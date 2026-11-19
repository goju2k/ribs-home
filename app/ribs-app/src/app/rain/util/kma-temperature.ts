import { useEffect, useState } from 'react';

import { DFS_NX, DFS_NY, dfsToLatLon, latLonToDfs } from './kma-dfs-grid';

// 기상청 날씨누리 기온 예보 이미지(/api/kma/temperature-key의 src)는 149x253 PNG로, 픽셀 하나가
// 동네예보 5km 격자 한 칸이다(열 = nx-1, 행 = 253-ny: 위가 북쪽). 픽셀 색은 범례 색과 정확히 같고,
// 범례 key(1℃ 간격)로 바꾸면 그 칸의 예보 기온이 된다. 이미지는 CORS *라 canvas로 읽을 수 있다.

export interface TemperatureLegend {
  id:string;
  color:string[];
  label:string[];
  key:string[];
}

export interface KmaTemperature {
  // 예보 대상 시각(UTC, '2026-11-19T01:00:00').
  efcDate:string;
  legend:TemperatureLegend;
  // 원본 이미지 픽셀(RGBA, DFS_NX x DFS_NY).
  pixels:Uint8ClampedArray;
  // 칸별 기온(℃), 값 없는 칸(바다 밖·투명)은 NaN.
  values:Float32Array;
}

// 이 기온 이하에서 내리면 눈으로 본다(사용자 기준: 영상 2도면 눈이 올 기온).
export const SNOW_MAX_CELSIUS = 2;

export type PrecipKind = 'rain' | 'snow';

export function precipKind(celsius:number | null | undefined):PrecipKind {
  return celsius != null && celsius <= SNOW_MAX_CELSIUS ? 'snow' : 'rain';
}

const REFRESH_MS = 20 * 60 * 1000;

let cache:{ at:number; promise:Promise<KmaTemperature | null>; } | null = null;

function hexToRgb(hex:string):[number, number, number] {
  const h = hex.replace('#', '');
  return [ parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16) ];
}

function rgbKey(r:number, g:number, b:number):string {
  return `${r},${g},${b}`;
}

