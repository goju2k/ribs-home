/* eslint-disable no-restricted-syntax -- 격자 생성 반복문 */
import { FloorPlan, IndoorPlan, inRing, makePlan, ringDist, segDist, toLocal, toWorld } from './plan';
import { INDOOR_SPECS, IndoorSpec } from './spec';

import type { DecorBox } from '../decor';
import { LANDMARK_ROOFS } from '../landmark-boxes';
import { WorldData } from '../world-data';

const CELL = 0.2;
/** 실내 격자 값 */
export const CELL_FREE = 0;
export const CELL_WALL = 1; // 못 지나가고 시선도 막음
export const CELL_OUTSIDE = 2; // 건물 밖 (문으로 나가면 여기)
export const CELL_FURNITURE = 3; // 못 지나가지만 시선은 안 막음
export const WALL_T = 0.14;

/**
 * 옥상 엘리베이터 탑 (지역 좌표 u·v, m): 코어 가운데 엘리베이터 홀 + 양쪽 칸 + 뒤 기계 벽(plan.ts HALL 2 + CAR_D 2.35 + 0.25)을 옥상 위로 올린 상자.
 * 문은 v 방향 한쪽 면 가운데 홀 폭(door = 홀 반폭). 꼭대기 층 엘리베이터에서 위로 → 문 앞 옥상, 옥상에서 문으로 걸어 들어가면 → 꼭대기 층 엘리베이터 칸
 */
export const LIFT_HOUSE = { hu: 4.6, hv: 4, h: 3.2, door: 2 } as const;

/**
 * 들어갈 수 있는 건물 하나의 실내 판정 (그리기 없음 — 서버·클라이언트 공용).
 * 0.2m 격자를 처음 필요할 때 만든다 (한 층 수십 ms, 서버는 시작할 때 미리 만든다). 2층부터는 평면이 같아 하나를 같이 쓴다.
 */
export class IndoorGrid {

  readonly plan:IndoorPlan;

  readonly bid:number;

  readonly name:string;

  /** 건물 높이 = 옥상 높이 */
  readonly height:number;

  readonly spec:IndoorSpec;

  /** 옥상 엘리베이터 탑: 문 쪽(v 방향 +1/-1), 막는 상자 (블렌더 랜드마크는 옥상 설비 상자가 탑을 대신해 null) */
  readonly house:{ side: number; box: DecorBox | null; };

  private grids = new Map<number, Uint8Array>();

  private gw:number;

  private gh:number;

  private u0:number;

  private v0:number;

  constructor(spec:IndoorSpec, bid:number, data:WorldData) {
    const row = data.buildings[bid];
    this.spec = spec;
    this.bid = bid;
    this.name = data.buildingNames[bid] ?? '건물';
    this.plan = makePlan(spec, data.buildingMeta[bid][1], row.slice(4), row[0]);
    [ this.height ] = row;
    const { frame } = this.plan;
    this.u0 = -frame.L / 2 - 2;
    this.v0 = -frame.W / 2 - 2;
    this.gw = Math.ceil((frame.L + 4) / CELL);
    this.gh = Math.ceil((frame.W + 4) / CELL);
    // 문은 옥상이 더 넓게 남는 쪽으로
    const { hu, hv, h } = LIFT_HOUSE;
    const side = inRing(0, hv + 3, frame.ring) ? 1 : -1;
    this.house = { side, box: LANDMARK_ROOFS[this.name] ? null : { cx: frame.ox, cz: frame.oz, dx: frame.ux, dz: frame.uz, hl: hu, hw: hv, h: this.height + h } };
  }

  get levels() {
    return this.plan.levels;
  }

  get floorH() {
    return this.plan.floorH;
  }

  baseY(level:number) {
    return (level - 1) * this.plan.floorH;
  }

  /** 모든 층 격자를 미리 만든다 (서버 시작 시) */
  prepare() {
    for (let l = 1; l <= Math.min(2, this.levels); l++) this.grid(l);
  }

  /** 1층(로비)만 다르고 2층부터는 평면이 같아 격자 하나를 같이 쓴다 (50~60층 건물도 시작이 빠르게) */
  private grid(level:number) {
    const key = level === 1 ? 1 : 2;
    let g = this.grids.get(key);
    if (!g) {
      g = this.buildGrid(this.plan.floor(key));
      this.grids.set(key, g);
    }
    return g;
  }

  private buildGrid(plan:FloorPlan) {
    const { ring } = this.plan.frame;
    const { doors } = this.plan;
    const grid = new Uint8Array(this.gw * this.gh);
    const segs = plan.walls.map((w) => ({ a: w.a, b: w.b, t: (w.kind === 'glass' ? 0.08 : WALL_T) / 2 + 0.05 }));
    const solids = [ ...plan.caps, ...plan.stairs ];
    for (let j = 0; j < this.gh; j++) {
      for (let i = 0; i < this.gw; i++) {
        const u = this.u0 + (i + 0.5) * CELL;
        const v = this.v0 + (j + 0.5) * CELL;
        let val = inRing(u, v, ring) ? CELL_FREE : CELL_OUTSIDE;
        if (ringDist(u, v, ring) < 0.35) {
          const inDoor = plan.lobby && doors.some((d) => Math.abs((u - d.u) * d.au + (v - d.v) * d.av) < d.hw - 0.05
            && Math.abs(-(u - d.u) * d.av + (v - d.v) * d.au) < 1.2);
          if (!inDoor) val = CELL_WALL;
        }
        if (val === CELL_FREE) {
          if (solids.some((r) => u > r.u0 - 0.05 && u < r.u1 + 0.05 && v > r.v0 - 0.05 && v < r.v1 + 0.05)) val = CELL_WALL;
          else if (segs.some((s) => segDist(u, v, s.a, s.b) < s.t)) val = CELL_WALL;
          else if (plan.blocks.some((r) => u > r.u0 && u < r.u1 && v > r.v0 && v < r.v1)) val = CELL_FURNITURE;
        }
        grid[j * this.gw + i] = val;
      }
    }
    return grid;
  }

