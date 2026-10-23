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
  /**
   * 정면 기단(테라스) + 가운데 넓은 계단 + 계단 양옆 화단 — 걸어서 올라간다 (계단 한 단이 0.3m 턱보다 낮다).
   * facing: 기단을 둘 긴 변의 바깥 방향 (x 동·z 남) — 긴 변들 중 이 방향에 가장 가까운 변
   */
  podium?: {
    facing: [number, number];
    depth: number; height: number;
    stairs: { width: number; steps: number; tread: number; };
    planters: { width: number; depth: number; height: number; gap: number; };
  };
}

export const LANDMARK_ROOFS:Record<string, RoofSpec> = {
  '63빌딩': { boxes: [[ -0.25, 14, 9, 4.5 ], [ 0.045, 10, 7, 6 ], [ 0.27, 8, 8, 3 ]], parapet: { width: 1, rise: 1.6 } },
  // KBS 본관: 두꺼운 처마(지붕 위 1.2m)·송신 철탑 받침 (철탑은 격자라 받침 둘레만큼 막는다)
  'KBS 본관': {
    boxes: [[ 0.22, 6, 6, 32 ]],
    parapet: { width: 1.2, rise: 1.2 },
    // 공원 쪽(남동) 긴 면: 3m 기단이 6m 나오고 가운데 36m 계단 12단, 양옆 화단
    podium: { facing: [ 0.62, 0.79 ], depth: 6, height: 3, stairs: { width: 36, steps: 12, tread: 0.5 }, planters: { width: 10, depth: 5, height: 1.2, gap: 1 } },
  },
};

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
export function landmarkRoofBoxes(data:WorldData, name:string):{ boxes: DecorBox[]; parapet: DecorBox[]; podium: DecorBox[]; h: number; } | null {
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
  // 정면 기단: 기단 판 (변 전체) + 계단 (아래 단일수록 앞으로 길다 — 겹친 상자 중 가장 높은 윗면에 선다) + 화단 둘
  const podium:DecorBox[] = [];
  const pd = spec.podium;
  if (pd) {
    let pick = -1;
    let bestDot = -Infinity;
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < best * 0.8) return;
      let nx = -(b.z - a.z) / len;
      let nz = (b.x - a.x) / len;
      if (inside(ring, (a.x + b.x) / 2 + nx * 0.3, (a.z + b.z) / 2 + nz * 0.3)) {
        nx = -nx;
        nz = -nz;
      }
      const dot = nx * pd.facing[0] + nz * pd.facing[1];
      if (dot > bestDot) {
        bestDot = dot;
        pick = i;
      }
    });
    const a = ring[pick];
    const b = ring[(pick + 1) % ring.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ex = (b.x - a.x) / len;
    const ez = (b.z - a.z) / len;
    let nx = -ez;
    let nz = ex;
    if (inside(ring, (a.x + b.x) / 2 + nx * 0.3, (a.z + b.z) / 2 + nz * 0.3)) {
      nx = -nx;
      nz = -nz;
    }
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    /** 변 가운데에서 along(변 방향)·out(바깥) 만큼 간 자리의 상자 */
    const at = (along:number, out:number, hl:number, hw:number, top:number):DecorBox => ({ cx: mx + ex * along + nx * out, cz: mz + ez * along + nz * out, dx: ex, dz: ez, hl, hw, h: top });
    podium.push(at(0, pd.depth / 2, len / 2, pd.depth / 2, pd.height));
    const { width, steps, tread } = pd.stairs;
    for (let k = 1; k <= steps; k++) {
      const ext = (steps - k + 1) * tread;
      podium.push(at(0, pd.depth + ext / 2, width / 2, ext / 2, (pd.height * k) / steps));
    }
    const p = pd.planters;
    [ -1, 1 ].forEach((side) => podium.push(at(side * (width / 2 + p.gap + p.width / 2), pd.depth + p.depth / 2, p.width / 2, p.depth / 2, p.height)));
  }
  return { boxes, parapet, podium, h };
}

/** 모든 랜드마크의 막는 상자 */
export function landmarkBoxes(data:WorldData):DecorBox[] {
  return Object.keys(LANDMARK_ROOFS).flatMap((name) => {
    const r = landmarkRoofBoxes(data, name);
    return r ? [ ...r.boxes, ...r.parapet, ...r.podium ] : [];
  });
}