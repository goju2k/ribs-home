import { Point } from './projection';

export type ClusterType = 'city' | 'town' | 'rural' | 'korea';

export interface ClusterPlace {
  id: string;
  pos: Point;
}

export interface Cluster {
  id: string;
  type: ClusterType;
  places: ClusterPlace[];
  /** 장소별 반경(도트) — 이 원들의 합집합(+노이즈)이 그려지는 영역 */
  radius: number;
  seed: number;
}

export const PLACE_RADIUS = 75; // 1.5km
const KOREA_RADIUS = 60;

const CITY_IDS = [ 'hakata' ];
const TOWN_IDS = [ 'dazaifu', 'ukihaTown', 'yufuin' ];

/** 반경 원이 겹치는 장소끼리 묶는다(union-find). 한국 장소는 따로 묶음. */
export function buildClusters(places:(ClusterPlace & { korea?: boolean; })[]):Cluster[] {
  const parent = places.map((_, i) => i);
  const find = (i:number):number => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const sameCountry = !!places[i].korea === !!places[j].korea;
      const d = Math.hypot(places[i].pos.x - places[j].pos.x, places[i].pos.y - places[j].pos.y);
      if (sameCountry && d < PLACE_RADIUS * 2) parent[find(i)] = find(j);
    }
  }

  const groups = new Map<number, number[]>();
  places.forEach((_, i) => {
    const root = find(i);
    groups.set(root, [ ...(groups.get(root) ?? []), i ]);
  });

  return [ ...groups.values() ].map((indexes, n) => {
    const members = indexes.map((i) => places[i]);
    const ids = members.map((m) => m.id);
    const korea = !!members[0].korea;
    let type:ClusterType = 'rural';
    if (korea) type = 'korea';
    else if (ids.some((id) => CITY_IDS.includes(id))) type = 'city';
    else if (ids.some((id) => TOWN_IDS.includes(id))) type = 'town';
    return {
      id: ids.join('+'),
      type,
      places: members.map(({ id, pos }) => ({ id, pos })),
      radius: korea ? KOREA_RADIUS : PLACE_RADIUS,
      seed: 1000 + n * 7919,
    };
  });
}