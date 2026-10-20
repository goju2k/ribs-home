/* eslint-disable no-continue, prefer-destructuring -- 도트 단위 반복문/픽셀 버퍼 쓰기가 본질인 생성 코드 */
import { LIT_TILES, RGB, T, TILE_RGB } from './palette';
import { hash2 } from './random';

import { YeouidoGrid } from '../data/decode';

/** 건물 높이 과장/압축 비율 (1 = 가로와 같은 축척) — 비스듬히 내려다보는 느낌으로 약간 눌러 준다 */
export const VSCALE = 0.75;

export interface Composite {
  width: number;
  height: number;
  /** 그리드 y=0 이 이미지에서 시작하는 위치(가장 높은 건물이 잘리지 않게 위쪽 여백) */
  top: number;
  day: Uint8ClampedArray;
  night: Uint8ClampedArray;
}

const NIGHT_TINT:RGB = [ 0.2, 0.24, 0.4 ];
const WINDOW_LIT:RGB = [ 255, 214, 130 ];
const STREET_LIGHT:RGB = [ 255, 206, 128 ];
const SKY_GLASS:RGB = [ 205, 228, 246 ];

const mul = (c:RGB, k:number):RGB => [ c[0] * k, c[1] * k, c[2] * k ];
const mix = (a:RGB, b:RGB, k:number):RGB => [ a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k ];
const tint = (c:RGB, t:RGB):RGB => [ c[0] * t[0], c[1] * t[1], c[2] * t[2] ];

export const heightPx = (h:number) => Math.max(1, Math.round(h * VSCALE));

/** 낮/밤 두 장의 2.5D 픽셀 이미지를 만든다 (1 도트 = 1 픽셀) */
export function compose(g:YeouidoGrid):Composite {
  const top = heightPx(g.maxBuildingHeight) + 3;
  const width = g.w;
  const height = g.h + top;
  const day = new Uint8ClampedArray(width * height * 4);
  const night = new Uint8ClampedArray(width * height * 4);

  const put = (buf:Uint8ClampedArray, x:number, y:number, c:RGB) => {
    if (y < 0 || y >= height) return;
    const o = (y * width + x) * 4;
    buf[o] = c[0];
    buf[o + 1] = c[1];
    buf[o + 2] = c[2];
    buf[o + 3] = 255;
  };
  const scale = (buf:Uint8ClampedArray, x:number, y:number, k:number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const o = (y * width + x) * 4;
    buf[o] *= k;
    buf[o + 1] *= k;
    buf[o + 2] *= k;
  };

  // 1) 바닥
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      let tile = g.tiles[i];
      if (g.buildingIds[i]) tile = T.PAVE;
      const v = hash2(x, y, 7) < 0.5 ? 0 : 1;
      let c:RGB = TILE_RGB[tile][v];
      if (tile === T.LANE) c = TILE_RGB[T.LANE][(x + y) % 6 < 3 ? 0 : 1];
      if (tile === T.WATER && hash2(x, y, 11) < 0.025) c = mix(c, [ 255, 255, 255 ], 0.35);

      let n:RGB = tint(c, NIGHT_TINT);
      if (tile === T.WATER) n = hash2(x, y, 13) < 0.005 ? [ 60, 80, 125 ] : [ 16, 28, 58 ];
      else if (LIT_TILES.has(tile)) {
        n = mix(n, STREET_LIGHT, tile === T.ROAD_MINOR ? 0.12 : 0.22);
        if (hash2(x, y, 17) < 0.012) n = STREET_LIGHT;
      }
      put(day, x, y + top, c);
      put(night, x, y + top, n);
    }
  }

  // 2) 그림자 — 남서쪽 해를 기준으로 동북동쪽으로
  const shadowed = new Uint8Array(g.w * g.h);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const id = g.buildingIds[y * g.w + x];
      if (!id) continue;
      const len = Math.round(heightPx(g.buildings[id].height) * 0.55);
      for (let s = 1; s <= len; s++) {
        const sx = x + s;
        const sy = y - Math.round(s * 0.35);
        if (sx >= g.w || sy < 0) break;
        const j = sy * g.w + sx;
        if (shadowed[j] || g.buildingIds[j]) continue;
        shadowed[j] = 1;
        scale(day, sx, sy + top, 0.72);
      }
    }
  }

  // 3) 건물 — 북쪽 줄부터 칠해야 남쪽(앞) 건물이 뒤 건물을 가린다
  const same = (x:number, y:number, id:number) => x >= 0 && y >= 0 && x < g.w && y < g.h && g.buildingIds[y * g.w + x] === id;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const id = g.buildingIds[y * g.w + x];
      if (!id) continue;
      const b = g.buildings[id];
      const h = heightPx(b.height);
      const northOpen = !same(x, y - 1, id);
      const southOpen = !same(x, y + 1, id);
      const westOpen = !same(x - 1, y, id);
      const eastOpen = !same(x + 1, y, id);

      // 벽(남쪽 면) — 남쪽이 같은 건물이면 어차피 그 칸의 벽/지붕에 덮인다
      if (southOpen) {
        for (let k = 0; k < h; k++) {
          let c = mul(b.wall, 0.7 + 0.2 * (k / h));
          if (westOpen) c = mul(c, 1.08);
          if (eastOpen) c = mul(c, 0.86);
          if (k === 0 && h > 2) c = mul(c, 0.7);
          const isWindow = h >= 3 && k > 0 && k < h - 1 && (x + id) % 2 === 0 && k % 2 === 1;
          let n = tint(c, [ 0.22, 0.24, 0.34 ]);
          if (isWindow) {
            c = mul(mix(c, SKY_GLASS, 0.35), 0.92);
            if (hash2(x, k, id) < 0.48) n = WINDOW_LIT;
            else n = mul(n, 0.7);
          }
          put(day, x, y + top - k, c);
          put(night, x, y + top - k, n);
        }
      }

      // 지붕
      let r = b.roof;
      if (northOpen || westOpen) r = mul(r, 1.1);
      if (southOpen || eastOpen) r = mul(r, 0.86);
      let rn = tint(r, [ 0.24, 0.26, 0.36 ]);
      // 높은 건물 옥상 항공 장애등
      if (h > 30 && northOpen && westOpen) rn = [ 255, 60, 50 ];
      put(day, x, y + top - h, r);
      put(night, x, y + top - h, rn);
    }
  }

  return { width, height, top, day, night };
}