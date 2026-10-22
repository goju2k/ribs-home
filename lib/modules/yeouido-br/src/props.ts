import { HEAL_MAX, HEAL_MIN, ITEM_KINDS, ItemKind } from './items';

/**
 * 부술 수 있는 물건 (배틀로얄 모드, 게임성 측정용 PoC — 종류·수치·드롭 표는 가정).
 * 좌클릭(파밍)으로 친다. 부서지면 드롭 표대로 아이템을 떨어뜨린다.
 * 지금은 충돌이 없다(지나갈 수 있음) — 엔진 충돌을 건드리지 않으려고.
 */

/** 순서가 곧 번호 */
export const PROP_KINDS = [ 'crate', 'vending', 'safe' ] as const;
export type PropKind = typeof PROP_KINDS[number];

export const PROP_NAMES:Record<PropKind, string> = { crate: '나무 상자', vending: '자판기', safe: '금고' };

/** 내구도: 맨손(10) 상자 3대·자판기 8대·금고 22대, 망치 +1(25) 2·4·9대 */
export const PROP_HP:Record<PropKind, number> = { crate: 30, vending: 80, safe: 220 };

/** 맞는 반경 (사거리에 더한다, m) */
export const PROP_RADIUS:Record<PropKind, number> = { crate: 0.6, vending: 0.5, safe: 0.5 };

/** 뿌릴 때 비율 */
export const PROP_WEIGHTS:Record<PropKind, number> = { crate: 12, vending: 4, safe: 1 };

/** 드롭 표 한 줄: [아이템 종류(null = 꽝), 비율, 최소 단계, 최대 단계] */
export type DropRow = [ItemKind | null, number, number, number];

/** 물건마다: 떨어뜨리는 개수 범위와 표 (개수만큼 표에서 따로 뽑는다) */
export const DROPS:Record<PropKind, { count: [number, number]; table: DropRow[]; }> = {
  crate: {
    count: [ 1, 1 ],
    table: [[ null, 3, 0, 0 ], [ 'armor', 3, 1, 1 ], [ 'shoes', 3, 1, 1 ], [ 'hammer', 2, 1, 1 ], [ 'rocket', 0.5, 1, 1 ], [ 'heal', 1, HEAL_MIN, HEAL_MAX ], [ 'pistol', 2, 1, 1 ], [ 'smg', 1.5, 1, 1 ], [ 'rifle', 1.5, 1, 1 ], [ 'shotgun', 1.5, 1, 1 ], [ 'crossbow', 1, 1, 1 ], [ 'sniper', 0.5, 1, 1 ]],
  },
  vending: {
    count: [ 1, 2 ],
    table: [[ 'shoes', 4, 1, 2 ], [ 'armor', 3, 1, 2 ], [ 'hammer', 2, 1, 1 ], [ 'rocket', 1, 1, 1 ], [ 'heal', 2, HEAL_MIN, HEAL_MAX ], [ 'pistol', 1.5, 1, 2 ], [ 'smg', 1.5, 1, 2 ], [ 'rifle', 1.5, 1, 2 ], [ 'shotgun', 1, 1, 2 ], [ 'crossbow', 1, 1, 2 ], [ 'sniper', 0.7, 1, 2 ]],
  },
  safe: {
    count: [ 2, 3 ],
    table: [[ 'armor', 3, 2, 3 ], [ 'shoes', 3, 2, 3 ], [ 'rocket', 2, 1, 2 ], [ 'heal', 4, HEAL_MIN, HEAL_MAX ], [ 'hammer', 1, 2, 3 ], [ 'rifle', 2, 2, 3 ], [ 'shotgun', 1.5, 2, 3 ], [ 'smg', 1.5, 2, 3 ], [ 'sniper', 2, 2, 3 ], [ 'crossbow', 1.5, 2, 3 ]],
  },
};

/** 표에서 한 번 뽑기: [종류 번호, 단계] (꽝이면 null) */
function rollOnce(table:DropRow[], rand:() => number):[number, number] | null {
  const sum = table.reduce((s, r) => s + r[1], 0);
  let r = rand() * sum;
  const row = table.find((t) => {
    r -= t[1];
    return r < 0;
  }) ?? table[table.length - 1];
  if (!row[0]) return null;
  // 회복약은 10% 단위 (20·30·…·100)
  if (row[0] === 'heal') return [ ITEM_KINDS.indexOf('heal'), row[2] + 10 * Math.floor(rand() * (Math.floor((row[3] - row[2]) / 10) + 1)) ];
  return [ ITEM_KINDS.indexOf(row[0]), row[2] + Math.floor(rand() * (row[3] - row[2] + 1)) ];
}

/** 드롭 표에서 뽑기: [종류 번호, 단계][] */
export function rollDrops(kind:PropKind, rand:() => number = Math.random):[number, number][] {
  const { count, table } = DROPS[kind];
  const n = count[0] + Math.floor(rand() * (count[1] - count[0] + 1));
  const out:[number, number][] = [];
  for (let i = 0; i < n; i++) {
    const got = rollOnce(table, rand);
    if (got) out.push(got);
  }
  return out;
}

/**
 * 좀비 드롭 (사람이 쓰러뜨렸을 때만): 모습 종류(1 걷는 좀비·2 뛰는 좀비)마다 떨굴 확률, 표는 하나 — 무기·갑옷·신발·망치 +1~+2
 */
export const ZOMBIE_DROP_CHANCE:Record<number, number> = { 1: 0.1, 2: 0.25 };
export const ZOMBIE_DROPS:DropRow[] = [
  [ 'armor', 3, 1, 2 ], [ 'shoes', 3, 1, 2 ], [ 'hammer', 1, 1, 1 ],
  [ 'pistol', 2, 1, 2 ], [ 'smg', 1.5, 1, 2 ], [ 'rifle', 1.5, 1, 2 ], [ 'shotgun', 1.5, 1, 2 ], [ 'crossbow', 1, 1, 2 ], [ 'sniper', 0.5, 1, 1 ],
];

/** 좀비가 떨굴 것 (없으면 null) */
export function rollZombieDrop(k:number, rand:() => number = Math.random):[number, number] | null {
  if (rand() >= (ZOMBIE_DROP_CHANCE[k] ?? 0)) return null;
  return rollOnce(ZOMBIE_DROPS, rand);
}

/** 물건: [id, 종류 번호(PROP_KINDS), 남은 내구도 0~255, x, y, z, 건물, 층, 방향] */
export type PropRow = [number, number, number, number, number, number, number, number, number];