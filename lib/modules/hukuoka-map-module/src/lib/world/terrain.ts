/* eslint-disable no-continue, no-restricted-syntax, no-nested-ternary -- 도트 단위 반복문이 많은 생성 코드라 가독성을 위해 허용 */
import { fbm, hash2, mulberry32 } from './random';

import { COASTLINE, FUK_RUNWAY, HAKATA_RIVER, ICN_RUNWAY, LatLng, NAKA_RIVER, RAIL_ROUTES, ROAD_ROUTES, ROUTES } from '../data/routes';
import { Cluster } from '../geo/clusters';
import { Point, project, projectKorea } from '../geo/projection';

// 지형 타일 종류
const T = {
  NONE: 0,
  GRASS: 1,
  FOREST: 2,
  WATER: 3,
  SEA: 4,
  ROAD: 5,
  EXPRESS: 6,
  RAIL: 7,
  BUILDING: 8,
  PAVE: 9,
  PADDY: 10,
  MOUNTAIN: 11,
  RUNWAY: 12,
  RUNWAY_MARK: 13,
  SHRINE: 14,
  BRICK: 15,
};

const BUILDING_COLORS = [ '#e9e2d0', '#d9c9ae', '#c7d2dd', '#e5b8a3', '#b9c6d1', '#f1e7c6', '#a8b9a1', '#d4a5a5', '#9fb4c8' ];
const C_STATION = BUILDING_COLORS.push('#b8bcc4') - 1;
const C_TERMINAL = BUILDING_COLORS.push('#eef2f6') - 1;
const C_CANAL = BUILDING_COLORS.push('#d9645a') - 1;
const C_WHITEWALL = BUILDING_COLORS.push('#f6f3ea') - 1;
const C_SA = BUILDING_COLORS.push('#e0c48a') - 1;

const CLIFF_COLORS = [ '#9a6a3a', '#8a5c30', '#744c27', '#5e3d20' ];
const CLIFF_DEPTH = CLIFF_COLORS.length;

export interface ClusterImage {
  cluster: Cluster;
  x0: number;
  y0: number;
  w: number;
  h: number;
  canvas: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
  lights: HTMLCanvasElement;
}

function hex(c:string):[number, number, number] {
  return [ parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16) ];
}

function shadeRgb([ r, g, b ]:[number, number, number], k:number):[number, number, number] {
  if (k >= 1) return [ r + (255 - r) * (k - 1), g + (255 - g) * (k - 1), b + (255 - b) * (k - 1) ];
  return [ r * k, g * k, b * k ];
}

class Grid {

  tile:Uint8Array;

  color:Uint8Array;

  shade:Uint8Array;

  land:Uint8Array;

  noBuild:Uint8Array;

  lit:Uint8Array;

  constructor(public x0:number, public y0:number, public w:number, public h:number) {
    const n = w * h;
    this.tile = new Uint8Array(n);
    this.color = new Uint8Array(n);
    this.shade = new Uint8Array(n);
    this.land = new Uint8Array(n);
    this.noBuild = new Uint8Array(n);
    this.lit = new Uint8Array(n);
  }

  /** 월드 좌표 → 배열 인덱스 (범위 밖이면 -1) */
  at(wx:number, wy:number) {
    const x = Math.round(wx) - this.x0;
    const y = Math.round(wy) - this.y0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return y * this.w + x;
  }

  disc(c:Point, r:number, fn:(i:number, dist:number) => void) {
    for (let y = Math.floor(c.y - r); y <= Math.ceil(c.y + r); y++) {
      for (let x = Math.floor(c.x - r); x <= Math.ceil(c.x + r); x++) {
        const d = Math.hypot(x - c.x, y - c.y);
        if (d > r) continue;
        const i = this.at(x, y);
        if (i >= 0 && this.land[i]) fn(i, d);
      }
    }
  }

