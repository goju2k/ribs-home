/* eslint-disable no-restricted-syntax, no-continue, no-bitwise -- 평면 생성 반복문, 난수 */
import { FACING, IndoorSpec } from './spec';

/**
 * 건물 실내 평면 자동 생성.
 * 좌표는 건물 지역 좌표 (u = 가장 긴 벽 방향, v = 그에 수직, 원점 = 외곽 사각형 가운데).
 * 난수 없이 외곽선만으로 정해지므로 같은 건물은 항상 같은 실내가 나온다 (다중접속에서 모두가 같은 실내를 봐야 함).
 *
 * 사무 고층 평면 (KB국민은행 본점 기준):
 *  - 가운데 코어 띠가 긴 방향(u)으로 길게 놓여 사무 공간을 +v / -v 두 영역으로 나눈다
 *  - 띠 가운데 엘리베이터 홀이 v 방향으로 뚫려 있고, 홀 양쪽에 엘리베이터 2대씩, 그 바깥에 비상계단
 *  - 홀 양 끝은 홀 폭 전체 자동문(1층은 출입구와 바로 이어짐)
 *  - 계단 바깥은 화장실, 그 옆 탕비실(양쪽 영역으로 문), 남은 띠는 창고·설비
 *  - 띠의 양 끝(u)은 복도로 두 영역이 통하고, 복도 바깥 끝벽에 회의실 4개씩
 *  - 책상 섬은 창가 벽에 붙여 코어 쪽으로 뻗는다
 */

export interface UV {
  u: number; v: number;
}

export interface Frame {
  /** 지역 원점(월드) */
  ox: number;
  oz: number;
  /** u축(월드 단위 벡터). v축은 (-uz, ux) */
  ux: number;
  uz: number;
  /** 외곽 사각형 크기 */
  L: number;
  W: number;
  /** 외곽선(지역 좌표) */
  ring: UV[];
}

export interface Door {
  /** 지역 좌표 중심과 벽 방향 */
  u: number;
  v: number;
  au: number;
  av: number;
  /** 반폭·높이 */
  hw: number;
  h: number;
  /** 문이 있는 외곽선 변 번호 */
  edge: number;
}

export interface Rect {
  u0: number; v0: number; u1: number; v1: number;
}

export type WallKind = 'part' | 'glass';

export interface Wall {
  a: UV; b: UV; kind: WallKind;
}

export type PropType = 'desk' | 'chair' | 'meetTable' | 'sofa' | 'coffeeTable' | 'reception' | 'plant' | 'counter' | 'fridge';

export interface Prop {
  type: PropType; u: number; v: number; rot: number;
}

/** 엘리베이터 홀 끝 자동문 (u 방향으로 벌어지는 두 짝) */
export interface AutoDoor {
  u: number; v: number; hw: number;
}

/** 비상계단: 칸 안에 두 갈래 계단을 그린다. dir = 첫 계단이 오르는 v 방향 */
export interface Stair extends Rect {
  dir: 1 | -1;
}

export interface FloorPlan {
  level: number;
  lobby: boolean;
  walls: Wall[];
  /** 막힌 덩어리(화장실·설비·엘리베이터 뒤) — 위가 덮인 상자로 그린다 */
  caps: Rect[];
  /** 엘리베이터 칸 (모든 층 같은 자리) */
  cabs: Rect[];
  stairs: Stair[];
  autoDoors: AutoDoor[];
  props: Prop[];
  /** 가구가 차지해 못 지나가는 곳 */
  blocks: Rect[];
}

export const toWorld = (f:Frame, u:number, v:number) => ({ x: f.ox + f.ux * u - f.uz * v, z: f.oz + f.uz * u + f.ux * v });
export const toLocal = (f:Frame, x:number, z:number):UV => {
  const dx = x - f.ox;
  const dz = z - f.oz;
  return { u: dx * f.ux + dz * f.uz, v: -dx * f.uz + dz * f.ux };
};

export function inRing(u:number, v:number, ring:UV[]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.v > v) !== (b.v > v) && u < ((b.u - a.u) * (v - a.v)) / (b.v - a.v) + a.u) hit = !hit;
  }
  return hit;
}

