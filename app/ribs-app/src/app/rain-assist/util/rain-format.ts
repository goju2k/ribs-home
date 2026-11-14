// 웹뷰 상태 카드/하단 시트가 함께 쓰는 표시용 계산. 앱이 보낸 값을 사람이 읽는 말로만 바꾼다.

// 기상청 레이더 이미지(rdr_sfc_pty_img)의 실제 색. 큰 단계마다 첫 칸 색을 대표로 쓴다
// (0.1 하늘, 0.5 파랑, 1 초록, 5 노랑, 10 주황, 20 빨강, 30+ 보라). RainRadarLayer의 Legends와 같은 값.
const INTENSITY_STEPS:[number, [number, number, number]][] = [
  [ 30, [ 224, 169, 255 ]],
  [ 20, [ 210, 0, 0 ]],
  [ 10, [ 255, 102, 0 ]],
  [ 5, [ 255, 225, 0 ]],
  [ 1, [ 0, 255, 0 ]],
  [ 0.5, [ 0, 51, 245 ]],
  [ 0, [ 0, 155, 245 ]],
];

function rgb([ r, g, b ]:[number, number, number]):string {
  return `rgb(${r}, ${g}, ${b})`;
}

function overWhite([ r, g, b ]:[number, number, number], alpha:number):string {
  const mix = (c:number) => Math.round((c * alpha) + (255 * (1 - alpha)));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// 하단 시트 막대용: 레이더 원색(같은 색상 계열, 흰 시트에서 잘 보이게 진하게).
export function intensityColor(mmh:number):string {
  return rgb(INTENSITY_STEPS.find(([ min ]) => mmh >= min)?.[1] ?? INTENSITY_STEPS[INTENSITY_STEPS.length - 1][1]);
}

// 하단 범례 바: 지도에 겹쳐 보이는 색 그대로. 지도는 레이더 이미지를 투명도 슬라이더 값(MapControlState.opacity,
// 기본 0.4)으로 겹치므로, 범례도 원색을 같은 비율로 흰 바탕에 섞는다 — 0.5mm/h 파랑이 지도에선 연보라처럼 보이는 것도 이 때문.
export function legendSteps(opacity:number):{ color:string; label:string; }[] {
  return [ ...INTENSITY_STEPS ].reverse().map(([ min, color ]) => ({
    color: overWhite(color, opacity),
    label: min === 0 ? '0.1' : String(min),
  }));
}

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