  cell(level:number, x:number, z:number) {
    const p = toLocal(this.plan.frame, x, z);
    const i = Math.floor((p.u - this.u0) / CELL);
    const j = Math.floor((p.v - this.v0) / CELL);
    if (i < 0 || j < 0 || i >= this.gw || j >= this.gh) return CELL_OUTSIDE;
    return this.grid(level)[j * this.gw + i];
  }

  private blockedAt(level:number, x:number, z:number, r:number) {
    return [[ 0, 0 ], [ r, 0 ], [ -r, 0 ], [ 0, r ], [ 0, -r ]].some(([ dx, dz ]) => {
      const c = this.cell(level, x + dx, z + dz);
      return c === CELL_WALL || c === CELL_FURNITURE;
    });
  }

  /** 실내 이동 (축별로 나눠 벽 따라 미끄러짐) */
  move(level:number, x:number, z:number, dx:number, dz:number, r:number) {
    let nx = x;
    let nz = z;
    if (!this.blockedAt(level, x + dx, z, r)) nx = x + dx;
    if (!this.blockedAt(level, nx, z + dz, r)) nz = z + dz;
    return { x: nx, z: nz };
  }

  isOutside(level:number, x:number, z:number) {
    return this.cell(level, x, z) === CELL_OUTSIDE;
  }

  /** 외곽선 안인지 (격자 없이) */
  contains(x:number, z:number) {
    const p = toLocal(this.plan.frame, x, z);
    return inRing(p.u, p.v, this.plan.frame.ring);
  }

  /** 바깥에서 (nx, nz)로 갈 때 1층 문으로 들어가는지 */
  entersAt(nx:number, nz:number) {
    const p = toLocal(this.plan.frame, nx, nz);
    if (!inRing(p.u, p.v, this.plan.frame.ring)) return false;
    return this.plan.doors.some((d) => Math.abs((p.u - d.u) * d.au + (p.v - d.v) * d.av) < d.hw - 0.3
      && Math.abs(-(p.u - d.u) * d.av + (p.v - d.v) * d.au) < 1.5);
  }

  /** 꼭대기 층 엘리베이터에서 옥상으로: 탑 문 앞 자리와 바깥을 보는 방향 */
  roofExit() {
    const { frame } = this.plan;
    const s = this.house.side;
    const p = toWorld(frame, 0, s * (LIFT_HOUSE.hv + 0.9));
    return { x: p.x, z: p.z, f: Math.atan2(-frame.uz * s, frame.ux * s) };
  }

  /** 옥상에서 (x, z) — 걸어가는 1.2m 앞 자리 — 가 탑 문 안쪽인지 */
  atRoofDoor(x:number, z:number) {
    const p = toLocal(this.plan.frame, x, z);
    const v = p.v * this.house.side;
    return Math.abs(p.u) < LIFT_HOUSE.door - 0.3 && v > LIFT_HOUSE.hv - 1.6 && v < LIFT_HOUSE.hv + 0.3;
  }

  /** 옥상에서 들어오면: 꼭대기 층 엘리베이터 칸 가운데, 홀을 보고 */
  roofArrive() {
    const { frame } = this.plan;
    const r = this.plan.floor(1).cabs[0];
    const cu = (r.u0 + r.u1) / 2;
    const p = toWorld(frame, cu, (r.v0 + r.v1) / 2);
    const s = cu < 0 ? 1 : -1;
    return { x: p.x, z: p.z, f: Math.atan2(frame.ux * s, frame.uz * s) };
  }

  /** 서 있는 엘리베이터 칸 (없으면 -1) */
  cabAt(x:number, z:number) {
    const p = toLocal(this.plan.frame, x, z);
    return this.plan.floor(1).cabs.findIndex((r) => p.u > r.u0 && p.u < r.u1 && p.v > r.v0 && p.v < r.v1);
  }

  /** 실내 시선 막힘 (그 층 벽·코어) */
  wallAt(level:number, x:number, y:number, z:number) {
    const base = this.baseY(level);
    return y > base && y < base + this.plan.floorH && this.cell(level, x, z) === CELL_WALL;
  }

  distanceTo(x:number, z:number) {
    const p = toLocal(this.plan.frame, x, z);
    return Math.max(0, Math.abs(p.u) - this.plan.frame.L / 2, Math.abs(p.v) - this.plan.frame.W / 2);
  }

}

/** INDOOR_SPECS에 있는 건물들의 실내 판정 */
export function createIndoorGrids(data:WorldData) {
  const list:IndoorGrid[] = [];
  INDOOR_SPECS.forEach((spec) => {
    const bid = data.buildingMeta.findIndex((m) => `${m[0] ? 'r' : 'w'}${m[1]}` === spec.key);
    if (bid >= 0) list.push(new IndoorGrid(spec, bid, data));
  });
  return list;
}