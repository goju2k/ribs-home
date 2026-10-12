import { Place } from '../data/places';

/** 1도트 = 20m */
export const METERS_PER_DOT = 20;

export interface Point {
  x: number;
  y: number;
}

const M_PER_DEG_LAT = 110574;
const mPerDegLng = (lat:number) => 111320 * Math.cos((lat * Math.PI) / 180);

// 하카타역을 원점으로 하는 국지 등장방형 투영 (x: 동쪽, y: 남쪽, 단위: 도트)
const ORIGIN_LAT = 33.59;
const ORIGIN_LNG = 130.42;

export function project(lat:number, lng:number):Point {
  return {
    x: ((lng - ORIGIN_LNG) * mPerDegLng(ORIGIN_LAT)) / METERS_PER_DOT,
    y: (-(lat - ORIGIN_LAT) * M_PER_DEG_LAT) / METERS_PER_DOT,
  };
}

// 한국(인천공항)은 예외 — 실제 방향(북서쪽)은 유지하되 거리는 약 14km 지점으로 축약 배치
const ICN_LAT = 37.4635;
const ICN_LNG = 126.4417;
const KOREA_DISPLAY_DISTANCE = 700; // 도트
const KOREA_ANCHOR:Point = (() => {
  const real = project(ICN_LAT, ICN_LNG);
  const len = Math.hypot(real.x, real.y);
  return { x: (real.x / len) * KOREA_DISPLAY_DISTANCE, y: (real.y / len) * KOREA_DISPLAY_DISTANCE };
})();

export function projectKorea(lat:number, lng:number):Point {
  return {
    x: KOREA_ANCHOR.x + ((lng - ICN_LNG) * mPerDegLng(ICN_LAT)) / METERS_PER_DOT,
    y: KOREA_ANCHOR.y + (-(lat - ICN_LAT) * M_PER_DEG_LAT) / METERS_PER_DOT,
  };
}

export function projectPlace(place:Place):Point {
  return place.korea ? projectKorea(place.lat, place.lng) : project(place.lat, place.lng);
}

/** 실제 거리(km) — 축약 배치와 무관하게 표기용 */
export function haversineKm(aLat:number, aLng:number, bLat:number, bLng:number) {
  const toRad = (d:number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}