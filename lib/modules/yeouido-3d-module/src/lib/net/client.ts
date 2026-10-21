import { BodyTuple, ClientMsg, decodeSnap, encodeInputs, fromRow, INTERP_DELAY_MS, InputTuple, PlayerState, PROTOCOL_VERSION, ServerMsg, VIEW_MAX, VIEW_MIN } from 'yeouido-net';

/**
 * 게임 서버 접속 (서버 권위): 자동 재접속, 내 입력 보내기, 서버가 확정한 내 상태 받기, 다른 사람 위치 보간.
 * 주소: ?ws=… 가 있으면 그것, 로컬 개발(127.0.0.1)은 :3200, 미리보기(:3100)는 :3102, https 운영은 wss://home.ribs.kr/ws
 */
export function serverUrl() {
  const q = new URLSearchParams(window.location.search).get('ws');
  if (q) return q;
  const { hostname, port, protocol } = window.location;
  if (protocol === 'https:') return 'wss://home.ribs.kr/ws';
  if (hostname === '127.0.0.1' || hostname === 'localhost') return `ws://${hostname}:3200/ws`;
  if (port === '3100') return `ws://${hostname}:3102/ws`;
  return `ws://${hostname}:3102/ws`;
}

/** 브라우저마다 한 번 정해 두는 임시 닉네임 */
export function myName() {
  const key = 'yeouido3d.name';
  try {
    const saved = window.localStorage.getItem(key);
    if (saved) return saved;
    const name = `시민${Math.floor(1000 + Math.random() * 9000)}`;
    window.localStorage.setItem(key, name);
    return name;
  } catch {
    return `시민${Math.floor(1000 + Math.random() * 9000)}`;
  }
}

interface Sample {
  t: number; s: PlayerState;
}

export interface Remote extends PlayerState {
  id: number;
  name: string;
}

export type NetState = 'connecting' | 'online' | 'offline';

/** 서버가 확정한 내 상태: ack 순번까지의 입력을 반영한 결과 */
export interface Authority {
  ack: number; me: BodyTuple; reset: boolean;
  /** 내 상태 비트·게이지 (모드가 정함, ST_FROZEN만 엔진) */
  ms: number; mv: number;
}

/** 접속(재접속)할 때 이어서 시작할 자리 */
export type SpawnFn = () => { x: number; y: number; z: number; b: number; l: number; } | undefined;

