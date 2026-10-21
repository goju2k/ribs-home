import { WebSocket } from 'ws';
import {
  ClientMsg, decodeInputs, encodeSnap, InputTuple, NEAR, PROTOCOL_VERSION, ServerMsg, SIM_HZ, SNAP_HZ, SnapRow, toArrayBuffer, toBody, toRow, validInput,
  VIEW_DEFAULT, VIEW_MAX, VIEW_MIN,
} from 'yeouido-net';
import { Body, createSimWorld, newBody, SimWorld, step, WORLD } from 'yeouido-sim';

import { createRtcLink, rtcAvailable, RtcLink } from './rtc';

/** 입력 예산: 실제 시간만큼만 걸음을 처리한다 (빨리 보내도 더 빨리 못 감 = 스피드핵 방지). 밀린 것은 이만큼까지 몰아서 */
const MAX_BURST = 6;
/** 이보다 많이 밀리면 오래된 입력을 버린다 (1초) */
const MAX_QUEUE = SIM_HZ;
/** 스냅숏 우선순위: 가까운 순 이 등수까지 매번, 그다음 등수까지 두 번에 한 번, 그 뒤는 네 번에 한 번 */
const NEAR_COUNT = 24;
const MID_COUNT = 64;

interface Player {
  id: number;
  name: string;
  ws: WebSocket;
  body: Body;
  queue: InputTuple[];
  /** 처리해도 되는 걸음 수 (틱마다 1씩 쌓임) */
  budget: number;
  /** 마지막으로 처리한 입력 순번 */
  ack: number;
  /** WebRTC 데이터채널 (열리면 입력·스냅숏을 이쪽으로) */
  rtc: RtcLink | null;
  /** 이 사람 화면에 보이는 반경(m) — 이 안의 사람만 보낸다 */
  view: number;
}

/**
 * 월드 하나 = 여의도 맵 한 판 (서버 권위).
 * 프로세스 하나가 여러 월드를 돌릴 수 있게 상태를 여기 모은다 (나중에 샤드·시즌·매치로 나눌 때 월드를 더 만든다).
 */
export class World {

  readonly id:string;

  readonly sim:SimWorld;

  private players = new Map<number, Player>();

  private nextId = 1;

  private tick = 0;

  private timer:NodeJS.Timeout | null = null;

  private lastAt = 0;

  private lastSnap = 0;

  /** 마지막 틱 처리 시간 (ms) — 한계 점검용 */
  lastTickMs = 0;

  /** 스냅숏 번호 (먼 사람을 두 번에 한 번 보낼 때 쓴다) */
  private snapNo = 0;

  /** 지난 1초 동안 보낸 스냅숏 바이트 (한계 점검용) */
  sentPerSec = 0;

  private sentAcc = 0;

  private sentAt = 0;

  constructor(id:string) {
    this.id = id;
    const t0 = Date.now();
    this.sim = createSimWorld(WORLD);
    this.sim.indoors.forEach((g) => g.prepare());
    console.log(`[${id}] sim ready ${Date.now() - t0}ms (indoor ${this.sim.indoors.length})`);
  }

  get size() {
    return this.players.size;
  }

