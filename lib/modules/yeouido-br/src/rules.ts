import { ST_FROZEN } from 'yeouido-net';

/**
 * 배틀로얄 모드 규칙 값 (게임성 측정용 PoC — 확정 아님. 숫자는 여기서만 바꾼다).
 * 엔진은 이 뜻을 모른다: 상태 비트·게이지·행동 비트에 이 모드가 뜻을 붙인다.
 */

export const BR_MODE = 'br';

/** 최대 체력 (게이지 255 = 가득) */
export const HP_MAX = 100;

/** 상태 비트 (엔진의 ST_FROZEN = 0x80과 겹치지 않게) */
export const ST_DEAD = 1;
export const ST_SHIELD = 2;
/** 주먹·무기를 휘두르는 중 (다른 사람 화면의 동작용) */
export const ST_SWING = 4;
/** 방금 맞음 (붉게 번쩍) */
export const ST_HURT = 8;
export { ST_FROZEN };

/** 행동 비트: 왼쪽 클릭·공격 버튼 = 근접, 오른쪽 = 원거리(6단계) */
export const ACT_MELEE = 1;
export const ACT_RANGED = 2;

/** 맨손 근접: 사거리(m), 앞쪽 부채꼴(cos 값 — 0.5면 좌우 60°), 피해, 재사용 대기, 휘두르는 동작 시간 */
export const FIST = { range: 1.7, cosArc: 0.5, damage: 12, cooldownMs: 600, swingMs: 300 } as const;

/** 맞은 표시 시간 (ms) */
export const HURT_MS = 250;

/** 전장 밖 초당 피해: 단계가 오를수록 세진다 (1단계 3, 10단계 12) */
export const zoneDps = (stage:number) => 2 + Math.min(stage, 11);

/** 체력 → 게이지(0~255) */
export const hpGauge = (hp:number) => Math.round((Math.max(0, hp) / HP_MAX) * 255);

/** 게이지 → 체력 */
export const gaugeHp = (v:number) => Math.round((v / 255) * HP_MAX);

export interface Pose {
  x: number; y: number; z: number; f: number; b: number; l: number;
}

/**
 * 근접 공격이 닿는지: 같은 공간(실외끼리 높이 차 1.6m 안, 실내는 같은 건물·층), 사거리 안, 바라보는 쪽 부채꼴 안.
 * 바로 붙어 있으면(0.5m 안) 방향과 상관없이 닿는다
 */
export function meleeReaches(a:Pose, t:Pose, range:number = FIST.range, cosArc:number = FIST.cosArc) {
  if (a.b !== t.b) return false;
  if (a.b >= 0 ? a.l !== t.l : Math.abs(a.y - t.y) > 1.6) return false;
  const dx = t.x - a.x;
  const dz = t.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d < 0.5) return true;
  return (Math.sin(a.f) * dx + Math.cos(a.f) * dz) / d >= cosArc;
}