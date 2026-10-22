import type { WorldData } from './world-data';

/**
 * 도심 꾸미기 (서버·클라이언트 공용): 도로 데이터에서 정해진 씨앗으로 자리를 뽑아, 양쪽이 똑같은 배치를 얻는다.
 * - 막는 것: 차(승용차·SUV·택시·버스) — 이동·총알을 막는 엄폐물. 충돌은 몸통·지붕 두 상자 (그려지는 모양과 같게)
 * - 안 막는 것: 가로등·신호등·버스 정류장·벤치·쓰레기통·화분·자전거·배달 오토바이·공사장 콘 (나무·상자처럼 보이지만 지나간다)
 */
export const DECOR_KINDS = [ 'sedan', 'suv', 'taxi', 'bus', 'lamp', 'signal', 'shelter', 'bench', 'bin', 'planter', 'bike', 'scooter', 'cone' ] as const;
export type DecorKind = typeof DECOR_KINDS[number];

/** 놓인 것 하나: 종류, 자리, 방향(앞 = (dx, dz)), 색 등 변형 번호 */
export interface Decor {
  k: DecorKind; x: number; z: number; dx: number; dz: number; v: number;
}

/** 차 치수 (m): 길이·폭, 몸통 높이, 지붕(실내) 높이·길이·앞뒤 치우침(+ 앞) */
export const VEHICLES = {
  sedan: { len: 4.6, wid: 1.8, body: 0.9, top: 1.45, cabLen: 2.4, cabOff: -0.2 },
  suv: { len: 4.8, wid: 1.9, body: 1.0, top: 1.8, cabLen: 3.0, cabOff: -0.35 },
  taxi: { len: 4.6, wid: 1.8, body: 0.9, top: 1.45, cabLen: 2.4, cabOff: -0.2 },
  bus: { len: 11, wid: 2.5, body: 3.1, top: 3.1, cabLen: 11, cabOff: 0 },
} as const;

export type VehicleKind = keyof typeof VEHICLES;

export const isVehicle = (k:DecorKind):k is VehicleKind => k in VEHICLES;

/** 충돌 상자 하나 (차의 몸통 또는 지붕): 가운데·방향(길이 쪽 단위 벡터)·반 길이·반 폭·높이 */
export interface DecorBox {
  cx: number; cz: number; dx: number; dz: number; hl: number; hw: number; h: number;
}

/** 차 → 충돌 상자 (몸통 전체 + 지붕 부분) */
export function vehicleBoxes(d:Decor):DecorBox[] {
  const s = VEHICLES[d.k as VehicleKind];
  const body:DecorBox = { cx: d.x, cz: d.z, dx: d.dx, dz: d.dz, hl: s.len / 2, hw: s.wid / 2, h: s.body };
  if (s.top <= s.body) return [ body ];
  return [ body, { cx: d.x + d.dx * s.cabOff, cz: d.z + d.dz * s.cabOff, dx: d.dx, dz: d.dz, hl: s.cabLen / 2, hw: s.wid / 2 - 0.05, h: s.top }];
}

/** 점이 상자 바닥 넓이 안인지 */
export function inBox(b:DecorBox, x:number, z:number) {
  const rx = x - b.cx;
  const rz = z - b.cz;
  return Math.abs(rx * b.dx + rz * b.dz) <= b.hl && Math.abs(-rx * b.dz + rz * b.dx) <= b.hw;
}

/** 정해진 씨앗 난수 (mulberry32) — 서버·클라이언트가 같은 수열 */
function seeded(seed:number) {
  let a = seed >>> 0; // eslint-disable-line no-bitwise
  return () => {
    /* eslint-disable no-bitwise */
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    /* eslint-enable no-bitwise */
  };
}

/** 도로 한 줄: [등급, 폭, 차선, 일방, 다리, ...xz] */
interface Road {
  grade: number; w: number; oneway: boolean; bridge: boolean; pts: number[]; len: number; 
}

/** 도로 조각 공간 격자 (다른 도로 위인지·교차로 근처인지 볼 때) */
const SEG_CELL = 40;

const cache = new WeakMap<WorldData, Decor[]>();

