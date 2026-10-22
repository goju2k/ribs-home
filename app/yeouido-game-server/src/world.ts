import { WebSocket } from 'ws';
import {
  ClientMsg, decodeInputs, MAX_LAG_MS, NO_FACE, encodeSnapPacked, packRows, ST_FROZEN, ST_HIDDEN, InputTuple, NEAR, PROTOCOL_VERSION, SayKind, ServerMsg, SIM_HZ, SNAP_HZ, toArrayBuffer, toBody, toRow, validInput,
  VIEW_DEFAULT, VIEW_MAX, VIEW_MIN,
} from 'yeouido-net';
import { Body, createSimWorld, newBody, SimWorld, step, WORLD } from 'yeouido-sim';

import type { Socket } from 'net';

import { GameMode, ModeHost, ModeNpc, ModePlayer } from './mode';
import { BattleRoyale } from './modes/battle-royale';
import { createRtcLink, rtcAvailable, RtcLink } from './rtc';

/** 한 월드에 동시에 들어오는 최대 인원 (넘으면 대기열). 개발용 접속(?debug)은 예외 */
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 300;

/** 입력 예산: 실제 시간만큼만 걸음을 처리한다 (빨리 보내도 더 빨리 못 감 = 스피드핵 방지). 밀린 것은 이만큼까지 몰아서 */
const MAX_BURST = SIM_HZ / 5;
/** 이보다 많이 밀리면 오래된 입력을 버린다 (1초) */
const MAX_QUEUE = SIM_HZ;
/** 스냅숏 우선순위: 가까운 순 이 등수까지 매번, 그다음 등수까지 두 번에 한 번, 그 뒤는 네 번에 한 번 */
const NEAR_COUNT = 24;
const MID_COUNT = 64;
/**
 * 스냅숏 한 통에 담는 최대 행 수: 한곳에 수백이 몰려도 1인 수신량이 끝없이 늘지 않게.
 * MID_COUNT 뒤(먼 쪽)는 남은 자리만큼만 — 많으면 더 드물게 돌려 가며 보낸다 (클라이언트는 3초 소식이 없어야 숨긴다)
 */
const MAX_ROWS = 64;
/** 먼 쪽에 남는 자리 (가까운 쪽이 다 차 있을 때) */
const FAR_ROWS = MAX_ROWS - NEAR_COUNT - (MID_COUNT - NEAR_COUNT) / 2;
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

