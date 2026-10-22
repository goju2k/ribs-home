import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Decor, DecorKind, DECOR_KINDS, VEHICLES } from 'yeouido-sim';

import { seeThrough } from './see-through';

/**
 * 도심 꾸미기 그리기: 배치는 yeouido-sim(placeDecor)이 서버와 같게 정한다. 여기선 모양만.
 * 종류마다 같은 모양을 한 번에 그리고(InstancedMesh), 400m 칸으로 나눠 가까운 칸만 그린다.
 * 모양은 앞 = +x, 왼쪽 = -z, 발 = y 0. 차는 충돌 상자(VEHICLES)를 넘지 않게 (보이는 것 = 막는 것).
 */

/** 부품: [가로(x), 세로(y), 깊이(z), x, y, z, 색 — null이면 칠(종류·변형마다 다른 색)] */
type Part = [number, number, number, number, number, number, string | null];

const GLASS = '#26303e';
const TIRE = '#1b1d22';
const HEAD = '#fff2c0';
const TAIL = '#d9483b';
const METAL = '#5a606b';
const POLE = '#3d434c';

/** 승용차·SUV·택시 공통 모양 (치수는 VEHICLES) */
function carParts(k:'sedan' | 'suv' | 'taxi'):Part[] {
  const s = VEHICLES[k];
  const L = s.len;
  const W = s.wid;
  const bodyY = 0.28;
  const bodyH = s.body - bodyY;
  const cabH = s.top - s.body;
  const cx = s.cabOff;
  const parts:Part[] = [
    // 몸통·지붕 (칠)
    [ L, bodyH, W, 0, bodyY + bodyH / 2, 0, null ],
    [ s.cabLen, cabH, W - 0.1, cx, s.body + cabH / 2, 0, null ],
    // 창: 옆 띠·앞·뒤 유리 (지붕 안쪽 아래)
    [ s.cabLen - 0.3, cabH * 0.6, W - 0.08, cx, s.body + cabH * 0.42, 0, GLASS ],
    [ 0.04, cabH * 0.6, W - 0.3, cx + s.cabLen / 2 - 0.01, s.body + cabH * 0.42, 0, GLASS ],
    [ 0.04, cabH * 0.6, W - 0.3, cx - s.cabLen / 2 + 0.01, s.body + cabH * 0.42, 0, GLASS ],
    // 바퀴 넷
    [ 0.62, 0.62, 0.26, L / 2 - 0.85, 0.31, W / 2 - 0.14, TIRE ], [ 0.62, 0.62, 0.26, L / 2 - 0.85, 0.31, -(W / 2 - 0.14), TIRE ],
    [ 0.62, 0.62, 0.26, -(L / 2 - 0.85), 0.31, W / 2 - 0.14, TIRE ], [ 0.62, 0.62, 0.26, -(L / 2 - 0.85), 0.31, -(W / 2 - 0.14), TIRE ],
    // 전조등·후미등
    [ 0.04, 0.12, 0.34, L / 2 - 0.01, bodyY + bodyH * 0.65, W / 2 - 0.3, HEAD ], [ 0.04, 0.12, 0.34, L / 2 - 0.01, bodyY + bodyH * 0.65, -(W / 2 - 0.3), HEAD ],
    [ 0.04, 0.12, 0.3, -L / 2 + 0.01, bodyY + bodyH * 0.65, W / 2 - 0.28, TAIL ], [ 0.04, 0.12, 0.3, -L / 2 + 0.01, bodyY + bodyH * 0.65, -(W / 2 - 0.28), TAIL ],
    // 번호판
    [ 0.03, 0.12, 0.5, L / 2 - 0.005, bodyY + 0.12, 0, '#f4f4f8' ], [ 0.03, 0.12, 0.5, -L / 2 + 0.005, bodyY + 0.12, 0, '#f4f4f8' ],
  ];
  // 택시: 지붕 위 표시등 (충돌 높이보다 조금 높다 — 작아서 지나가도 된다)
  if (k === 'taxi') parts.push([ 0.3, 0.14, 0.6, cx, s.top + 0.07, 0, '#ffd84a' ]);
  return parts;
}

