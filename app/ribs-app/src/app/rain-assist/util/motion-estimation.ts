import { rleDecode } from './rle';

const NO_DATA_INDEX = 255;

export interface RadarGrid {
  data:Uint8Array;
  width:number;
  height:number;
}

// API가 내려주는 grid_data는 base64(RLE(grid)) 형태이므로 base64 디코드 후 RLE 복원까지 수행한다.
export function decodeGridBase64(base64:string, width:number, height:number):RadarGrid {
  const binary = atob(base64);
  const encoded = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    encoded[i] = binary.charCodeAt(i);
  }
  const data = rleDecode(encoded, width * height);
  return { data, width, height };
}

export interface MotionVectorResult {
  // "newer(y,x) ~= older(y+dRow, x+dCol)"가 성립하는 오프셋. 실제 이동 벡터는 부호가 반대.
  dCol:number;
  dRow:number;
  confidence:number;
}

interface EstimateOptions {
  older:RadarGrid;
  newer:RadarGrid;
  centerCol:number;
  centerRow:number;
  blockRadius?:number;
  searchRadius?:number;
}

// 사용자 위치 주변 (2*blockRadius+1) 정사각 블록에서, older 프레임을 (dRow,dCol)만큼 이동시켰을 때
// newer 프레임과 가장 잘 맞는 오프셋을 SAD(절대차합) 최소화로 탐색한다.
export function estimateLocalMotionVector(opts:EstimateOptions):MotionVectorResult | null {

  const { older, newer, centerCol, centerRow, blockRadius = 5, searchRadius = 5 } = opts;

  if (older.width !== newer.width || older.height !== newer.height) {
    return null;
  }

  const { width, height } = newer;

  let bestDCol = 0;
  let bestDRow = 0;
  let bestSad = Infinity;
  let bestValidCount = 0;

  for (let dRow = -searchRadius; dRow <= searchRadius; dRow += 1) {
    for (let dCol = -searchRadius; dCol <= searchRadius; dCol += 1) {

      let sad = 0;
      let validCount = 0;

      for (let by = -blockRadius; by <= blockRadius; by += 1) {
        for (let bx = -blockRadius; bx <= blockRadius; bx += 1) {

          const newerRow = centerRow + by;
          const newerCol = centerCol + bx;
          const olderRow = newerRow + dRow;
          const olderCol = newerCol + dCol;

          const inBounds = newerRow >= 0 && newerRow < height && newerCol >= 0 && newerCol < width
            && olderRow >= 0 && olderRow < height && olderCol >= 0 && olderCol < width;

          if (inBounds) {
            const newerValue = newer.data[(newerRow * width) + newerCol];
            const olderValue = older.data[(olderRow * width) + olderCol];

            if (newerValue !== NO_DATA_INDEX && olderValue !== NO_DATA_INDEX) {
              sad += Math.abs(newerValue - olderValue);
              validCount += 1;
            }
          }
        }
      }

      if (validCount > 0) {
        const normalizedSad = sad / validCount;
        if (normalizedSad < bestSad || (normalizedSad === bestSad && validCount > bestValidCount)) {
          bestSad = normalizedSad;
          bestDCol = dCol;
          bestDRow = dRow;
          bestValidCount = validCount;
        }
      }
    }
  }

  const blockCells = (2 * blockRadius + 1) ** 2;
  if (bestValidCount < blockCells * 0.2) {
    // 유효 강수 셀이 너무 적으면 이동벡터 신호가 부족한 것으로 판단
    return null;
  }

  return { dCol: bestDCol, dRow: bestDRow, confidence: bestValidCount / blockCells };
}