import { PNG } from 'pngjs';

import { classifyPixel } from './radar-legend';

export interface RadarGridResult {
  grid:Buffer;
  gridWidth:number;
  gridHeight:number;
  sourceWidth:number;
  sourceHeight:number;
  stride:number;
}

// 원본 PNG를 stride 간격으로 다운샘플링하며 각 셀을 범례 인덱스(0-23) 또는 255(no-data)로 분류
export function buildGrid(pngBuffer:Buffer, stride = 8):RadarGridResult {

  const png = PNG.sync.read(pngBuffer);
  const { width: sourceWidth, height: sourceHeight, data } = png;

  const gridWidth = Math.ceil(sourceWidth / stride);
  const gridHeight = Math.ceil(sourceHeight / stride);
  const grid = Buffer.alloc(gridWidth * gridHeight);

  for (let gy = 0; gy < gridHeight; gy += 1) {
    const y = Math.min(gy * stride, sourceHeight - 1);
    for (let gx = 0; gx < gridWidth; gx += 1) {
      const x = Math.min(gx * stride, sourceWidth - 1);
      const idx = ((sourceWidth * y) + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      grid[gy * gridWidth + gx] = classifyPixel(r, g, b, a);
    }
  }

  return { grid, gridWidth, gridHeight, sourceWidth, sourceHeight, stride };

}