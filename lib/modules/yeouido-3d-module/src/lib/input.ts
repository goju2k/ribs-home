/** 키보드·가상 조이스틱·버튼이 함께 쓰는 입력 상태 (React 렌더와 무관하게 매 프레임 읽는다) */
export interface InputState {
  /** 조이스틱: 화면 기준 x=오른쪽, y=아래, 길이 0~1 */
  joy: { x: number; y: number; };
  keys: Set<string>;
  runHeld: boolean;
  /** 누적된 회전 요청(90도 단위, +는 시계 방향) */
  rotate: number;
  /** 누적된 확대 요청(배율 곱) */
  zoom: number;
}

export const createInput = ():InputState => ({ joy: { x: 0, y: 0 }, keys: new Set(), runHeld: false, rotate: 0, zoom: 1 });

/** 키보드 + 조이스틱 → 화면 기준 이동 벡터와 달리기 여부 */
export function readMove(input:InputState) {
  const k = input.keys;
  let x = input.joy.x;
  let y = input.joy.y;
  if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
  if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  const joyLen = Math.hypot(input.joy.x, input.joy.y);
  const run = input.runHeld || k.has('ShiftLeft') || k.has('ShiftRight') || joyLen > 0.92;
  return { x, y, amount: Math.min(1, len), run };
}