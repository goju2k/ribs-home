import { Circle, DROP_WEIGHTS, GroundItem, ITEM_KINDS, pickSpawn } from 'yeouido-br';
import { SimWorld } from 'yeouido-sim';

/** 아이템 찾기 격자 한 칸 (m) */
const CELL = 8;
const key = (cx:number, cz:number) => (cx + 4096) * 8192 + (cz + 4096);

const WEIGHT_SUM = ITEM_KINDS.reduce((s, k) => s + DROP_WEIGHTS[k], 0);

/** 비율대로 아무 종류 (ITEM_KINDS 번호) */
export function randomKind(rand:() => number = Math.random) {
  let r = rand() * WEIGHT_SUM;
  for (let i = 0; i < ITEM_KINDS.length; i++) {
    r -= DROP_WEIGHTS[ITEM_KINDS[i]];
    if (r < 0) return i;
  }
  return 0;
}

/**
 * 땅에 떨어진 아이템들 (배틀로얄 모드). 줍기 판정이 사람마다 근처만 보도록 8m 격자에 넣어 둔다.
 */
export class ItemField {

  private items = new Map<number, GroundItem>();

  private grid = new Map<number, Set<number>>();

  private nextId = 1;

  get size() {
    return this.items.size;
  }

  list() {
    return [ ...this.items.values() ];
  }

  clear() {
    this.items.clear();
    this.grid.clear();
  }

  add(kind:number, lv:number, x:number, y:number, z:number, b:number, l:number) {
    const r2 = (n:number) => Math.round(n * 100) / 100;
    const it:GroundItem = [ this.nextId++, kind, lv, r2(x), r2(y), r2(z), b, l ];
    this.items.set(it[0], it);
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL));
    const set = this.grid.get(k) ?? new Set<number>();
    set.add(it[0]);
    this.grid.set(k, set);
    return it;
  }

  remove(id:number) {
    const it = this.items.get(id);
    if (!it) return;
    this.items.delete(id);
    this.grid.get(key(Math.floor(it[3] / CELL), Math.floor(it[5] / CELL)))?.delete(id);
  }

  /** (x, z)에서 r 안의 아이템 (높이·건물은 부르는 쪽이 본다) */
  near(x:number, z:number, r:number) {
    const out:GroundItem[] = [];
    const cx1 = Math.floor((x + r) / CELL);
    const cz0 = Math.floor((z - r) / CELL);
    const cz1 = Math.floor((z + r) / CELL);
    for (let cx = Math.floor((x - r) / CELL); cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        this.grid.get(key(cx, cz))?.forEach((id) => {
          const it = this.items.get(id)!;
          if (Math.hypot(it[3] - x, it[5] - z) <= r) out.push(it);
        });
      }
    }
    return out;
  }

  /** 원 밖 아이템을 없애고 그 번호들 */
  removeOutside(c:Circle) {
    const out:number[] = [];
    this.items.forEach((it) => {
      if (Math.hypot(it[3] - c.cx, it[5] - c.cz) > c.r) out.push(it[0]);
    });
    out.forEach((id) => this.remove(id));
    return out;
  }

  /** 원 안 아이템 수 */
  countIn(c:Circle) {
    let n = 0;
    this.items.forEach((it) => {
      if (Math.hypot(it[3] - c.cx, it[5] - c.cz) <= c.r) n++;
    });
    return n;
  }

  /** 원 안 무작위 자리(지상·옥상·실내)에 n개 뿌린다 */
  scatter(sim:SimWorld, c:Circle, n:number) {
    const added:GroundItem[] = [];
    for (let i = 0; i < n; i++) {
      const s = pickSpawn(sim, c);
      added.push(this.add(randomKind(), 1, s.x, s.y, s.z, s.b, s.l));
    }
    return added;
  }

}