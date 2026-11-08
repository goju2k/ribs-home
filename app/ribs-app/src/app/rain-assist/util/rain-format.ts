// 웹뷰 상태 카드/하단 시트가 함께 쓰는 표시용 계산. 앱이 보낸 값을 사람이 읽는 말로만 바꾼다.

// 기상청 레이더 범례의 큰 단계와 같은 색(파랑 → 초록 → 노랑 → 주황 → 빨강 → 보라).
const INTENSITY_STEPS:[number, string][] = [
  [ 30, '#B57BE0' ],
  [ 20, '#E0484D' ],
  [ 10, '#F08A35' ],
  [ 5, '#E9C21C' ],
  [ 1, '#4DB86C' ],
  [ 0, '#5AB4EC' ],
];

export function intensityColor(mmh:number):string {
  return INTENSITY_STEPS.find(([ min ]) => mmh >= min)?.[1] ?? '#5AB4EC';
}

// 하단 범례 바: 위 색 단계와 같은 순서, 같은 경계.
export const LEGEND_STEPS:{ color:string; label:string; }[] = [ ...INTENSITY_STEPS ].reverse().map(([ min, color ]) => ({
  color,
  label: min === 0 ? '0.1' : String(min),
}));

// 이보다 느리면 "거의 멈춤" — 화살표를 그리지 않고, 방향·속도도 말하지 않는다. 앱은 이동을 못 잡으면
// 속도 0, 방향 0°(북쪽)를 보내는데, 그대로 그리면 시작점과 화살촉이 겹친 북쪽 화살표가 된다.
export const STATIONARY_SPEED_KMH = 3;

export function isStationary(speedKmh:number):boolean {
  return !(speedKmh >= STATIONARY_SPEED_KMH);
}

export function formatMmh(mmh:number):string {
  return mmh >= 10 ? String(Math.round(mmh)) : String(Math.round(mmh * 10) / 10);
}

const COMPASS_16 = [ '북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서' ];

// headingDeg는 비구름이 "가는" 방향 — 사람은 "어디서 오는지"로 말하므로 반대쪽 방위를 쓴다.
// withParticle=false면 "북서쪽"만(좁은 칸용).
export function comingFromText(headingDeg:number, withParticle = true):string {
  const from = (headingDeg + 180) % 360;
  return `${COMPASS_16[Math.round(from / 22.5) % 16]}쪽${withParticle ? '에서' : ''}`;
}

// 지금부터 minutes분 뒤의 벽시계 시각(KST, "18:32"). 기기 타임존과 무관하게 KST로 표기한다.
export function clockAfter(nowMs:number, minutes:number):string {
  const d = new Date(nowMs + (minutes * 60_000) + (9 * 60 * 60 * 1000));
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}