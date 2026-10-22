import { castRay, SimWorld } from 'yeouido-sim';

/** 사람 몸통을 세운 원기둥으로 본다: 반지름·키 (m) */
const BODY_R = 0.4;
const BODY_H = 1.8;
/** 총구 높이 (발에서, m) */
export const MUZZLE_Y = 1.4;

/**
 * 광선이 사람(발 위치 cx, cy, cz의 세운 원기둥)에 닿는 거리 (안 닿으면 -1).
 * (dx, dy, dz)는 길이 1. 수평으로 가장 가까워지는 곳에서 원기둥 안이면 그 앞쪽 들어가는 자리.
 */
export function rayBody(ox:number, oy:number, oz:number, dx:number, dy:number, dz:number, cx:number, cy:number, cz:number, maxT:number, r = BODY_R, h = BODY_H) {
  const hl2 = dx * dx + dz * dz;
  if (hl2 < 1e-6) return -1;
  const t = ((cx - ox) * dx + (cz - oz) * dz) / hl2;
  const px = ox + dx * t;
  const pz = oz + dz * t;
  const d = Math.hypot(px - cx, pz - cz);
  if (d > r) return -1;
  const enter = t - Math.sqrt(r * r - d * d) / Math.sqrt(hl2);
  if (enter < 0 || enter > maxT) return -1;
  const y = oy + dy * enter;
  return y >= cy && y <= cy + h ? enter : -1;
}

/** 조준(몸 방향 face, 높이각 pitch +는 아래) → 길이 1 방향 */
export function aimDir(face:number, pitch:number):[number, number, number] {
  const c = Math.cos(pitch);
  return [ Math.sin(face) * c, -Math.sin(pitch), Math.cos(face) * c ];
}

/** 머리: 키의 위쪽 이 비율부터 */
const HEAD_FROM = 0.82;

/** 맞힐 수 있는 것 하나 (사람·좀비): 지금(또는 되감은) 발 위치와 맞았을 때 할 일 (by = 쏜 사람, head = 머리) */
export interface ShotTarget<P = unknown> {
  id: number; x: number; y: number; z: number; b: number; l: number;
  /** 맞는 원기둥 반지름·키 (없으면 사람 크기) */
  r?: number; h?: number;
  hit: (dmg:number, by:P, head?:boolean) => void;
}

/**
 * 총알 한 발(바로 맞음): 벽까지 거리 안에서 가장 먼저 닿는 대상. 같은 공간(실외끼리, 실내는 같은 건물·층)만.
 * 돌려주는 값: 끝 지점과 맞은 대상(없으면 null)
 */
export function hitscan<P>(sim:SimWorld, o:[number, number, number], dir:[number, number, number], range:number, b:number, l:number, targets:ShotTarget<P>[], skipId = -1) {
  const wall = castRay(sim, o[0], o[1], o[2], dir[0], dir[1], dir[2], range, b, l);
  let best:ShotTarget<P> | null = null;
  let bestT = wall;
  targets.forEach((t) => {
    // 쏜 사람 자신·다른 공간·사거리 밖은 건너뛴다
    if (t.id === skipId || t.b !== b || (b >= 0 && t.l !== l) || Math.abs(t.x - o[0]) > bestT + 2 || Math.abs(t.z - o[2]) > bestT + 2) return;
    const d = rayBody(o[0], o[1], o[2], dir[0], dir[1], dir[2], t.x, t.y, t.z, bestT, t.r, t.h);
    if (d >= 0 && d < bestT) {
      best = t;
      bestT = d;
    }
  });
  const end:[number, number, number] = [ o[0] + dir[0] * bestT, o[1] + dir[1] * bestT, o[2] + dir[2] * bestT ];
  const t = best as ShotTarget<P> | null;
  // 머리: 맞은 높이가 키의 위쪽 18% 안
  const head = !!t && end[1] >= t.y + (t.h ?? BODY_H) * HEAD_FROM;
  return { end, target: t, head, dist: bestT };
}

/** 날아가는 화살: 속도 벡터(m/s)·낙차(m/s²), 남은 사거리(지나온 길이로 줄인다), 피해·머리 배율 */
export interface Arrow {
  id: number; by: number; x: number; y: number; z: number; vel: [number, number, number]; g: number; left: number; dmg: number; headMul: number; b: number; l: number;
}

const r2 = (n:number) => Math.round(n * 100) / 100;
export const at3 = (x:number, y:number, z:number):[number, number, number] => [ r2(x), r2(y), r2(z) ];