  start() {
    this.timer = setInterval(() => this.step(), 1000 / SIM_HZ);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** 시작 자리: 샘플 건물 옥상 가운데 ±3m (시험용) */
  private spawnBody() {
    const roof = this.sim.indoors[0];
    if (!roof) return newBody(WORLD.spawn.x, 0, WORLD.spawn.z);
    return newBody(roof.plan.frame.ox + (Math.random() - 0.5) * 6, roof.height, roof.plan.frame.oz + (Math.random() - 0.5) * 6);
  }

  /** 클라이언트가 원한 시작 자리(확인용 ?at=, 재접속)를 받아 줄지 — 지금은 개발 단계라 범위만 본다 */
  private acceptSpawn(s:NonNullable<Extract<ClientMsg, { t: 'hello'; }>['spawn']>) {
    const ok = [ s.x, s.y, s.z, s.b, s.l ].every((v) => typeof v === 'number' && Number.isFinite(v))
      && Math.abs(s.x) <= WORLD.half.w && Math.abs(s.z) <= WORLD.half.d && s.y >= 0 && s.y <= 500;
    if (!ok) return null;
    const body = newBody(s.x, s.y, s.z);
    const room = s.b >= 0 ? this.sim.byBid.get(s.b) : undefined;
    if (room && room.contains(s.x, s.z)) {
      body.b = room.bid;
      body.l = Math.max(1, Math.min(room.levels, Math.round(s.l)));
      body.y = room.baseY(body.l);
    } else if (s.b >= 0) return null;
    return body;
  }

  /** 새 연결: hello를 받으면 입장시킨다 */
  connect(ws:WebSocket) {
    let me:Player | null = null;
    const hello = setTimeout(() => ws.close(4000, 'hello timeout'), 5000);

    ws.on('message', (raw, isBinary) => {
      // 입력은 바이너리로 온다
      if (isBinary) {
        if (me) World.inputCmds(me, decodeInputs(toArrayBuffer(raw as Buffer)));
        return;
      }
      let msg:ClientMsg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!me) {
        if (msg.t !== 'hello') return;
        clearTimeout(hello);
        if (msg.v !== PROTOCOL_VERSION) {
          ws.send(JSON.stringify({ t: 'error', msg: '새로고침이 필요합니다 (프로토콜 버전)' } satisfies ServerMsg));
          ws.close(4001, 'version');
          return;
        }
        const body = (msg.spawn && this.acceptSpawn(msg.spawn)) || this.spawnBody();
        me = this.join(ws, String(msg.name || '').slice(0, 16) || '시민', body);
        return;
      }
      if (msg.t === 'input') World.inputCmds(me, msg.cmds);
      else if (msg.t === 'view' && typeof msg.r === 'number' && Number.isFinite(msg.r)) me.view = Math.max(VIEW_MIN, Math.min(VIEW_MAX, msg.r));
      else if (msg.t === 'rtc') this.rtcSignal(me, msg);
    });
    ws.on('close', () => {
      clearTimeout(hello);
      if (me) this.leave(me);
    });
    ws.on('error', () => ws.terminate());
  }

  /** 입력 받기: 데이터채널은 잃어버릴 수 있어 최근 입력을 겹쳐 보내므로, 이미 받은 순번은 버린다 */
  private static inputCmds(p:Player, cmds:unknown) {
    if (!Array.isArray(cmds)) return;
    cmds.slice(-MAX_QUEUE).forEach((c) => {
      if (validInput(c) && c[0] > p.ack && (!p.queue.length || c[0] > p.queue[p.queue.length - 1][0])) p.queue.push(c);
    });
    if (p.queue.length > MAX_QUEUE) p.queue.splice(0, p.queue.length - MAX_QUEUE);
  }

  /** WebRTC 신호: 처음 offer가 오면 연결을 만들고, 열린 데이터채널로 들어온 입력도 같은 곳으로 */
  private rtcSignal(p:Player, msg:Extract<ClientMsg, { t: 'rtc'; }>) {
    if (!p.rtc) {
      p.rtc = createRtcLink(
        (m) => {
          if (p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(m));
        },
        (data) => {
          if (typeof data !== 'string') {
            World.inputCmds(p, decodeInputs(toArrayBuffer(data)));
            return;
          }
          try {
            const m = JSON.parse(data) as ClientMsg;
            if (m.t === 'input') World.inputCmds(p, m.cmds);
          } catch {
            // 깨진 패킷
          }
        },
        (open) => console.log(`[${this.id}] #${p.id} rtc ${open ? 'open' : 'closed'}`),
      );
    }
    p.rtc?.signal(msg);
  }

  private join(ws:WebSocket, name:string, body:Body) {
    const p:Player = { id: this.nextId++, name, ws, body, queue: [], budget: 0, ack: 0, rtc: null, view: VIEW_DEFAULT };
    this.players.set(p.id, p);
    this.send(p, {
      t: 'welcome',
      id: p.id,
      world: this.id,
      v: PROTOCOL_VERSION,
      me: toBody(body),
      ack: 0,
      rtc: rtcAvailable(),
      players: [ ...this.players.values() ].filter((o) => o !== p).map((o) => ({ id: o.id, name: o.name })),
    });
    this.broadcast({ t: 'join', id: p.id, name }, p);
    console.log(`[${this.id}] join #${p.id} ${name} (${this.players.size}명)`);
    return p;
  }

