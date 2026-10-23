import { coverBox, Decor, DecorBox, inBox, isCover, isVehicle, placeDecor, vehicleBoxes } from './decor';
import { landmarkBoxes } from './landmark-boxes';
import { BLOCK, decodeCollision, WorldData } from './world-data';

/** 차가 놓인 자리·방향 (앞 = (dx, dz)) */
export interface VehiclePose {
  x: number; z: number; dx: number; dz: number;
}

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

  /** 도심 꾸미기 (그리기용으로도 내준다) */
  readonly decor:Decor[];

  /** 차·랜드마크 옥상 설비 충돌 상자 (BUCKET 격자) — 이동·총알을 막는다 */
  private boxBuckets = new Map<number, DecorBox[]>();

  /** 차(decor 번호)마다 지금 판정 상자 — 타면 빼고, 내리면 새 자리에 */
  private vehicleBoxesOf = new Map<number, DecorBox[]>();

  /** 차가 옮겨지거나(pose) 누가 타서 빠질 때(null) — 화면이 따라 그린다 */
  readonly vehicleListeners:((idx:number, pose:VehiclePose | null, driven:boolean) => void)[] = [];

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

    this.decor = placeDecor(data, (x, z) => this.at(x, z) === BLOCK.NONE);
    const addBox = (b:DecorBox) => {
      const r = Math.hypot(b.hl, b.hw);
      for (let bx = Math.floor((b.cx - r) / BUCKET); bx <= Math.floor((b.cx + r) / BUCKET); bx++) {
        for (let bz = Math.floor((b.cz - r) / BUCKET); bz <= Math.floor((b.cz + r) / BUCKET); bz++) {
          const list = this.boxBuckets.get(bx * 100000 + bz);
          if (list) list.push(b);
          else this.boxBuckets.set(bx * 100000 + bz, [ b ]);
        }
      }
    };
    this.addBox = addBox;
    this.decor.forEach((d, i) => {
      if (isVehicle(d.k)) {
        const boxes = vehicleBoxes(d).map((b) => ({ ...b, car: i }));
        boxes.forEach(addBox);
        this.vehicleBoxesOf.set(i, boxes);
      } else if (isCover(d.k)) addBox(coverBox(d));
    });
    // 블렌더 랜드마크 외형의 옥상 설비·난간 (몸체는 지도 바닥 다각형 그대로)
    landmarkBoxes(data).forEach(addBox);
  }

  private addBox:(b:DecorBox) => void = () => undefined;

  private removeBox(b:DecorBox) {
    const r = Math.hypot(b.hl, b.hw);
    for (let bx = Math.floor((b.cx - r) / BUCKET); bx <= Math.floor((b.cx + r) / BUCKET); bx++) {
      for (let bz = Math.floor((b.cz - r) / BUCKET); bz <= Math.floor((b.cz + r) / BUCKET); bz++) {
        const list = this.boxBuckets.get(bx * 100000 + bz);
        const at = list ? list.indexOf(b) : -1;
        if (at >= 0) list!.splice(at, 1);
      }
    }
  }

  /**
   * 차(decor 번호) 하나를 옮긴다 (pose, null이면 판정에서 뺀다). driven: 누가 운전 중 (화면은 운전하는 사람 자리에 따로 그린다).
   * 운전 중인 차도 걸음마다 옮겨 두어 걷는 사람·총알을 막는다 (운전하는 사람은 자기 차 상자를 건너뛴다)
   */
  setVehicle(idx:number, pose:VehiclePose | null, driven = false) {
    const d = this.decor[idx];
    if (!d || !isVehicle(d.k)) return;
    (this.vehicleBoxesOf.get(idx) ?? []).forEach((b) => this.removeBox(b));
    const boxes = pose ? vehicleBoxes({ ...d, ...pose }).map((b) => ({ ...b, car: idx })) : [];
    boxes.forEach(this.addBox);
    this.vehicleBoxesOf.set(idx, boxes);
    this.vehicleListeners.forEach((fn) => fn(idx, pose, driven));
  }

  /** (x, z)의 차 충돌 상자 중 가장 높은 것 (없으면 0) — 그보다 낮으면 막히고, 위에 서면 바닥 */
  private boxTop(x:number, z:number, below = Infinity, ignoreCar = -1) {
    const list = this.boxBuckets.get(Math.floor(x / BUCKET) * 100000 + Math.floor(z / BUCKET));
    if (!list) return 0;
    let top = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.h > top && b.h <= below && b.car !== ignoreCar && inBox(b, x, z)) top = b.h;
    }
    return top;
  }

  private treeHit(x:number, y:number, z:number) {
    const list = this.treeBuckets.get(Math.floor(x / TREE_BUCKET) * 100000 + Math.floor(z / TREE_BUCKET));
    return !!list?.some((t) => y > 1.7 * t.k && y < 4.7 * t.k && Math.hypot(x - t.x, z - t.z) < 1.5 * t.k);
  }

  /**
   * 카메라에서 (x, y~y+tall, z)를 보는 시선이 건물·나무에 막히는지.
   * 정사영이라 시선은 평행선: 카메라 쪽 수평 방향 (dx, dz)로 1m 갈 때마다 rise 만큼 오른다.
   */
  hidesFrom(x:number, y:number, z:number, tall:number, dx:number, dz:number, rise:number, indoor?:SightIndoor, maxS = Infinity) {
    // maxS: 카메라까지의 수평 거리 (원근 카메라는 가까이 있어 그 너머는 안 본다)
    return [ y + tall * 0.25, y + tall * 0.9 ].some((y0) => {
      for (let s = 0.6; s < maxS && y0 + s * rise < this.maxH + 1; s += 1) {
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
    // 차 지붕에도 내려설 수 있다 (날다가 내려오면)
    floor = Math.max(floor, this.boxTop(x, z, y + 0.3));
    if (floor === 0 && this.at(x, z) === BLOCK.WATER) floor = 1;
    return floor;
  }

  /** 높이 y에서 한 점이 막혔는지 (총알 광선이 0.4m마다 부르므로 배열을 만들지 않고 바로 훑는다) */
  private blockedPoint(x:number, z:number, y:number, ignoreCar = -1) {
    if (y < 0.3) {
      if (this.at(x, z) !== BLOCK.NONE) return true;
    } else {
      const list = this.buckets.get(Math.floor(x / BUCKET) * 100000 + Math.floor(z / BUCKET));
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const f = this.footprints[list[i]];
          if (f.solid && f.h > y + 0.3 && x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ && inside(f.ring, x, z)) return true;
        }
      }
    }
    // 차: 건물처럼 그 높이보다 낮으면 막힌다 (0.3m 턱은 넘는다)
    return this.boxTop(x, z, Infinity, ignoreCar) > y + 0.3;
  }

  /** 총알·시선용: 한 점이 막혔는지 — 걸을 때의 0.3m 턱 여유 없이 차는 그 높이까지 막는다 (엄폐물) */
  solidAt(x:number, z:number, y:number) {
    return this.blockedPoint(x, z, y) || this.boxTop(x, z) > y;
  }

  /** 반지름 r 원이 막힌 곳에 걸리는지 (중심 + 네 방향) */
  /** ignoreCar: 이 차(decor 번호)의 상자는 건너뛴다 (운전하는 사람이 자기 차에 걸리지 않게) */
  blocked(x:number, z:number, r:number, y = 0, ignoreCar = -1) {
    // 점(r = 0)이면 다섯 곳이 모두 같은 자리
    if (r === 0) return this.blockedPoint(x, z, y, ignoreCar);
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