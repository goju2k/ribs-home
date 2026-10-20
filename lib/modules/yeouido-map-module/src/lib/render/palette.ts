// 타일 번호는 tools/bake-yeouido.mjs 의 T 와 같아야 한다
export const T = {
  GROUND: 0,
  GRASS: 1,
  FOREST: 2,
  WATER: 3,
  ROAD: 4,
  ROAD_MINOR: 5,
  FOOT: 6,
  BRIDGE: 7,
  RAIL: 8,
  PITCH: 9,
  PAVE: 10,
  SAND: 11,
  LANE: 12,
  CYCLE: 13,
  PLAZA: 14,
  CONSTRUCTION: 15,
} as const;

export type RGB = [number, number, number];

const hex = (c:string):RGB => [ parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16) ];

/** 타일별 [기본, 얼룩] 두 가지 색 — 도트 질감용 */
export const TILE_RGB:RGB[][] = [
  [ '#d8d3c4', '#d2ccbc' ], // GROUND
  [ '#8cc56b', '#7fb95f' ], // GRASS
  [ '#4f9a4f', '#438a45' ], // FOREST
  [ '#4f8fcf', '#5a9bd8' ], // WATER
  [ '#5d6168', '#585c63' ], // ROAD
  [ '#8b8e93', '#85888d' ], // ROAD_MINOR
  [ '#e6dcc4', '#ddd2b8' ], // FOOT
  [ '#a3a6ab', '#9a9da2' ], // BRIDGE
  [ '#7a6a5c', '#5c5048' ], // RAIL
  [ '#5fae6a', '#6cb877' ], // PITCH
  [ '#b9b8b3', '#b2b1ac' ], // PAVE
  [ '#e8d7a5', '#e0cd96' ], // SAND
  [ '#f2f0e8', '#5d6168' ], // LANE (점선: 두 번째 색은 도로색)
  [ '#c98a6c', '#c08164' ], // CYCLE
  [ '#e3ddd0', '#dad3c4' ], // PLAZA
  [ '#c9a77a', '#bf9c6e' ], // CONSTRUCTION
].map((pair) => pair.map(hex));

export const BACKGROUND = '#0b0e22';

/** 밤에 가로등 빛이 도는 타일 */
export const LIT_TILES = new Set<number>([ T.ROAD, T.LANE, T.BRIDGE, T.ROAD_MINOR ]);