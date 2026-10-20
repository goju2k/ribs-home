import { BLOCK, decodeCollision, WorldData } from './world-data';

const BUCKET = 50; // 건물 높이 찾기용 공간 격자(m)
const TREE_BUCKET = 8;

interface Footprint {
  idx: number;
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

/** 실내에 있을 때 시선 검사: 들어간 건물은 현재 층 천장까지만, 실내 벽은 따로 */
export interface SightIndoor {
  bid: number;
  cutY: number;
  wallAt: (x:number, y:number, z:number) => boolean;
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

  private treeBuckets = new Map<number, { x: number; z: number; k: number; }[]>();

  private maxH = 0;

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
      const idx = this.footprints.push({ idx: this.footprints.length, h: row[0], solid: row[3] === 1, ring, minX, minZ, maxX, maxZ }) - 1;
      for (let bx = Math.floor(minX / BUCKET); bx <= Math.floor(maxX / BUCKET); bx++) {
        for (let bz = Math.floor(minZ / BUCKET); bz <= Math.floor(maxZ / BUCKET); bz++) {
          const key = bx * 100000 + bz;
          const list = this.buckets.get(key);
          if (list) list.push(idx);
          else this.buckets.set(key, [ idx ]);
        }
      }
    });

    // 나무 수관: 반지름 1.5k, 높이 1.7k~4.7k (build-city의 나무 모양과 맞춤)
    for (let i = 0; i + 2 < data.trees.length; i += 3) {
      const tree = { x: data.trees[i], z: data.trees[i + 1], k: data.trees[i + 2] / 10 };
      const r = 1.5 * tree.k;
      // 칸 경계에 걸친 수관도 찾도록 겹치는 칸마다 넣는다
      for (let bx = Math.floor((tree.x - r) / TREE_BUCKET); bx <= Math.floor((tree.x + r) / TREE_BUCKET); bx++) {
        for (let bz = Math.floor((tree.z - r) / TREE_BUCKET); bz <= Math.floor((tree.z + r) / TREE_BUCKET); bz++) {
          const list = this.treeBuckets.get(bx * 100000 + bz);
          if (list) list.push(tree);
          else this.treeBuckets.set(bx * 100000 + bz, [ tree ]);
        }
      }
    }
    this.maxH = data.maxBuildingHeight;
  }

  private treeHit(x:number, y:number, z:number) {
    const list = this.treeBuckets.get(Math.floor(x / TREE_BUCKET) * 100000 + Math.floor(z / TREE_BUCKET));
    return !!list?.some((t) => y > 1.7 * t.k && y < 4.7 * t.k && Math.hypot(x - t.x, z - t.z) < 1.5 * t.k);
  }

  /**
   * 카메라에서 (x, y~y+tall, z)를 보는 시선이 건물·나무에 막히는지.
   * 정사영이라 시선은 평행선: 카메라 쪽 수평 방향 (dx, dz)로 1m 갈 때마다 rise 만큼 오른다.
   */
  hidesFrom(x:number, y:number, z:number, tall:number, dx:number, dz:number, rise:number, indoor?:SightIndoor) {
    return [ y + tall * 0.25, y + tall * 0.9 ].some((y0) => {
      for (let s = 0.6; y0 + s * rise < this.maxH + 1; s += 1) {
        const sx = x + dx * s;
        const sz = z + dz * s;
        const sy = y0 + s * rise;
        if (sy < 6 && this.treeHit(sx, sy, sz)) return true;
        if (this.footprintsAt(sx, sz).some((f) => (indoor && f.idx === indoor.bid ? Math.min(f.h, indoor.cutY) : f.h) > sy)) return true;
        if (indoor?.wallAt(sx, sy, sz)) return true;
      }
      return false;
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