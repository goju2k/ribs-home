import { WebSocket } from 'ws';
import { ClientMsg, MAX_SPEED, OUTDOOR, PlayerState, ServerMsg, TICK_HZ, toRow, validState } from 'yeouido-net';

interface Player {
  id: number;
  name: string;
  ws: WebSocket;
  state: PlayerState;
  /** 마지막으로 받은 상태 시각 (순간이동 판정용) */
  at: number;
  /** 아직 첫 위치를 안 보냈으면 다른 사람에게 안 보인다 */
  placed: boolean;
}

/**
 * 월드 하나 = 여의도 맵 한 판. 프로세스 하나가 여러 월드를 돌릴 수 있게 상태를 여기 모은다
 * (나중에 샤드·시즌·사설 방으로 나눌 때 월드를 더 만들면 된다).
 */
export class World {

  private players = new Map<number, Player>();

  private nextId = 1;

  private tick = 0;

  private timer:NodeJS.Timeout | null = null;

  readonly id:string;

  constructor(id:string) {
    this.id = id;
  }

  get size() {
    return this.players.size;
  }

  start() {
    this.timer = setInterval(() => this.step(), 1000 / TICK_HZ);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** 새 연결: hello를 받으면 입장시킨다 */
  connect(ws:WebSocket) {
    let me:Player | null = null;
    const hello = setTimeout(() => ws.close(4000, 'hello timeout'), 5000);

    ws.on('message', (raw) => {
      let msg:ClientMsg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!me) {
        if (msg.t !== 'hello') return;
        clearTimeout(hello);
        me = this.join(ws, String(msg.name || '').slice(0, 16) || '시민');
        return;
      }
      if (msg.t === 'state') this.move(me, msg);
    });
    ws.on('close', () => {
      clearTimeout(hello);
      if (me) this.leave(me);
    });
    ws.on('error', () => ws.terminate());
  }

  private join(ws:WebSocket, name:string) {
    const p:Player = { id: this.nextId++, name, ws, state: { x: 0, y: 0, z: 0, f: 0, a: 0, b: OUTDOOR, l: 1 }, at: Date.now(), placed: false };
    this.players.set(p.id, p);
    this.send(p, { t: 'welcome', id: p.id, world: this.id, hz: TICK_HZ, players: [ ...this.players.values() ].filter((o) => o !== p).map((o) => ({ id: o.id, name: o.name })) });
    this.broadcast({ t: 'join', id: p.id, name }, p);
    console.log(`[${this.id}] join #${p.id} ${name} (${this.players.size}명)`);
    return p;
  }

  private leave(p:Player) {
    if (!this.players.delete(p.id)) return;
    this.broadcast({ t: 'leave', id: p.id });
    console.log(`[${this.id}] leave #${p.id} ${p.name} (${this.players.size}명)`);
  }

  /** 위치는 클라이언트가 보내되, 말이 안 되는 속도면 버린다 (건물 출입·층 이동은 순간이동 허용) */
  private move(p:Player, s:PlayerState) {
    if (!validState(s)) return;
    const now = Date.now();
    const dt = Math.max(0.05, (now - p.at) / 1000);
    const dist = Math.hypot(s.x - p.state.x, s.z - p.state.z);
    const sameSpace = s.b === p.state.b;
    if (p.placed && sameSpace && dist > MAX_SPEED * dt + 2) return;
    p.state = { x: s.x, y: s.y, z: s.z, f: s.f, a: Math.max(0, Math.min(60, s.a)), b: Math.round(s.b), l: Math.round(s.l) };
    p.at = now;
    p.placed = true;
  }

  /** 매 틱: 모두의 위치를 모두에게 (주변 구역만 보내기는 다음 단계) */
  private step() {
    this.tick++;
    if (!this.players.size) return;
    const rows = [ ...this.players.values() ].filter((p) => p.placed).map((p) => toRow(p.id, p.state));
    const msg = JSON.stringify({ t: 'snap', tick: this.tick, ps: rows } satisfies ServerMsg);
    this.players.forEach((p) => {
      if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
    });
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