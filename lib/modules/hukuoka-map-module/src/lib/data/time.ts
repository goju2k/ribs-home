// 타임라인 시각은 "2026-10-14 00:00 (한국/일본 시각, 둘 다 UTC+9)부터 흐른 분"으로 통일한다.
const TRIP_EPOCH_UTC_MS = Date.UTC(2026, 9, 13, 15, 0); // 2026-10-14 00:00 UTC+9
const FIRST_DAY = 14;
const WEEKDAYS = [ '일', '월', '화', '수', '목', '금', '토' ];

/** '15 10:30' → 분 */
export function parseTripTime(text:string):number {
  const [ day, hm ] = text.split(' ');
  const [ h, m ] = hm.split(':').map(Number);
  return (Number(day) - FIRST_DAY) * 1440 + h * 60 + m;
}

export function tripTimeToParts(t:number) {
  const total = Math.floor(t);
  const dayIndex = Math.floor(total / 1440);
  const minuteOfDay = ((total % 1440) + 1440) % 1440;
  const day = FIRST_DAY + dayIndex;
  const weekday = WEEKDAYS[new Date(Date.UTC(2026, 9, day)).getUTCDay()];
  return { day, weekday, hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60, minuteOfDay };
}

export function formatClock(t:number) {
  const { hour, minute } = tripTimeToParts(t);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatDayLabel(t:number) {
  const { day, weekday } = tripTimeToParts(t);
  return `10월 ${day}일 (${weekday})`;
}

export function nowTripTime(nowMs = Date.now()) {
  return (nowMs - TRIP_EPOCH_UTC_MS) / 60000;
}