function busParts():Part[] {
  const s = VEHICLES.bus;
  const L = s.len;
  const W = s.wid;
  return [
    [ L, s.top - 0.3, W, 0, 0.3 + (s.top - 0.3) / 2, 0, null ],
    // 창: 옆 긴 띠·앞 큰 유리, 아래 흰 띠
    [ L - 1.2, 1.0, W + 0.02, -0.3, 2.05, 0, GLASS ],
    [ 0.04, 1.4, W - 0.2, L / 2 + 0.01, 1.95, 0, GLASS ],
    [ L + 0.02, 0.18, W + 0.02, 0, 0.75, 0, '#f4f4f8' ],
    // 앞문
    [ 1.0, 1.9, 0.02, L / 2 - 1.2, 1.35, W / 2 + 0.01, GLASS ],
    [ 0.9, 0.9, 0.3, L / 2 - 2.2, 0.45, W / 2 - 0.15, TIRE ], [ 0.9, 0.9, 0.3, L / 2 - 2.2, 0.45, -(W / 2 - 0.15), TIRE ],
    [ 0.9, 0.9, 0.3, -(L / 2 - 2.6), 0.45, W / 2 - 0.15, TIRE ], [ 0.9, 0.9, 0.3, -(L / 2 - 2.6), 0.45, -(W / 2 - 0.15), TIRE ],
    [ 0.04, 0.16, 0.4, L / 2 + 0.01, 0.6, W / 2 - 0.35, HEAD ], [ 0.04, 0.16, 0.4, L / 2 + 0.01, 0.6, -(W / 2 - 0.35), HEAD ],
    // 앞 위 행선판
    [ 0.04, 0.25, W - 0.4, L / 2 + 0.01, 2.85, 0, '#ffb347' ],
  ];
}

