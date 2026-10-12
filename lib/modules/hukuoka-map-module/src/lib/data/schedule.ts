import { parseTripTime } from './time';

export type MoveMode = 'walk' | 'taxi' | 'train' | 'bus' | 'plane';

export interface StaySegment {
  kind: 'stay';
  start: number;
  end: number;
  placeId: string;
}

export interface MoveSegment {
  kind: 'move';
  start: number;
  end: number;
  from: string;
  to: string;
  mode: MoveMode;
  /** ROUTES 키 — 없으면 시내 이동(꺾인 직선) */
  route?: string;
}

export type Segment = StaySegment | MoveSegment;

const S = (start:string, end:string, placeId:string):StaySegment => ({ kind: 'stay', start: parseTripTime(start), end: parseTripTime(end), placeId });
const M = (start:string, end:string, from:string, to:string, mode:MoveMode, route?:string):MoveSegment => ({ kind: 'move', start: parseTripTime(start), end: parseTripTime(end), from, to, mode, route });

// 지도 재생용 정규화 구간표. 원칙: 이동은 다음 일정 시각에 도착하도록, "A > B"는 적힌 시각에 출발,
// "(N분)"은 머무는 시간. 일정 원문에 없는 이동 수단/소요 시간은 추정값이다.
export const SCHEDULE:Segment[] = [
  // 14일
  S('14 16:00', '14 16:25', 'icn'),
  M('14 16:25', '14 17:40', 'icn', 'fuk', 'plane'),
  M('14 17:40', '14 18:00', 'fuk', 'hotel', 'taxi'),
  S('14 18:00', '14 19:20', 'hotel'),
  M('14 19:20', '14 19:30', 'hotel', 'kirby', 'walk'),
  S('14 19:30', '14 21:00', 'kirby'),
  M('14 21:00', '14 21:10', 'kirby', 'hotel', 'walk'),
  S('14 21:10', '15 08:45', 'hotel'),

  // 15일
  M('15 08:45', '15 09:00', 'hotel', 'hakata', 'walk'),
  M('15 09:00', '15 09:20', 'hakata', 'jrFutsukaichi', 'train', 'jrKagoshima'),
  S('15 09:20', '15 10:10', 'jrFutsukaichi'),
  M('15 10:10', '15 10:30', 'jrFutsukaichi', 'dazaifu', 'bus', 'futsukaichiDazaifu'),
  S('15 10:30', '15 11:45', 'dazaifu'),
  M('15 11:45', '15 12:00', 'dazaifu', 'ryuguujo', 'walk'),
  S('15 12:00', '15 13:40', 'ryuguujo'),
  M('15 13:40', '15 14:00', 'ryuguujo', 'nishiFutsukaichi', 'train', 'dazaifuLine'),
  M('15 14:00', '15 14:20', 'nishiFutsukaichi', 'tenjin', 'train', 'nishitetsu'),
  S('15 14:20', '15 15:55', 'tenjin'),
  M('15 15:55', '15 16:00', 'tenjin', 'biccamera', 'walk'),
  S('15 16:00', '15 16:40', 'biccamera'),
  M('15 16:40', '15 17:00', 'biccamera', 'hotel', 'walk'),
  S('15 17:00', '15 17:45', 'hotel'),
  M('15 17:45', '15 18:00', 'hotel', 'west', 'walk'),
  S('15 18:00', '15 19:55', 'west'),
  M('15 19:55', '15 20:00', 'west', 'yatai', 'walk'),
  S('15 20:00', '15 21:40', 'yatai'),
  M('15 21:40', '15 22:00', 'yatai', 'hotel', 'walk'),
  S('15 22:00', '16 07:15', 'hotel'),

  // 16일 (버스 투어)
  M('16 07:15', '16 07:30', 'hotel', 'lawson', 'walk'),
  S('16 07:30', '16 07:50', 'lawson'),
  M('16 07:50', '16 09:00', 'lawson', 'kusu', 'bus', 'expHakataKusu'),
  S('16 09:00', '16 09:10', 'kusu'),
  M('16 09:10', '16 09:40', 'kusu', 'yufuin', 'bus', 'expKusuYufuin'),
  S('16 09:40', '16 13:00', 'yufuin'),
  M('16 13:00', '16 13:10', 'yufuin', 'bungomori', 'bus', 'yufuinBungomori'),
  S('16 13:10', '16 13:40', 'bungomori'),
  M('16 13:40', '16 15:10', 'bungomori', 'ukihaTown', 'bus', 'bungomoriUkiha'),
  S('16 15:10', '16 16:10', 'ukihaTown'),
  M('16 16:10', '16 16:20', 'ukihaTown', 'ukihaInari', 'bus', 'ukihaTownInari'),
  S('16 16:20', '16 16:50', 'ukihaInari'),
  M('16 16:50', '16 18:00', 'ukihaInari', 'hakata', 'bus', 'ukihaHakata'),
  S('16 18:00', '16 18:15', 'hakata'),
  M('16 18:15', '16 18:30', 'hakata', 'sushi', 'walk'),
  S('16 18:30', '16 19:20', 'sushi'),
  M('16 19:20', '16 19:30', 'sushi', 'yodobashi', 'walk'),
  S('16 19:30', '16 20:45', 'yodobashi'),
  M('16 20:45', '16 21:00', 'yodobashi', 'hotel', 'walk'),
  S('16 21:00', '17 10:20', 'hotel'),

  // 17일
  M('17 10:20', '17 10:30', 'hotel', 'canal', 'walk'),
  S('17 10:30', '17 11:55', 'canal'),
  M('17 11:55', '17 12:00', 'canal', 'ramen', 'walk'),
  S('17 12:00', '17 13:30', 'ramen'),
  M('17 13:30', '17 14:00', 'ramen', 'fuk', 'taxi'),
  S('17 14:00', '17 16:25', 'fuk'),
  M('17 16:25', '17 17:50', 'fuk', 'icn', 'plane'),
  S('17 17:50', '17 18:10', 'icn'),
];

export const TRIP_START = SCHEDULE[0].start;
export const TRIP_END = SCHEDULE[SCHEDULE.length - 1].end;