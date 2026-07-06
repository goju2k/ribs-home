import { bearingDeg, destinationPoint, gridCellToLatLng, haversineDistanceKm, LatLng, latLngToGridCell } from './grid-projection';
import { estimateLocalMotionVector, poolGridMin, RadarGrid } from './motion-estimation';
import { NO_DATA_INDEX, RAIN_THRESHOLD_INDEX } from './radar-legend';

export interface RadarFrameInput {
  tm:string;
  grid:RadarGrid;
}

export type RainForecastResult =
  | { status:'no-signal'; }
  | { status:'no-motion'; }
  | { status:'raining'; }
  | { status:'result'; etaMinutes:number; bearingDeg:number; speedKmh:number; distanceKm:number; };

// yyyyMMddHHmm -> 분 단위 타임스탬프(경과시간 계산용). 두 tm 모두 같은 방식으로 파싱해
// 차이만 쓰므로 브라우저 타임존과 무관하게 항상 정확하다(파싱 자체의 절대값은 안 씀).
function parseTmMinutes(tm:string):number {
  const yyyy = Number(tm.slice(0, 4));
  const month = Number(tm.slice(4, 6));
  const dd = Number(tm.slice(6, 8));
  const hh = Number(tm.slice(8, 10));
  const mi = Number(tm.slice(10, 12));
  return new Date(yyyy, month - 1, dd, hh, mi).getTime() / 60000;
}

function angularDiffDeg(a:number, b:number):number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// yyyyMMddHHmm(KST 벽시계) -> UTC epoch ms. parseTmMinutes와 달리 브라우저 로컬 타임존과
// 무관하게 "실제 지금(Date.now())"과 직접 비교 가능한 절대 시각을 돌려준다(KST는 DST가 없어
// 고정 오프셋으로 충분, 타임존 DB 불필요).
function parseKstTmToEpochMs(tm:string):number {
  const yyyy = Number(tm.slice(0, 4));
  const month = Number(tm.slice(4, 6));
  const dd = Number(tm.slice(6, 8));
  const hh = Number(tm.slice(8, 10));
  const mi = Number(tm.slice(10, 12));
  return Date.UTC(yyyy, month - 1, dd, hh, mi) - KST_OFFSET_MS;
}

// corners+그리드 크기로부터 "셀당 실제 km"를 추정한다(그리드 중앙 행에서 좌우 끝 사이 거리 / 폭).
// stride가 나중에 또 바뀌어도 이 값 하나로 자동으로 맞는다.
function estimateKmPerCell(corners:LatLng[], gridWidth:number, gridHeight:number):number {
  const midRow = Math.floor(gridHeight / 2);
  const left = gridCellToLatLng(corners, 0, midRow, gridWidth, gridHeight);
  const right = gridCellToLatLng(corners, gridWidth - 1, midRow, gridWidth, gridHeight);
  return haversineDistanceKm(left, right) / Math.max(gridWidth - 1, 1);
}

interface GridCell {
  row:number; col:number; 
}

// 사용자 위치 주변(그리드 셀 공간, 사각형)에서 가장 가까운 강수 셀을 찾는다.
// 뉴턴-랩슨 역변환 없이 정수 셀 좌표만으로 스캔하므로, 기존의 반복 레이 마칭보다 빠르고
// 특정 방향으로만 찾지 않아 실제로 가장 가까운 강수를 놓치지 않는다.
function findNearestRainCell(grid:RadarGrid, userCell:GridCell, maxRadiusCells:number):GridCell | null {

  const minRow = Math.max(0, userCell.row - maxRadiusCells);
  const maxRow = Math.min(grid.height - 1, userCell.row + maxRadiusCells);
  const minCol = Math.max(0, userCell.col - maxRadiusCells);
  const maxCol = Math.min(grid.width - 1, userCell.col + maxRadiusCells);

  let best:GridCell | null = null;
  let bestDistSq = Infinity;

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {

      const value = grid.data[(row * grid.width) + col];

      if (value !== NO_DATA_INDEX && value <= RAIN_THRESHOLD_INDEX) {
        const dRow = row - userCell.row;
        const dCol = col - userCell.col;
        const distSq = (dRow * dRow) + (dCol * dCol);
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          best = { row, col };
        }
      }
    }
  }

  return best;
}

