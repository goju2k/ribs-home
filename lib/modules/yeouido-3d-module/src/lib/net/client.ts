import { ClientMsg, fromRow, INTERP_DELAY_MS, PlayerState, PROTOCOL_VERSION, ServerMsg, TICK_HZ } from 'yeouido-net';

/**
 * 게임 서버 접속: 자동 재접속, 내 상태를 TICK_HZ로 보내기, 다른 사람 위치를 받아 보간하기.
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

const lerpAngle = (a:number, b:number, k:number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export class GameClient {

  state:NetState = 'connecting';

  myId = 0;

  private ws:WebSocket | null = null;

  private names = new Map<number, string>();

  private samples = new Map<number, Sample[]>();

  private lastSent = 0;

  private retry = 0;

  private closed = false;

  private timer:ReturnType<typeof setTimeout> | null = null;

  private url:string;

  private name:string;

  constructor(url:string, name:string) {
    this.url = url;
    this.name = name;
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
      this.send({ t: 'hello', v: PROTOCOL_VERSION, name: this.name });
    };
    ws.onmessage = (e) => {
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
      this.myId = msg.id;
      msg.players.forEach((p) => this.names.set(p.id, p.name));
    } else if (msg.t === 'join') this.names.set(msg.id, msg.name);
    else if (msg.t === 'leave') {
      this.names.delete(msg.id);
      this.samples.delete(msg.id);
    } else if (msg.t === 'snap') {
      msg.ps.forEach((row) => {
        const { id, ...s } = fromRow(row);
        if (id === this.myId) return;
        const list = this.samples.get(id) ?? [];
        list.push({ t: now, s });
        if (list.length > 12) list.shift();
        this.samples.set(id, list);
      });
    }
  }

  private send(msg:ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** 매 프레임 불러도 되고, 실제 전송은 TICK_HZ로 */
  sendState(s:PlayerState, now:number) {
    if (this.state !== 'online' || now - this.lastSent < 1000 / TICK_HZ) return;
    this.lastSent = now;
    this.send({ t: 'state', ...s });
  }

  /** INTERP_DELAY_MS 늦은 시점으로 보간한 다른 사람들 */
  remotes(now:number):Remote[] {
    const at = now - INTERP_DELAY_MS;
    const out:Remote[] = [];
    this.samples.forEach((list, id) => {
      if (!list.length || now - list[list.length - 1].t > 3000) return; // 3초 소식 없으면 숨김
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
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }

}