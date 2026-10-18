import { PNG } from 'pngjs';

import { encodePng } from './png-indexed';
import { classifyPixel, RAIN_THRESHOLD_INDEX } from './radar-legend';

// 앱은 사용자 주변(반경 ~150km, 약 430px)만 분석하므로 전체 1453px 이미지를 매번 받을 필요가 없다.
// 256px(약 180km) 타일로 잘라 "비가 있는 타일"만 올리고, 앱은 자기 주변 타일만 받는다.
// 비가 없는 타일은 올리지 않는다 — 앱은 index에 없는 타일을 "강수 없음"으로 채운다.
export const TILE_SIZE = 256;

export interface RadarTile {
  tx:number;
  ty:number;
  png:Buffer;
}

export interface RadarTiles {
  width:number;
  height:number;
  tileSize:number;
  tiles:RadarTile[];
}

export function buildTiles(pngBuffer:Buffer, tileSize = TILE_SIZE):RadarTiles {

  const src = PNG.sync.read(pngBuffer);
  const { width, height, data } = src;

  // 이미지는 범례색 + 안티앨리어싱 몇십 가지 색만 쓰므로 색별로 분류 결과를 기억해 둔다.
  // 앱(RadarPngDecoder)은 alpha 0만 no-data로 보므로 여기서도 alpha 1 이상이면 색으로 분류해,
  // 앱이 비로 볼 픽셀이 있는 타일을 빠뜨리지 않게 한다.
  const rainByColor = new Map<number, boolean>();
  const isRain = (idx:number) => {
    const key = (((data[idx] * 256) + data[idx + 1]) * 256 + data[idx + 2]) * 256 + data[idx + 3];
    let rain = rainByColor.get(key);
    if (rain === undefined) {
      rain = classifyPixel(data[idx], data[idx + 1], data[idx + 2], data[idx + 3], 1) <= RAIN_THRESHOLD_INDEX;
      rainByColor.set(key, rain);
    }
    return rain;
  };

  const tiles:RadarTile[] = [];
  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);

  for (let ty = 0; ty < tilesY; ty += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {

      const x0 = tx * tileSize;
      const y0 = ty * tileSize;
      const w = Math.min(tileSize, width - x0);
      const h = Math.min(tileSize, height - y0);

      let hasRain = false;
      for (let y = y0; y < y0 + h && !hasRain; y += 1) {
        for (let x = x0; x < x0 + w; x += 1) {
          if (isRain(((width * y) + x) * 4)) {
            hasRain = true;
            break;
          }
        }
      }
      if (hasRain) {
        tiles.push({ tx, ty, png: cropPng(data, width, x0, y0, w, h) });
      }

    }
  }

  return { width, height, tileSize, tiles };

}

function cropPng(data:Buffer, width:number, x0:number, y0:number, w:number, h:number):Buffer {
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const from = ((width * (y0 + y)) + x0) * 4;
    data.copy(rgba, y * w * 4, from, from + (w * 4));
  }
  return encodePng(w, h, rgba);
}