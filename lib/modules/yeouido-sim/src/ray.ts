import { SimWorld } from './body';

/** 광선을 이 간격으로 짚어 본다 (m) */
const STEP = 0.4;

/**
 * 광선이 벽·바닥·건물에 막히기까지의 거리 (안 막히면 max). 총알·시선 등 장르와 무관한 엔진 기능.
 * - 실외(b < 0): 땅 아래로 가거나, 그 높이보다 높은 건물 안으로 들어가면 막힘
 * - 실내(b ≥ 0): 같은 층 벽, 층 바닥·천장, 건물 밖(창·외벽)으로 나가면 막힘
 * (dx, dy, dz)는 길이 1
 */
export function castRay(w:SimWorld, x:number, y:number, z:number, dx:number, dy:number, dz:number, max:number, b = -1, l = 1) {
  const room = b >= 0 ? w.byBid.get(b) : undefined;
  const base = room ? room.baseY(l) : 0;
  const top = room ? base + room.plan.floorH : Infinity;
  for (let t = STEP; t < max; t += STEP) {
    const px = x + dx * t;
    const py = y + dy * t;
    const pz = z + dz * t;
    if (room) {
      if (py <= base || py >= top || room.isOutside(l, px, pz) || room.wallAt(l, px, py, pz)) return t;
    } else if (py <= 0 || w.collision.blocked(px, pz, 0, py)) return t;
  }
  return max;
}