const PARTS:Record<DecorKind, Part[]> = {
  sedan: carParts('sedan'),
  suv: carParts('suv'),
  taxi: carParts('taxi'),
  bus: busParts(),
  // 가로등: 기둥 + 차도 쪽(+x)으로 뻗은 팔 + 등
  lamp: [
    [ 0.14, 6.2, 0.14, 0, 3.1, 0, POLE ], [ 0.3, 0.3, 0.3, 0, 0.15, 0, POLE ],
    [ 1.5, 0.1, 0.1, 0.7, 6.1, 0, POLE ], [ 0.6, 0.14, 0.3, 1.45, 6.02, 0, POLE ], [ 0.5, 0.04, 0.24, 1.45, 5.94, 0, HEAD ],
  ],
  // 신호등: 기둥 + 차도 위(+z)로 뻗은 팔 + 삼색등 (앞뒤 양쪽)
  signal: [
    [ 0.18, 5.4, 0.18, 0, 2.7, 0, POLE ], [ 0.1, 0.1, 3.6, 0, 5.3, 1.8, POLE ],
    [ 0.3, 0.36, 1.1, 0, 5.05, 3.0, '#22262c' ],
    [ 0.32, 0.18, 0.18, 0, 5.05, 2.65, TAIL ], [ 0.32, 0.18, 0.18, 0, 5.05, 3.0, '#ffb347' ], [ 0.32, 0.18, 0.18, 0, 5.05, 3.35, '#4fd06a' ],
    // 보행자 신호 (기둥 중간)
    [ 0.26, 0.5, 0.26, 0, 2.6, 0.2, '#22262c' ], [ 0.28, 0.16, 0.16, 0, 2.7, 0.2, '#4fd06a' ],
  ],
  // 버스 정류장: 지붕·뒷벽 유리·기둥·안쪽 의자·옆 광고판 (앞 = 차도 쪽 +x, 길이는 z)
  shelter: [
    [ 1.7, 0.12, 4.2, 0, 2.55, 0, '#3d6fd8' ],
    [ 0.06, 2.1, 4.0, -0.75, 1.3, 0, '#9fc6d9' ],
    [ 0.1, 2.5, 0.1, 0.7, 1.25, 1.95, POLE ], [ 0.1, 2.5, 0.1, 0.7, 1.25, -1.95, POLE ], [ 0.1, 2.5, 0.1, -0.75, 1.25, 2.02, POLE ], [ 0.1, 2.5, 0.1, -0.75, 1.25, -2.02, POLE ],
    [ 0.45, 0.08, 2.4, -0.45, 0.48, 0, '#c9a06a' ], [ 0.08, 0.45, 0.08, -0.45, 0.24, 1.0, METAL ], [ 0.08, 0.45, 0.08, -0.45, 0.24, -1.0, METAL ],
    [ 1.4, 2.0, 0.08, 0, 1.25, 2.06, '#f4f4f8' ], [ 1.2, 1.7, 0.09, 0, 1.3, 2.06, null ],
  ],
  // 벤치: 길이 = x
  bench: [
    [ 1.7, 0.07, 0.42, 0, 0.45, 0, '#b07a3e' ], [ 1.7, 0.36, 0.06, 0, 0.75, -0.22, '#b07a3e' ],
    [ 0.07, 0.45, 0.45, 0.72, 0.22, 0, METAL ], [ 0.07, 0.45, 0.45, -0.72, 0.22, 0, METAL ],
  ],
  // 쓰레기통 (칠 = 몸통)
  bin: [[ 0.5, 0.85, 0.5, 0, 0.425, 0, null ], [ 0.56, 0.08, 0.56, 0, 0.89, 0, '#3d434c' ], [ 0.3, 0.04, 0.02, 0, 0.7, 0.255, '#f4f4f8' ]],
  // 화분: 콘크리트 통 + 덤불 + 꽃 (칠 = 꽃)
  planter: [
    [ 1.0, 0.5, 1.0, 0, 0.25, 0, '#b9b4a8' ], [ 0.86, 0.36, 0.86, 0, 0.62, 0, '#4f9a4f' ],
    [ 0.16, 0.12, 0.16, 0.2, 0.84, 0.18, null ], [ 0.16, 0.12, 0.16, -0.22, 0.84, -0.1, null ], [ 0.16, 0.12, 0.16, 0.05, 0.86, -0.25, null ], [ 0.16, 0.12, 0.16, -0.15, 0.83, 0.24, null ],
  ],
  // 공공자전거: 바퀴 둘 + 틀(칠) + 안장·손잡이 + 앞 바구니
  bike: [
    [ 0.64, 0.64, 0.05, 0.52, 0.32, 0, TIRE ], [ 0.64, 0.64, 0.05, -0.52, 0.32, 0, TIRE ],
    [ 1.0, 0.07, 0.06, 0, 0.58, 0, null ], [ 0.07, 0.4, 0.06, -0.25, 0.75, 0, null ], [ 0.07, 0.45, 0.06, 0.45, 0.8, 0, null ],
    [ 0.24, 0.06, 0.14, -0.25, 0.97, 0, '#22262c' ], [ 0.06, 0.06, 0.5, 0.45, 1.03, 0, '#22262c' ], [ 0.26, 0.2, 0.3, 0.62, 0.85, 0, METAL ],
  ],
  // 배달 오토바이: 바퀴·몸통(칠)·안장·손잡이 + 뒤 배달통(칠)
  scooter: [
    [ 0.5, 0.5, 0.1, 0.62, 0.25, 0, TIRE ], [ 0.5, 0.5, 0.1, -0.6, 0.25, 0, TIRE ],
    [ 1.2, 0.35, 0.36, 0, 0.5, 0, '#e8e6e0' ], [ 0.2, 0.6, 0.3, 0.55, 0.8, 0, '#e8e6e0' ], [ 0.06, 0.06, 0.62, 0.6, 1.12, 0, '#22262c' ],
    [ 0.6, 0.1, 0.32, -0.15, 0.74, 0, '#22262c' ], [ 0.46, 0.42, 0.46, -0.55, 1.0, 0, null ],
  ],
  // 공사장 콘
  cone: [[ 0.42, 0.05, 0.42, 0, 0.025, 0, '#ff7a2a' ], [ 0.26, 0.3, 0.26, 0, 0.2, 0, '#ff7a2a' ], [ 0.2, 0.12, 0.2, 0, 0.41, 0, '#f4f4f8' ], [ 0.13, 0.22, 0.13, 0, 0.58, 0, '#ff7a2a' ]],
};

/** 칠 색: 종류마다 변형 번호(v)로 고른다 */
const PAINT:Partial<Record<DecorKind, string[]>> = {
  sedan: [ '#f2f2f0', '#c9ced6', '#2a2d33', '#5a606b', '#2f4a7a', '#c84a3e', '#d9cdb0', '#8fb3d9' ],
  suv: [ '#f2f2f0', '#c9ced6', '#2a2d33', '#5a606b', '#3f5a3f', '#7a2f2f', '#d9cdb0', '#4f6f8f' ],
  taxi: [ '#f2a33a' ],
  bus: [ '#3d6fd8', '#3fae4f', '#d9483b' ],
  shelter: [ '#ffd84a' ],
  bin: [ '#4f8a5a', '#5a606b', '#3d6fd8' ],
  planter: [ '#ff8ab0', '#ffd84a', '#f4f4f8', '#ff7a5a', '#c58aff', '#ff8ab0' ],
  bike: [ '#4fae5a' ],
  scooter: [ '#d9483b', '#3d6fd8', '#ffd84a', '#4fd0c0', '#f4f4f8', '#ff8a3a' ],
};

