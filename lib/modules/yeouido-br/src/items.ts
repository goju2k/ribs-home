import { FIST } from './rules';

/**
 * 배틀로얄 아이템 (게임성 측정용 PoC — 종류·수치는 가정).
 * 완성품이 떨어져 있고, 같은 칸 아이템을 주우면 강화(+1, 최대 +7). 죽으면 시체에 남아 다른 사람이 털 수 있다.
 */

/** 순서가 곧 번호 (메시지에 번호로 오가므로 새 종류는 뒤에 붙인다) */
export const ITEM_KINDS = [ 'pipe', 'armor', 'shoes', 'rocket', 'hammer', 'pistol', 'bow' ] as const;
export type ItemKind = typeof ITEM_KINDS[number];

export const ITEM_NAMES:Record<ItemKind, string> = { pipe: '쇠파이프', armor: '갑옷', shoes: '신발', rocket: '로켓슈트', hammer: '망치', pistol: '권총', bow: '활' };

/** 땅에 뿌릴 때 비율 (로켓슈트는 땅에 안 뿌린다 — 물건을 부숴야 나온다) */
export const DROP_WEIGHTS:Record<ItemKind, number> = { pipe: 3, armor: 3, shoes: 3, rocket: 0, hammer: 3, pistol: 1, bow: 1 };

export const MAX_LEVEL = 7;

/** 장비: 칸마다 강화 단계 (0 = 없음) */
export type Gear = Record<ItemKind, number>;

export const emptyGear = ():Gear => ({ pipe: 0, armor: 0, shoes: 0, rocket: 0, hammer: 0, pistol: 0, bow: 0 });

/** 원거리 무기: 한 종류만 든다 (다른 종류를 주우면 들고 있던 것은 그 자리에 떨어진다) */
export const RANGED_KINDS:ItemKind[] = [ 'pistol', 'bow' ];

/** 들고 있는 원거리 무기 (없으면 null) */
export const heldRanged = (g:Gear):ItemKind | null => RANGED_KINDS.find((k) => g[k] > 0) ?? null;

export interface RangedStats {
  /** 바로 맞음(총) 또는 날아가는 화살 */
  hitscan: boolean;
  damage: number;
  /** 다음 발까지 (재장전, ms) */
  reloadMs: number;
  range: number;
  /** 화살 속도 (m/s) */
  speed: number;
}

/**
 * 원거리 무기 (탄약 무제한, 강화마다 재장전↓·피해↑):
 * 권총 피해 14→32·재장전 0.9→0.48초·사거리 40m(바로 맞음) / 활 피해 22→46·재장전 1.4→0.8초·사거리 60m(화살 45m/s)
 */
export const rangedStats = (kind:ItemKind, lv:number):RangedStats => (kind === 'bow'
  ? { hitscan: false, damage: 22 + 4 * (lv - 1), reloadMs: 1400 - 100 * (lv - 1), range: 60, speed: 45 }
  : { hitscan: true, damage: 14 + 3 * (lv - 1), reloadMs: 900 - 70 * (lv - 1), range: 40, speed: 0 });

/** 주웠을 때 새 단계: 없던 칸이면 주운 단계, 있으면 더 높은 쪽 + 1 */
export const afterPickup = (cur:number, got:number) => (cur ? Math.min(MAX_LEVEL, Math.max(cur, got) + 1) : got);

/** 신발: 땅 속도 배율 (+1 1.15 → 달리기 5.5m/s = 뛰는 좀비, +7 1.45 → 7.0m/s) */
export const shoeMul = (lv:number) => (lv ? 1.15 + 0.05 * (lv - 1) : 1);

/** 로켓슈트: 비행 가능 + 비행 속도 배율 (+1 0.4 → 달려 날기 14m/s, +7 0.88 → 32m/s) */
export const rocketMul = (lv:number) => (lv ? 0.4 + 0.08 * (lv - 1) : 0);

/** 갑옷: 받는 근접 피해 감소 비율 (+1 10%, +7 46%) — 전장 밖 피해는 못 막는다 */
export const armorCut = (lv:number) => (lv ? 0.1 + 0.06 * (lv - 1) : 0);

/** 물건 부수는 힘(한 번 칠 때): 망치가 있으면 망치(+1 25, +7 73), 없으면 쇠파이프 12, 맨손 8 */
export const breakPower = (g:Gear) => {
  if (g.hammer) return 25 + 8 * (g.hammer - 1);
  return g.pipe ? 12 : 8;
};

export interface MeleeStats {
  range: number; cosArc: number; damage: number; cooldownMs: number; swingMs: number;
}

/** 근접 무기: 없으면 맨손, 쇠파이프는 단계마다 피해↑·대기↓ (+1 18, +7 42) */
export const meleeStats = (lv:number):MeleeStats => (lv
  ? { range: 2.2, cosArc: 0.5, damage: 18 + 4 * (lv - 1), cooldownMs: 700 - 30 * (lv - 1), swingMs: 350 }
  : FIST);

/** 땅에 떨어진 아이템: [id, 종류 번호(ITEM_KINDS), 단계, x, y, z, 건물, 층] */
export type GroundItem = [number, number, number, number, number, number, number, number];

/** 시체에 남은 아이템: [종류 번호, 단계] */
export type CorpseItem = [number, number];

/** 줍는 거리 (m) */
export const PICK_RANGE = 1.3;