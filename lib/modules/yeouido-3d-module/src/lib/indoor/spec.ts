/** 들어갈 수 있는 건물 설정. OSM 데이터에 없는 정보(실제 층수·출입구)는 여기서 보정한다 */
export interface EntranceSpec {
  /** 출입구가 있는 벽이 바라보는 방위 (x=동, z=남 기준 단위 벡터로 바꿔 쓴다) */
  facing: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
  /** 문 폭(m) */
  width: number;
}

export interface IndoorSpec {
  /** 'w' + way id 또는 'r' + relation id */
  key: string;
  use: 'office';
  levels: number;
  entrances: EntranceSpec[];
}

export const INDOOR_SPECS:IndoorSpec[] = [
  // KB국민은행 본점 (OSM은 15층이지만 실제 지상 14층). 1층 로비 출입구가 남서·북동 양쪽에 있다
  { key: 'w681809122', use: 'office', levels: 14, entrances: [{ facing: 'SW', width: 8 }, { facing: 'NE', width: 8 }] },
];

const S = Math.SQRT1_2;
export const FACING:Record<EntranceSpec['facing'], [number, number]> = { N: [ 0, -1 ], NE: [ S, -S ], E: [ 1, 0 ], SE: [ S, S ], S: [ 0, 1 ], SW: [ -S, S ], W: [ -1, 0 ], NW: [ -S, -S ] };