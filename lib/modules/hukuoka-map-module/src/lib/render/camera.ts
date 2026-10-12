import { Point } from '../geo/projection';
import { World } from '../geo/world';
import { TravelerState } from '../timeline/position';

/** x, y: 화면 중앙에 오는 월드 좌표(도트), scale: 도트 1개당 CSS 픽셀 */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Viewport {
  w: number;
  h: number;
  /** 상단 바/하단 패널에 가려지는 높이 */
  insetTop: number;
  insetBottom: number;
}

export const MIN_SCALE = 0.04;
export const MAX_SCALE = 16;
/** 이보다 작게 축소하면 장소 대신 구역 이름만 보여준다 */
export const OVERVIEW_SCALE = 0.9;

export const clampScale = (s:number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function toScreen(cam:Camera, vp:Viewport, p:Point):Point {
  return { x: (p.x - cam.x) * cam.scale + vp.w / 2, y: (p.y - cam.y) * cam.scale + vp.h / 2 };
}

/** 화면의 (sx, sy) 지점을 고정한 채 확대/축소 */
export function zoomAt(cam:Camera, vp:Viewport, sx:number, sy:number, factor:number):Camera {
  const scale = clampScale(cam.scale * factor);
  const wx = cam.x + (sx - vp.w / 2) / cam.scale;
  const wy = cam.y + (sy - vp.h / 2) / cam.scale;
  return { scale, x: wx - (sx - vp.w / 2) / scale, y: wy - (sy - vp.h / 2) / scale };
}

/** 영역이 가리지 않는 부분 한가운데에 bounds가 오도록 */
export function fitBounds(b:{ minX: number; minY: number; maxX: number; maxY: number; }, vp:Viewport, padding:number, maxScale = MAX_SCALE):Camera {
  const availH = Math.max(80, vp.h - vp.insetTop - vp.insetBottom);
  const scale = clampScale(Math.min((vp.w - padding * 2) / Math.max(b.maxX - b.minX, 1), (availH - padding * 2) / Math.max(b.maxY - b.minY, 1), maxScale));
  return centerOn({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, scale, vp);
}

export function centerOn(p:Point, scale:number, vp:Viewport):Camera {
  const visibleCenterY = vp.insetTop + (vp.h - vp.insetTop - vp.insetBottom) / 2;
  return { scale, x: p.x, y: p.y - (visibleCenterY - vp.h / 2) / scale };
}

export function stayScale(vp:Viewport) {
  return Math.min(9, Math.max(3, Math.min(vp.w, vp.h - vp.insetTop - vp.insetBottom) / 70));
}

/** 자동 추적 목표: 머무는 중엔 확대, 이동 중엔 출발~도착 경로가 다 보이게 */
export function followTarget(state:TravelerState, world:World, vp:Viewport):Camera {
  const near = stayScale(vp);
  const move = world.moves[state.segmentIndex];
  if (state.segment.kind === 'stay' || !move) return centerOn(state.pos, near, vp);
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  move.path.points.forEach((p) => {
    b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
    b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y);
  });
  // 출발·도착지 섬이 잘리지 않도록 여유를 둔다
  const margin = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.12;
  return fitBounds({ minX: b.minX - margin, minY: b.minY - margin, maxX: b.maxX + margin, maxY: b.maxY + margin }, vp, 48, near);
}

/** 프레임마다 목표 쪽으로 부드럽게 (확대 배율은 로그 공간에서 보간) */
export function approach(cam:Camera, target:Camera, dtSec:number):Camera {
  const k = 1 - Math.exp(-dtSec * 3.2);
  const scale = Math.exp(Math.log(cam.scale) + (Math.log(target.scale) - Math.log(cam.scale)) * k);
  return { scale, x: cam.x + (target.x - cam.x) * k, y: cam.y + (target.y - cam.y) * k };
}