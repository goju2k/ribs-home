import type { DecorBox } from './decor';
import type { WorldData } from './world-data';

/**
 * 블렌더로 만든 랜드마크 외형의 막는 상자 (서버·클라이언트 공용): 옥상 설비·옥상 난간.
 * 몸체는 지도 바닥 다각형 그대로라 원래 판정이 맞고, 옥상 위에 더한 것만 여기서 막는다 (보이는 것 = 막는 것).
 * 블렌더 스크립트(scripts/blender)는 이 값을 JSON으로 받아 같은 자리에 같은 크기로 만든다 — 한 곳에서만 정한다.
 * 상자 높이(h)는 땅에서부터의 꼭대기 높이 (몸체 안쪽이라 아래쪽은 원래 막혀 있다).
 */
interface RoofSpec {
  /** 옥상 설비: [긴 방향 위치(-0.5~0.5, 긴 변 길이 비율), 긴 방향 길이, 폭, 높이] (m) */
  boxes: [number, number, number, number][];
  /** 옥상 둘레 난간: 두께·높이 (m) */
  parapet: { width: number; rise: number; };
}

export const LANDMARK_ROOFS:Record<string, RoofSpec> = { '63빌딩': { boxes: [[ -0.25, 14, 9, 4.5 ], [ 0.045, 10, 7, 6 ], [ 0.27, 8, 8, 3 ]], parapet: { width: 1, rise: 1.6 } } };

/** 다각형 안인지 (짝수-홀수) */
function inside(ring:{ x: number; z: number; }[], x:number, z:number) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}

/** 랜드마크 하나의 상자들 (설비 + 난간) — name: 건물 이름 */
export function landmarkRoofBoxes(data:WorldData, name:string):{ boxes: DecorBox[]; parapet: DecorBox[]; h: number; } | null {
  const spec = LANDMARK_ROOFS[name];
  const bi = Object.entries(data.buildingNames).find(([ , n ]) => n === name)?.[0];
  if (!spec || bi === undefined) return null;
  const row = data.buildings[Number(bi)];
  const h = row[0];
  const ring:{ x: number; z: number; }[] = [];
  for (let k = 4; k + 1 < row.length; k += 2) ring.push({ x: row[k], z: row[k + 1] });
  const cx = ring.reduce((t, p) => t + p.x, 0) / ring.length;
  const cz = ring.reduce((t, p) => t + p.z, 0) / ring.length;
  // 긴 방향: 가장 긴 변
  let best = 0;
  let dx = 1;
  let dz = 0;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len > best) {
      best = len;
      dx = (b.x - a.x) / len;
      dz = (b.z - a.z) / len;
    }
  });
  const along = ring.map((p) => (p.x - cx) * dx + (p.z - cz) * dz);
  const span = Math.max(...along) - Math.min(...along);
  const boxes = spec.boxes.map(([ t, sx, sy, sz ]):DecorBox => ({ cx: cx + dx * t * span, cz: cz + dz * t * span, dx, dz, hl: sx / 2, hw: sy / 2, h: h + sz }));
  // 난간: 변마다 안쪽으로 두께만큼 들인 얇은 상자 (아주 짧은 꺾임은 건너뜀)
  const { width, rise } = spec.parapet;
  const parapet:DecorBox[] = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.5) return;
    const ex = (b.x - a.x) / len;
    const ez = (b.z - a.z) / len;
    let nx = -ez;
    let nz = ex;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    if (!inside(ring, mx + nx * 0.3, mz + nz * 0.3)) {
      nx = -nx;
      nz = -nz;
    }
    parapet.push({ cx: mx + nx * (width / 2), cz: mz + nz * (width / 2), dx: ex, dz: ez, hl: len / 2, hw: width / 2, h: h + rise });
  });
  return { boxes, parapet, h };
}

/** 모든 랜드마크의 막는 상자 */
export function landmarkBoxes(data:WorldData):DecorBox[] {
  return Object.keys(LANDMARK_ROOFS).flatMap((name) => {
    const r = landmarkRoofBoxes(data, name);
    return r ? [ ...r.boxes, ...r.parapet ] : [];
  });
}