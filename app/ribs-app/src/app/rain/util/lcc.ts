/**
 * Lambert Conformal Conic (ellipsoidal, Snyder's formulas) — the projection the KMA radar mosaic
 * is natively defined in (their own client exposes it as EPSG:980201 in weather.go.kr's kmap
 * config): `+proj=lcc +lat_1=30 +lat_2=60 +lat_0=0 +lon_0=126 +datum=WGS84 +units=m`.
 *
 * Mirrors the Android app's LambertConformalConic.kt (same formulas, verified there against
 * pyproj) so the web can locate points in the grid's own coordinate system instead of assuming
 * it's a plain lat/lon rectangle — it isn't; see radarGrid.ts for why that matters here.
 */

const A = 6378137.0;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const E = Math.sqrt(E2);
const LAT1 = (30 * Math.PI) / 180;
const LAT2 = (60 * Math.PI) / 180;
const LAT0 = 0;
const LON0 = (126 * Math.PI) / 180;

function mFn(phi: number): number {
  return Math.cos(phi) / Math.sqrt(1 - E2 * Math.sin(phi) * Math.sin(phi));
}

function tFn(phi: number): number {
  return Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi)), E / 2);
}

const M1 = mFn(LAT1);
const M2 = mFn(LAT2);
const T1 = tFn(LAT1);
const T2 = tFn(LAT2);
const T0 = tFn(LAT0);
const N = (Math.log(M1) - Math.log(M2)) / (Math.log(T1) - Math.log(T2));
const LCC_F = M1 / (N * Math.pow(T1, N));
const RHO0 = A * LCC_F * Math.pow(T0, N);

export interface Meters {
  x: number;
  y: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export function projectLcc(latDeg: number, lngDeg: number): Meters {
  const phi = (latDeg * Math.PI) / 180;
  const lam = (lngDeg * Math.PI) / 180;
  const rho = A * LCC_F * Math.pow(tFn(phi), N);
  const theta = N * (lam - LON0);
  return { x: rho * Math.sin(theta), y: RHO0 - rho * Math.cos(theta) };
}

/** Closed-form radius/angle, then a short fixed-point iteration for latitude (Snyder's standard inverse). */
export function unprojectLcc(x: number, y: number): LatLng {
  const sign = N >= 0 ? 1 : -1;
  const rho = sign * Math.sqrt(x * x + (RHO0 - y) * (RHO0 - y));
  const theta = Math.atan2(sign * x, sign * (RHO0 - y));
  const tt = Math.pow(rho / (A * LCC_F), 1 / N);
  const lng = (theta / N + LON0) * (180 / Math.PI);
  let phi = Math.PI / 2 - 2 * Math.atan(tt);
  for (let i = 0; i < 10; i++) {
    const es = E * Math.sin(phi);
    phi = Math.PI / 2 - 2 * Math.atan(tt * Math.pow((1 - es) / (1 + es), E / 2));
  }
  return { lat: phi * (180 / Math.PI), lng };
}
