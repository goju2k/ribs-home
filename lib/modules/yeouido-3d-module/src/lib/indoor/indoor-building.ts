/* eslint-disable no-restricted-syntax -- 격자·메시 생성 반복문 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { AutoDoor, FloorPlan, IndoorPlan, inRing, makePlan, Rect, ringDist, segDist, Stair, toLocal, UV } from './plan';
import { propGeometry } from './props';
import { INDOOR_SPECS, IndoorSpec } from './spec';

import { WorldData } from '../data/world-data';
import { MAX_DOORS, SEE, seeThrough } from '../world/see-through';

const CELL = 0.2;
/** 실내 격자 값 */
const FREE = 0;
const WALL = 1; // 못 지나가고 시선도 막음
const OUTSIDE = 2; // 건물 밖 (문으로 나가면 여기)
const FURNITURE = 3; // 못 지나가지만 시선은 안 막음
const WALL_T = 0.14;

const mat = (color?:string) => seeThrough(new THREE.MeshLambertMaterial(color ? { color } : { vertexColors: true }));

function colored(g:THREE.BufferGeometry, color:string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const cols = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < cols.length; i += 3) cols.set([ c.r, c.g, c.b ], i);
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}

/** 지역 좌표 선분 → 바닥에 선 얇은 상자 */
function wallBox(a:UV, b:UV, h:number, t:number, y0:number, color:string) {
  const len = Math.hypot(b.u - a.u, b.v - a.v);
  const g = new THREE.BoxGeometry(len, h, t);
  g.rotateY(-Math.atan2(b.v - a.v, b.u - a.u));
  g.translate((a.u + b.u) / 2, y0 + h / 2, (a.v + b.v) / 2);
  return colored(g, color);
}

const rectBox = (r:Rect, h:number, color:string, y0 = 0) => {
  const g = new THREE.BoxGeometry(r.u1 - r.u0, h, r.v1 - r.v0);
  g.translate((r.u0 + r.u1) / 2, y0 + h / 2, (r.v0 + r.v1) / 2);
  return colored(g, color);
};

/** 비상계단: 두 갈래(같은 칸 안에서 나란히, 중간 참) — 계단 칸은 막혀 있고 위에서 보이기만 한다 */
function stairGeometry(st:Stair, H:number) {
  const out:THREE.BufferGeometry[] = [];
  const mid = (st.u0 + st.u1) / 2;
  const n = 12;
  const rise = H / 2 / n;
  const tread = 0.28;
  const run = n * tread;
  const vStart = -st.dir * (run / 2 + 0.4);
  const color = (k:number) => (k % 2 ? '#bab4a8' : '#c7c1b5');
  for (let k = 0; k < n; k++) {
    // 첫 갈래: dir 쪽으로 오른다
    const a = vStart + st.dir * k * tread;
    out.push(rectBox({ u0: st.u0 + 0.15, u1: mid - 0.08, v0: Math.min(a, a + st.dir * tread), v1: Math.max(a, a + st.dir * tread) }, (k + 1) * rise, color(k)));
    // 둘째 갈래: 참에서 되돌아 오른다
    const b = vStart + st.dir * (run - k * tread);
    out.push(rectBox({ u0: mid + 0.08, u1: st.u1 - 0.15, v0: Math.min(b, b - st.dir * tread), v1: Math.max(b, b - st.dir * tread) }, H / 2 + (k + 1) * rise, color(k)));
  }
  // 중간 참
  const landing0 = vStart + st.dir * run;
  const landingEnd = st.dir * (Math.abs(st.v1 - st.v0) / 2 - 0.15);
  out.push(rectBox({ u0: st.u0 + 0.15, u1: st.u1 - 0.15, v0: Math.min(landing0, landingEnd), v1: Math.max(landing0, landingEnd) }, H / 2, '#b3ada1'));
  // 두 갈래 사이 벽과 초록 비상구 표시
  out.push(wallBox({ u: mid, v: vStart }, { u: mid, v: landing0 }, H - 0.3, 0.12, 0, '#d8d3c9'));
  out.push(rectBox({ u0: mid - 0.3, u1: mid + 0.3, v0: -st.dir * (Math.abs(st.v1 - st.v0) / 2 - 0.2) - 0.05, v1: -st.dir * (Math.abs(st.v1 - st.v0) / 2 - 0.2) + 0.05 }, 0.25, '#2fb35a', 2.6));
  return out;
}

