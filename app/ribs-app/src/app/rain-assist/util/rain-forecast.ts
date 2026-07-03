import { bearingDeg, destinationPoint, gridCellToLatLng, haversineDistanceKm, LatLng, latLngToGridCell } from './grid-projection';
import { estimateLocalMotionVector, RadarGrid } from './motion-estimation';
import { NO_DATA_INDEX, RAIN_THRESHOLD_INDEX } from './radar-legend';

export interface RadarFrameInput {
  tm:string;
  grid:RadarGrid;
}

export type RainForecastResult =
  | { status:'no-signal'; }
  | { status:'no-motion'; }
  | { status:'result'; etaMinutes:number; bearingDeg:number; speedKmh:number; distanceKm:number; };

// yyyyMMddHHmm -> 분 단위 타임스탬프(경과시간 계산용)
function parseTmMinutes(tm:string):number {
  const yyyy = Number(tm.slice(0, 4));
  const month = Number(tm.slice(4, 6));
  const dd = Number(tm.slice(6, 8));
  const hh = Number(tm.slice(8, 10));
  const mi = Number(tm.slice(10, 12));
  return new Date(yyyy, month - 1, dd, hh, mi).getTime() / 60000;
}

const MAX_SEARCH_KM = 100;
const STEP_KM = 1;
const MIN_SPEED_KMH = 0.5;

export function computeRainForecast(opts:{
  corners:LatLng[];
  frames:RadarFrameInput[];
  userPosition:LatLng;
}):RainForecastResult {

  const { corners, frames, userPosition } = opts;

  if (frames.length < 2) {
    return { status: 'no-signal' };
  }

  const oldest = frames[0];
  const newest = frames[frames.length - 1];

  const cell = latLngToGridCell(corners, userPosition, newest.grid.width, newest.grid.height);
  if (!cell) {
    return { status: 'no-signal' };
  }

  const motion = estimateLocalMotionVector({
    older: oldest.grid,
    newer: newest.grid,
    centerCol: cell.col,
    centerRow: cell.row,
  });

  if (!motion || (motion.dCol === 0 && motion.dRow === 0)) {
    return { status: 'no-motion' };
  }

  // 실제 이동 벡터(과거->현재)는 estimateLocalMotionVector가 찾은 offset의 반대 부호
  const movementRow = -motion.dRow;
  const movementCol = -motion.dCol;

  const elapsedMinutes = parseTmMinutes(newest.tm) - parseTmMinutes(oldest.tm);
  if (elapsedMinutes <= 0) {
    return { status: 'no-motion' };
  }

  const originLatLng = gridCellToLatLng(corners, cell.col, cell.row, newest.grid.width, newest.grid.height);
  const movedLatLng = gridCellToLatLng(
    corners,
    cell.col + movementCol,
    cell.row + movementRow,
    newest.grid.width,
    newest.grid.height,
  );

  const distanceMovedKm = haversineDistanceKm(originLatLng, movedLatLng);
  const speedKmh = (distanceMovedKm / elapsedMinutes) * 60;
  const movingBearing = bearingDeg(originLatLng, movedLatLng);

  if (speedKmh < MIN_SPEED_KMH) {
    return { status: 'no-motion' };
  }

  // 강수가 다가오는 상류 방향(스톰 이동 방향의 반대)으로 레이 마칭하며 가장 가까운 강수 셀 탐색
  const upwindBearing = (movingBearing + 180) % 360;

  for (let d = STEP_KM; d <= MAX_SEARCH_KM; d += STEP_KM) {

    const probePoint = destinationPoint(userPosition, upwindBearing, d);
    const probeCell = latLngToGridCell(corners, probePoint, newest.grid.width, newest.grid.height);

    if (probeCell) {
      const value = newest.grid.data[(probeCell.row * newest.grid.width) + probeCell.col];
      if (value !== NO_DATA_INDEX && value <= RAIN_THRESHOLD_INDEX) {
        return {
          status: 'result',
          etaMinutes: (d / speedKmh) * 60,
          bearingDeg: upwindBearing,
          speedKmh,
          distanceKm: d,
        };
      }
    }
  }

  return { status: 'no-motion' };

}