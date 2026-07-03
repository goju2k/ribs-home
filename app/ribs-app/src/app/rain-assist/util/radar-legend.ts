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