const lerpAngle = (a:number, b:number, k:number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/** 입력·스냅숏이 오가는 길: WebRTC 데이터채널(UDP처럼) 또는 웹소켓(TCP) */
export type Transport = 'ws' | 'rtc';

export class GameClient {

  state:NetState = 'connecting';

  transport:Transport = 'ws';

  /** 서버까지 왕복 시간(ms, 부드럽게)과 흔들림(연속한 왕복 시간 차이, ms) */
  rtt = 0;

  jitter = 0;

  private lastRtt = 0;

  private pingTimer:ReturnType<typeof setInterval> | null = null;

  private pc:RTCPeerConnection | null = null;

  private dc:RTCDataChannel | null = null;

  /** 서버에 마지막으로 알린 보이는 반경 */
  private sentView = 0;

  /** 데이터채널은 순서가 뒤바뀔 수 있어 이보다 오래된 스냅숏은 버린다 */
  private lastTick = 0;

  myId = 0;

  private ws:WebSocket | null = null;

  private names = new Map<number, string>();

  private samples = new Map<number, Sample[]>();

  /** 아직 가져가지 않은 서버 확정 상태 (가장 최근 것만) */
  private auth:Authority | null = null;

  /** 서버가 보낸 오류 (버전 불일치 등) */
  error = '';

  private retry = 0;

  private closed = false;

  private timer:ReturnType<typeof setTimeout> | null = null;

  private url:string;

  private name:string;

  private spawn:SpawnFn;

  /** 이 월드의 게임 모드 이름 (welcome에서) */
  modeName:string | null = null;

  /** 아직 가져가지 않은 모드 메시지 */
  private modeInbox:unknown[] = [];

  /** 내 상태 비트·게이지 (가장 최근 스냅숏) */
  meStatus = { s: 0, v: 0 };

  constructor(url:string, name:string, spawn:SpawnFn) {
    this.url = url;
    this.name = name;
    this.spawn = spawn;
    this.open();
  }

  /** 접속한 사람 수 (나 포함) */
  get count() {
    return this.state === 'online' ? this.names.size + 1 : 0;
  }

  private open() {
    this.state = 'connecting';
    let ws:WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.later();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      const debug = new URLSearchParams(window.location.search).has('debug');
      this.send({ t: 'hello', v: PROTOCOL_VERSION, name: this.name, debug, spawn: debug ? this.spawn() : undefined });
    };
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        this.binary(e.data);
        return;
      }
      let msg:ServerMsg;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.receive(msg);
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.rtt = 0;
      this.lastRtt = 0;
      this.sentView = 0;
      this.closeRtc();
      this.lastTick = 0;
      this.state = 'offline';
      this.names.clear();
      this.samples.clear();
      this.later();
    };
  }

  /** 끊기면 1, 2, 4 … 최대 15초 뒤 다시 */
  private later() {
    if (this.closed) return;
    const wait = Math.min(15000, 1000 * 2 ** this.retry++);
    this.timer = setTimeout(() => this.open(), wait);
  }

  private receive(msg:ServerMsg) {
    const now = performance.now();
    if (msg.t === 'welcome') {
      this.state = 'online';
      this.startPing();
      this.myId = msg.id;
      msg.players.forEach((p) => this.names.set(p.id, p.name));
      this.auth = { ack: msg.ack, me: msg.me, ms: 0, mv: 0, reset: true };
      if (this.modeName !== msg.mode) this.modeInbox = this.modeInbox.slice(-50);
      this.modeName = msg.mode;
      if (msg.rtc && !new URLSearchParams(window.location.search).has('nortc')) this.startRtc();
    } else if (msg.t === 'rtc') this.rtcSignal(msg);
    else if (msg.t === 'error') this.error = msg.msg;
    else if (msg.t === 'pong') this.pong(msg.c);
    else if (msg.t === 'mode') {
      this.modeInbox.push(...msg.ds);
      if (this.modeInbox.length > 500) this.modeInbox.shift();
    } else if (msg.t === 'join') this.names.set(msg.id, msg.name);
    else if (msg.t === 'leave') {
      this.names.delete(msg.id);
      this.samples.delete(msg.id);
    } else if (msg.t === 'snap') {
      if (msg.tick <= this.lastTick) return;
      this.lastTick = msg.tick;
      this.auth = { ack: msg.ack, me: msg.me, ms: msg.ms, mv: msg.mv, reset: this.auth?.reset ?? false };
      this.meStatus = { s: msg.ms, v: msg.mv };
      msg.ps.forEach((row) => {
        const { id, ...s } = fromRow(row);
        if (id === this.myId) return;
        let list = this.samples.get(id) ?? [];
        if (list.length && now - list[list.length - 1].t > 500) list = []; // 범위 밖에 있다 다시 들어옴
        list.push({ t: now, s });
        if (list.length > 12) list.shift();
        this.samples.set(id, list);
      });
    }
  }

  private send(msg:ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** 바이너리 스냅숏 → 같은 처리 */
  private binary(buf:ArrayBuffer) {
    const snap = decodeSnap(buf);
    if (snap) this.receive({ t: 'snap', tick: snap.tick, ack: snap.ack, me: snap.me, ms: snap.ms, mv: snap.mv, ps: snap.rows });
  }

  /** 화면에 보이는 반경(m)을 알려 준다 (15% 넘게 바뀔 때만) — 서버는 이 안의 사람만 보낸다 */
  setView(r:number) {
    const v = Math.round(Math.max(VIEW_MIN, Math.min(VIEW_MAX, r)));
    if (this.state !== 'online' || (this.sentView && Math.abs(v - this.sentView) < this.sentView * 0.15)) return;
    this.sentView = v;
    this.send({ t: 'view', r: v });
  }

  /** 1초마다 ping — 데이터채널이 열려 있으면 그 길로 (스냅숏이 오가는 길의 실제 지연) */
  private startPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      const m = JSON.stringify({ t: 'ping', c: performance.now() } satisfies ClientMsg);
      if (this.dc?.readyState === 'open') this.dc.send(m);
      else if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(m);
    }, 1000);
  }

  private pong(c:number) {
    const r = performance.now() - c;
    if (r < 0 || r > 10000) return;
    this.jitter = this.lastRtt ? this.jitter + (Math.abs(r - this.lastRtt) - this.jitter) * 0.3 : 0;
    this.rtt = this.rtt ? this.rtt + (r - this.rtt) * 0.3 : r;
    this.lastRtt = r;
  }

  /**
   * 입력 보내기. 웹소켓은 이번 프레임에 만든 것만, 데이터채널은 잃어버릴 수 있으니 아직 확인 안 된 최근 입력을 겹쳐 보낸다
   * (서버는 이미 받은 순번을 버린다)
   */
  sendInputs(fresh:InputTuple[], unacked:InputTuple[]) {
    if (this.state !== 'online' || !fresh.length) return;
    if (this.dc?.readyState === 'open') this.dc.send(encodeInputs(unacked.slice(-10)));
    else if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeInputs(fresh));
  }

  /** WebRTC: 브라우저가 offer를 만들고, 신호는 웹소켓으로. 열리면 입력·스냅숏을 데이터채널로 */
  private startRtc() {
    if (typeof RTCPeerConnection === 'undefined') return;
    this.closeRtc();
    const pc = new RTCPeerConnection({ iceServers: [] });
    const dc = pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 });
    this.pc = pc;
    this.dc = dc;
    dc.onopen = () => {
      this.transport = 'rtc';
    };
    dc.onclose = () => {
      this.transport = 'ws';
    };
    dc.binaryType = 'arraybuffer';
    dc.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        this.binary(e.data);
        return;
      }
      try {
        this.receive(JSON.parse(String(e.data)));
      } catch {
        // 깨진 패킷
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate?.candidate) this.send({ t: 'rtc', c: e.candidate.candidate, mid: e.candidate.sdpMid ?? '0' });
    };
    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .then(() => this.send({ t: 'rtc', sdp: pc.localDescription?.sdp, type: 'offer' }))
      .catch(() => this.closeRtc());
    // 5초 안에 안 열리면 웹소켓으로 계속 (외부 UDP가 막혀 있는 경우 등)
    setTimeout(() => {
      if (this.dc === dc && dc.readyState !== 'open') this.closeRtc();
    }, 5000);
  }

  private rtcSignal(m:{ sdp?: string; type?: string; c?: string; mid?: string; }) {
    const { pc } = this;
    if (!pc) return;
    if (m.sdp && m.type) pc.setRemoteDescription({ type: m.type as RTCSdpType, sdp: m.sdp }).catch(() => this.closeRtc());
    if (m.c) pc.addIceCandidate({ candidate: m.c.replace(/^a=/, ''), sdpMid: m.mid ?? '0' }).catch(() => {});
  }

  private closeRtc() {
    this.dc?.close();
    this.pc?.close();
    this.dc = null;
    this.pc = null;
    this.transport = 'ws';
  }

  /** 새로 받은 서버 확정 상태 (없으면 null). reset이면 입장 직후라 예측을 버리고 그대로 따른다 */
  takeAuthority() {
    const a = this.auth;
    this.auth = null;
    return a;
  }

  /** 받은 모드 메시지를 꺼낸다 (모드 화면이 매 프레임 가져간다) */
  takeModeMessages() {
    const list = this.modeInbox;
    this.modeInbox = [];
    return list;
  }

  /** 모드 요청 보내기 */
  sendMode(d:unknown) {
    this.send({ t: 'mode', d });
  }

  /**
   * 늦은 시점으로 보간한 다른 사람들. 서버가 먼 사람은 덜 자주 보내므로,
   * 사람마다 최근 받은 간격의 1.3배(최소 INTERP_DELAY_MS)만큼 늦춰 두 표본 사이에 오게 한다
   */
  remotes(now:number):Remote[] {
    const out:Remote[] = [];
    this.samples.forEach((list, id) => {
      if (!list.length || now - list[list.length - 1].t > 3000) return; // 3초 소식 없으면 숨김
      const n = list.length;
      const gap = n >= 3 ? (list[n - 1].t - list[n - 3].t) / 2 : 0;
      const at = now - Math.max(INTERP_DELAY_MS, gap * 1.3);
      let { s } = list[list.length - 1];
      for (let i = list.length - 1; i > 0; i--) {
        const a = list[i - 1];
        const b = list[i];
        if (a.t <= at && at <= b.t) {
          const k = (at - a.t) / Math.max(1, b.t - a.t);
          // 건물·층이 바뀐 순간은 보간하지 않고 새 자리로
          s = a.s.b !== b.s.b || a.s.l !== b.s.l ? b.s : {
            x: a.s.x + (b.s.x - a.s.x) * k,
            y: a.s.y + (b.s.y - a.s.y) * k,
            z: a.s.z + (b.s.z - a.s.z) * k,
            f: lerpAngle(a.s.f, b.s.f, k),
            a: a.s.a + (b.s.a - a.s.a) * k,
            b: b.s.b,
            l: b.s.l,
            s: b.s.s,
            v: b.s.v,
            k: b.s.k,
          };
          break;
        }
        if (i === 1 && at < a.t) s = a.s;
      }
      out.push({ id, name: this.names.get(id) ?? '', ...s });
    });
    return out;
  }

  close() {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.closeRtc();
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }

}