/**
 * 최종 보스 (배틀로얄 모드, 게임성 측정용 PoC — 수치는 가정).
 * 20분이 지나 원이 최종(500m)이 되면 원 가운데에 나타난다. 쓰러뜨리면 승리·판 끝, 시간 안에 못 쓰러뜨리면 패배·판 끝.
 */

/** 모습 종류 (엔진 k: 1·2는 좀비) */
export const Z_BOSS = 3;

/** 보스가 나온 뒤 이 시간 안에 못 쓰러뜨리면 패배 (ms) */
export const BOSS_LIMIT_MS = 5 * 60 * 1000;
/** 판이 끝나고 결과를 보여 준 뒤 새 판까지 (ms) */
export const RESULT_MS = 15_000;

/**
 * 체력 = 기준 × 살아 있는 사람 수 × 난이도.
 * 기준: 20분 동안 아이템을 모아 평균 +3 장비라고 보면 한 사람이 내는 실제 초당 피해가 약 25 (파이프 +3 40/s·권총 +3 26/s를
 * 계속 맞히진 못하니 절반 남짓) → 한 사람이 약 90초 때려야 잡히는 2250.
 * 실제 판 기록(누가 몇 강으로 얼마나 때렸는지)이 쌓이면 이 기준을 다시 맞춘다 (10단계 밸런스 도구).
 */
export const BOSS_HP_PER_PLAYER = 2250;
export const BOSS_HP_MIN = 2250;

export const DIFFICULTY = { easy: 0.6, normal: 1, hard: 1.6 } as const;
export type Difficulty = keyof typeof DIFFICULTY;

export const bossHp = (alive:number, difficulty:Difficulty = 'normal') => Math.round(Math.max(BOSS_HP_MIN, BOSS_HP_PER_PLAYER * Math.max(1, alive)) * DIFFICULTY[difficulty]);

/** 보스 능력 (난이도가 피해에도 곱해진다) */
export const BOSS = {
  /** 몸 크기 배율 (화면·맞는 원기둥) — 사람의 10배(키 17m), 위압감 */
  scale: 10,
  /** 맞는 원기둥 반지름·키 (m) */
  radius: 4,
  height: 17,
  /** 쫓는 속도 배율 (달리기 7.2 기준 → 6.1m/s, 맨발보다 조금 느림) */
  chaseMul: 0.85,
  /** 내려치기: 앞 반경·피해·대기 */
  smashRange: 7,
  smashDamage: 25,
  smashMs: 1800,
  /** 땅 울리기: 반경(높이 무관 — 옥상에서 버티기 방지)·피해·간격, 미리 알려 주는 시간 */
  slamRange: 20,
  slamDamage: 12,
  slamEveryMs: 6000,
  slamWindupMs: 900,
  /** 도약: 이 시간 동안 목표에게 2m도 못 다가가면(건물에 막힘) 목표 근처로 뛰어오른다 (ms) */
  stuckMs: 3000,
  /** 좀비 부르기: 간격·마리 수 */
  summonEveryMs: 25_000,
  summonCount: 3,
} as const;

/** 상태 비트: 땅 울리기 준비 중 (화면에 경고 원) — 좀비 비트(16 불탐)와 겹치지 않게 */
export const ST_SLAM = 32;