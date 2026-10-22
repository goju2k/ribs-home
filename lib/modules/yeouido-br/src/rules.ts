import { ST_FROZEN, ST_HIDDEN } from 'yeouido-net';

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
/** 손을 쓰는 중: 파밍으로 치기·쏘기 (다른 사람 화면의 동작용) */
export const ST_SWING = 4;
/** 방금 맞음 (붉게 번쩍) */
export const ST_HURT = 8;
export { ST_FROZEN, ST_HIDDEN };

/** 행동 비트: 좌클릭·파밍 버튼 = 파밍(줍기·시체 털기·물건 부수기), 우클릭·사격 버튼 = 사격, R·재장전 버튼 = 재장전 */
export const ACT_FARM = 1;
export const ACT_FIRE = 2;
export const ACT_RELOAD = 4;

/** 파밍: 앞쪽 이 거리·부채꼴(cos) 안의 가장 가까운 것, 줍고 나서·한 번 치고 나서 다음까지 (ms) */
export const FARM = { range: 2.4, cosArc: 0.55, pickMs: 250, hitMs: 450, swingMs: 300 } as const;

/** 근접 닿기 기본값: 사거리(m), 앞쪽 부채꼴(cos 값 — 0.5면 좌우 60°) — 사람의 근접 공격은 없앴다(슈터), 좀비·보스 판정에 쓴다 */
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