export function segDist(u:number, v:number, a:UV, b:UV) {
  const du = b.u - a.u;
  const dv = b.v - a.v;
  const len2 = du * du + dv * dv || 1;
  const t = Math.max(0, Math.min(1, ((u - a.u) * du + (v - a.v) * dv) / len2));
  return Math.hypot(u - (a.u + du * t), v - (a.v + dv * t));
}

export function ringDist(u:number, v:number, ring:UV[]) {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) d = Math.min(d, segDist(u, v, ring[i], ring[(i + 1) % ring.length]));
  return d;
}

/** 외벽에서 margin 이상 안쪽인지 */
const insideBy = (u:number, v:number, ring:UV[], margin:number) => inRing(u, v, ring) && ringDist(u, v, ring) >= margin;
const rectInside = (r:Rect, ring:UV[], margin:number) => [[ r.u0, r.v0 ], [ r.u1, r.v0 ], [ r.u1, r.v1 ], [ r.u0, r.v1 ], [ (r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2 ]]
  .every(([ u, v ]) => insideBy(u, v, ring, margin));
const overlaps = (a:Rect, b:Rect) => a.u0 < b.u1 && a.u1 > b.u0 && a.v0 < b.v1 && a.v1 > b.v0;
const rect = (u0:number, u1:number, v0:number, v1:number):Rect => ({ u0: Math.min(u0, u1), u1: Math.max(u0, u1), v0: Math.min(v0, v1), v1: Math.max(v0, v1) });
const wall = (u0:number, v0:number, u1:number, v1:number, kind:WallKind = 'part'):Wall => ({ a: { u: u0, v: v0 }, b: { u: u1, v: v1 }, kind });

/** 외곽선(월드 [x,z,...]) → 지역 좌표계 */
export function makeFrame(flat:number[]):Frame {
  const pts:{ x: number; z: number; }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) pts.push({ x: flat[i], z: flat[i + 1] });
  let best = 0;
  let ux = 1;
  let uz = 0;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len > best) {
      best = len;
      ux = (b.x - a.x) / len;
      uz = (b.z - a.z) / len;
    }
  });
  const tmp:Frame = { ox: 0, oz: 0, ux, uz, L: 0, W: 0, ring: [] };
  const loc = pts.map((p) => toLocal(tmp, p.x, p.z));
  const minU = Math.min(...loc.map((p) => p.u));
  const maxU = Math.max(...loc.map((p) => p.u));
  const minV = Math.min(...loc.map((p) => p.v));
  const maxV = Math.max(...loc.map((p) => p.v));
  const c = toWorld(tmp, (minU + maxU) / 2, (minV + maxV) / 2);
  const frame:Frame = { ox: c.x, oz: c.z, ux, uz, L: maxU - minU, W: maxV - minV, ring: [] };
  frame.ring = pts.map((p) => toLocal(frame, p.x, p.z));
  return frame;
}

/** 출입구 방위 → 그쪽을 바라보는 가장 긴 외벽 위, 건물 가운데에 가장 가까운 자리 */
export function placeDoors(frame:Frame, spec:IndoorSpec, doorH:number):Door[] {
  const { ring } = frame;
  return spec.entrances.map((e) => {
    const [ fx, fz ] = FACING[e.facing];
    // 방위를 지역 좌표로
    const fu = fx * frame.ux + fz * frame.uz;
    const fv = -fx * frame.uz + fz * frame.ux;
    let pick = -1;
    let pickLen = 0;
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b.u - a.u, b.v - a.v);
      if (len < 1) return;
      let nu = (b.v - a.v) / len;
      let nv = -(b.u - a.u) / len;
      if (inRing((a.u + b.u) / 2 + nu * 0.05, (a.v + b.v) / 2 + nv * 0.05, ring)) {
        nu = -nu;
        nv = -nv;
      }
      if (nu * fu + nv * fv > 0.8 && len > pickLen) {
        pick = i;
        pickLen = len;
      }
    });
    if (pick < 0) throw new Error(`${spec.key}: ${e.facing} 쪽 외벽을 찾지 못함`);
    const a = ring[pick];
    const b = ring[(pick + 1) % ring.length];
    const au = (b.u - a.u) / pickLen;
    const av = (b.v - a.v) / pickLen;
    const hw = Math.min(e.width / 2, pickLen / 2 - 0.5);
    // 건물 가운데(0,0)를 그 벽에 내린 점, 문이 벽 끝을 넘지 않게
    const t = Math.max(hw + 0.5, Math.min(pickLen - hw - 0.5, -(a.u * au + a.v * av)));
    return { u: a.u + au * t, v: a.v + av * t, au, av, hw, h: Math.min(3.6, doorH - 0.4), edge: pick };
  });
}

