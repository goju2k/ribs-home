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
  // 섬 동·서·남·북에 고르게 (게임성 측정용 PoC — 출입구 방향은 긴 두 면으로 가정). 다른 건물 외곽선과 겹치는 복합 건물은 빼었다
  // 63빌딩 (동쪽 끝, 지상 60층)
  { key: 'w64989671', use: 'office', levels: 60, entrances: [{ facing: 'NW', width: 8 }, { facing: 'SE', width: 8 }] },
  // LG트윈타워 (북동, 34층 — 두 동 중 하나로 그린 외곽선)
  { key: 'r6033900', use: 'office', levels: 34, entrances: [{ facing: 'NW', width: 6 }, { facing: 'SE', width: 6 }] },
  // 현대카드 본사 1관 (북서, 11층 — 다른 건물 조각과 안 겹치는 것으로 골랐다)
  { key: 'w682328405', use: 'office', levels: 11, entrances: [{ facing: 'NE', width: 6 }, { facing: 'SW', width: 6 }] },
  // 전경련회관 FKI타워 (남서, 50층)
  { key: 'w681805210', use: 'office', levels: 50, entrances: [{ facing: 'NW', width: 8 }, { facing: 'SE', width: 8 }] },
];

const S = Math.SQRT1_2;
export const FACING:Record<EntranceSpec['facing'], [number, number]> = { N: [ 0, -1 ], NE: [ S, -S ], E: [ 1, 0 ], SE: [ S, S ], S: [ 0, 1 ], SW: [ -S, S ], W: [ -1, 0 ], NW: [ -S, -S ] };