  rect(c:Point, x1:number, y1:number, x2:number, y2:number, fn:(i:number, dx:number, dy:number) => void) {
    for (let dy = y1; dy <= y2; dy++) {
      for (let dx = x1; dx <= x2; dx++) {
        const i = this.at(c.x + dx, c.y + dy);
        if (i >= 0 && this.land[i]) fn(i, dx, dy);
      }
    }
  }

  line(points:Point[], r:number, fn:(i:number) => void) {
    for (let k = 1; k < points.length; k++) {
      const a = points[k - 1];
      const b = points[k];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(len / 0.4));
      for (let s = 0; s <= steps; s++) {
        const p = { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps };
        if (p.x < this.x0 - r || p.y < this.y0 - r || p.x > this.x0 + this.w + r || p.y > this.y0 + this.h + r) continue;
        this.disc(p, r, (i) => fn(i));
      }
    }
  }

}

function lotBuilding(g:Grid, i:number, colorIndex:number, row:number, rows:number) {
  g.tile[i] = T.BUILDING;
  g.color[i] = colorIndex;
  g.shade[i] = row === 0 ? 1 : row === rows - 1 ? 2 : 0;
}

/** 구역 하나의 도트 지형을 생성한다 (1px = 1도트) */
export function generateClusterImage(cluster:Cluster):ClusterImage {
  const { places, radius: R, seed, type } = cluster;
  const korea = type === 'korea';
  const proj = (ll:LatLng) => (korea ? projectKorea(ll[0], ll[1]) : project(ll[0], ll[1]));
  const pad = 10;
  const x0 = Math.floor(Math.min(...places.map((p) => p.pos.x)) - R - pad);
  const y0 = Math.floor(Math.min(...places.map((p) => p.pos.y)) - R - pad);
  const x1 = Math.ceil(Math.max(...places.map((p) => p.pos.x)) + R + pad);
  const y1 = Math.ceil(Math.max(...places.map((p) => p.pos.y)) + R + pad + CLIFF_DEPTH);
  const g = new Grid(x0, y0, x1 - x0, y1 - y0);
  const rng = mulberry32(seed);
  const placeDist = (wx:number, wy:number) => Math.min(...places.map((p) => Math.hypot(wx - p.pos.x, wy - p.pos.y))) / R;

  // 1) 구역 모양: 장소 반경 원들의 합집합 + 노이즈로 울퉁불퉁하게
  const dn = new Float32Array(g.w * g.h);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const wx = x0 + x;
      const wy = y0 + y;
      const i = y * g.w + x;
      dn[i] = placeDist(wx, wy);
      if (dn[i] + (fbm(wx / 16, wy / 16, seed) - 0.5) * 0.6 < 1) {
        g.land[i] = 1;
        g.tile[i] = T.GRASS;
      }
    }
  }

  // 2) 지형 바탕 (숲·산·논)
  const ukiha = places.some((p) => p.id.startsWith('ukiha'));
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      if (!g.land[i]) continue;
      const wx = x0 + x;
      const wy = y0 + y;
      const forest = fbm(wx / 9, wy / 9, seed + 1);
      if (type === 'rural') {
        const m = fbm(wx / 22, wy / 22, seed + 2);
        if (m > 0.64 && dn[i] > 0.3) {
          g.tile[i] = T.MOUNTAIN;
          if (m > 0.72) g.shade[i] = 1;
        } else if (forest > 0.5) g.tile[i] = T.FOREST;
        else if (ukiha && fbm(wx / 12, wy / 12, seed + 3) > 0.45) g.tile[i] = T.PADDY;
      } else if (type === 'town' || type === 'korea') {
        if (forest > 0.63 && dn[i] > 0.25) g.tile[i] = T.FOREST;
        else if (dn[i] > 0.35 && fbm(wx / 12, wy / 12, seed + 3) > (ukiha ? 0.42 : 0.56)) g.tile[i] = T.PADDY;
      } else if (forest > 0.74) g.tile[i] = T.FOREST;
      if (korea && dn[i] > 0.78) g.tile[i] = T.SEA;
    }
  }

  // 3) 실제 지리 힌트 — 하카타만, 나카강·하카타강, 활주로
  if (type === 'city') {
    const coast = COASTLINE.map(proj);
    for (let x = 0; x < g.w; x++) {
      const wx = x0 + x;
      let k = 1;
      while (k < coast.length - 1 && coast[k].x < wx) k++;
      const a = coast[k - 1];
      const b = coast[k];
      const coastY = a.y + ((b.y - a.y) * (wx - a.x)) / (b.x - a.x);
      for (let y = 0; y < g.h; y++) {
        const i = y * g.w + x;
        if (!g.land[i]) continue;
        if (y0 + y < coastY) g.tile[i] = T.SEA;
        else if (y0 + y < coastY + 1.5) g.tile[i] = T.PAVE; // 항만 안벽
      }
    }
    g.line(NAKA_RIVER.map(proj), 2.2, (i) => {
      if (g.tile[i] !== T.SEA) g.tile[i] = T.WATER; 
    });
    g.line(HAKATA_RIVER.map(proj), 1.1, (i) => {
      if (g.tile[i] !== T.SEA) g.tile[i] = T.WATER; 
    });
  }
  const runway = type === 'city' ? FUK_RUNWAY : korea ? ICN_RUNWAY : null;
  if (runway) {
    const pts = runway.map(proj);
    g.line(pts, 16, (i) => {
      g.noBuild[i] = 1; if (g.tile[i] !== T.SEA && g.tile[i] !== T.WATER) g.tile[i] = T.GRASS; 
    });
    g.line(pts, 1.6, (i) => (g.tile[i] = T.RUNWAY));
    const [ a, b ] = pts;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let s = 3; s < len - 3; s += 4) {
      const i = g.at(a.x + ((b.x - a.x) * s) / len, a.y + ((b.y - a.y) * s) / len);
      if (i >= 0 && g.land[i]) g.tile[i] = T.RUNWAY_MARK;
    }
  }

  // 4) 철도·고속도로
  if (!korea) {
    ROAD_ROUTES.forEach((key) => g.line(ROUTES[key].map(proj), 0.9, (i) => {
      if (g.tile[i] !== T.SEA) g.tile[i] = T.EXPRESS; 
    }));
    RAIL_ROUTES.forEach((key) => g.line(ROUTES[key].map(proj), 0.6, (i) => {
      if (g.tile[i] !== T.SEA) g.tile[i] = T.RAIL; 
    }));
  }

  // 5) 바둑판 도로 (도시는 전체, 마을은 장소 주변만)
  if (type === 'city' || type === 'town' || korea) {
    const step = type === 'city' ? [ 13, 7 ] : [ 20, 10 ];
    const vRoads = new Map<number, boolean>();
    const hRoads = new Map<number, boolean>();
    for (let gx = x0 + Math.floor(rng() * 8); gx < x1; gx += step[0] + Math.floor(rng() * step[1])) vRoads.set(gx, rng() < 0.3);
    for (let gy = y0 + Math.floor(rng() * 8); gy < y1; gy += step[0] - 2 + Math.floor(rng() * step[1])) hRoads.set(gy, rng() < 0.3);
    const roadLimit = type === 'city' ? 2 : korea ? 0.55 : 0.6;
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const i = y * g.w + x;
        if (!g.land[i] || g.tile[i] !== T.GRASS || g.noBuild[i] || dn[i] > roadLimit) continue;
        const wx = x0 + x;
        const wy = y0 + y;
        if (vRoads.has(wx) || vRoads.get(wx - 1) || hRoads.has(wy) || hRoads.get(wy - 1)) g.tile[i] = T.ROAD;
      }
    }
  }

  // 6) 장소별 랜드마크
  const at = (id:string) => places.find((p) => p.id === id)?.pos;
  const noBuild = (c:Point, r:number) => g.disc(c, r, (i) => (g.noBuild[i] = 1));
  let p = at('dazaifu');
  if (p) {
    noBuild(p, 13);
    g.disc(p, 12, (i, d) => {
      if (d > 8 && g.tile[i] === T.GRASS) g.tile[i] = T.FOREST; 
    });
    g.rect(p, -6, -8, 6, 4, (i) => (g.tile[i] = T.PAVE));
    g.rect(p, -3, -7, 3, -5, (i, dx, dy) => {
      g.tile[i] = T.SHRINE; g.shade[i] = dy === -7 ? 1 : 0; 
    });
    g.disc({ x: p.x, y: p.y + 1.5 }, 2.2, (i) => (g.tile[i] = T.WATER));
  }
  p = at('canal');
  if (p) {
    noBuild(p, 6);
    g.rect(p, -5, -4, 5, 4, (i, dx, dy) => lotBuilding(g, i, C_CANAL, dy + 4, 9));
    g.rect(p, -5, 0, 5, 0, (i) => (g.tile[i] = T.WATER));
  }
  p = at('hakata');
  if (p) {
    noBuild({ x: p.x + 1, y: p.y }, 5);
    g.rect(p, -3, -6, 3, 4, (i, dx, dy) => lotBuilding(g, i, C_STATION, dy + 6, 11));
  }
  for (const id of [ 'fuk', 'icn' ]) {
    p = at(id);
    if (!p) continue;
    const half = id === 'icn' ? 7 : 4;
    noBuild(p, half + 3);
    g.rect(p, -half, -2, half, 2, (i, dx, dy) => lotBuilding(g, i, C_TERMINAL, dy + 2, 5));
    g.rect(p, -half, 3, half, 5, (i) => (g.tile[i] = T.PAVE));
  }
  p = at('yatai');
  if (p) {
    for (let k = -5; k <= 5; k++) {
      const i = g.at(p.x - 1, p.y + k);
      if (i >= 0 && g.land[i] && g.tile[i] !== T.WATER) {
        g.tile[i] = T.PAVE; if (k % 2 === 0) g.lit[i] = 2; 
      }
    }
  }
  p = at('yufuin');
  if (p) {
    const lake = project(33.2665, 131.368);
    g.disc(lake, 3.6, (i) => (g.tile[i] = T.WATER));
    noBuild(lake, 5);
    const mt = { x: p.x + R * 0.6, y: p.y - R * 0.55 };
    g.disc(mt, 26, (i, d) => {
      g.tile[i] = d < 26 * 0.95 ? T.MOUNTAIN : T.FOREST; g.shade[i] = d < 9 ? 1 : 0; g.noBuild[i] = 1; 
    });
  }
  p = at('bungomori');
  if (p) {
    noBuild(p, 12);
    const tt = { x: p.x, y: p.y + 4 };
    g.disc({ x: p.x, y: p.y - 1 }, 7, (i, d) => {
      const iy = Math.floor(i / g.w) + y0;
      if (iy <= p!.y - 1 && d > 3.5) g.tile[i] = T.BRICK;
    });
    for (let a = -160; a <= -20; a += 20) {
      const rad = (a * Math.PI) / 180;
      g.line([ tt, { x: tt.x + Math.cos(rad) * 9, y: tt.y + Math.sin(rad) * 9 }], 0.3, (i) => {
        if (g.tile[i] !== T.BRICK) g.tile[i] = T.RAIL; 
      });
    }
    g.disc(tt, 2, (i) => (g.tile[i] = T.PAVE));
    g.line([{ x: p.x - R, y: p.y + 8 }, { x: p.x + R, y: p.y + 8 }], 0.5, (i) => (g.tile[i] = T.RAIL));
    g.line([ tt, { x: tt.x, y: p.y + 8 }], 0.3, (i) => (g.tile[i] = T.RAIL));
  }
  p = at('kusu');
  if (p) {
    noBuild(p, 9);
    g.rect(p, -7, 2, 7, 5, (i, dx) => (g.tile[i] = dx % 3 === 0 ? T.ROAD : T.PAVE));
    g.rect(p, -3, -2, 3, 1, (i, dx, dy) => lotBuilding(g, i, C_SA, dy + 2, 4));
  }
  p = at('ukihaInari');
  if (p) {
    const hill = { x: p.x + 5, y: p.y - 8 };
    g.disc(hill, 17, (i, d) => {
      g.tile[i] = d < 11 ? T.MOUNTAIN : T.FOREST; g.shade[i] = d < 5 ? 1 : 0; g.noBuild[i] = 1; 
    });
    g.line([{ x: p.x, y: p.y + 3 }, { x: hill.x, y: hill.y }], 0.5, (i) => {
      g.tile[i] = T.SHRINE; 
    });
  }
  p = at('ukihaTown');
  if (p) {
    g.line([{ x: p.x - 28, y: p.y }, { x: p.x + 28, y: p.y }], 0.5, (i) => (g.tile[i] = T.PAVE));
    for (let dx = -26; dx <= 24; dx += 4) {
      for (const top of [ -4, 2 ]) {
        if (rng() < 0.15) continue;
        g.rect({ x: p.x + dx, y: p.y + top }, 0, 0, 2, 1, (i, _x, dy) => {
          if (g.tile[i] === T.GRASS || g.tile[i] === T.PADDY || g.tile[i] === T.FOREST) {
            g.tile[i] = T.BUILDING; g.color[i] = C_WHITEWALL; g.shade[i] = dy === 0 ? 1 : 0;
          }
        });
      }
    }
  }

  // 7) 건물 — 3x3 필지(도시) / 2x2(마을), 장소에 가까울수록 빽빽하게
  const lot = type === 'city' ? 4 : 3;
  const size = lot - 1;
  for (let ly = 0; ly < g.h; ly += lot) {
    for (let lx = 0; lx < g.w; lx += lot) {
      let ok = true;
      for (let y = ly; y < ly + size && ok; y++) {
        for (let x = lx; x < lx + size && ok; x++) {
          const i = y * g.w + x;
          if (x >= g.w || y >= g.h || !g.land[i] || g.tile[i] !== T.GRASS || g.noBuild[i]) ok = false;
        }
      }
      if (!ok) continue;
      const d = dn[ly * g.w + lx];
      const prob = type === 'city' ? 0.92 - d * 0.35 : type === 'rural' ? (d < 0.3 ? 0.25 : 0.03) : Math.max(0.04, 0.6 - d * 0.65);
      if (hash2(lx + x0, ly + y0, seed + 5) > prob) continue;
      const colorIndex = Math.floor(hash2(lx + x0, ly + y0, seed + 6) * 9);
      for (let y = ly; y < ly + size; y++) {
        for (let x = lx; x < lx + size; x++) lotBuilding(g, y * g.w + x, colorIndex, y - ly, size);
      }
      // 밤에 켜질 창문
      if (hash2(lx + x0, ly + y0, seed + 7) < 0.55) {
        const wy = ly + size - 1;
        const wx = lx + Math.floor(hash2(lx, ly, seed + 8) * size);
        g.lit[wy * g.w + wx] = 1;
      }
    }
  }
  // 랜드마크 건물 창문
  for (let i = 0; i < g.tile.length; i++) {
    if (g.tile[i] === T.BUILDING && g.color[i] >= 9 && g.shade[i] === 0 && hash2(i, 3, seed) < 0.35) g.lit[i] = 1;
  }

  return paint(cluster, g);
}

