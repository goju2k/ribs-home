interface CanvasPoint {
  x:number;
  y:number;
}

function midpoint(a:CanvasPoint, b:CanvasPoint):CanvasPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// 각 변의 중점을 지나는 2차 베지어로 그리드 격자의 계단 형태를 부드럽게 그린다.
// Canvas 2D의 stroke는 기본적으로 안티앨리어싱되므로 별도 AA 처리는 불필요.
export function drawSmoothClosedPath(ctx:CanvasRenderingContext2D, points:CanvasPoint[]) {

  if (points.length === 0) {
    return;
  }

  if (points.length < 3) {
    const [ p ] = points;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();

  const first = midpoint(points[points.length - 1], points[0]);
  ctx.moveTo(first.x, first.y);

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const mid = midpoint(current, next);
    ctx.quadraticCurveTo(current.x, current.y, mid.x, mid.y);
  }

  ctx.closePath();
  ctx.stroke();
}