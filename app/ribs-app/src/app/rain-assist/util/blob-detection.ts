import { RadarGrid } from './motion-estimation';
import { NO_DATA_INDEX } from './radar-legend';

export interface RainBlob {
  cells:{ row:number; col:number; }[];
  centroidRow:number;
  centroidCol:number;
  peakIndex:number;
}

const NEIGHBOR_OFFSETS:[number, number][] = [
  [ -1, -1 ], [ -1, 0 ], [ -1, 1 ],
  [ 0, -1 ], [ 0, 1 ],
  [ 1, -1 ], [ 1, 0 ], [ 1, 1 ],
];

// 8방향 연결 BFS로 강수 셀(value !== NO_DATA_INDEX && value <= threshold) 덩어리를 그룹화
export function detectBlobs(grid:RadarGrid, threshold:number):RainBlob[] {

  const { data, width, height } = grid;
  const visited = new Uint8Array(width * height);
  const blobs:RainBlob[] = [];

  const isRain = (row:number, col:number):boolean => {
    if (row < 0 || row >= height || col < 0 || col >= width) {
      return false;
    }
    const value = data[(row * width) + col];
    return value !== NO_DATA_INDEX && value <= threshold;
  };

  for (let startRow = 0; startRow < height; startRow += 1) {
    for (let startCol = 0; startCol < width; startCol += 1) {

      const startIdx = (startRow * width) + startCol;

      if (!visited[startIdx] && isRain(startRow, startCol)) {

        visited[startIdx] = 1;

        const cells:{ row:number; col:number; }[] = [{ row: startRow, col: startCol }];
        const queue:{ row:number; col:number; }[] = [{ row: startRow, col: startCol }];
        let queueHead = 0;
        let peakIndex = data[startIdx];
        let sumRow = startRow;
        let sumCol = startCol;

        while (queueHead < queue.length) {

          const current = queue[queueHead];
          queueHead += 1;

          for (let n = 0; n < NEIGHBOR_OFFSETS.length; n += 1) {

            const [ dRow, dCol ] = NEIGHBOR_OFFSETS[n];
            const nRow = current.row + dRow;
            const nCol = current.col + dCol;

            if (isRain(nRow, nCol)) {
              const nIdx = (nRow * width) + nCol;
              if (!visited[nIdx]) {
                visited[nIdx] = 1;
                cells.push({ row: nRow, col: nCol });
                queue.push({ row: nRow, col: nCol });
                sumRow += nRow;
                sumCol += nCol;

                const value = data[nIdx];
                if (value < peakIndex) {
                  peakIndex = value;
                }
              }
            }
          }
        }

        blobs.push({
          cells,
          centroidRow: sumRow / cells.length,
          centroidCol: sumCol / cells.length,
          peakIndex,
        });
      }
    }
  }

  return blobs;
}

// 8방향(N,NE,E,SE,S,SW,W,NW) 시계방향 오프셋
const DIRS:[number, number][] = [
  [ -1, 0 ], [ -1, 1 ], [ 0, 1 ], [ 1, 1 ], [ 1, 0 ], [ 1, -1 ], [ 0, -1 ], [ -1, -1 ],
];

// Moore-Neighbor Tracing으로 블롭의 외곽 셀 좌표를 순서대로 추출한다.
// 시작 지점 반환 시 종료하는 단순화된 정지조건을 사용 — 확인용 시각화 목적상 충분하며,
// 매우 얇은(1셀 폭) 돌출부가 있는 병적인 모양에서는 약간의 오차가 있을 수 있다.
export function traceBlobOutline(grid:RadarGrid, blob:RainBlob):{ row:number; col:number; }[] {

  if (blob.cells.length < 3) {
    return blob.cells.slice();
  }

  const inBlob = new Set(blob.cells.map((c) => `${c.row}:${c.col}`));
  const isForeground = (row:number, col:number) => inBlob.has(`${row}:${col}`);

  let start = blob.cells[0];
  for (let i = 1; i < blob.cells.length; i += 1) {
    const c = blob.cells[i];
    if (c.row < start.row || (c.row === start.row && c.col < start.col)) {
      start = c;
    }
  }

  let current = start;
  let backtrackDir = 6; // West — raster-scan 특성상 시작점의 서쪽은 배경

  const boundary:{ row:number; col:number; }[] = [ current ];
  const maxSteps = (blob.cells.length * 8) + 8;

  for (let step = 0; step < maxSteps; step += 1) {

    let found:{ row:number; col:number; } | null = null;
    let foundDir = -1;

    for (let k = 1; k <= 8 && !found; k += 1) {
      const dirIdx = (backtrackDir + k) % 8;
      const [ dRow, dCol ] = DIRS[dirIdx];
      const nRow = current.row + dRow;
      const nCol = current.col + dCol;
      if (isForeground(nRow, nCol)) {
        found = { row: nRow, col: nCol };
        foundDir = dirIdx;
      }
    }

    if (!found) {
      break;
    }

    backtrackDir = (foundDir + 4) % 8;
    current = found;

    if (current.row === start.row && current.col === start.col) {
      break;
    }

    boundary.push(current);
  }

  return boundary;
}