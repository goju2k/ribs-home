import { PLACE_BY_ID } from '../data/places';
import { MoveMode, SCHEDULE, Segment } from '../data/schedule';
import { tripTimeToParts } from '../data/time';
import { PLAN_EVENTS, PlanEvent } from '../data/trip-plan';
import { Point } from '../geo/projection';
import { pointAlong, World } from '../geo/world';

export interface TravelerState {
  pos: Point;
  segmentIndex: number;
  segment: Segment;
  mode: MoveMode | 'stay';
  /** 진행 방향: 1 오른쪽, -1 왼쪽 */
  facing: 1 | -1;
  /** 이동 구간 진행률 0~1 */
  progress: number;
  /** 머무는 장소 (이동 중이면 목적지) */
  placeId: string;
  sleeping: boolean;
}

export function findSegmentIndex(t:number, schedule:Segment[] = SCHEDULE) {
  if (t <= schedule[0].start) return 0;
  let lo = 0;
  let hi = schedule.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (schedule[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** 숙소에서 밤 11시~아침 7시 사이면 자는 중 */
export function isSleeping(segment:Segment, t:number) {
  if (segment.kind !== 'stay' || segment.placeId !== 'hotel') return false;
  const { minuteOfDay } = tripTimeToParts(t);
  return minuteOfDay >= 23 * 60 || minuteOfDay < 7 * 60;
}

let lastFacing:1 | -1 = 1;

export function getTravelerState(t:number, world:World, schedule:Segment[] = SCHEDULE):TravelerState {
  const segmentIndex = findSegmentIndex(t, schedule);
  const segment = schedule[segmentIndex];

  if (segment.kind === 'stay') {
    return {
      pos: world.placePos[segment.placeId],
      segmentIndex,
      segment,
      mode: 'stay',
      facing: lastFacing,
      progress: 0,
      placeId: segment.placeId,
      sleeping: isSleeping(segment, t),
    };
  }

  const progress = Math.min(Math.max((t - segment.start) / (segment.end - segment.start), 0), 1);
  const move = world.moves[segmentIndex];
  const { point, dx } = move ? pointAlong(move.path, progress) : { point: world.placePos[segment.to], dx: 0 };
  if (dx > 0.01) lastFacing = 1;
  else if (dx < -0.01) lastFacing = -1;
  return { pos: point, segmentIndex, segment, mode: segment.mode, facing: lastFacing, progress, placeId: segment.to, sleeping: false };
}

export function findPlanEvents(t:number):{ current: PlanEvent | null; next: PlanEvent | null; } {
  const nextIndex = PLAN_EVENTS.findIndex((e) => e.t > t);
  const end = nextIndex < 0 ? PLAN_EVENTS.length : nextIndex;
  return { current: PLAN_EVENTS[end - 1] ?? null, next: nextIndex < 0 ? null : PLAN_EVENTS[nextIndex] };
}

const MODE_TEXT:Record<MoveMode, string> = {
  walk: '걸어서 이동 중',
  taxi: '택시로 이동 중',
  train: '전철로 이동 중',
  bus: '버스로 이동 중',
  plane: '비행 중',
};

export function describeActivity(state:TravelerState) {
  const { segment } = state;
  if (segment.kind === 'move') {
    const how = segment.tour ? '투어 버스로 이동 중' : MODE_TEXT[segment.mode];
    return `${how} · ${PLACE_BY_ID[segment.from].name} → ${PLACE_BY_ID[segment.to].name}`;
  }
  if (state.sleeping) return '숙소에서 쿨쿨 자는 중';
  return `${PLACE_BY_ID[segment.placeId].name}에 머무는 중${segment.tour ? ' · 투어 버스 대기' : ''}`;
}