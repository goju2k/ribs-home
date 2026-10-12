// 시각에 따른 밤/노을 정도 (10월 후쿠오카 기준: 해 뜸 06:20경, 해 짐 17:50경)

const ramp = (v:number, a:number, b:number) => Math.min(1, Math.max(0, (v - a) / (b - a)));

export function daylight(minuteOfDay:number) {
  const m = minuteOfDay;
  const night = m < 12 * 60 ? 1 - ramp(m, 5 * 60 + 30, 6 * 60 + 50) : ramp(m, 17 * 60 + 20, 18 * 60 + 40);
  const sunset = Math.max(0, 1 - Math.abs(m - (17 * 60 + 50)) / 50) + Math.max(0, 1 - Math.abs(m - (6 * 60 + 10)) / 40) * 0.6;
  return { night, sunset: Math.min(1, sunset) };
}

function mix(a:[number, number, number], b:[number, number, number], k:number):[number, number, number] {
  return [ a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k ];
}

const SKY_DAY:[number, number, number] = [ 168, 220, 245 ];
const SKY_NIGHT:[number, number, number] = [ 22, 28, 62 ];
const SKY_SUNSET:[number, number, number] = [ 246, 178, 122 ];

export function skyColor(night:number, sunset:number) {
  const c = mix(mix(SKY_DAY, SKY_NIGHT, night), SKY_SUNSET, sunset * 0.55);
  return `rgb(${c.map(Math.round).join(',')})`;
}