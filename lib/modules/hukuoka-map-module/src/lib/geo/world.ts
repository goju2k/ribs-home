import { buildClusters, Cluster } from './clusters';
import { haversineKm, Point, project, projectPlace } from './projection';

import { PLACE_BY_ID, PLACES } from '../data/places';
import { ROUTES } from '../data/routes';
import { MoveSegment, SCHEDULE, Segment } from '../data/schedule';

export interface Path {
  points: Point[];
  /** 각 점까지의 누적 길이(도트) */
  cumulative: number[];
  length: number;
}

export interface WorldMove {
  segment: MoveSegment;
  path: Path;
  /** 서로 다른 구역 사이 이동이면 실제 거리(km) — 생략 구간 표기용 */
  gapKm?: number;
}

export interface World {
  placePos: Record<string, Point>;
  clusters: Cluster[];
  clusterOfPlace: Record<string, string>;
  /** SCHEDULE과 같은 순서, 머무름 구간은 null */
  moves: (WorldMove | null)[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number; };
}

export function makePath(points:Point[]):Path {
  const clean = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 0.01);
  const cumulative = [ 0 ];
  for (let i = 1; i < clean.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(clean[i].x - clean[i - 1].x, clean[i].y - clean[i - 1].y));
  }
  return { points: clean, cumulative, length: cumulative[cumulative.length - 1] };
}

export function pointAlong(path:Path, ratio:number):{ point: Point; dx: number; } {
  const { points, cumulative, length } = path;
  if (points.length === 1 || length === 0) return { point: points[0], dx: 0 };
  const target = Math.min(Math.max(ratio, 0), 1) * length;
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < target) i++;
  const a = points[i - 1];
  const b = points[i];
  const span = cumulative[i] - cumulative[i - 1] || 1;
  const k = (target - cumulative[i - 1]) / span;
  return { point: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, dx: b.x - a.x };
}

function flightArc(a:Point, b:Point):Point[] {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  // 진행 방향의 수직 방향 중 화면 위쪽으로 부푸는 쪽
  let nx = -(b.y - a.y) / len;
  let ny = (b.x - a.x) / len;
  if (ny > 0) {
    nx = -nx; ny = -ny; 
  }
  const control = { x: mid.x + nx * len * 0.22, y: mid.y + ny * len * 0.22 };
  const pts:Point[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push({
      x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * control.x + t ** 2 * b.x,
      y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * control.y + t ** 2 * b.y,
    });
  }
  return pts;
}

function movePoints(seg:MoveSegment, placePos:Record<string, Point>):Point[] {
  const a = placePos[seg.from];
  const b = placePos[seg.to];
  if (seg.mode === 'plane') return flightArc(a, b);
  if (seg.route) return [ a, ...ROUTES[seg.route].map(([ lat, lng ]) => project(lat, lng)), b ];
  // 시내 이동은 바둑판 길을 걷는 느낌으로 한 번 꺾어서
  const corner = Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  return [ a, corner, b ];
}

export function buildWorld(schedule:Segment[] = SCHEDULE):World {
  const placePos:Record<string, Point> = Object.fromEntries(PLACES.map((p) => [ p.id, projectPlace(p) ]));
  const clusters = buildClusters(PLACES.map((p) => ({ id: p.id, pos: placePos[p.id], korea: p.korea })));
  const clusterOfPlace:Record<string, string> = {};
  clusters.forEach((c) => c.places.forEach((p) => (clusterOfPlace[p.id] = c.id)));

  const moves = schedule.map((seg) => {
    if (seg.kind !== 'move') return null;
    const path = makePath(movePoints(seg, placePos));
    const from = PLACE_BY_ID[seg.from];
    const to = PLACE_BY_ID[seg.to];
    const gapKm = clusterOfPlace[seg.from] !== clusterOfPlace[seg.to] ? haversineKm(from.lat, from.lng, to.lat, to.lng) : undefined;
    return { segment: seg, path, gapKm };
  });

  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  clusters.forEach((c) => c.places.forEach(({ pos }) => {
    bounds.minX = Math.min(bounds.minX, pos.x - c.radius);
    bounds.minY = Math.min(bounds.minY, pos.y - c.radius);
    bounds.maxX = Math.max(bounds.maxX, pos.x + c.radius);
    bounds.maxY = Math.max(bounds.maxY, pos.y + c.radius);
  }));

  return { placePos, clusters, clusterOfPlace, moves, bounds };
}