// 코어 치수 (m)
const CV = 4; // 코어 띠 반폭(v)
const HALL = 2; // 엘리베이터 홀 반폭(u) — 홀 끝 자동문이 홀 폭 전체(4m)
const CAR_D = 2.35; // 엘리베이터 칸 깊이(u)
const CAR_W = 2.5; // 칸 폭(v)
const STAIR_W = 3.2;
const WC_W = 5;
const PANTRY_W = 4;
const CORRIDOR = 3; // 띠 끝과 회의실 사이 복도 폭
const ROOM_D = 6; // 끝 회의실 깊이(u)

/** 건물 끝(u) 회의실 줄이 붙는 끝벽 선: 그 끝의 실제 폭 전체가 건물 안인 가장 바깥 u (바깥에서 안으로 찾는다) */
function endLine(ring:UV[], L:number, side:1 | -1) {
  const probe = side * (L / 2 - 3);
  let lo = 0;
  let hi = 0;
  while (insideBy(probe, lo - 0.25, ring, 0.4)) lo -= 0.25;
  while (insideBy(probe, hi + 0.25, ring, 0.4)) hi += 0.25;
  const vs:number[] = [];
  for (let v = lo + 0.5; v <= hi - 0.5; v += 1) vs.push(v);
  for (let u = L / 2 + 1; u > 0; u -= 0.25) {
    if (vs.every((v) => insideBy(side * u, v, ring, 0.35))) return u;
  }
  return L / 2;
}

/** u 위치에서 v 방향으로 창가 벽까지 (dir = +1이면 +v 쪽) */
function windowV(ring:UV[], u:number, dir:1 | -1, halfWidth:number) {
  const ok = (v:number) => [ u - halfWidth, u, u + halfWidth ].every((uu) => insideBy(uu, dir * v, ring, 0.4));
  let v = CV;
  while (v < 200 && ok(v + 0.25)) v += 0.25;
  return dir * v;
}

interface Core {
  walls: Wall[];
  caps: Rect[];
  cabs: Rect[];
  stairs: Stair[];
  /** 띠 전체 (가구 배치에서 피함) */
  band: Rect;
  /** 탕비실 칸 */
  pantries: Rect[];
  /** 끝 회의실 [방 사각형, 복도 쪽 u] */
  rooms: { r: Rect; doorU: number; }[];
}

