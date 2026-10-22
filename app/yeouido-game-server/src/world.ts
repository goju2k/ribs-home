import { WebSocket } from 'ws';
import {
  ClientMsg, decodeInputs, MAX_LAG_MS, NO_FACE, encodeSnap, ST_FROZEN, ST_HIDDEN, InputTuple, NEAR, PROTOCOL_VERSION, ServerMsg, SIM_HZ, SNAP_HZ, SnapRow, toArrayBuffer, toBody, toRow, validInput,
  VIEW_DEFAULT, VIEW_MAX, VIEW_MIN,
} from 'yeouido-net';
import { Body, createSimWorld, newBody, SimWorld, step, WORLD } from 'yeouido-sim';

import { GameMode, ModeHost, ModeNpc, ModePlayer } from './mode';
import { BattleRoyale } from './modes/battle-royale';
import { createRtcLink, rtcAvailable, RtcLink } from './rtc';

/** 입력 예산: 실제 시간만큼만 걸음을 처리한다 (빨리 보내도 더 빨리 못 감 = 스피드핵 방지). 밀린 것은 이만큼까지 몰아서 */
const MAX_BURST = SIM_HZ / 5;
/** 이보다 많이 밀리면 오래된 입력을 버린다 (1초) */
const MAX_QUEUE = SIM_HZ;
/** 스냅숏 우선순위: 가까운 순 이 등수까지 매번, 그다음 등수까지 두 번에 한 번, 그 뒤는 네 번에 한 번 */
const NEAR_COUNT = 24;
const MID_COUNT = 64;
/** 관심 영역 격자 한 칸 (m) */
const CELL = 128;
const cellKey = (cx:number, cz:number) => (cx + 1000) * 4096 + (cz + 1000);
/** 정렬 키에서 번호 자리 (사람 수가 이보다 적어야 한다) */
const KEY = 65536;
/** 지연 보정용 위치 기록 틱 수 (1초) */
const HIST = SIM_HZ;
/** NPC 번호 범위 (사람 번호와 안 겹치게, 스냅숏 id는 u16) */
const NPC_FIRST = 40000;
const NPC_LAST = 65000;
/** 시뮬레이션 몇 틱에 스냅숏 한 번인지 (30Hz / 15Hz = 2) */
const SPLIT = Math.round(SIM_HZ / SNAP_HZ);

interface Player extends ModePlayer {
  ws: WebSocket;
  queue: InputTuple[];
  /** 이번 틱에 이 사람에게만 보낼 모드 메시지 (틱 끝에 한 번에) */
  modeOut: unknown[];
  lagMs: number;
  /** 처리해도 되는 걸음 수 (틱마다 1씩 쌓임) */
  budget: number;
  /** 마지막으로 처리한 입력 순번 */
  ack: number;
  /** WebRTC 데이터채널 (열리면 입력·스냅숏을 이쪽으로) */
  rtc: RtcLink | null;
  /** 이 사람 화면에 보이는 반경(m) — 이 안의 사람만 보낸다 */
  view: number;
  /** 이 사람에게 보낸 스냅숏 수 (먼 사람을 몇 번에 한 번 보낼지 정할 때) */
  sent: number;
}

/**
 * 월드 하나 = 여의도 맵 한 판 (서버 권위). 엔진만 맡는다: 접속·입력·이동·스냅숏.
 * 게임 규칙(시작 자리, 체력, 전투, 판 진행)은 GameMode(지금은 배틀로얄 PoC)가 정한다.
 * 프로세스 하나가 여러 월드를 돌릴 수 있게 상태를 여기 모은다 (나중에 샤드·시즌·매치로 나눌 때 월드를 더 만든다).
 */
export class World {

  readonly id:string;

  readonly sim:SimWorld;

  /** 정렬용 임시 배열 (거리·번호를 한 숫자로 묶어 담는다 — 받는 사람마다 객체를 만들지 않게) */
  private keys = new Float64Array(256);

  private players = new Map<number, Player>();

  /** 모드가 만든 NPC (좀비 등) — 사람과 같은 이동·스냅숏, 받는 사람은 아님 */
  private npcs = new Map<number, ModeNpc>();

  private nextNpcId = NPC_FIRST;