function loadImage(src:string):Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src}`));
    img.src = src;
  });
}

async function fetchKmaTemperature():Promise<KmaTemperature | null> {
  const res = await fetch('/api/kma/temperature-key', { cache: 'no-store' });
  if (!res.ok) {
    return null;
  }
  const data = await res.json() as { src:string; time:string; legend:TemperatureLegend; };
  if (!data?.src || !data.legend?.color) {
    return null;
  }
  const img = await loadImage(data.src);
  const canvas = document.createElement('canvas');
  canvas.width = DFS_NX;
  canvas.height = DFS_NY;
  const ctx = canvas.getContext('2d');
  if (!ctx || img.naturalWidth !== DFS_NX || img.naturalHeight !== DFS_NY) {
    return null;
  }
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, DFS_NX, DFS_NY).data;

  const palette = data.legend.color.map((hex, i) => ({ rgb: hexToRgb(hex), value: Number(data.legend.key[i]) }));
  const exact = new Map(palette.map((p) => [ rgbKey(p.rgb[0], p.rgb[1], p.rgb[2]), p.value ]));
  const values = new Float32Array(DFS_NX * DFS_NY);
  for (let i = 0; i < values.length; i += 1) {
    const o = i * 4;
    if (pixels[o + 3] < 128) {
      values[i] = NaN;
    } else {
      const found = exact.get(rgbKey(pixels[o], pixels[o + 1], pixels[o + 2]));
      values[i] = found ?? nearestValue(palette, pixels[o], pixels[o + 1], pixels[o + 2]);
    }
  }
  return { efcDate: data.time, legend: data.legend, pixels, values };
}

// 범례에 딱 맞는 색이 없을 때(이미지 가장자리 등) 가장 가까운 색. 너무 멀면 값 없음.
function nearestValue(palette:{ rgb:[number, number, number]; value:number; }[], r:number, g:number, b:number):number {
  let best = NaN;
  let bestDist = 30 * 30 * 3;
  palette.forEach((p) => {
    const d = ((p.rgb[0] - r) ** 2) + ((p.rgb[1] - g) ** 2) + ((p.rgb[2] - b) ** 2);
    if (d < bestDist) {
      bestDist = d;
      best = p.value;
    }
  });
  return best;
}

function getKmaTemperature():Promise<KmaTemperature | null> {
  if (!cache || Date.now() - cache.at > REFRESH_MS) {
    const promise = fetchKmaTemperature().catch(() => null);
    cache = { at: Date.now(), promise };
    // 실패하면 다음 호출 때 다시 받는다.
    promise.then((r) => {
      if (!r && cache?.promise === promise) cache = null; 
    });
  }
  return cache.promise;
}

// 기상청 기온 예보 격자. 여러 컴포넌트가 써도 한 번만 받고, 20분마다 새로 받는다.
export function useKmaTemperature():KmaTemperature | null {
  const [ data, setData ] = useState<KmaTemperature | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => getKmaTemperature().then((r) => {
      if (alive && r) setData(r); 
    });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return data;
}

function cellIndex(lat:number, lon:number):number | null {
  const { x, y } = latLonToDfs(lat, lon);
  const nx = Math.round(x);
  const ny = Math.round(y);
  if (nx < 1 || nx > DFS_NX || ny < 1 || ny > DFS_NY) {
    return null;
  }
  return ((DFS_NY - ny) * DFS_NX) + (nx - 1);
}

// 위경도 지점의 예보 기온(℃). 격자 밖이거나 값이 없으면 null.
export function temperatureAt(data:KmaTemperature, lat:number, lon:number):number | null {
  const i = cellIndex(lat, lon);
  if (i == null) {
    return null;
  }
  const v = data.values[i];
  return Number.isNaN(v) ? null : v;
}

const OVERLAY_WIDTH = 720;

export interface TemperatureOverlay {
  dataUrl:string;
  north:number;
  west:number;
  south:number;
  east:number;
}

// 지도(웹 메르카토르)에 그대로 펴서 얹을 이미지를 만든다. 결과 이미지는 경도·메르카토르 y에 대해
// 선형이라, 북서·남동 두 모서리 위치에 맞춰 늘리면 지도와 정확히 겹친다(원본 LCC 이미지를
// 그대로 늘리면 남북으로 갈수록 어긋난다).
export function buildMercatorOverlay(data:KmaTemperature):TemperatureOverlay | null {
  // 격자 테두리를 위경도로 바꿔 감싸는 범위를 구한다.
  let north = -90;
  let south = 90;
  let west = 180;
  let east = -180;
  const edge = (x:number, y:number) => {
    const p = dfsToLatLon(x, y);
    north = Math.max(north, p.lat);
    south = Math.min(south, p.lat);
    west = Math.min(west, p.lon);
    east = Math.max(east, p.lon);
  };
  for (let x = 0.5; x <= DFS_NX + 0.5; x += 1) {
    edge(x, 0.5);
    edge(x, DFS_NY + 0.5);
  }
  for (let y = 0.5; y <= DFS_NY + 0.5; y += 1) {
    edge(0.5, y);
    edge(DFS_NX + 0.5, y);
  }

  const mercY = (lat:number) => Math.log(Math.tan((Math.PI / 4) + ((lat * Math.PI) / 360)));
  const yTop = mercY(north);
  const yBottom = mercY(south);
  const lonSpanRad = ((east - west) * Math.PI) / 180;
  const width = OVERLAY_WIDTH;
  const height = Math.round(width * ((yTop - yBottom) / lonSpanRad));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  const out = ctx.createImageData(width, height);
  for (let v = 0; v < height; v += 1) {
    const my = yTop - (((v + 0.5) / height) * (yTop - yBottom));
    const lat = (Math.atan(Math.sinh(my)) * 180) / Math.PI;
    for (let u = 0; u < width; u += 1) {
      const lon = west + (((u + 0.5) / width) * (east - west));
      const i = cellIndex(lat, lon);
      if (i != null) {
        const s = i * 4;
        const o = ((v * width) + u) * 4;
        out.data[o] = data.pixels[s];
        out.data[o + 1] = data.pixels[s + 1];
        out.data[o + 2] = data.pixels[s + 2];
        out.data[o + 3] = data.pixels[s + 3];
      }
    }
  }
  ctx.putImageData(out, 0, 0);
  return { dataUrl: canvas.toDataURL('image/png'), north, west, south, east };
}