function core(frame:Frame):Core {
  const { ring } = frame;
  const walls:Wall[] = [];
  const caps:Rect[] = [];
  const cabs:Rect[] = [];
  const stairs:Stair[] = [];
  const pantries:Rect[] = [];
  const rooms:Core['rooms'] = [];
  const bandEnds = { [-1]: 0, 1: 0 };

  ([ -1, 1 ] as const).forEach((s) => {
    const carIn = s * HALL;
    const carOut = s * (HALL + CAR_D);
    // 엘리베이터 2대 (홀 쪽으로 문, 칸 사이 칸막이)
    [[ 0.05, CAR_W ], [ -CAR_W, -0.05 ]].forEach(([ v0, v1 ]) => cabs.push(rect(carIn, carOut, v0, v1)));
    walls.push(wall(carIn, 0, carOut, 0));
    // 홀 옆벽: 칸 문(1.4m) 자리만 비움
    walls.push(wall(carIn, -CV, carIn, -CAR_W + 0.55), wall(carIn, -0.6, carIn, 0.6), wall(carIn, CAR_W - 0.55, carIn, CV));
    // 칸 위아래 막힌 부분과 뒤 기계 벽
    caps.push(rect(carIn, carOut, CAR_W, CV), rect(carIn, carOut, -CV, -CAR_W), rect(carOut, carOut + s * 0.25, -CV, CV));
    // 비상계단
    const st0 = carOut + s * 0.25;
    const st1 = st0 + s * STAIR_W;
    stairs.push({ ...rect(st0, st1, -CV, CV), dir: s === 1 ? 1 : -1 });
    walls.push(wall(st0, -CV, st1, -CV), wall(st0, CV, st1, CV), wall(st1, -CV, st1, CV));
    // 화장실 (막힘)
    const wc1 = st1 + s * WC_W;
    caps.push(rect(st1, wc1, -CV, CV));
    // 탕비실: 양쪽 영역으로 문(1.2m)
    const p1 = wc1 + s * PANTRY_W;
    pantries.push(rect(wc1, p1, -CV, CV));
    const pm = (wc1 + p1) / 2;
    [ -1, 1 ].forEach((t) => walls.push(wall(wc1, t * CV, pm - 0.6, t * CV), wall(pm + 0.6, t * CV, p1, t * CV)));
    walls.push(wall(p1, -CV, p1, CV));

    // 끝벽에 붙은 회의실 4개, 그 안쪽이 복도, 띠는 복도 앞에서 끝난다
    const endU = endLine(ring, frame.L, s);
    const roomIn = endU - ROOM_D;
    const bandEnd = Math.max(Math.abs(p1) + 0.5, roomIn - CORRIDOR);
    bandEnds[s] = bandEnd;
    // 탕비실과 띠 끝 사이는 창고·설비 (막힘)
    if (bandEnd - Math.abs(p1) > 0.5) caps.push(rect(p1, s * bandEnd, -CV, CV));
    // 회의실 줄: v 방향으로 4칸, 바깥 끝벽까지
    let vlo = 0;
    let vhi = 0;
    while (insideBy(s * (roomIn + ROOM_D / 2), vlo - 0.25, ring, 0.4)) vlo -= 0.25;
    while (insideBy(s * (roomIn + ROOM_D / 2), vhi + 0.25, ring, 0.4)) vhi += 0.25;
    const step = (vhi - vlo) / 4;
    for (let k = 0; k < 4; k++) {
      const v0 = vlo + step * k;
      const v1 = v0 + step;
      const mid = (v0 + v1) / 2;
      rooms.push({ r: rect(s * roomIn, s * (endU + 0.3), v0, v1), doorU: s * roomIn });
      // 복도 쪽 유리벽(가운데 1.2m 문), 방 사이 벽
      walls.push(wall(s * roomIn, v0, s * roomIn, mid - 0.6, 'glass'), wall(s * roomIn, mid + 0.6, s * roomIn, v1, 'glass'));
      if (k > 0) walls.push(wall(s * roomIn, v0, s * (endU + 0.3), v0));
    }
  });
  return { walls, caps, cabs, stairs, pantries, rooms, band: rect(-bandEnds[-1], bandEnds[1], -CV, CV) };
}

function plant(u:number, v:number, props:Prop[], blocks:Rect[]) {
  props.push({ type: 'plant', u, v, rot: 0 });
  blocks.push(rect(u - 0.35, u + 0.35, v - 0.35, v + 0.35));
}

function sofaSet(u:number, v:number, props:Prop[], blocks:Rect[]) {
  // 소파 두 개가 u 방향으로 마주 본다
  props.push({ type: 'sofa', u: u - 1.6, v, rot: Math.PI / 2 }, { type: 'sofa', u: u + 1.6, v, rot: -Math.PI / 2 });
  props.push({ type: 'coffeeTable', u, v, rot: Math.PI / 2 });
  blocks.push(rect(u - 2.1, u + 2.1, v - 1.1, v + 1.1));
}

