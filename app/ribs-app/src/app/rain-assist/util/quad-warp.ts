// 4점 좌표 대응(source 사각형 -> target 사변형) 투영 변환을 CSS `matrix3d(...)`로 계산한다.
// Paul Heckbert의 "unit square -> quad" 고전 알고리즘(1989)을 이미지 원본 픽셀 크기(W x H)로
// 일반화한 것 — source(0,0)-(W,0)-(W,H)-(0,H) 사각형을 임의의 target 사변형(사다리꼴 등)으로
// 매핑하는 3x3 projective 행렬을 구해, 원근 나눗셈(perspective divide)을 CSS matrix3d의
// 4번째 행/열에 직접 굽는 표준 기법으로 16개 값에 임베드한다. 별도 CSS `perspective` 속성 불필요.

export interface Point {
  x:number;
  y:number;
}

// unit square (0,0),(1,0),(1,1),(0,1) -> quad[0..3] 로 매핑하는 3x3 projective 행렬을 구한다.
// 반환값은 [a,b,c, d,e,f, g,h,i](row-major, i는 항상 1) — (x,y,w) = M * (u,v,1), 최종좌표는 (x/w, y/w).
function squareToQuad(quad:[Point, Point, Point, Point]):number[] | null {

  const [ p0, p1, p2, p3 ] = quad;

  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;

  let a:number;
  let b:number;
  let c:number;
  let d:number;
  let e:number;
  let f:number;
  let g:number;
  let h:number;

  if (dx3 === 0 && dy3 === 0) {
    // 평행사변형(순수 affine) — 원근 항 없이 그대로 계산 가능
    a = p1.x - p0.x;
    b = p2.x - p1.x;
    c = p0.x;
    d = p1.y - p0.y;
    e = p2.y - p1.y;
    f = p0.y;
    g = 0;
    h = 0;
  } else {
    const denom = (dx1 * dy2) - (dx2 * dy1);
    if (denom === 0) {
      return null;
    }
    g = ((dx3 * dy2) - (dx2 * dy3)) / denom;
    h = ((dx1 * dy3) - (dx3 * dy1)) / denom;
    a = p1.x - p0.x + (g * p1.x);
    b = p3.x - p0.x + (h * p3.x);
    c = p0.x;
    d = p1.y - p0.y + (g * p1.y);
    e = p3.y - p0.y + (h * p3.y);
    f = p0.y;
  }

  const m = [ a, b, c, d, e, f, g, h, 1 ];
  return m.every((v) => Number.isFinite(v)) ? m : null;
}

// source 사각형(0,0)-(W,0)-(W,H)-(0,H)을 target 사변형으로 매핑하는 CSS `matrix3d(...)` 문자열을
// 계산한다. targetQuad는 [topLeft, topRight, bottomRight, bottomLeft] 순서(source의
// (0,0)/(W,0)/(W,H)/(0,H)에 각각 대응). degenerate한 경우(분모 0, 극단적 줌아웃 등) null.
export function computeQuadWarpMatrix3d(
  sourceWidth:number,
  sourceHeight:number,
  targetQuad:[Point, Point, Point, Point],
):string | null {

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  const q = squareToQuad(targetQuad);
  if (!q) {
    return null;
  }

  const [ a, b, c, d, e, f, g, h, i ] = q;

  // unit square -> quad 행렬(Q)에 "source px -> unit square"(1/W, 1/H 스케일)를 합성 —
  // u,v에 곱해지는 1,2열만 W,H로 나누면 된다(상수항 c,f와 3행의 i는 그대로).
  const m11 = a / sourceWidth;
  const m21 = b / sourceHeight;
  const m41 = c;
  const m12 = d / sourceWidth;
  const m22 = e / sourceHeight;
  const m42 = f;
  const m14 = g / sourceWidth;
  const m24 = h / sourceHeight;
  const m44 = i;

  const values = [ m11, m21, m41, m12, m22, m42, m14, m24, m44 ];
  if (!values.every((v) => Number.isFinite(v))) {
    return null;
  }

  return `matrix3d(${m11}, ${m12}, 0, ${m14}, ${m21}, ${m22}, 0, ${m24}, 0, 0, 1, 0, ${m41}, ${m42}, 0, ${m44})`;

}