/**
 * 배치 (한 번 만들어 둔다). free(x, z): 땅이 비었는지 (건물·물이 아닌지 — 충돌 격자로)
 */
export function placeDecor(data:WorldData, free:(x:number, z:number) => boolean):Decor[] {
  const hit = cache.get(data);
  if (hit) return hit;
  const rand = seeded(0x5eed1);
  const roads:Road[] = data.roads.map((r) => {
    const pts = r.slice(5);
    let len = 0;
    for (let i = 2; i + 1 < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    return { grade: r[0], w: r[1], oneway: r[3] === 1, bridge: r[4] === 1, pts, len };
  });

  // 도로 조각 격자: 한 점이 (자기 말고) 다른 도로 위인지 — 교차로에 차·가로등이 서지 않게
  const segs = new Map<number, [number, number][]>();
  const key = (cx:number, cz:number) => (cx + 1000) * 4096 + (cz + 1000);
  roads.forEach((r, ri) => {
    for (let i = 2; i + 1 < r.pts.length; i += 2) {
      const m = r.w / 2 + 4;
      const [ x0, z0, x1, z1 ] = [ r.pts[i - 2], r.pts[i - 1], r.pts[i], r.pts[i + 1] ];
      for (let cx = Math.floor((Math.min(x0, x1) - m) / SEG_CELL); cx <= Math.floor((Math.max(x0, x1) + m) / SEG_CELL); cx++) {
        for (let cz = Math.floor((Math.min(z0, z1) - m) / SEG_CELL); cz <= Math.floor((Math.max(z0, z1) + m) / SEG_CELL); cz++) {
          const k = key(cx, cz);
          const list = segs.get(k);
          if (list) list.push([ ri, i ]);
          else segs.set(k, [[ ri, i ]]);
        }
      }
    }
  });
  const segDist = (r:Road, i:number, x:number, z:number) => {
    const [ x0, z0, x1, z1 ] = [ r.pts[i - 2], r.pts[i - 1], r.pts[i], r.pts[i + 1] ];
    const vx = x1 - x0;
    const vz = z1 - z0;
    const l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - x0) * vx + (z - z0) * vz) / l2));
    return Math.hypot(x0 + vx * t - x, z0 + vz * t - z);
  };
  /** (x, z)가 다른 도로(차도 + margin) 위인지 */
  const onOtherRoad = (x:number, z:number, self:number, margin:number) => (segs.get(key(Math.floor(x / SEG_CELL), Math.floor(z / SEG_CELL))) ?? [])
    .some(([ ri, i ]) => ri !== self && segDist(roads[ri], i, x, z) < roads[ri].w / 2 + margin);

  const out:Decor[] = [];
  // 놓인 것끼리 겹치지 않게: 4m 격자에 자리(반지름 포함)
  const taken = new Map<number, [number, number, number][]>();
  const TC = 4;
  const clear = (x:number, z:number, r:number) => {
    for (let cx = Math.floor((x - r - 6) / TC); cx <= Math.floor((x + r + 6) / TC); cx++) {
      for (let cz = Math.floor((z - r - 6) / TC); cz <= Math.floor((z + r + 6) / TC); cz++) {
        if ((taken.get(key(cx, cz)) ?? []).some(([ ox, oz, or ]) => Math.hypot(ox - x, oz - z) < or + r)) return false;
      }
    }
    return true;
  };
  const put = (d:Decor, r:number) => {
    out.push(d);
    const k = key(Math.floor(d.x / TC), Math.floor(d.z / TC));
    const list = taken.get(k);
    if (list) list.push([ d.x, d.z, r ]);
    else taken.set(k, [[ d.x, d.z, r ]]);
  };

  /** 도로를 따라 걸으며 s(m)마다 그 자리·방향을 넘긴다 (끝에서 edge m 안은 건너뜀 — 교차로) */
  const walk = (r:Road, step:() => number, edge:number, fn:(x:number, z:number, dx:number, dz:number) => void) => {
    let s = edge + step() * rand();
    let acc = 0;
    for (let i = 2; i + 1 < r.pts.length; i += 2) {
      const x0 = r.pts[i - 2];
      const z0 = r.pts[i - 1];
      const sl = Math.hypot(r.pts[i] - x0, r.pts[i + 1] - z0);
      const dx = (r.pts[i] - x0) / (sl || 1);
      const dz = (r.pts[i + 1] - z0) / (sl || 1);
      while (sl >= 0.01 && s <= acc + sl && s <= r.len - edge) {
        const t = s - acc;
        fn(x0 + dx * t, z0 + dz * t, dx, dz);
        s += step();
      }
      acc += sl;
    }
  };

  /** 차 한 대가 놓일 수 있는지: 네 모서리·가운데가 빈 땅이고 다른 도로 위가 아님 */
  const vehicleFits = (k:VehicleKind, x:number, z:number, dx:number, dz:number, self:number) => {
    const s = VEHICLES[k];
    const corners = [[ 1, 1 ], [ 1, -1 ], [ -1, 1 ], [ -1, -1 ], [ 0, 0 ]].map(([ a, b ]) => [ x + dx * (s.len / 2) * a - dz * (s.wid / 2) * b, z + dz * (s.len / 2) * a + dx * (s.wid / 2) * b ]);
    return corners.every(([ cx, cz ]) => free(cx, cz) && !onOtherRoad(cx, cz, self, 1));
  };

  roads.forEach((r, ri) => {
    if (r.bridge || r.len < 30) return;
    const main = r.grade === 1;
    // 길가 주차: 폭 7m 이상, 일방통행 좁은 길은 오른쪽만. 큰길은 드물게(택시 많게)
    if (r.w >= 7) {
      const sides = r.oneway && r.w < 10 ? [ 1 ] : [ 1, -1 ];
      sides.forEach((side) => {
        const off = r.w / 2 - 1.2;
        walk(r, () => 5.5 + rand() * 4, 14, (x, z, dx, dz) => {
          if (rand() > (main ? 0.12 : 0.42)) return;
          // 오른쪽(side 1) = 진행 방향 오른손: (dx, dz)를 시계 방향으로 90도 = (-dz, dx)
          const px = x - dz * off * side;
          const pz = z + dx * off * side;
          const roll = rand();
          let k:VehicleKind = 'sedan';
          if (roll < (main ? 0.45 : 0.15)) k = 'taxi';
          else if (roll < (main ? 0.7 : 0.45)) k = 'suv';
          // 같은 쪽 차선 방향으로 (오른쪽은 진행 방향, 왼쪽은 반대)
          const fdx = dx * side;
          const fdz = dz * side;
          if (!vehicleFits(k, px, pz, fdx, fdz, ri) || !clear(px, pz, 2.6)) return;
          put({ k, x: px, z: pz, dx: fdx, dz: fdz, v: Math.floor(rand() * 8) }, 2.6);
        });
      });
    }
    // 가로등: 폭 7m 이상 길 양쪽 보도에 28~34m마다 (서로 엇갈리게)
    if (r.w >= 7) {
      [ 1, -1 ].forEach((side) => {
        const off = r.w / 2 + 0.7;
        walk(r, () => 28 + rand() * 6, 10, (x, z, dx, dz) => {
          const px = x - dz * off * side;
          const pz = z + dx * off * side;
          if (!free(px, pz) || onOtherRoad(px, pz, ri, 0.5) || !clear(px, pz, 0.5)) return;
          // 등은 차도 쪽을 본다
          put({ k: 'lamp', x: px, z: pz, dx: dz * side, dz: -dx * side, v: 0 }, 0.5);
        });
      });
    }
    // 버스 정류장: 큰길 한쪽에 300~420m마다, 앞에 버스가 서 있기도
    if (main && r.w >= 10) {
      walk(r, () => 300 + rand() * 120, 40, (x, z, dx, dz) => {
        const off = r.w / 2 + 1.6;
        const px = x - dz * off;
        const pz = z + dx * off;
        if (!free(px, pz) || !free(px + dx * 2, pz + dz * 2) || !free(px - dx * 2, pz - dz * 2) || onOtherRoad(px, pz, ri, 1) || !clear(px, pz, 2.6)) return;
        // 앞에 버스: 정류장보다 먼저 자리를 본다 (정류장과 붙어 있으니 서로는 겹쳐도 된다)
        const bo = r.w / 2 - 1.7;
        const bx = x - dz * bo;
        const bz = z + dx * bo;
        const bus = rand() < 0.45 && vehicleFits('bus', bx, bz, dx, dz, ri) && clear(bx, bz, 5.8);
        // 정류장은 차도를 마주 본다 (앞 = 차도 쪽)
        put({ k: 'shelter', x: px, z: pz, dx: dz, dz: -dx, v: 0 }, 2.6);
        if (bus) put({ k: 'bus', x: bx, z: bz, dx, dz, v: Math.floor(rand() * 3) }, 5.8);
      });
    }
    // 보도 소품: 벤치·쓰레기통·화분·자전거·배달 오토바이 (보도 안쪽 줄, 건물 쪽)
    if (r.w >= 6) {
      [ 1, -1 ].forEach((side) => {
        const off = r.w / 2 + 1.9;
        walk(r, () => 9 + rand() * 14, 8, (x, z, dx, dz) => {
          if (rand() > 0.5) return;
          const px = x - dz * off * side;
          const pz = z + dx * off * side;
          if (!free(px, pz) || onOtherRoad(px, pz, ri, 0.8) || !clear(px, pz, 0.9)) return;
          const roll = rand();
          let k:DecorKind = 'planter';
          if (roll < 0.22) k = 'bench';
          else if (roll < 0.4) k = 'bin';
          else if (roll < 0.62) k = 'bike';
          else if (roll < 0.78) k = 'scooter';
          // 벤치·화분은 길과 나란히, 자전거·오토바이는 차도 쪽을 보고 비스듬히
          const across = k === 'bike' || k === 'scooter';
          const a = across ? 0.5 + rand() * 0.3 : 0;
          const fx = across ? dz * side * Math.cos(a) + dx * Math.sin(a) : dx;
          const fz = across ? -dx * side * Math.cos(a) + dz * Math.sin(a) : dz;
          put({ k, x: px, z: pz, dx: fx, dz: fz, v: Math.floor(rand() * 6) }, 0.9);
        });
      });
    }
  });

  // 신호등: 큰길 끝(다른 도로와 만나는 곳) 오른쪽 모서리
  roads.forEach((r, ri) => {
    if (r.grade !== 1 || r.bridge || r.len < 40) return;
    const n = r.pts.length;
    [[ r.pts[0], r.pts[1], r.pts[2], r.pts[3] ], [ r.pts[n - 2], r.pts[n - 1], r.pts[n - 4], r.pts[n - 3] ]].forEach(([ ex, ez, nx, nz ]) => {
      if (!onOtherRoad(ex, ez, ri, 2)) return;
      const l = Math.hypot(nx - ex, nz - ez) || 1;
      // 교차로에서 도로 안쪽 방향
      const dx = (nx - ex) / l;
      const dz = (nz - ez) / l;
      const back = 6;
      const off = r.w / 2 + 0.8;
      const px = ex + dx * back - dz * off;
      const pz = ez + dz * back + dx * off;
      if (!free(px, pz) || onOtherRoad(px, pz, ri, 0.5) || !clear(px, pz, 0.6)) return;
      // 신호등 팔은 차도 위로, 등은 다가오는 차(교차로 반대쪽)를 본다
      put({ k: 'signal', x: px, z: pz, dx: -dx, dz: -dz, v: 0 }, 0.6);
    });
  });

  // 공사장: 둘레를 따라 콘
  (data.areas.construction ?? []).forEach((poly) => {
    const ring = poly[0];
    for (let i = 2; i + 1 < ring.length; i += 2) {
      const x0 = ring[i - 2];
      const z0 = ring[i - 1];
      const sl = Math.hypot(ring[i] - x0, ring[i + 1] - z0);
      for (let t = 1; t < sl; t += 3 + rand() * 2) {
        const px = x0 + ((ring[i] - x0) * t) / sl;
        const pz = z0 + ((ring[i + 1] - z0) * t) / sl;
        if (free(px, pz) && clear(px, pz, 0.35)) put({ k: 'cone', x: px, z: pz, dx: 1, dz: 0, v: 0 }, 0.35);
      }
    }
  });

  cache.set(data, out);
  return out;
}