/** 끝 회의실: 탁자와 의자 6개 (탁자는 방의 긴 쪽으로) */
function meetingRooms(c:Core, props:Prop[], blocks:Rect[]) {
  c.rooms.forEach(({ r }) => {
    const u = (r.u0 + r.u1) / 2;
    const v = (r.v0 + r.v1) / 2;
    if (r.v1 - r.v0 < 4.2) return;
    // 방이 v로 길면 탁자도 v 방향
    props.push({ type: 'meetTable', u, v, rot: Math.PI / 2 });
    blocks.push(rect(u - 0.6, u + 0.6, v - 1.5, v + 1.5));
    [ -1, 0, 1 ].forEach((j) => {
      props.push({ type: 'chair', u: u - 1.05, v: v + j * 0.95, rot: -Math.PI / 2 });
      props.push({ type: 'chair', u: u + 1.05, v: v + j * 0.95, rot: Math.PI / 2 });
    });
  });
}

/** 탕비실: 안쪽 벽에 싱크대·냉장고, 가운데 작은 탁자 */
function pantryProps(c:Core, props:Prop[], blocks:Rect[]) {
  c.pantries.forEach((p) => {
    const wallU = Math.abs(p.u0) < Math.abs(p.u1) ? p.u0 : p.u1; // 화장실 쪽 벽
    const s = Math.sign(p.u0 + p.u1);
    const cu = wallU + s * 0.35;
    props.push({ type: 'counter', u: cu, v: -1.2, rot: s > 0 ? Math.PI / 2 : -Math.PI / 2 });
    props.push({ type: 'fridge', u: cu, v: 1.4, rot: s > 0 ? Math.PI / 2 : -Math.PI / 2 });
    blocks.push(rect(cu - 0.35, cu + 0.35, -2.6, 1.8));
    const tu = (p.u0 + p.u1) / 2 + s * 0.4;
    props.push({ type: 'coffeeTable', u: tu, v: 0.2, rot: 0 });
    props.push({ type: 'chair', u: tu - 0.5, v: 0.95, rot: 0 }, { type: 'chair', u: tu + 0.5, v: -0.55, rot: Math.PI });
    blocks.push(rect(tu - 0.6, tu + 0.6, -0.1, 0.5));
  });
}

/**
 * 책상 섬: 책상 4개가 v 방향(남서↔북동)으로 나란히 붙은 줄 두 개가 마주 본다.
 * 한쪽 끝이 창가 벽에 붙고 코어 쪽으로 뻗는다. 책상은 1.6m 쪽이 v를 따라 놓이고 앉는 사람은 u 쪽을 본다.
 */
function island(u:number, wallV:number, props:Prop[], blocks:Rect[]) {
  const dir = Math.sign(wallV);
  for (let k = 0; k < 4; k++) {
    const v = wallV - dir * (0.8 + k * 1.6);
    props.push({ type: 'desk', u: u + 0.4, v, rot: Math.PI / 2 });
    props.push({ type: 'desk', u: u - 0.4, v, rot: -Math.PI / 2 });
    props.push({ type: 'chair', u: u + 1.15, v, rot: Math.PI / 2 });
    props.push({ type: 'chair', u: u - 1.15, v, rot: -Math.PI / 2 });
  }
  blocks.push(rect(u - 0.8, u + 0.8, wallV, wallV - dir * 6.4));
}