/** 대기열 한 사람: 자리가 나면 enter()로 입장 */
interface Waiter {
  ws: WebSocket; at: number; enter: () => void;
}

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

  /** 받는 사람마다 고른 행 번호 (스냅숏 만들 때 재사용) */
  private pick = new Int32Array(MAX_ROWS);

  private players = new Map<number, Player>();

  /** 가득 찼을 때 기다리는 사람 (먼저 온 순) */
  private waiting:Waiter[] = [];

  /** 대기 순번이 바뀌어 알려야 하는지 (틱마다 한 번에) */
  private queueDirty = false;

  /** 대기열 기록 (서버를 켠 뒤로): 가장 길었던 대기 인원·그때, 가장 오래 기다린 시간, 기다렸던 사람 수 */
  private queueStat = { peak: 0, peakAt: 0, longestMs: 0, total: 0 };

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
      say: (text, kind, to) => (to ? this.sayTo(to as Player, text, kind) : this.say(text, kind)),
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

  /** 상태 확인용: 대기열 */
  get queueInfo() {
    const { peak, peakAt, longestMs, total } = this.queueStat;
    return { max: MAX_PLAYERS, now: this.waiting.length, peak, peakAt: peakAt ? new Date(peakAt).toISOString() : null, longestWaitS: Math.round(longestMs / 1000), total };
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
    // 같은 메시지(예: 총 궤적은 근처 사람 모두에게 같은 객체)는 한 번만 JSON으로 바꾸고, 사람마다 한 통으로 묶는다
    const json = new Map<unknown, string>();
    const str = (d:unknown) => {
      let s = json.get(d);
      if (s === undefined) {
        s = JSON.stringify(d);
        json.set(d, s);
      }
      return s;
    };
    const all = this.modeAll.map(str).join(',');
    this.modeAll = [];
    this.players.forEach((p) => {
      const mine = p.modeOut.length ? p.modeOut.map(str).join(',') : '';
      p.modeOut = [];
      if ((!all && !mine) || p.ws.readyState !== WebSocket.OPEN) return;
      // = JSON.stringify({ t: 'mode', ds: [ ...모두에게, ...나에게 ] } satisfies ServerMsg)
      p.ws.send(`{"t":"mode","ds":[${all}${all && mine ? ',' : ''}${mine}]}`);
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
    let waiter:Waiter | null = null;
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
        const name = String(msg.name || '').slice(0, 16) || '시민';
        // 가득 찼거나 이미 기다리는 사람이 있으면 줄 끝에 (개발용 접속은 바로)
        if (!debug && (this.players.size >= MAX_PLAYERS || this.waiting.length)) {
          if (waiter) return;
          waiter = {
            ws,
            at: Date.now(),
            enter: () => {
              me = this.join(ws, name, null, false);
            },
          };
          this.enqueue(waiter);
          return;
        }
        me = this.join(ws, name, requested, debug);
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
      else if (waiter) this.dequeue(waiter);
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
    this.say(`${name} 님이 접속했습니다. (${this.players.size}명)`, 'join', p);
    console.log(`[${this.id}] join #${p.id} ${name} (${this.players.size}명)`);
    return p;
  }

  private leave(p:Player) {
    if (!this.players.delete(p.id)) return;
    p.rtc?.close();
    this.mode.leave(p);
    this.broadcast({ t: 'leave', id: p.id });
    this.say(`${p.name} 님이 나갔습니다. (${this.players.size}명)`, 'leave');
    console.log(`[${this.id}] leave #${p.id} ${p.name} (${this.players.size}명)`);
    this.admit();
  }

  /** 대기열 끝에 세운다 */
  private enqueue(w:Waiter) {
    this.waiting.push(w);
    this.queueDirty = true;
    const st = this.queueStat;
    st.total++;
    if (this.waiting.length > st.peak) {
      st.peak = this.waiting.length;
      st.peakAt = Date.now();
      console.log(`[${this.id}] 대기열 최고 ${st.peak}명 (접속 ${this.players.size}/${MAX_PLAYERS})`);
    }
  }

  /** 기다리다 나감 */
  private dequeue(w:Waiter) {
    const i = this.waiting.indexOf(w);
    if (i < 0) return;
    this.waiting.splice(i, 1);
    this.queueDirty = true;
  }

  /** 자리가 난 만큼 줄 앞부터 들여보낸다 */
  private admit() {
    while (this.players.size < MAX_PLAYERS && this.waiting.length) {
      const w = this.waiting.shift()!;
      this.queueDirty = true;
      if (w.ws.readyState === WebSocket.OPEN) {
        const waited = Date.now() - w.at;
        this.queueStat.longestMs = Math.max(this.queueStat.longestMs, waited);
        w.enter();
      }
    }
  }

  /** 기다리는 사람마다 순번 알림 (바뀐 틱에만) */
  private sendQueue() {
    if (!this.queueDirty) return;
    this.queueDirty = false;
    const size = this.waiting.length;
    this.waiting.forEach((w, i) => {
      if (w.ws.readyState === WebSocket.OPEN) w.ws.send(JSON.stringify({ t: 'queue', pos: i + 1, size, players: this.players.size, max: MAX_PLAYERS } satisfies ServerMsg));
    });
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
    // 이번 틱에 보낼 것(모드 메시지·스냅숏)을 사람마다 한 번의 쓰기로 묶는다 (보낼 때마다 시스템 호출이라 사람이 많으면 이게 크다)
    const corked = this.cork();
    this.flushMode();
    this.sendQueue();
    const t1 = performance.now();
    this.lastSimMs = t1 - t0;
    // 받는 사람을 SPLIT 묶음으로 나눠 틱마다 번갈아 보낸다 → 각자 SNAP_HZ, 한 틱의 부담은 1/SPLIT
    if (this.players.size) this.snapshot(this.tick % SPLIT);
    corked.forEach((sock) => sock.uncork());
    this.lastSnapMs = performance.now() - t1;
    this.lastTickMs = performance.now() - t0;
  }

  /** 웹소켓 아래 소켓을 잠시 막아 둔다 (uncork 때 쌓인 것을 한 번에 쓴다) */
  private cork() {
    const out:Socket[] = [];
    this.players.forEach((p) => {
      const sock = (p.ws as unknown as { _socket?: Socket; })._socket; // eslint-disable-line no-underscore-dangle
      if (sock && p.ws.readyState === WebSocket.OPEN) {
        sock.cork();
        out.push(sock);
      }
    });
    return out;
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
    // 행은 이번 틱에 한 번만 바이트로 만들어 두고, 받는 사람마다 고른 것만 복사한다
    const packed = packRows(all.map((o) => toRow(o.id, o.body, o.st, o.gv, o.k)));
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
    const { keys, pick } = this;
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
      // 먼 쪽: 네 번에 한 번, 너무 많으면 남은 자리에 맞게 더 드물게
      const farEvery = Math.max(4, Math.ceil((count - MID_COUNT) / FAR_ROWS));
      let n = 0;
      for (let rank = 0; rank < count && n < MAX_ROWS; rank++) {
        const j = sorted[rank] % KEY;
        const d = Math.floor(sorted[rank] / KEY) / 16;
        let every = 1;
        if (rank >= NEAR_COUNT) every = 2;
        if (rank >= MID_COUNT) every = farEvery;
        if (d > NEAR) every = Math.max(every, 2);
        if ((p.sent + all[j].id) % every === 0) pick[n++] = j;
      }
      const buf = encodeSnapPacked(this.tick, p.ack, toBody(p.body), p.st, p.gv, packed, pick, n);
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

  /** 방송: 한 사람에게만 */
  sayTo(p:Player, text:string, kind?:SayKind) {
    this.send(p, { t: 'say', text, kind: kind ?? 'info' });
  }

  /** 방송: 모두에게 한 줄 (except 빼고) */
  say(text:string, kind?:SayKind, except?:Player) {
    this.broadcast({ t: 'say', text, kind: kind ?? 'info' }, except);
  }

  private broadcast(msg:ServerMsg, except?:Player) {
    const s = JSON.stringify(msg);
    this.players.forEach((p) => {
      if (p !== except && p.ws.readyState === WebSocket.OPEN) p.ws.send(s);
    });
  }

}