const TILE_COLORS:Record<number, [string, string]> = {
  [T.GRASS]: [ '#86d064', '#7cc55b' ],
  [T.FOREST]: [ '#3f9a46', '#358a3d' ],
  [T.WATER]: [ '#4aa8e8', '#5cb6f0' ],
  [T.SEA]: [ '#3b8fdc', '#4a9be3' ],
  [T.ROAD]: [ '#a9adb5', '#a3a8b0' ],
  [T.EXPRESS]: [ '#8c929b', '#868c95' ],
  [T.RAIL]: [ '#7b6a5a', '#c3c3cb' ],
  [T.PAVE]: [ '#ddd5c4', '#d6cdb9' ],
  [T.PADDY]: [ '#e2c45a', '#d6b74c' ],
  [T.MOUNTAIN]: [ '#7f8c6a', '#73805f' ],
  [T.RUNWAY]: [ '#5f656e', '#5a6069' ],
  [T.RUNWAY_MARK]: [ '#f2f2f2', '#f2f2f2' ],
  [T.SHRINE]: [ '#d8443a', '#cf3d33' ],
  [T.BRICK]: [ '#8e4b3a', '#834434' ],
};
const TILE_RGB:Record<number, [[number, number, number], [number, number, number]]> = Object.fromEntries(
  Object.entries(TILE_COLORS).map(([ k, [ a, b ]]) => [ k, [ hex(a), hex(b) ]]),
);
const BUILDING_RGB = BUILDING_COLORS.map(hex);
const CLIFF_RGB = CLIFF_COLORS.map(hex);