function lobby(frame:Frame, doors:Door[], c:Core) {
  const props:Prop[] = [];
  const blocks:Rect[] = [];
  const { ring } = frame;
  // 띠와, 출입문에서 엘리베이터 홀까지 가는 길, 끝 복도·회의실은 비운다
  const keep = [
    c.band,
    ...doors.map((d) => rect(Math.min(d.u - d.hw, -HALL) - 1, Math.max(d.u + d.hw, HALL) + 1, d.v, Math.sign(d.v) * CV)),
    rect(c.band.u1, 999, -999, 999),
    rect(-999, c.band.u0, -999, 999),
  ];
  const free = (r:Rect) => rectInside(r, ring, 0.8) && !keep.some((k) => overlaps(r, k));
  doors.forEach((d, i) => {
    // 문 양옆 화분
    [ -1, 1 ].forEach((s) => {
      const u = d.u + d.au * s * (d.hw + 1.2);
      const v = d.v + d.av * s * (d.hw + 1.2) + (d.v > 0 ? -1.2 : 1.2);
      if (insideBy(u, v, ring, 0.6)) plant(u, v, props, blocks);
    });
    // 첫 문 쪽 영역엔 안내 데스크, 다른 쪽엔 대기 소파
    const v = d.v > 0 ? CV + (d.v - CV) * 0.5 : -CV + (d.v + CV) * 0.5;
    const u = d.u + d.hw + 4.5;
    if (i === 0) {
      const r = rect(u - 2.3, u + 2.3, v - 0.55, v + 0.55);
      if (free(r)) {
        props.push({ type: 'reception', u, v, rot: -Math.PI / 2 }); // 손님 쪽이 문(홀) 쪽
        blocks.push(r);
      }
    } else if (free(rect(u - 2.1, u + 2.1, v - 1.1, v + 1.1))) sofaSet(u, v, props, blocks);
  });
  // 양쪽 영역 끝 라운지
  [ -1, 1 ].forEach((s) => [ -1, 1 ].forEach((t) => {
    const u = s * ((s > 0 ? c.band.u1 : -c.band.u0) - 4);
    const v = t * (CV + (frame.W / 2 - CV) / 2);
    if (free(rect(u - 2.1, u + 2.1, v - 1.1, v + 1.1))) sofaSet(u, v, props, blocks);
  }));
  meetingRooms(c, props, blocks);
  pantryProps(c, props, blocks);
  return { lobby: true, walls: [] as Wall[], props, blocks, autoDoors: [] as AutoDoor[] };
}

function office(frame:Frame, c:Core) {
  const props:Prop[] = [];
  const blocks:Rect[] = [];
  const { ring } = frame;
  // 엘리베이터 홀 양 끝 자동문: 홀 폭 전체(4m)
  const autoDoors:AutoDoor[] = [{ u: 0, v: CV, hw: HALL }, { u: 0, v: -CV, hw: HALL }];

  // 두 영역 모두 창가 벽에 붙인 책상 섬을 u 간격 5.2m로 빈틈없이 (자동문 앞만 비움)
  const PU = 5.2;
  const span = c.band.u1 - c.band.u0 - 3.2;
  const n = Math.floor(span / PU);
  const start = c.band.u0 + 1.6 + (span - n * PU) / 2;
  ([ -1, 1 ] as const).forEach((t) => {
    for (let i = 0; i <= n; i++) {
      const u = start + i * PU;
      if (Math.abs(u) < HALL + 2.6) continue;
      const wallV = windowV(ring, u, t, 1.6);
      if (Math.abs(wallV) - 6.4 < CV + 1.8) continue; // 코어 앞 통로가 1.8m 안 되면 생략
      island(u, wallV, props, blocks);
    }
  });
  // 자동문 옆 화분
  [ -1, 1 ].forEach((t) => [ -1, 1 ].forEach((s) => plant(s * (HALL + 1.2), t * (CV + 0.8), props, blocks)));
  meetingRooms(c, props, blocks);
  pantryProps(c, props, blocks);
  return { lobby: false, walls: [] as Wall[], props, blocks, autoDoors };
}

export interface IndoorPlan {
  frame: Frame;
  floorH: number;
  levels: number;
  doors: Door[];
  floor: (level:number) => FloorPlan;
}

export function makePlan(spec:IndoorSpec, osmId:number, flat:number[], height:number):IndoorPlan {
  const frame = makeFrame(flat);
  const floorH = height / spec.levels;
  const doors = placeDoors(frame, spec, floorH);
  const c = core(frame);
  const cache = new Map<number, FloorPlan>();
  return {
    frame,
    floorH,
    levels: spec.levels,
    doors,
    floor: (level) => {
      const hit = cache.get(level);
      if (hit) return hit;
      // 2층부터는 층과 상관없이 같은 평면 (판정 격자도 하나를 같이 쓴다 — 층마다 달라지게 바꾸면 IndoorGrid.grid도 고칠 것)
      const body = level === 1 ? lobby(frame, doors, c) : office(frame, c);
      const plan:FloorPlan = { ...body, level, cabs: c.cabs, caps: c.caps, stairs: c.stairs, walls: [ ...c.walls, ...body.walls ] };
      cache.set(level, plan);
      return plan;
    },
  };
}