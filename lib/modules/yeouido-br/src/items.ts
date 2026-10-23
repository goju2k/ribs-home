import { WEAPON_KINDS } from './weapons';

/**
 * 배틀로얄 아이템 (게임성 측정용 PoC — 종류·수치는 가정).
 * 완성품이 떨어져 있고, 같은 칸 아이템을 주우면 강화(+1, 최대 +10 — 최대면 같은 아이템은 더 못 줍는다). 죽으면 시체에 남아 다른 사람이 털 수 있다.
 * 무기는 한 종류만 든다(weapons.ts) — 다른 무기를 주우면 들고 있던 것은 그 자리에 떨어진다. 땅 아이템은 닿으면 줍고, 시체 털기·부수기는 좌클릭(파밍).
 */

/** 순서가 곧 번호 (메시지에 번호로 오간다 — 슈터 개편에서 다시 매김, 프로토콜 v12) */
export const ITEM_KINDS = [ 'armor', 'shoes', 'rocket', 'hammer', ...WEAPON_KINDS, 'heal' ] as const;
export type ItemKind = typeof ITEM_KINDS[number];

export const ITEM_NAMES:Record<ItemKind, string> = {
  armor: '갑옷',
  shoes: '신발',
  rocket: '로켓슈트',
  hammer: '망치',
  pistol: '권총',
  smg: '기관단총',
  rifle: '돌격소총',
  shotgun: '산탄총',
  sniper: '저격소총',
  crossbow: '석궁',
  heal: '회복약',
};

/**
 * 회복약: 줍는 순간 체력을 회복하는 소모품 (장비 칸에 남지 않고, 시체에도 안 남는다).
 * 떨어진 아이템의 '단계' 칸에 회복 %(20~100, 10 단위)가 들어 있다. 체력이 가득하면 줍지 않는다.
 * 회복은 밸런스가 까다로워 드물게: 물건(상자·택배·금고)에서만, 로켓슈트의 2배 비율
 */
export const HEAL_MIN = 20;
export const HEAL_MAX = 100;
export const isConsumable = (k:ItemKind) => k === 'heal';
/** 회복약 하나의 회복량 (체력) */
export const healAmount = (pct:number, hpMax:number) => Math.round((hpMax * pct) / 100);

/** 땅에 뿌릴 때 비율 (로켓슈트는 땅에 안 뿌린다 — 물건을 부숴야 나온다). 무기 없이 시작하니 무기는 여기저기, 6종 같은 비율(합 11.5) */
export const DROP_WEIGHTS:Record<ItemKind, number> = {
  armor: 3,
  shoes: 3,
  rocket: 0,
  hammer: 2,
  ...Object.fromEntries(WEAPON_KINDS.map((k) => [ k, 11.5 / WEAPON_KINDS.length ])) as Record<typeof WEAPON_KINDS[number], number>,
  heal: 0,
};

/** 강화 상한 (2026-10-22 7 → 10) */
export const MAX_LEVEL = 10;

/** 장비: 칸마다 강화 단계 (0 = 없음) */
export type Gear = Record<ItemKind, number>;

export const emptyGear = ():Gear => Object.fromEntries(ITEM_KINDS.map((k) => [ k, 0 ])) as Gear;

/** 이 칸이 이미 최대라 같은 아이템을 더 못 줍는지 (회복약은 장비가 아니라 해당 없음) */
export const isMaxed = (gear:Gear, k:ItemKind) => !isConsumable(k) && gear[k] >= MAX_LEVEL;

/** 주웠을 때 새 단계: 없던 칸이면 주운 단계, 있으면 더 높은 쪽 + 1 */
export const afterPickup = (cur:number, got:number) => (cur ? Math.min(MAX_LEVEL, Math.max(cur, got) + 1) : got);

/** 신발: 땅 속도 배율 (+1 1.15 → 달리기 8.3m/s = 뛰는 좀비, +7 1.45 → 10.4m/s, +10 1.6 → 11.5m/s) */
export const shoeMul = (lv:number) => (lv ? 1.15 + 0.05 * (lv - 1) : 1);

/** 로켓슈트: 비행 가능 + 비행 속도 배율 (+1 0.4 → 달려 날기 14m/s, +7 0.88 → 32m/s, +10 1.12 → 40m/s) */
export const rocketMul = (lv:number) => (lv ? 0.4 + 0.08 * (lv - 1) : 0);

/** 갑옷: 받는 피해 감소 비율 (+1 10%, +7 46%, +10 64%) — 전장 밖 피해는 못 막는다 */
export const armorCut = (lv:number) => (lv ? 0.1 + 0.06 * (lv - 1) : 0);

/** 물건 부수는 힘(좌클릭 한 번): 망치가 있으면 망치(+1 25, +7 73), 없으면 맨손 10 */
export const breakPower = (g:Gear) => (g.hammer ? 25 + 8 * (g.hammer - 1) : 10);

/** 땅에 떨어진 아이템: [id, 종류 번호(ITEM_KINDS), 단계, x, y, z, 건물, 층] */
export type GroundItem = [number, number, number, number, number, number, number, number];

/** 시체에 남은 아이템: [종류 번호, 단계] */
export type CorpseItem = [number, number];

/**
 * 닿으면 줍기: 발에서 이 거리 안의 땅 아이템 (m). 바꿔 떨어뜨린 무기·못 줍는 아이템(최대 단계·체력 가득)은
 * 그 사람이 PICK_RELEASE m 넘게 멀어질 때까지 건너뛴다 (제자리에서 무한히 바꿔 들거나 다시 시도하지 않게). 줍기 사이 PICK_GAP_MS
 */
export const PICK_RANGE = 1.0;
export const PICK_RELEASE = 2.0;
export const PICK_GAP_MS = 250;