/** 키보드·가상 조이스틱·버튼이 함께 쓰는 입력 상태 (React 렌더와 무관하게 매 프레임 읽는다) */
export interface InputState {
  /** 조이스틱: 화면 기준 x=오른쪽, y=아래, 길이 0~1 */
  joy: { x: number; y: number; };
  keys: Set<string>;
  /** 달리기 버튼은 누를 때마다 켜고 끈다 (기본은 달리기) */
  runToggle: boolean;
  /** 높이 버튼을 누르고 있는 중 */
  upHeld: boolean;
  downHeld: boolean;
  /** 누적된 회전 요청(90도 단위, +는 시계 방향) */
  rotate: number;
  /** 누적된 확대 요청(배율 곱) */
  zoom: number;
}

export const createInput = ():InputState => ({ joy: { x: 0, y: 0 }, keys: new Set(), runToggle: true, upHeld: false, downHeld: false, rotate: 0, zoom: 1 });

/** 키보드 + 조이스틱 → 화면 기준 이동 벡터와 달리기 여부 */
export function readMove(input:InputState) {
  const k = input.keys;
  let { x } = input.joy;
  let { y } = input.joy;
  if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
  if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  const shift = k.has('ShiftLeft') || k.has('ShiftRight');
  // Shift는 누르는 동안 토글을 뒤집는다 (달리는 중엔 걷기, 걷는 중엔 달리기)
  const run = input.runToggle !== shift;
  return { x, y, amount: Math.min(1, len), run };
}

/** 위(+1)·아래(-1)·정지(0) */
export function readLift(input:InputState) {
  const k = input.keys;
  const up = input.upHeld || k.has('Space') || k.has('KeyR') || k.has('PageUp');
  const down = input.downHeld || k.has('KeyC') || k.has('KeyF') || k.has('PageDown');
  return (up ? 1 : 0) - (down ? 1 : 0);
}