/** 들어갈 수 있는 건물 하나: 층별 실내 메시와 실내 충돌, 엘리베이터 */
export class IndoorBuilding {

  readonly plan:IndoorPlan;

  readonly bid:number;

  readonly name:string;

  readonly group = new THREE.Group();

  private floorGroup:THREE.Group | null = null;

  private shownLevel = 0;

  /** 현재 층 자동문: 두 짝과 열린 정도(0~1) */
  private autoDoors:{ d: AutoDoor; l: THREE.Mesh; r: THREE.Mesh; open: number; }[] = [];

  private grid:Uint8Array = new Uint8Array(0);

  private gw:number;

  private gh:number;

  private u0:number;

  private v0:number;

  constructor(readonly spec:IndoorSpec, bid:number, data:WorldData) {
    const row = data.buildings[bid];
    this.bid = bid;
    this.name = data.buildingNames[bid] ?? '건물';
    this.plan = makePlan(spec, data.buildingMeta[bid][1], row.slice(4), row[0]);
    const { frame } = this.plan;
    // 지역 좌표(u→x, v→z)를 월드로: y축 회전 θ에서 x축 → (cosθ, -sinθ) = (ux, uz)
    this.group.position.set(frame.ox, 0, frame.oz);
    this.group.rotation.y = Math.atan2(-frame.uz, frame.ux);
    this.u0 = -frame.L / 2 - 2;
    this.v0 = -frame.W / 2 - 2;
    this.gw = Math.ceil((frame.L + 4) / CELL);
    this.gh = Math.ceil((frame.W + 4) / CELL);
    this.group.add(this.doorFrames());
  }

