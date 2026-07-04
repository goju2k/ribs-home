// KEEP IN SYNC WITH app/ribs-app/src/app/rain-assist/util/radar-legend.ts
// 원본: app/ribs-app/src/app/rain/components/map-layer/RainRadarLayer.tsx 의 `Legends`
export const RadarLegend: [[number, number, number], number][] = [
  [[ 51, 51, 51 ], 110 ],
  [[ 0, 3, 144 ], 90 ],
  [[ 76, 78, 177 ], 80 ],
  [[ 179, 180, 222 ], 70 ],
  [[ 147, 0, 228 ], 60 ],
  [[ 179, 41, 255 ], 50 ],
  [[ 201, 105, 255 ], 40 ],
  [[ 224, 169, 255 ], 30 ],
  [[ 180, 0, 0 ], 25 ],
  [[ 210, 0, 0 ], 20 ],
  [[ 255, 50, 0 ], 15 ],
  [[ 255, 102, 0 ], 10 ],
  [[ 204, 170, 0 ], 9 ],
  [[ 224, 185, 0 ], 8 ],
  [[ 249, 205, 0 ], 7 ],
  [[ 255, 220, 31 ], 6 ],
  [[ 255, 225, 0 ], 5 ],
  [[ 0, 90, 0 ], 4 ],
  [[ 0, 140, 0 ], 3 ],
  [[ 0, 190, 0 ], 2 ],
  [[ 0, 255, 0 ], 1 ],
  [[ 0, 51, 245 ], 0.5 ],
  [[ 0, 155, 245 ], 0.1 ],
  [[ 0, 200, 255 ], 0 ],
];

export const NO_DATA = 255;

// mm/h > 0 인 마지막 범례 인덱스. 이 값 이하(더 진한 강수)를 강수로 간주.
// KEEP IN SYNC WITH app/ribs-app/src/app/rain-assist/util/radar-legend.ts 의 RAIN_THRESHOLD_INDEX
export const RAIN_THRESHOLD_INDEX = RadarLegend.findIndex(([ , mmh ]) => mmh === 0) - 1;

// alpha 채널이 없거나(투명) 임계값 미만이면 강수 데이터 없음으로 간주.
// PNG 압축/안티앨리어싱으로 픽셀이 범례 색과 정확히 일치하지 않는 경우가 많아 최근접 RGB 매칭을 사용.
export function classifyPixel(r:number, g:number, b:number, a:number, alphaThreshold = 10):number {

  if (a < alphaThreshold) {
    return NO_DATA;
  }

  let bestIndex = 0;
  let bestDist = Infinity;

  for (let i = 0; i < RadarLegend.length; i += 1) {
    const [[ lr, lg, lb ]] = RadarLegend[i];
    const dist = (r - lr) ** 2 + (g - lg) ** 2 + (b - lb) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }

  return bestIndex;
}