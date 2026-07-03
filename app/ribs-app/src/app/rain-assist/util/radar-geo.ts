import { Position } from '@mint-ui/map';

// 원본: app/ribs-app/src/app/rain/components/map-layer/RainRadarLayer.tsx 의 4개 꼭짓점 좌표(pos)
// KEEP IN SYNC WITH app/ribs-app/src/app/api/rain-assist/radar-frames/route.ts 의 RADAR_CORNERS
export const RADAR_CORNERS:[number, number][] = [
  [ 30.8101038494, 121.3322516155 ],
  [ 40.1670385352, 120.609116658 ],
  [ 40.0701181652, 133.0225827684 ],
  [ 30.7283967663, 132.0821758282 ],
];

export function toPositions():Position[] {
  return RADAR_CORNERS.map(([ lat, lng ]) => new Position(lat, lng));
}