/** 그림자를 드리울 만큼 큰 것 (작은 소품은 그림자 그리기 비용만 든다) */
const SHADOW:Partial<Record<DecorKind, boolean>> = { sedan: true, suv: true, taxi: true, bus: true, shelter: true, lamp: true, signal: true };

/** 칸 크기 (m)·그리는 거리 (칸 가장자리까지) */
const CHUNK = 400;

/** 부품 목록 → 칠 부분·고정 색 부분 두 모양 (고정 색은 꼭짓점 색) */
function geometries(parts:Part[]) {
  const make = (list:Part[]) => {
    if (!list.length) return null;
    const geos = list.map(([ w, h, d, x, y, z, color ]) => {
      const g = new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(x, y, z);
      const c = new THREE.Color(color ?? '#ffffff');
      const n = g.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([ c.r, c.g, c.b ], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    });
    return mergeGeometries(geos);
  };
  return { paint: make(parts.filter((p) => p[6] === null)), fixed: make(parts.filter((p) => p[6] !== null)) };
}

export class DecorMeshes {

  private scene:THREE.Scene;

  private chunks:{ group: THREE.Group; x: number; z: number; }[] = [];

  private disposables:{ dispose: () => void; }[] = [];

  constructor(scene:THREE.Scene, decor:Decor[]) {
    this.scene = scene;
    const paintMat = seeThrough(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const fixedMat = seeThrough(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.disposables.push(paintMat, fixedMat);
    const shapes = new Map(DECOR_KINDS.map((k) => [ k, geometries(PARTS[k]) ]));
    shapes.forEach(({ paint, fixed }) => [ paint, fixed ].forEach((g) => g && this.disposables.push(g)));

    // 칸마다·종류마다 묶는다
    const byChunk = new Map<string, Map<DecorKind, Decor[]>>();
    decor.forEach((d) => {
      const key = `${Math.floor(d.x / CHUNK)},${Math.floor(d.z / CHUNK)}`;
      let kinds = byChunk.get(key);
      if (!kinds) {
        kinds = new Map();
        byChunk.set(key, kinds);
      }
      const list = kinds.get(d.k);
      if (list) list.push(d);
      else kinds.set(d.k, [ d ]);
    });
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    byChunk.forEach((kinds, key) => {
      const [ cx, cz ] = key.split(',').map(Number);
      const group = new THREE.Group();
      group.name = `decor ${key}`;
      kinds.forEach((list, k) => {
        const { paint, fixed } = shapes.get(k)!;
        const colors = PAINT[k] ?? [ '#ffffff' ];
        [ paint, fixed ].forEach((geo, gi) => {
          if (!geo) return;
          const mesh = new THREE.InstancedMesh(geo, gi === 0 ? paintMat : fixedMat, list.length);
          list.forEach((d, i) => {
            // 앞(+x)을 (dx, dz)로: rotation.y = atan2(-dz, dx)
            q.setFromAxisAngle(up, Math.atan2(-d.dz, d.dx));
            m.compose(p.set(d.x, 0, d.z), q, one);
            mesh.setMatrixAt(i, m);
            if (gi === 0) mesh.setColorAt(i, c.set(colors[d.v % colors.length]));
          });
          mesh.castShadow = !!SHADOW[k];
          mesh.receiveShadow = true;
          mesh.computeBoundingSphere();
          group.add(mesh);
          this.disposables.push(mesh);
        });
      });
      scene.add(group);
      this.chunks.push({ group, x: (cx + 0.5) * CHUNK, z: (cz + 0.5) * CHUNK });
    });
  }

  /** 매 장면: (x, z)에서 range m 안에 걸치는 칸만 그린다 */
  update(x:number, z:number, range:number) {
    const r = range + CHUNK / 2;
    this.chunks.forEach((ch) => {
      ch.group.visible = Math.abs(ch.x - x) < r && Math.abs(ch.z - z) < r;
    });
  }

  dispose() {
    this.chunks.forEach((ch) => this.scene.remove(ch.group));
    this.disposables.forEach((d) => d.dispose());
  }

}