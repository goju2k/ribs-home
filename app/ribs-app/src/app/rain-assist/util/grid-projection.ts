// 지도 컨트롤러 없이 순수 수학으로 위경도 <-> 그리드 좌표를 변환한다.
// RADAR_CORNERS는 [bottomLeft, topLeft, topRight, bottomRight] 순서(radar-geo.ts와 동일 순서)를 가정한다.

export interface LatLng {
  lat:number;
  lng:number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg:number) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad:number) {
  return (rad * 180) / Math.PI;
}

interface BilinearCoeffs {
  aLat:number; bLat:number; cLat:number; dLat:number;
  aLng:number; bLng:number; cLng:number; dLng:number;
}

// lat(u,v) = a + b*u + c*v + d*u*v (lng도 동일 형태), u=0 좌측/1 우측, v=0 상단/1 하단
function coeffs(corners:LatLng[]):BilinearCoeffs {
  const [ bl, tl, tr, br ] = corners;
  return {
    aLat: tl.lat,
    bLat: tr.lat - tl.lat,
    cLat: bl.lat - tl.lat,
    dLat: tl.lat - tr.lat - bl.lat + br.lat,
    aLng: tl.lng,
    bLng: tr.lng - tl.lng,
    cLng: bl.lng - tl.lng,
    dLng: tl.lng - tr.lng - bl.lng + br.lng,
  };
}

export function bilinearForward(corners:LatLng[], u:number, v:number):LatLng {
  const c = coeffs(corners);
  return {
    lat: c.aLat + c.bLat * u + c.cLat * v + c.dLat * u * v,
    lng: c.aLng + c.bLng * u + c.cLng * v + c.dLng * u * v,
  };
}

// Newton-Raphson으로 (lat,lng) -> (u,v) 역산. 쿼드가 평행사변형에 가까워 몇 회 안에 수렴한다.
export function bilinearInverse(corners:LatLng[], point:LatLng, maxIter = 20):{ u:number; v:number; } | null {

  const c = coeffs(corners);
  let u = 0.5;
  let v = 0.5;

  for (let i = 0; i < maxIter; i += 1) {

    const lat = c.aLat + c.bLat * u + c.cLat * v + c.dLat * u * v;
    const lng = c.aLng + c.bLng * u + c.cLng * v + c.dLng * u * v;

    const fLat = lat - point.lat;
    const fLng = lng - point.lng;

    if (Math.abs(fLat) < 1e-9 && Math.abs(fLng) < 1e-9) {
      break;
    }

    const dLatDu = c.bLat + c.dLat * v;
    const dLatDv = c.cLat + c.dLat * u;
    const dLngDu = c.bLng + c.dLng * v;
    const dLngDv = c.cLng + c.dLng * u;

    const det = (dLatDu * dLngDv) - (dLatDv * dLngDu);
    if (Math.abs(det) < 1e-12) {
      return null;
    }

    const du = ((fLat * dLngDv) - (fLng * dLatDv)) / det;
    const dv = ((fLng * dLatDu) - (fLat * dLngDu)) / det;

    u -= du;
    v -= dv;
  }

  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    return null;
  }

  return { u, v };
}

export function latLngToGridCell(
  corners:LatLng[],
  point:LatLng,
  gridWidth:number,
  gridHeight:number,
  margin = 0.05,
):{ col:number; row:number; } | null {

  const uv = bilinearInverse(corners, point);
  if (!uv) {
    return null;
  }

  const { u, v } = uv;
  if (u < -margin || u > 1 + margin || v < -margin || v > 1 + margin) {
    return null;
  }

  const col = Math.min(Math.max(Math.round(u * (gridWidth - 1)), 0), gridWidth - 1);
  const row = Math.min(Math.max(Math.round(v * (gridHeight - 1)), 0), gridHeight - 1);

  return { col, row };
}

export function gridCellToLatLng(
  corners:LatLng[],
  col:number,
  row:number,
  gridWidth:number,
  gridHeight:number,
):LatLng {
  const u = gridWidth <= 1 ? 0 : col / (gridWidth - 1);
  const v = gridHeight <= 1 ? 0 : row / (gridHeight - 1);
  return bilinearForward(corners, u, v);
}

export function haversineDistanceKm(a:LatLng, b:LatLng):number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = (Math.sin(dLat / 2) ** 2) + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(dLng / 2) ** 2));
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function bearingDeg(from:LatLng, to:LatLng):number {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = (Math.cos(lat1) * Math.sin(lat2)) - (Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng));

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function destinationPoint(from:LatLng, bearing:number, distanceKm:number):LatLng {
  const bearingRad = toRad(bearing);
  const lat1 = toRad(from.lat);
  const lng1 = toRad(from.lng);
  const angularDist = distanceKm / EARTH_RADIUS_KM;

  const lat2 = Math.asin(
    (Math.sin(lat1) * Math.cos(angularDist)) + (Math.cos(lat1) * Math.sin(angularDist) * Math.cos(bearingRad)),
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angularDist) * Math.cos(lat1),
    Math.cos(angularDist) - (Math.sin(lat1) * Math.sin(lat2)),
  );

  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 };
}