function makeCanvas(w:number, h:number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function paint(cluster:Cluster, g:Grid):ClusterImage {
  const { w, h, x0, y0 } = g;
  const img = new ImageData(w, h);
  const shadowImg = new ImageData(w, h);
  const lightImg = new ImageData(w, h);
  const put = (data:Uint8ClampedArray, i:number, [ r, gg, b ]:[number, number, number], a = 255) => {
    data[i * 4] = r; data[i * 4 + 1] = gg; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!g.land[i]) continue;
      const tile = g.tile[i];
      const v = hash2(x + x0, y + y0, 77) < 0.5 ? 0 : 1;
      let rgb:[number, number, number];
      if (tile === T.BUILDING) {
        const base = BUILDING_RGB[g.color[i]];
        if (g.color[i] === C_WHITEWALL) rgb = g.shade[i] === 1 ? [ 74, 74, 88 ] : base;
        else rgb = shadeRgb(base, g.shade[i] === 1 ? 1.12 : g.shade[i] === 2 ? 0.8 : 1);
      } else if (tile === T.RAIL) {
        rgb = TILE_RGB[T.RAIL][Math.abs(x + x0 + y + y0) % 2];
      } else if (tile === T.FOREST) {
        rgb = hash2(x + x0, y + y0, 91) < 0.22 ? [ 86, 178, 90 ] : TILE_RGB[T.FOREST][v];
      } else if (tile === T.MOUNTAIN || tile === T.SHRINE) {
        rgb = shadeRgb(TILE_RGB[tile][v], g.shade[i] === 1 ? 1.18 : 1);
      } else {
        rgb = TILE_RGB[tile]?.[v] ?? [ 255, 0, 255 ];
      }
      // 구역 테두리는 살짝 어둡게
      const edge = (x > 0 && !g.land[i - 1]) || (x < w - 1 && !g.land[i + 1]) || (y > 0 && !g.land[i - w]) || (y < h - 1 && !g.land[i + w]);
      if (edge) rgb = shadeRgb(rgb, 0.82);
      put(img.data, i, rgb);
      put(shadowImg.data, i, [ 20, 30, 70 ], 70);
      if (g.lit[i] === 1) put(lightImg.data, i, [ 255, 215, 106 ]);
      else if (g.lit[i] === 2) put(lightImg.data, i, [ 255, 123, 58 ]);

      // 떠 있는 섬처럼 아래쪽 단면(절벽)을 붙인다
      if (y < h - 1 && !g.land[i + w]) {
        for (let k = 1; k <= CLIFF_DEPTH && y + k < h; k++) {
          const j = i + k * w;
          if (g.land[j]) break;
          put(img.data, j, CLIFF_RGB[k - 1]);
          put(shadowImg.data, j, [ 20, 30, 70 ], 70);
        }
      }
    }
  }

  const canvas = makeCanvas(w, h);
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  const shadow = makeCanvas(w, h);
  shadow.getContext('2d')!.putImageData(shadowImg, 0, 0);
  const lights = makeCanvas(w, h);
  lights.getContext('2d')!.putImageData(lightImg, 0, 0);
  return { cluster, x0, y0, w, h, canvas, shadow, lights };
}