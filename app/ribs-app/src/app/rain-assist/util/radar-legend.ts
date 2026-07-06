// 원본: app/ribs-app/src/app/rain/components/map-layer/RainRadarLayer.tsx 의 `Legends`
// KEEP IN SYNC WITH app/my-bot-server-app/src/rain-radar/radar-legend.ts
export const Legends:[string, number][] = [
  [ 'rgb(51, 51, 51)', 110 ],
  [ 'rgb(0, 3, 144)', 90 ],
  [ 'rgb(76, 78, 177)', 80 ],
  [ 'rgb(179, 180, 222)', 70 ],
  [ 'rgb(147, 0, 228)', 60 ],
  [ 'rgb(179, 41, 255)', 50 ],
  [ 'rgb(201, 105, 255)', 40 ],
  [ 'rgb(224, 169, 255)', 30 ],
  [ 'rgb(180, 0, 0)', 25 ],
  [ 'rgb(210, 0, 0)', 20 ],
  [ 'rgb(255, 50, 0)', 15 ],
  [ 'rgb(255, 102, 0)', 10 ],
  [ 'rgb(204, 170, 0)', 9 ],
  [ 'rgb(224, 185, 0)', 8 ],
  [ 'rgb(249, 205, 0)', 7 ],
  [ 'rgb(255, 220, 31)', 6 ],
  [ 'rgb(255, 225, 0)', 5 ],
  [ 'rgb(0, 90, 0)', 4 ],
  [ 'rgb(0, 140, 0)', 3 ],
  [ 'rgb(0, 190, 0)', 2 ],
  [ 'rgb(0, 255, 0)', 1 ],
  [ 'rgb(0, 51, 245)', 0.5 ],
  [ 'rgb(0, 155, 245)', 0.1 ],
  [ 'rgb(0, 200, 255)', 0 ],
];

export const LegendsMap = new Map<string, number>(Legends);

export const NO_DATA_INDEX = 255;

// mm/h > 0 인 마지막 범례 인덱스. 이 값 이하(더 진한 강수)를 강수로 간주.
export const RAIN_THRESHOLD_INDEX = Legends.findIndex(([ , mmh ]) => mmh === 0) - 1;

// 'rgb(r,g,b)' 문자열을 매 픽셀마다 파싱하지 않도록 미리 튜플로 변환해둔다.
const LEGEND_RGB:[number, number, number][] = Legends.map(([ css ]) => {
  const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  return m ? [ Number(m[1]), Number(m[2]), Number(m[3]) ] : [ 0, 0, 0 ];
});

// 원본 PNG를 서버에서 미리 분류해 압축·전송하는 대신, 클라이언트가 디코드한 원본 픽셀에서
// 매번 직접 분류한다 — 서버측 인코드/디코드 왕복 과정에서 생기던 몇 픽셀 단위 불일치를 없애고
// 항상 원본과 동일한 소스에서 분류하기 위함. 로직은 서버
// (app/my-bot-server-app/src/rain-radar/radar-legend.ts)의 classifyPixel과 동일하게 유지.
export function classifyPixel(r:number, g:number, b:number, a:number, alphaThreshold = 10):number {

  if (a < alphaThreshold) {
    return NO_DATA_INDEX;
  }

  let bestIndex = 0;
  let bestDist = Infinity;

  for (let i = 0; i < LEGEND_RGB.length; i += 1) {
    const [ lr, lg, lb ] = LEGEND_RGB[i];
    const dist = ((r - lr) ** 2) + ((g - lg) ** 2) + ((b - lb) ** 2);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }

  return bestIndex;
}