/**
 * 최종 보스 (배틀로얄 모드, 게임성 측정용 PoC — 수치는 가정).
 * 20분이 지나 원이 최종(500m)이 되면 원 가운데에 나타난다. 쓰러뜨리면 승리·판 끝, 시간 안에 못 쓰러뜨리면 패배·판 끝.
 */

/** 모습 종류 (엔진 k: 1·2는 좀비) */
export const Z_BOSS = 3;

/** 보스가 나온 뒤 이 시간 안에 못 쓰러뜨리면 패배 (ms) */
export const BOSS_LIMIT_MS = 5 * 60 * 1000;
/**
 * 탈출 (치킨): 보스전 동안은 휴전(사람끼리 피해 없음). 보스가 쓰러진 자리에 탈출구가 생기고, truceMs 뒤 휴전이 끝나며 열린다.
 * 열린 탈출구에 가장 먼저 닿은 1명이 치킨 — 판 끝. limitMs 안에 아무도 못 닿거나 모두 쓰러지면 치킨 없이 끝
 */
export const ESCAPE = { truceMs: 3000, limitMs: 90_000, radius: 2 } as const;

/** 판이 끝나고 결과를 보여 준 뒤 새 판까지 (ms) */
export const RESULT_MS = 15_000;

/**
 * 체력 = 기준 × 살아 있는 사람 수 × 난이도.
 * 기준(슈터): 총 +3이면 한 사람이 실제로 내는 초당 피해가 약 60~90 (기관단총·돌격소총을 절반쯤 맞힌다고 보면) →
 * 혼자 약 90~130초 쏴야 잡히는 8000. 실제 판 기록이 쌓이면 다시 맞춘다 (밸런스는 뒤로 미룸).
 */
export const BOSS_HP_PER_PLAYER = 8000;
export const BOSS_HP_MIN = 8000;

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
  /** 도약: 날아가는 시간 (ms)·가장 높을 때 (m) — 날아오르는 순간 착지 자리에 경고 원 */
  leapMs: 1300,
  leapHeight: 18,
  /** 좀비 부르기: 간격·마리 수 (불려 온 좀비는 바로 가까운 사람을 쫓는다) */
  summonEveryMs: 10_000,
  summonCount: 6,
} as const;

/**
 * 독 파이어볼 난사: 간격마다 예고(보스가 초록으로 빛나며 멈춤) 뒤 부채꼴로 여러 발. 포물선으로 날아가 사람·땅·벽에 닿으면 터진다.
 * 터진 자리 반경 안 사람은 피해 + 중독(초당 피해, 시간). 멀리서 쏘는 사람(저격)도 노린다.
 */
export const BALL = {
  everyMs: 5000,
  windupMs: 700,
  count: 7,
  /** 부채꼴 전체 각 (라디안) */
  fan: 0.6,
  speed: 24,
  gravity: 6,
  /** 이 거리 안 사람만 노린다 (m) */
  range: 140,
  /** 공 크기(맞는 반지름)·터지는 반경 (m) */
  radius: 0.6,
  splash: 3,
  damage: 10,
  poisonDps: 4,
  poisonMs: 5000,
  /** 이보다 오래 날면 사라진다 (ms) */
  lifeMs: 7000,
} as const;

/** 상태 비트: 땅 울리기 준비 중 (화면에 경고 원) — 좀비 비트(16 불탐)와 겹치지 않게 */
export const ST_SLAM = 32;