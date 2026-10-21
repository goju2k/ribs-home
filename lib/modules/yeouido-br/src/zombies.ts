/**
 * 낮밤과 좀비 (배틀로얄 모드, 게임성 측정용 PoC — 수치는 가정).
 * 좀비는 밤에만 사람 근처에 생기고, 해가 뜨면 불타 사라진다. 가끔 뛰는 좀비(신발 없는 사람보다 빠름).
 */

/** 낮 3분 20초 + 밤 1분 40초 = 5분 주기 (20분 판에 밤 4번), 판은 낮으로 시작 */
export const DAY_MS = 200_000;
export const NIGHT_MS = 100_000;
export const CYCLE_MS = DAY_MS + NIGHT_MS;
/** 해 질 녘·새벽에 밝기가 바뀌는 시간 (ms) */
export const DUSK_MS = 8000;

export interface DayNight {
  night: boolean;
  /** 지금 낮/밤이 끝날 때까지 (ms) */
  remain: number;
  /** 밝기 1 = 낮, 0 = 밤 (경계에서 부드럽게) */
  light: number;
}

export function dayNight(elapsed:number):DayNight {
  const t = ((elapsed % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  const night = t >= DAY_MS;
  const remain = night ? CYCLE_MS - t : DAY_MS - t;
  let light = night ? 0 : 1;
  // 낮이 끝나 갈 때 어두워지고, 밤이 끝나 갈 때 밝아진다
  if (remain < DUSK_MS) light = night ? 1 - remain / DUSK_MS : remain / DUSK_MS;
  return { night, remain, light };
}

/** 모습 종류 (엔진 k, 0은 사람) */
export const Z_WALKER = 1;
export const Z_RUNNER = 2;

export interface ZombieStats {
  name: string;
  hp: number;
  /** 쫓을 때 달리는지·속도 배율 (걷기 1.4m/s, 달리기 4.8m/s 기준) */
  chaseRun: boolean;
  chaseMul: number;
  /** 어슬렁거릴 때 걷기 배율 */
  wanderMul: number;
  damage: number;
  cooldownMs: number;
  /** 이만큼 붙으면 멈춰서 때린다 (m) */
  reach: number;
}

/**
 * 쫓는 속도: 일반 좀비 4.3m/s(맨발 달리기 4.8보다 조금 느림 — 맨발로는 떼어 내기 어렵다), 뛰는 좀비 5.5m/s(= 신발 +1).
 * 피해: 일반 초당 3.3, 뛰는 좀비 초당 4.2 — 맨몸이 둘에게 물리면 약 13초
 */
export const ZOMBIES:Record<number, ZombieStats> = {
  [Z_WALKER]: { name: '좀비', hp: 40, chaseRun: true, chaseMul: 0.9, wanderMul: 0.5, damage: 5, cooldownMs: 1500, reach: 1.1 },
  [Z_RUNNER]: { name: '뛰는 좀비', hp: 30, chaseRun: true, chaseMul: 5.5 / 4.8, wanderMul: 0.6, damage: 5, cooldownMs: 1200, reach: 1.1 },
};

/** 뛰는 좀비 비율 */
export const RUNNER_RATE = 0.15;
/** 시야: 이 반경(원) 안 같은 공간의 사람을 보면 쫓는다 (m). 화면에는 안 보인다 */
export const Z_SIGHT = 20;
/** 쫓던 사람이 시야 밖에 이만큼 넘게 있으면 포기한다 (ms) */
export const Z_FORGET_MS = 5000;

/** 상태 비트: 불타는 중 (새벽) — 사람 비트(1·2·4·8)와 같은 칸을 쓰되 좀비에만 */
export const ST_BURN = 16;