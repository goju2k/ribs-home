// hukuoka-map-module 의 camera 에서 필요한 부분만 가져옴 (공용 엔진으로 빼기 전까지 복사본)

/** x, y: 화면 중앙에 오는 이미지 좌표(픽셀), scale: 이미지 1픽셀당 CSS 픽셀 */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Viewport {
  w: number;
  h: number;
}

export const MIN_SCALE = 0.3;
export const MAX_SCALE = 14;

export const clampScale = (s:number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function toScreen(cam:Camera, vp:Viewport, x:number, y:number) {
  return { x: (x - cam.x) * cam.scale + vp.w / 2, y: (y - cam.y) * cam.scale + vp.h / 2 };
}

/** 화면의 (sx, sy) 지점을 고정한 채 확대/축소 */
export function zoomAt(cam:Camera, vp:Viewport, sx:number, sy:number, factor:number):Camera {
  const scale = clampScale(cam.scale * factor);
  const wx = cam.x + (sx - vp.w / 2) / cam.scale;
  const wy = cam.y + (sy - vp.h / 2) / cam.scale;
  return { scale, x: wx - (sx - vp.w / 2) / scale, y: wy - (sy - vp.h / 2) / scale };
}

export function fitRect(w:number, h:number, vp:Viewport, padding = 0):Camera {
  const scale = clampScale(Math.min((vp.w - padding * 2) / w, (vp.h - padding * 2) / h));
  return { scale, x: w / 2, y: h / 2 };
}

/** 이미지 밖으로 너무 멀리 나가지 않게 */
export function clampToImage(cam:Camera, w:number, h:number):Camera {
  return { ...cam, x: Math.min(w, Math.max(0, cam.x)), y: Math.min(h, Math.max(0, cam.y)) };
}