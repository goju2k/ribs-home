import { BLOCK, decodeCollision, WorldData } from '../data/world-data';

const BUCKET = 50; // 건물 높이 찾기용 공간 격자(m)

interface Footprint {
  h: number;
  solid: boolean;
  ring: number[];
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

function inside(ring:number[], x:number, z:number) {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i];
    const zi = ring[i + 1];
    const xj = ring[j];
    const zj = ring[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** 1m 격자 충돌 판정 — 건물·물은 못 들어간다. 날 때는 건물 높이로 판정 */
export class Collision {

  private grid:Uint8Array;

  private w:number;

  private h:number;

  private cell:number;

  private halfW:number;

  private halfD:number;

  private footprints:Footprint[] = [];

  private buckets = new Map<number, number[]>();

  constructor(data:WorldData) {
    this.grid = decodeCollision(data.collision);
    this.w = data.collision.w;
    this.h = data.collision.h;
    this.cell = data.collision.cell;
    this.halfW = data.half.w;
    this.halfD = data.half.d;

    data.buildings.forEach((row) => {
      const ring = row.slice(4);
      let minX = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i + 1 < ring.length; i += 2) {
        minX = Math.min(minX, ring[i]);
        maxX = Math.max(maxX, ring[i]);
        minZ = Math.min(minZ, ring[i + 1]);
        maxZ = Math.max(maxZ, ring[i + 1]);
      }
      const idx = this.footprints.push({ h: row[0], solid: row[3] === 1, ring, minX, minZ, maxX, maxZ }) - 1;
      for (let bx = Math.floor(minX / BUCKET); bx <= Math.floor(maxX / BUCKET); bx++) {
        for (let bz = Math.floor(minZ / BUCKET); bz <= Math.floor(maxZ / BUCKET); bz++) {
          const key = bx * 100000 + bz;
          const list = this.buckets.get(key);
          if (list) list.push(idx);
          else this.buckets.set(key, [ idx ]);
        }
      }
    });
  }

  at(x:number, z:number) {
    const cx = Math.floor((x + this.halfW) / this.cell);
    const cz = Math.floor((z + this.halfD) / this.cell);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return BLOCK.WATER;
    return this.grid[cz * this.w + cx];
  }

  /** (x, z)를 덮는 건물들 */
  private footprintsAt(x:number, z:number) {
    const list = this.buckets.get(Math.floor(x / BUCKET) * 100000 + Math.floor(z / BUCKET)) ?? [];
    return list.map((i) => this.footprints[i])
      .filter((f) => x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ && inside(f.ring, x, z));
  }

  /** 높이 y에서 내려섰을 때 딛는 바닥 높이 (지붕, 물 위는 1m 떠 있기, 그 외 땅 0) */
  floorAt(x:number, z:number, y:number) {
    let floor = 0;
    this.footprintsAt(x, z).forEach((f) => {
      if (f.h <= y + 0.3) floor = Math.max(floor, f.h);
    });
    if (floor === 0 && this.at(x, z) === BLOCK.WATER) floor = 1;
    return floor;
  }

  /** 높이 y에서 한 점이 막혔는지 */
  private blockedPoint(x:number, z:number, y:number) {
    if (y < 0.3) return this.at(x, z) !== BLOCK.NONE;
    return this.footprintsAt(x, z).some((f) => f.solid && f.h > y + 0.3);
  }

  /** 반지름 r 원이 막힌 곳에 걸리는지 (중심 + 네 방향) */
  blocked(x:number, z:number, r:number, y = 0) {
    return this.blockedPoint(x, z, y)
      || this.blockedPoint(x + r, z, y)
      || this.blockedPoint(x - r, z, y)
      || this.blockedPoint(x, z + r, y)
      || this.blockedPoint(x, z - r, y);
  }

  /** 축별로 나눠 움직여 벽을 따라 미끄러지게 */
  move(x:number, z:number, dx:number, dz:number, r:number, y = 0) {
    let nx = x;
    let nz = z;
    if (!this.blocked(x + dx, z, r, y)) nx = x + dx;
    if (!this.blocked(nx, z + dz, r, y)) nz = z + dz;
    return { x: nx, z: nz };
  }

}