  private leave(p:Player) {
    if (!this.players.delete(p.id)) return;
    p.rtc?.close();
    this.broadcast({ t: 'leave', id: p.id });
    console.log(`[${this.id}] leave #${p.id} ${p.name} (${this.players.size}명)`);
  }

  /** 한 틱(1/30초): 각자 밀린 입력을 예산만큼 시뮬레이션, 2틱마다 스냅숏 */
  private step() {
    const t0 = performance.now();
    this.tick++;
    // Windows 타이머는 15.6ms 단위라 setInterval이 정확히 30Hz로 안 돈다 → 예산은 실제로 흐른 시간만큼 준다
    const gain = this.lastAt ? (t0 - this.lastAt) / (1000 / SIM_HZ) : 1;
    this.lastAt = t0;
    this.players.forEach((p) => {
      p.budget = Math.min(MAX_BURST, p.budget + gain);
      while (p.budget >= 1 && p.queue.length) {
        const [ seq, mx, mz, run, lift ] = p.queue.shift()!;
        step(this.sim, p.body, { mx, mz, run: run === 1, lift });
        p.ack = seq;
        p.budget -= 1;
      }
    });
    if (t0 - this.lastSnap >= 1000 / SNAP_HZ - 2) {
      this.lastSnap = t0;
      if (this.players.size) this.snapshot();
    }
    this.lastTickMs = performance.now() - t0;
  }

  /**
   * 받는 사람마다 보이는 사람만 골라 바이너리로:
   * - 실내 사람은 같은 건물·같은 층에게만 (벽 너머 투시 방지)
   * - 보이는 반경 밖은 빼고, 가까운 순으로 줄 세워 멀수록 덜 자주
   *   (가까운 24명 매번, 64명까지 두 번에 한 번, 그 뒤는 네 번에 한 번 — 사람이 몰려도 양이 일정 이상 안 늘게)
   */
  private snapshot() {
    this.snapNo++;
    const all = [ ...this.players.values() ];
    const rows = new Map<number, SnapRow>(all.map((p) => [ p.id, toRow(p.id, p.body) ]));
    let sent = 0;
    all.forEach((p) => {
      const near:{ o: Player; d: number; }[] = [];
      all.forEach((o) => {
        if (o === p) return;
        if (o.body.b >= 0 && (o.body.b !== p.body.b || o.body.l !== p.body.l)) return;
        const d = Math.hypot(o.body.x - p.body.x, o.body.z - p.body.z);
        if (d <= p.view) near.push({ o, d });
      });
      near.sort((a, b) => a.d - b.d);
      const list:SnapRow[] = [];
      near.forEach(({ o, d }, rank) => {
        let every = 1;
        if (rank >= NEAR_COUNT) every = 2;
        if (rank >= MID_COUNT) every = 4;
        if (d > NEAR) every = Math.max(every, 2);
        if ((this.snapNo + o.id) % every === 0) list.push(rows.get(o.id)!);
      });
      const buf = encodeSnap(this.tick, p.ack, toBody(p.body), list);
      sent += buf.byteLength;
      // 데이터채널이 열려 있으면 그쪽(UDP처럼)으로
      if (p.rtc?.open()) p.rtc.sendBinary(buf);
      else if (p.ws.readyState === WebSocket.OPEN) p.ws.send(buf);
    });
    // 초당 보낸 양
    const now = performance.now();
    this.sentAcc += sent;
    if (now - this.sentAt >= 1000) {
      this.sentPerSec = Math.round((this.sentAcc * 1000) / (now - this.sentAt));
      this.sentAcc = 0;
      this.sentAt = now;
    }
  }

  private send(p:Player, msg:ServerMsg) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(msg));
  }

  private broadcast(msg:ServerMsg, except?:Player) {
    const s = JSON.stringify(msg);
    this.players.forEach((p) => {
      if (p !== except && p.ws.readyState === WebSocket.OPEN) p.ws.send(s);
    });
  }

}