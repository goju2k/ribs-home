// 기상청 동네예보(DFS) 5km 격자 — 람베르트 정각원추도법(LCC). 기상청 공개 변환식과 같은 값.
// 격자 번호는 1부터: nx 1..149(서→동), ny 1..253(남→북). 서울시청 ≈ (60, 127).
const RE = 6371.00877; // 지구 반경(km)
const GRID = 5.0; // 격자 간격(km)
const SLAT1 = 30.0; // 표준위도 1
const SLAT2 = 60.0; // 표준위도 2
const OLON = 126.0; // 기준점 경도
const OLAT = 38.0; // 기준점 위도
const XO = 43; // 기준점 X 격자
const YO = 136; // 기준점 Y 격자

export const DFS_NX = 149;
export const DFS_NY = 253;

const DEG = Math.PI / 180;
const re = RE / GRID;
const slat1 = SLAT1 * DEG;
const slat2 = SLAT2 * DEG;
const olon = OLON * DEG;
const olat = OLAT * DEG;
const sn = Math.log(Math.cos(slat1) / Math.cos(slat2))
  / Math.log(Math.tan((Math.PI * 0.25) + (slat2 * 0.5)) / Math.tan((Math.PI * 0.25) + (slat1 * 0.5)));
const sf = (Math.tan((Math.PI * 0.25) + (slat1 * 0.5)) ** sn * Math.cos(slat1)) / sn;
const ro = (re * sf) / Math.tan((Math.PI * 0.25) + (olat * 0.5)) ** sn;

// 위경도 -> 격자 좌표(실수). 반올림하면 기상청 격자 번호(nx, ny).
export function latLonToDfs(lat:number, lon:number):{ x:number; y:number; } {
  const ra = (re * sf) / Math.tan((Math.PI * 0.25) + (lat * DEG * 0.5)) ** sn;
  let theta = (lon * DEG) - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return { x: (ra * Math.sin(theta)) + XO, y: (ro - (ra * Math.cos(theta))) + YO };
}

// 격자 좌표(실수) -> 위경도.
export function dfsToLatLon(x:number, y:number):{ lat:number; lon:number; } {
  const xn = x - XO;
  const yn = ro - (y - YO);
  let ra = Math.sqrt((xn * xn) + (yn * yn));
  if (sn < 0) ra = -ra;
  const alat = 2.0 * Math.atan(((re * sf) / ra) ** (1.0 / sn)) - (Math.PI * 0.5);
  let theta:number;
  if (Math.abs(xn) <= 0.0) {
    theta = 0.0;
  } else if (Math.abs(yn) <= 0.0) {
    theta = (Math.PI * 0.5) * Math.sign(xn);
  } else {
    theta = Math.atan2(xn, yn);
  }
  const alon = (theta / sn) + olon;
  return { lat: alat / DEG, lon: alon / DEG };
}