  /** 지연 보정: 번호마다 지난 HIST 틱 위치 [x, y, z, b, l] × HIST (틱 % HIST 자리) */
  private hist = new Map<number, Float32Array>();

  private nextId = 1;

  private tick = 0;

  private timer:NodeJS.Timeout | null = null;

  private lastAt = 0;

  /** 마지막 틱 처리 시간 (ms) — 한계 점검용. 시뮬레이션·스냅숏 나눠서도 */
  lastTickMs = 0;

  lastSimMs = 0;

  lastSnapMs = 0;

  /** 지난 1초 동안 보낸 스냅숏 바이트 (한계 점검용) */
  sentPerSec = 0;

  private sentAcc = 0;

  private sentAt = 0;

  /** 이 월드의 게임 규칙 */
  private mode:GameMode;

  /** 이번 틱에 모두에게 보낼 모드 메시지 */
  private modeAll:unknown[] = [];

  constructor(id:string) {
    this.id = id;
    const t0 = Date.now();
    this.sim = createSimWorld(WORLD);
    this.sim.indoors.forEach((g) => g.prepare());
    console.log(`[${id}] sim ready ${Date.now() - t0}ms (indoor ${this.sim.indoors.length})`);
    const host:ModeHost = {
      sim: this.sim,
      players: () => this.players.values(),
      get: (pid) => this.players.get(pid),
      send: (p, d) => {
        (p as Player).modeOut.push(d);
      },
      broadcast: (d, except) => {
        if (except) this.players.forEach((p) => p !== except && p.modeOut.push(d));
        else this.modeAll.push(d);
      },
      addNpc: (k, body) => {
        // 비어 있는 번호를 돌려 쓴다
        while (this.npcs.has(this.nextNpcId)) this.nextNpcId = this.nextNpcId >= NPC_LAST ? NPC_FIRST : this.nextNpcId + 1;
        const npc:ModeNpc = { id: this.nextNpcId, k, body, st: 0, gv: 255, input: { mx: 0, mz: 0, run: false, lift: 0 } };
        this.nextNpcId = this.nextNpcId >= NPC_LAST ? NPC_FIRST : this.nextNpcId + 1;
        this.npcs.set(npc.id, npc);
        return npc;
      },
      removeNpc: (id) => {
        this.npcs.delete(id);
      },
      npcs: () => this.npcs.values(),
      past: (id, msAgo) => {
        const h = this.hist.get(id);
        if (!h) return null;
        // 틱 중간(입력 처리 중)에 부르므로 마지막 기록은 지난 틱 끝 (this.tick - 1)
        const ago = Math.max(0, Math.min(HIST - 2, Math.round(msAgo / (1000 / SIM_HZ))));
        const o = ((((this.tick - 1 - ago) % HIST) + HIST) % HIST) * 5;
        if (Number.isNaN(h[o])) return null;
        return { x: h[o], y: h[o + 1], z: h[o + 2], b: h[o + 3], l: h[o + 4] };
      },
    };
    this.mode = new BattleRoyale(host);
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

  /** 상태 확인용: 게임 모드 정보 */
  get modeInfo() {
    return this.mode.info();
  }

  /**
   * 모드 메시지는 틱 끝에 묶어 보낸다: 모두에게 갈 것은 한 번만 직렬화, 개인 것은 사람마다 한 묶음.
   * (300명이 몰려 싸우면 죽음·맞음 알림이 많아 메시지마다 보내면 이벤트 루프가 밀린다)
   */
  private flushMode() {
    const all = this.modeAll.length ? JSON.stringify({ t: 'mode', ds: this.modeAll } satisfies ServerMsg) : null;
    this.modeAll = [];
    this.players.forEach((p) => {
      if (p.ws.readyState !== WebSocket.OPEN) return;
      if (all) p.ws.send(all);
      if (p.modeOut.length) {
        p.ws.send(JSON.stringify({ t: 'mode', ds: p.modeOut } satisfies ServerMsg));
        p.modeOut = [];
      }
    });
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
        const debug = msg.debug === true;
        // 원하는 자리(?at=, 재접속)는 개발용 접속만 — 쓸지는 모드가 정한다
        const requested = (debug && msg.spawn && this.acceptSpawn(msg.spawn)) || null;
        me = this.join(ws, String(msg.name || '').slice(0, 16) || '시민', requested, debug);
        return;
      }
      if (msg.t === 'input') World.inputCmds(me, msg.cmds);
      else if (msg.t === 'ping' && typeof msg.c === 'number') ws.send(JSON.stringify({ t: 'pong', c: msg.c } satisfies ServerMsg));
      else if (msg.t === 'view' && typeof msg.r === 'number' && Number.isFinite(msg.r)) me.view = Math.max(VIEW_MIN, Math.min(VIEW_MAX, msg.r));
      else if (msg.t === 'rtc') this.rtcSignal(me, msg);
      else if (msg.t === 'mode') this.mode.message?.(me, msg.d);
      else if (msg.t === 'lag' && typeof msg.ms === 'number' && Number.isFinite(msg.ms)) me.lagMs = Math.max(0, Math.min(MAX_LAG_MS, msg.ms));
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
            // 데이터채널로 온 ping은 같은 길로 돌려준다 (실제로 스냅숏이 오가는 길의 지연)
            else if (m.t === 'ping' && typeof m.c === 'number') p.rtc?.send(JSON.stringify({ t: 'pong', c: m.c } satisfies ServerMsg));
          } catch {
            // 깨진 패킷
          }
        },
        (open) => console.log(`[${this.id}] #${p.id} rtc ${open ? 'open' : 'closed'}`),
      );
    }
    p.rtc?.signal(msg);
  }

  private join(ws:WebSocket, name:string, requested:Body | null, debug:boolean) {
    const p:Player = { id: this.nextId++, name, ws, body: newBody(0, 0, 0), st: 0, gv: 0, modeOut: [], lagMs: 0, queue: [], budget: 0, ack: 0, rtc: null, view: VIEW_DEFAULT, sent: 0, debug };
    this.players.set(p.id, p);
    // 시작 자리·상태는 모드가 정한다
    this.mode.join(p, requested);
    const { body } = p;
    this.send(p, {
      t: 'welcome',
      id: p.id,
      world: this.id,
      mode: this.mode.name,
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
    this.mode.leave(p);
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
    const now = Date.now();
    this.players.forEach((p) => {
      p.budget = Math.min(MAX_BURST, p.budget + gain);
      while (p.budget >= 1 && p.queue.length) {
        const [ seq, mx, mz, run, lift, face, act, pitch ] = p.queue.shift()!;
        // 움직일 수 없는 상태(모드가 정함: 예 — 죽음)면 입력은 받아 순번만 넘긴다 (클라이언트 예측도 같은 비트를 보고 멈춘다)
        if (!(p.st & ST_FROZEN)) step(this.sim, p.body, { mx, mz, run: run === 1, lift, face: face === NO_FACE ? undefined : face }); // eslint-disable-line no-bitwise
        p.ack = seq;
        p.budget -= 1;
        this.mode.act(p, act, now, { face: face === NO_FACE ? p.body.f : face, pitch, seq });
      }
    });
    // NPC: 모드가 정한 입력으로 한 걸음
    this.npcs.forEach((n) => {
      if (!(n.st & ST_FROZEN)) step(this.sim, n.body, n.input); // eslint-disable-line no-bitwise
    });
    this.mode.tick(now);
    this.record();
    this.flushMode();
    const t1 = performance.now();
    this.lastSimMs = t1 - t0;
    // 받는 사람을 SPLIT 묶음으로 나눠 틱마다 번갈아 보낸다 → 각자 SNAP_HZ, 한 틱의 부담은 1/SPLIT
    if (this.players.size) this.snapshot(this.tick % SPLIT);
    this.lastSnapMs = performance.now() - t1;
    this.lastTickMs = performance.now() - t0;
  }

  /** 지연 보정용: 이번 틱 사람·NPC 위치를 기록 (없어진 번호는 지운다) */
  private record() {
    const slot = (this.tick % HIST) * 5;
    const seen = new Set<number>();
    const put = (id:number, b:Body) => {
      seen.add(id);
      let h = this.hist.get(id);
      if (!h) {
        h = new Float32Array(HIST * 5).fill(NaN);
        this.hist.set(id, h);
      }
      h[slot] = b.x;
      h[slot + 1] = b.y;
      h[slot + 2] = b.z;
      h[slot + 3] = b.b;
      h[slot + 4] = b.l;
    };
    this.players.forEach((p) => put(p.id, p.body));
    this.npcs.forEach((n) => put(n.id, n.body));
    if (this.hist.size > seen.size) [ ...this.hist.keys() ].forEach((id) => !seen.has(id) && this.hist.delete(id));
  }

  /**
   * 받는 사람마다 보이는 사람만 골라 바이너리로:
   * - 실내 사람은 같은 건물·같은 층에게만 (벽 너머 투시 방지)
   * - 보이는 반경 밖은 빼고, 가까운 순으로 줄 세워 멀수록 덜 자주
   *   (가까운 24명 매번, 64명까지 두 번에 한 번, 그 뒤는 네 번에 한 번 — 사람이 몰려도 양이 일정 이상 안 늘게)
   */
  private snapshot(half:number) {
    // 보이는 것 = 사람 + NPC (앞쪽 사람들만 받는 사람)
    const all:{ id: number; body: Body; st: number; gv: number; k: number; }[] = [ ...this.players.values() ].map((p) => ({ id: p.id, body: p.body, st: p.st, gv: p.gv, k: 0 }));
    const receivers = all.length;
    this.npcs.forEach((o) => all.push(o));
    const n = all.length;
    if (this.keys.length < n) this.keys = new Float64Array(n * 2);
    const rows = all.map((o) => toRow(o.id, o.body, o.st, o.gv, o.k));
    const players = [ ...this.players.values() ];
    // 공간 격자: 실외는 CELL m 칸, 실내는 "건물:층" 묶음 (번호 목록) — 받는 사람마다 전원을 훑지 않고 근처만 본다
    const cells = new Map<number, number[]>();
    const rooms = new Map<string, number[]>();
    all.forEach((o, i) => {
      const room = o.body.b >= 0;
      const key = room ? `${o.body.b}:${o.body.l}` : cellKey(Math.floor(o.body.x / CELL), Math.floor(o.body.z / CELL));
      const map = (room ? rooms : cells) as Map<string | number, number[]>;
      const list = map.get(key);
      if (list) list.push(i);
      else map.set(key, [ i ]);
    });
    const { keys } = this;
    let sent = 0;
    players.forEach((p, i) => {
      if (i >= receivers || p.id % SPLIT !== half) return;
      p.sent++;
      const px = p.body.x;
      const pz = p.body.z;
      const r = p.view;
      let count = 0;
      const consider = (list:number[] | undefined) => {
        if (!list) return;
        for (let k = 0; k < list.length; k++) {
          const j = list[k];
          // 세상에 없는 사람(관전 등)은 남에게 안 보낸다
          if (j !== i && !(all[j].st & ST_HIDDEN)) { // eslint-disable-line no-bitwise
            const o = all[j].body;
            const d = Math.hypot(o.x - px, o.z - pz);
            // 거리(1/16 m)와 번호를 한 숫자로: 숫자 정렬만으로 가까운 순이 된다
            if (d <= r) keys[count++] = Math.floor(d * 16) * KEY + j;
          }
        }
      };
      // 실내에 있으면 같은 건물·층 사람도 (실외 사람은 실내에서도 창밖으로 보인다)
      if (p.body.b >= 0) consider(rooms.get(`${p.body.b}:${p.body.l}`));
      const cx1 = Math.floor((px + r) / CELL);
      const cz0 = Math.floor((pz - r) / CELL);
      const cz1 = Math.floor((pz + r) / CELL);
      for (let cx = Math.floor((px - r) / CELL); cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) consider(cells.get(cellKey(cx, cz)));
      }
      const sorted = keys.subarray(0, count).sort();
      const list:SnapRow[] = [];
      for (let rank = 0; rank < count; rank++) {
        const j = sorted[rank] % KEY;
        const d = Math.floor(sorted[rank] / KEY) / 16;
        let every = 1;
        if (rank >= NEAR_COUNT) every = 2;
        if (rank >= MID_COUNT) every = 4;
        if (d > NEAR) every = Math.max(every, 2);
        if ((p.sent + all[j].id) % every === 0) list.push(rows[j]);
      }
      const buf = encodeSnap(this.tick, p.ack, toBody(p.body), p.st, p.gv, list);
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