// 사용자와 가장 가까운 강수 셀은 대개 강수 구역의 가장자리(가장 옅은 경계)라서, 그 지점을
// 그대로 이동벡터 블록 중심으로 쓰면 경계 바로 바깥의 no-data와 섞여 SAD 매칭이 불안정해진다.
// 그 주변에서 가장 강한(=index가 가장 작은) 셀을 찾아 이동벡터 추적 앵커로 삼는다
// (거리/ETA 계산에는 여전히 원래의 가장 가까운 지점을 쓴다 — 정밀도에 영향 없음).
function findStrongestNearby(grid:RadarGrid, center:GridCell, radiusCells:number):GridCell {

  const minRow = Math.max(0, center.row - radiusCells);
  const maxRow = Math.min(grid.height - 1, center.row + radiusCells);
  const minCol = Math.max(0, center.col - radiusCells);
  const maxCol = Math.min(grid.width - 1, center.col + radiusCells);

  let best = center;
  let bestValue = grid.data[(center.row * grid.width) + center.col];

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const value = grid.data[(row * grid.width) + col];
      if (value !== NO_DATA_INDEX && value < bestValue) {
        bestValue = value;
        best = { row, col };
      }
    }
  }

  return best;
}

const RAINING_NOW_KM = 2;
const MAX_SEARCH_KM = 100;
const TARGET_WORKING_KM_PER_CELL = 3;
const BLOCK_RADIUS_KM = 8;
const SEARCH_RADIUS_KM = 30;
const APPROACH_CONE_DEG = 60;
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

  const userCell = latLngToGridCell(corners, userPosition, newest.grid.width, newest.grid.height);
  if (!userCell) {
    return { status: 'no-signal' };
  }

  const kmPerCell = estimateKmPerCell(corners, newest.grid.width, newest.grid.height);

  // 0. 접근 예보(이동벡터/각도) 판정은 "아직 안 온 비"를 전제로 한다. 이미 내 위치 자체가
  //    비 구역 안이면 그 판정(각도 불일치, 정지/느린 이동 등)에 걸려 오히려 "감지된 강수 없음"으로
  //    오탐할 수 있으므로, 접근 예보보다 먼저 "지금 내 위치에 비가 오는 중인지"부터 확인한다.
  const rainingNowRadiusCells = Math.max(1, Math.round(RAINING_NOW_KM / kmPerCell));
  if (findNearestRainCell(newest.grid, userCell, rainingNowRadiusCells)) {
    return { status: 'raining' };
  }

  const maxRadiusCells = Math.max(1, Math.round(MAX_SEARCH_KM / kmPerCell));

  // 1. 내 위치가 아니라, 내 주변에서 가장 가까운 강수 셀을 먼저 찾는다.
  const stormCell = findNearestRainCell(newest.grid, userCell, maxRadiusCells);
  if (!stormCell) {
    return { status: 'no-signal' };
  }

  const stormLatLng = gridCellToLatLng(corners, stormCell.col, stormCell.row, newest.grid.width, newest.grid.height);

  // 2. 그 강수 셀을 중심으로(내 위치가 아니라) 이동벡터를 계산 — 실제 강수 텍스처가 있는 곳이라
  //    신호가 훨씬 안정적이다. SAD 매칭은 원본 해상도가 아니라 축소한 작업용 그리드에서 수행.
  const poolFactor = Math.max(1, Math.round(TARGET_WORKING_KM_PER_CELL / kmPerCell));
  const workingKmPerCell = kmPerCell * poolFactor;
  const pooledOlder = poolGridMin(oldest.grid, poolFactor);
  const pooledNewer = poolGridMin(newest.grid, poolFactor);

  const blockRadius = Math.max(1, Math.round(BLOCK_RADIUS_KM / workingKmPerCell));
  const searchRadius = Math.max(1, Math.round(SEARCH_RADIUS_KM / workingKmPerCell));

  // 이동벡터 추적은 가장자리(stormCell)가 아니라 그 주변에서 가장 강한 셀을 앵커로 삼는다
  const anchorSearchRadiusCells = Math.max(1, Math.round(BLOCK_RADIUS_KM / kmPerCell));
  const anchorCell = findStrongestNearby(newest.grid, stormCell, anchorSearchRadiusCells);
  const pooledCol = Math.min(Math.floor(anchorCell.col / poolFactor), pooledNewer.width - 1);
  const pooledRow = Math.min(Math.floor(anchorCell.row / poolFactor), pooledNewer.height - 1);

  const motion = estimateLocalMotionVector({
    older: pooledOlder,
    newer: pooledNewer,
    centerCol: pooledCol,
    centerRow: pooledRow,
    blockRadius,
    searchRadius,
  });

  if (!motion || (motion.dCol === 0 && motion.dRow === 0)) {
    return { status: 'no-motion' };
  }

  const elapsedMinutes = parseTmMinutes(newest.tm) - parseTmMinutes(oldest.tm);
  if (elapsedMinutes <= 0) {
    return { status: 'no-motion' };
  }

  // 실제 이동 벡터(과거->현재)는 estimateLocalMotionVector가 찾은 offset의 반대 부호.
  // 풀링 그리드 셀 단위 변위를 원본 그리드 셀 단위로 환산해 원본 해상도로 좌표를 구한다.
  const movementRow = -motion.dRow * poolFactor;
  const movementCol = -motion.dCol * poolFactor;

  const movedLatLng = gridCellToLatLng(
    corners,
    stormCell.col + movementCol,
    stormCell.row + movementRow,
    newest.grid.width,
    newest.grid.height,
  );

  const distanceMovedKm = haversineDistanceKm(stormLatLng, movedLatLng);
  const speedKmh = (distanceMovedKm / elapsedMinutes) * 60;

  if (speedKmh < MIN_SPEED_KMH) {
    return { status: 'no-motion' };
  }

  // 3. 강수 셀의 이동 방향이 "강수 셀 -> 나" 방향과 대략 일치하는지 확인해 오탐(멀어지는 비를
  //    "온다"고 알리는 것)을 막는다.
  const movingBearing = bearingDeg(stormLatLng, movedLatLng);
  const stormToUserBearing = bearingDeg(stormLatLng, userPosition);

  if (angularDiffDeg(movingBearing, stormToUserBearing) > APPROACH_CONE_DEG) {
    return { status: 'no-motion' };
  }

  // 4. stormLatLng/distanceKm은 "최신 프레임 시각(newest.tm)" 기준 강수 위치다. 이 프레임이
  //    실제 지금(사용자가 예보를 보는 시각)보다 몇 분~몇십 분 뒤처져 있을 수 있으므로(KMA 발행
  //    지연·크론 주기 등), 프레임 시각과 지금 사이 경과 시간만큼 이동벡터 방향/속도로 한 번 더
  //    전진시킨 위치를 "현재 추정 위치"로 삼아 거리/방위/ETA를 계산한다. 이걸 안 하면 데이터가
  //    뒤처질수록(간격이 클수록) ETA가 실제보다 과대평가된다(이미 더 가까워졌는데 옛 위치 기준
  //    거리로 계산하기 때문).
  const dataAgeMinutes = Math.max(0, (Date.now() - parseKstTmToEpochMs(newest.tm)) / 60000);
  const advanceKm = speedKmh * (dataAgeMinutes / 60);
  const stormLatLngNow = advanceKm > 0 ? destinationPoint(stormLatLng, movingBearing, advanceKm) : stormLatLng;
  const distanceKmNow = haversineDistanceKm(stormLatLngNow, userPosition);

  return {
    status: 'result',
    etaMinutes: (distanceKmNow / speedKmh) * 60,
    // 화살표가 다가오는 비 쪽(나 -> 강수 셀의 "지금 추정 위치" 방향)을 가리키도록 함
    bearingDeg: bearingDeg(userPosition, stormLatLngNow),
    speedKmh,
    distanceKm: distanceKmNow,
  };

}