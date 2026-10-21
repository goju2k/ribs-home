import { Circle, pickSpawn, PROP_HP, PROP_KINDS, PROP_WEIGHTS, PropRow } from 'yeouido-br';
import { SimWorld } from 'yeouido-sim';

/** 물건 찾기 격자 한 칸 (m) */
/** 흩뿌리기: 옥상은 실내가 있는 건물 옥상뿐이라(지금 KB 한 채) 1%만 — 좁은 옥상에 쏟아지지 않게 */
const SCATTER = { roof: 0.01, indoor: 0.1 };

const CELL = 8;
const key = (cx:number, cz:number) => (cx + 4096) * 8192 + (cz + 4096);

const WEIGHT_SUM = PROP_KINDS.reduce((s, k) => s + PROP_WEIGHTS[k], 0);

function randomPropKind(rand:() => number = Math.random) {
  let r = rand() * WEIGHT_SUM;
  for (let i = 0; i < PROP_KINDS.length; i++) {
    r -= PROP_WEIGHTS[PROP_KINDS[i]];
    if (r < 0) return i;
  }
  return 0;
}

export interface Prop {
  id: number; kind: number; hp: number; x: number; y: number; z: number; b: number; l: number; f: number;
}

const r2 = (n:number) => Math.round(n * 100) / 100;

/** 보내는 형태 (내구도는 0~255로) */
export const propRow = (p:Prop):PropRow => [ p.id, p.kind, Math.round((p.hp / PROP_HP[PROP_KINDS[p.kind]]) * 255), p.x, p.y, p.z, p.b, p.l, p.f ];

/**
 * 부술 수 있는 물건들 (배틀로얄 모드). 공격 판정이 근처만 보도록 8m 격자에 넣어 둔다.
 */
export class PropField {

  private props = new Map<number, Prop>();

  private grid = new Map<number, Set<number>>();

  private nextId = 1;

  get size() {
    return this.props.size;
  }

  list() {
    return [ ...this.props.values() ].map(propRow);
  }

  clear() {
    this.props.clear();
    this.grid.clear();
  }

  add(kind:number, x:number, y:number, z:number, b:number, l:number, f:number) {
    const p:Prop = { id: this.nextId++, kind, hp: PROP_HP[PROP_KINDS[kind]], x: r2(x), y: r2(y), z: r2(z), b, l, f: r2(f) };
    this.props.set(p.id, p);
    const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    const set = this.grid.get(k) ?? new Set<number>();
    set.add(p.id);
    this.grid.set(k, set);
    return p;
  }

  remove(id:number) {
    const p = this.props.get(id);
    if (!p) return;
    this.props.delete(id);
    this.grid.get(key(Math.floor(p.x / CELL), Math.floor(p.z / CELL)))?.delete(id);
  }

  near(x:number, z:number, r:number) {
    const out:Prop[] = [];
    const cx1 = Math.floor((x + r) / CELL);
    const cz0 = Math.floor((z - r) / CELL);
    const cz1 = Math.floor((z + r) / CELL);
    for (let cx = Math.floor((x - r) / CELL); cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        this.grid.get(key(cx, cz))?.forEach((id) => {
          const p = this.props.get(id)!;
          if (Math.hypot(p.x - x, p.z - z) <= r) out.push(p);
        });
      }
    }
    return out;
  }

  countIn(c:Circle) {
    let n = 0;
    this.props.forEach((p) => {
      if (Math.hypot(p.x - c.cx, p.z - c.cz) <= c.r) n++;
    });
    return n;
  }

  removeOutside(c:Circle) {
    const out:number[] = [];
    this.props.forEach((p) => {
      if (Math.hypot(p.x - c.cx, p.z - c.cz) > c.r) out.push(p.id);
    });
    out.forEach((id) => this.remove(id));
    return out;
  }

  /** 원 안 무작위 자리(지상·옥상·실내)에 n개 */
  scatter(sim:SimWorld, c:Circle, n:number) {
    const added:Prop[] = [];
    for (let i = 0; i < n; i++) {
      const s = pickSpawn(sim, c, Math.random, SCATTER);
      added.push(this.add(randomPropKind(), s.x, s.y, s.z, s.b, s.l, Math.random() * Math.PI * 2));
    }
    return added.map(propRow);
  }

}