  /** 출입문 테두리: 양쪽 기둥과 위 인방 (밖에서 문 자리가 보이게, 늘 표시) */
  private doorFrames() {
    const { ring } = this.plan.frame;
    const parts:THREE.BufferGeometry[] = [];
    this.plan.doors.forEach((d) => {
      // 문 바깥쪽 법선
      let nu = -d.av;
      let nv = d.au;
      if (inRing(d.u + nu * 0.3, d.v + nv * 0.3, ring)) {
        nu = -nu;
        nv = -nv;
      }
      const at = (t:number, out:number) => ({ u: d.u + d.au * t + nu * out, v: d.v + d.av * t + nv * out });
      [ -1, 1 ].forEach((s) => parts.push(wallBox(at(s * (d.hw + 0.15) - 0.15, 0.15), at(s * (d.hw + 0.15) + 0.15, 0.15), d.h + 0.3, 0.5, 0, '#3a4048')));
      parts.push(wallBox(at(-d.hw - 0.3, 0.15), at(d.hw + 0.3, 0.15), 0.3, 0.5, d.h, '#3a4048'));
      // 문 앞 매트
      parts.push(wallBox(at(-d.hw, 1.2), at(d.hw, 1.2), 0.03, 2.2, 0.01, '#5b5f66'));
    });
    return new THREE.Mesh(mergeGeometries(parts), mat());
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

  /** 이 층을 보여 주고 실내 충돌을 만든다 (0이면 숨김) */
  show(level:number) {
    if (level === this.shownLevel) return;
    this.shownLevel = level;
    if (this.floorGroup) {
      this.group.remove(this.floorGroup);
      this.floorGroup.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      this.floorGroup = null;
      this.autoDoors = [];
    }
    if (!level) return;
    const plan = this.plan.floor(level);
    this.floorGroup = this.buildFloor(plan);
    this.floorGroup.position.y = this.baseY(level);
    this.group.add(this.floorGroup);
    this.buildGrid(plan);
  }

  private buildFloor(plan:FloorPlan) {
    const { frame, floorH, doors } = this.plan;
    const g = new THREE.Group();
    const H = floorH - 0.05;

    // 바닥: 외곽선 모양 (Shape는 XY 평면 → X축 -90° 회전하면 (u, -v) 가 (u, v) 로)
    const shape = new THREE.Shape(frame.ring.map((p) => new THREE.Vector2(p.u, -p.v)));
    const floorGeo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, 0.03, 0);
    g.add(new THREE.Mesh(colored(floorGeo, plan.lobby ? '#c8b89c' : '#a9a69d'), mat()));

    const parts:THREE.BufferGeometry[] = [];
    // 외벽 안쪽 면: 벽 + 창 띠 (문 자리는 비움)
    const { ring } = frame;
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b.u - a.u, b.v - a.v);
      if (len < 0.05) return;
      const at = (t:number) => ({ u: a.u + ((b.u - a.u) * t) / len, v: a.v + ((b.v - a.v) * t) / len });
      // 안쪽으로 살짝 들인다
      let nu = -(b.v - a.v) / len;
      let nv = (b.u - a.u) / len;
      if (!inRing((a.u + b.u) / 2 + nu * 0.3, (a.v + b.v) / 2 + nv * 0.3, ring)) {
        nu = -nu;
        nv = -nv;
      }
      const inset = (p:UV, d:number) => ({ u: p.u + nu * d, v: p.v + nv * d });
      const spans:[number, number][] = [];
      const door = plan.lobby ? doors.find((d) => d.edge === i) : undefined;
      if (door) {
        const t = (door.u - a.u) * door.au + (door.v - a.v) * door.av;
        spans.push([ 0, t - door.hw ], [ t + door.hw, len ]);
        // 문 위 상인방
        parts.push(wallBox(inset(at(t - door.hw), 0.2), inset(at(t + door.hw), 0.2), H - door.h, 0.2, door.h, '#e8e4dc'));
      } else spans.push([ 0, len ]);
      spans.forEach(([ s, e ]) => {
        if (e - s < 0.05) return;
        parts.push(wallBox(inset(at(s), 0.2), inset(at(e), 0.2), H, 0.2, 0, '#e8e4dc'));
        parts.push(wallBox(inset(at(s), 0.32), inset(at(e), 0.32), H - 1.5, 0.04, 0.9, '#8fb2c6'));
      });
    });
    // 칸막이·회의실 유리벽
    plan.walls.forEach((w) => parts.push(wallBox(w.a, w.b, w.kind === 'glass' ? H - 0.4 : H - 0.2, w.kind === 'glass' ? 0.08 : WALL_T, 0, w.kind === 'glass' ? '#b7d0dd' : '#e9e6df')));
    // 코어: 막힌 덩어리와 엘리베이터 칸
    plan.caps.forEach((r) => parts.push(rectBox(r, H, '#bdb6aa')));
    plan.cabs.forEach((r) => parts.push(rectBox({ u0: r.u0 + 0.05, u1: r.u1 - 0.05, v0: r.v0 + 0.05, v1: r.v1 - 0.05 }, 0.04, '#7f8a96', 0.03)));
    // 엘리베이터 홀 바닥 (돌)
    const hall = plan.cabs.reduce((a, r) => ({ u0: Math.min(a.u0, r.u0), u1: Math.max(a.u1, r.u1), v0: Math.min(a.v0, r.v0), v1: Math.max(a.v1, r.v1) }), plan.cabs[0]);
    parts.push(rectBox({ u0: -2, u1: 2, v0: hall.v0 - 1.5, v1: hall.v1 + 1.5 }, 0.02, '#d6d0c4', 0.03));
    plan.stairs.forEach((st) => parts.push(...stairGeometry(st, H)));
    g.add(new THREE.Mesh(mergeGeometries(parts), mat()));

    // 자동문: 두 짝이 u 방향으로 벌어진다 (고정 유리 바로 안쪽에서 미끄러짐)
    plan.autoDoors.forEach((d) => {
      const panel = () => {
        const m = new THREE.Mesh(wallBox({ u: -d.hw / 2, v: 0 }, { u: d.hw / 2, v: 0 }, H - 0.5, 0.06, 0, '#9cc0d4'), mat());
        m.position.z = d.v - Math.sign(d.v) * 0.08;
        g.add(m);
        return m;
      };
      this.autoDoors.push({ d, l: panel(), r: panel(), open: 0 });
    });
    this.updateDoors(0, null);

    // 가구: 종류별 인스턴스
    const byType = new Map<string, typeof plan.props>();
    plan.props.forEach((p) => {
      const list = byType.get(p.type) ?? [];
      list.push(p);
      byType.set(p.type, list);
    });
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    byType.forEach((list, type) => {
      const inst = new THREE.InstancedMesh(propGeometry(list[0].type), mat(), list.length);
      list.forEach((p, i) => inst.setMatrixAt(i, m.compose(new THREE.Vector3(p.u, 0.04, p.v), q.setFromAxisAngle(up, p.rot), new THREE.Vector3(1, 1, 1))));
      inst.name = type;
      g.add(inst);
    });
    return g;
  }

  private buildGrid(plan:FloorPlan) {
    const { ring } = this.plan.frame;
    const { doors } = this.plan;
    const grid = new Uint8Array(this.gw * this.gh);
    const segs = plan.walls.map((w) => ({ a: w.a, b: w.b, t: (w.kind === 'glass' ? 0.08 : WALL_T) / 2 + 0.05 }));
    for (let j = 0; j < this.gh; j++) {
      for (let i = 0; i < this.gw; i++) {
        const u = this.u0 + (i + 0.5) * CELL;
        const v = this.v0 + (j + 0.5) * CELL;
        const inside = inRing(u, v, ring);
        let val = inside ? FREE : OUTSIDE;
        if (ringDist(u, v, ring) < 0.35) {
          const inDoor = plan.lobby && doors.some((d) => Math.abs((u - d.u) * d.au + (v - d.v) * d.av) < d.hw - 0.05
            && Math.abs(-(u - d.u) * d.av + (v - d.v) * d.au) < 1.2);
          if (!inDoor) val = WALL;
        }
        if (val === FREE) {
          if ([ ...plan.caps, ...plan.stairs ].some((r) => u > r.u0 - 0.05 && u < r.u1 + 0.05 && v > r.v0 - 0.05 && v < r.v1 + 0.05)) val = WALL;
          else if (segs.some((s) => segDist(u, v, s.a, s.b) < s.t)) val = WALL;
          else if (plan.blocks.some((r) => u > r.u0 && u < r.u1 && v > r.v0 && v < r.v1)) val = FURNITURE;
        }
        grid[j * this.gw + i] = val;
      }
    }
    this.grid = grid;
  }

  /** 자동문: 플레이어가 문 반폭+1.5m 안에 오면 열린다 (p = 플레이어 지역 좌표) */
  private updateDoors(dt:number, p:UV | null) {
    this.autoDoors.forEach((a) => {
      const near = p ? Math.hypot(p.u - a.d.u, p.v - a.d.v) < a.d.hw + 1.5 : false;
      a.open = dt ? a.open + ((near ? 1 : 0) - a.open) * (1 - Math.exp(-dt * 7)) : a.open;
      const slide = a.d.hw / 2 + a.open * a.d.hw * 0.95;
      a.l.position.x = a.d.u - slide;
      a.r.position.x = a.d.u + slide;
    });
  }

  /** 매 프레임: 자동문 */
  update(dt:number, x:number, z:number) {
    if (this.autoDoors.length) this.updateDoors(dt, toLocal(this.plan.frame, x, z));
  }

  private cell(x:number, z:number) {
    const p = toLocal(this.plan.frame, x, z);
    const i = Math.floor((p.u - this.u0) / CELL);
    const j = Math.floor((p.v - this.v0) / CELL);
    if (i < 0 || j < 0 || i >= this.gw || j >= this.gh) return OUTSIDE;
    return this.grid[j * this.gw + i];
  }

  private blockedAt(x:number, z:number, r:number) {
    return [[ 0, 0 ], [ r, 0 ], [ -r, 0 ], [ 0, r ], [ 0, -r ]].some(([ dx, dz ]) => {
      const c = this.cell(x + dx, z + dz);
      return c === WALL || c === FURNITURE;
    });
  }

  /** 실내 이동 (축별로 나눠 벽 따라 미끄러짐) */
  move(x:number, z:number, dx:number, dz:number, r:number) {
    let nx = x;
    let nz = z;
    if (!this.blockedAt(x + dx, z, r)) nx = x + dx;
    if (!this.blockedAt(nx, z + dz, r)) nz = z + dz;
    return { x: nx, z: nz };
  }

  isOutside(x:number, z:number) {
    return this.cell(x, z) === OUTSIDE;
  }

  /** 외곽선 안인지 (격자 없이) */
  contains(x:number, z:number) {
    const p = toLocal(this.plan.frame, x, z);
    return inRing(p.u, p.v, this.plan.frame.ring);
  }

  /** 바깥에서 (x,z) → (nx,nz)로 갈 때 1층 문으로 들어가는지 */
  entersAt(nx:number, nz:number) {
    const p = toLocal(this.plan.frame, nx, nz);
    if (!inRing(p.u, p.v, this.plan.frame.ring)) return false;
    return this.plan.doors.some((d) => Math.abs((p.u - d.u) * d.au + (p.v - d.v) * d.av) < d.hw - 0.3
      && Math.abs(-(p.u - d.u) * d.av + (p.v - d.v) * d.au) < 1.5);
  }

  /** 서 있는 엘리베이터 칸 */
  cabAt(x:number, z:number) {
    const p = toLocal(this.plan.frame, x, z);
    return this.plan.floor(1).cabs.findIndex((r) => p.u > r.u0 && p.u < r.u1 && p.v > r.v0 && p.v < r.v1);
  }

  /** 실내 시선 막힘 (현재 층 벽·코어) */
  wallAt(x:number, y:number, z:number, level:number) {
    const base = this.baseY(level);
    return y > base && y < base + this.plan.floorH && this.cell(x, z) === WALL;
  }

  distanceTo(x:number, z:number) {
    const p = toLocal(this.plan.frame, x, z);
    return Math.max(0, Math.abs(p.u) - this.plan.frame.L / 2, Math.abs(p.v) - this.plan.frame.W / 2);
  }

}

export function createIndoorBuildings(data:WorldData) {
  const list:IndoorBuilding[] = [];
  INDOOR_SPECS.forEach((spec) => {
    const bid = data.buildingMeta.findIndex((m) => `${m[0] ? 'r' : 'w'}${m[1]}` === spec.key);
    if (bid < 0) return;
    list.push(new IndoorBuilding(spec, bid, data));
  });
  // 문 구멍은 늘 뚫어 둔다 (밖에서 로비가 보이게)
  let k = 0;
  list.forEach((b) => b.plan.doors.forEach((d) => {
    if (k >= MAX_DOORS) return;
    const { frame } = b.plan;
    const c = { x: frame.ox + frame.ux * d.u - frame.uz * d.v, z: frame.oz + frame.uz * d.u + frame.ux * d.v };
    const ax = frame.ux * d.au - frame.uz * d.av;
    const az = frame.uz * d.au + frame.ux * d.av;
    SEE.doorA.value[k].set(c.x, c.z, ax, az);
    SEE.doorB.value[k].set(d.hw, d.h, b.bid + 1, 0);
    k++;
  }));
  return list;
}