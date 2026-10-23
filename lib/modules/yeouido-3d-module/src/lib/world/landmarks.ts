import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toPoints, WorldData } from 'yeouido-sim';

import { seeThrough } from './see-through';

/**
 * 랜드마크 외벽 (화면만): 사진을 보고 특징을 도트로 다시 그린다. 모양·판정은 지도 그대로 (바닥 다각형 × 높이).
 * 일반 건물은 창문 무늬 하나를 같이 쓰지만, 여기 건물은 벽 구간마다 무늬를 골라 건물 둘레 전체 × 높이 전체를 한 장으로 칠한다
 * (층마다 다른 것 — 기계층 띠·꼭대기 왕관·로비 — 을 제 높이에, 밤의 불 켜진 층이 3m마다 되풀이되지 않게).
 * 밤 무늬는 자기 빛(emissive)으로 — 밤일수록 켠다 (setLandmarkNight).
 * 새 랜드마크는 LANDMARKS에 이름·무늬 고르기·그리기를 더한다.
 */

/** 텍스처 가로 8도트 = 3m (일반 건물 창 칸과 같다) */
const BAY = 3;
const PX_BAY = 8;

/** 결정적인 0~1 난수 (같은 칸은 늘 같은 값) */
const hash = (a:number, b:number, s:number) => {
  let h = (a * 374761393 + b * 668265263 + s * 2147483647) | 0; // eslint-disable-line no-bitwise
  h = Math.imul(h ^ (h >>> 13), 1274126177); // eslint-disable-line no-bitwise
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296; // eslint-disable-line no-bitwise
};

/** 무늬 한 벌: 낮 색(map)·밤 빛(emissiveMap) */
interface Facade {
  day: THREE.Texture; night: THREE.Texture;
}

/** 캔버스 → 도트 텍스처 (가까이는 도트, 멀면 밉맵 평균 색) */
function pixelTexture(c:HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const canvas = (w:number, h:number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
};

/**
 * 63빌딩 (사진: 45도·정면·측면·로비·야경):
 * - 금색 반사 유리 통창, 가는 짙은 줄눈의 거의 정사각 격자 — 유리마다 하늘·구름이 비쳐 밝기가 조금씩 다르고, 위로 갈수록 하늘빛
 * - 넓은 앞뒤 면은 매끈하게 이어진 유리, 짙은 기계층 띠는 좁은 옆면에만 (중간·위쪽)
 * - 꼭대기는 짙은 왕관 띠 (그 아래 가는 빛 줄), 아래는 짙은 차양 기단과 유리문 로비
 * - 좁은 옆면: 가운데 은청색 유리 띠 + 양옆 짙은 세로 홈 (지도 다각형의 짧은 꺾임 구간)
 * - 밤: 불 켜진 층은 그 층의 30% 이상이 이어서 켜진 가로 빛줄로, 옆면 가운데 띠는 주황빛 세로줄, 모서리·안테나 붉은 항공등
 */
const FLOORS_63 = 63;
/** 한 층 = 텍스처 4도트 (유리 3 + 줄눈 1) */
const PX_FLOOR = 4;
const BANDS_63 = [ 22, 44 ];
/** 밤에 불이 켜진 층 비율 (켜진 층은 둘레의 30~100%가 이어서 켜진다) */
const LIT_FLOORS = 0.22;

type Kind63 = 'front' | 'side' | 'strip';

function paint63(kind:Kind63, bays:number):Facade {
  const W = bays * PX_BAY;
  const H = FLOORS_63 * PX_FLOOR;
  const d = canvas(W, H);
  const n = canvas(W, H);
  n.g.fillStyle = '#000000';
  n.g.fillRect(0, 0, W, H);
  const col = new THREE.Color();
  const salt = { front: 1, side: 2, strip: 3 }[kind];
  // 캔버스 위쪽 = 건물 꼭대기 (v = 1)
  for (let floor = 0; floor < FLOORS_63; floor++) {
    const y = H - (floor + 1) * PX_FLOOR;
    const up = floor / FLOORS_63;
    const crown = floor >= FLOORS_63 - 2;
    const band = kind === 'side' && BANDS_63.includes(floor);
    const lobby = floor < 2 && kind !== 'strip';
    if (crown || band || lobby) {
      // 짙은 띠: 왕관은 맨 위 한 줄 밝게, 기계층은 그릴(가로줄), 로비는 차양 아래 유리문
      d.g.fillStyle = crown ? '#34322f' : '#2c2b2a';
      d.g.fillRect(0, y, W, PX_FLOOR);
      if (crown && floor === FLOORS_63 - 1) {
        d.g.fillStyle = '#8c8577';
        d.g.fillRect(0, y, W, 1);
      }
      if (band) {
        d.g.fillStyle = '#4a4741';
        d.g.fillRect(0, y + 1, W, 1);
        d.g.fillRect(0, y + 3, W, 1);
      }
      if (lobby && floor === 0) {
        for (let px = 0; px < W; px += 4) {
          d.g.fillStyle = '#6f7d88';
          d.g.fillRect(px + 1, y + 1, 2, 3);
          // 밤: 로비 유리문은 늘 켜져 있다
          n.g.fillStyle = '#c9b48a';
          n.g.fillRect(px + 1, y + 1, 2, 3);
        }
      }
    } else {
      for (let px = 0; px < W; px += 4) {
        // 유리 한 판: 금색(아래) → 위로 갈수록 하늘빛이 섞인 밝은 금색, 판마다 반사 밝기 조금씩
        const k = hash(floor, px, salt);
        if (kind === 'strip') col.setRGB(0.66 + 0.08 * up, 0.76 + 0.08 * up, 0.86 + 0.06 * up);
        else col.setRGB(0.9 + 0.06 * up, 0.74 + 0.1 * up, 0.44 + 0.2 * up);
        col.multiplyScalar(0.86 + 0.24 * k);
        d.g.fillStyle = `#${col.getHexString()}`;
        d.g.fillRect(px, y, 4, PX_FLOOR);
        // 줄눈: 판 아래 1도트·오른쪽 1도트 (짙은 금속)
        d.g.fillStyle = kind === 'strip' ? '#47505a' : '#4e4134';
        d.g.fillRect(px, y + PX_FLOOR - 1, 4, 1);
        d.g.fillRect(px + 3, y, 1, PX_FLOOR);
      }
      if (kind === 'strip') {
        // 밤: 옆면 가운데 띠는 위아래로 이어진 주황빛
        n.g.fillStyle = '#ff9a3a';
        n.g.fillRect(0, y, W, PX_FLOOR - 1);
      } else {
        // 밤: 불 켜진 층 — 사무실은 한 구역을 켜면 그 층의 30% 이상이 이어서 켜진다.
        // 켤 층·켜진 범위는 무늬와 상관없이 층마다 하나로 정해 모서리를 돌아도 이어진다 (둘레 전체가 텍스처 한 장)
        if (hash(floor, 0, 40) < LIT_FLOORS) {
          const span = Math.round(W * (0.3 + 0.7 * hash(floor, 1, 41)));
          const start = Math.floor((W / 4) * hash(floor, 2, 42)) * 4;
          const warm = 0.78 + 0.22 * hash(floor, 3, 43);
          n.g.fillStyle = `rgb(${Math.round(255 * warm)}, ${Math.round(225 * warm)}, ${Math.round(160 * warm)})`;
          // 끝이 넘치면 앞으로 돌아온다 (둘레를 한 바퀴)
          for (let o = 0; o < span; o += 4) {
            const x = (start + o) % W;
            // 켜진 구역 안에서도 가끔 꺼진 칸 (10%)
            if (hash(floor, x, 44) > 0.1) n.g.fillRect(x, y + 1, 4, 1);
          }
        }
      }
    }
    // 왕관 바로 아래 가는 빛 줄 (밤)
    if (floor === FLOORS_63 - 3) {
      n.g.fillStyle = '#b9d4ff';
      n.g.fillRect(0, y, W, 1);
    }
  }
  return { day: pixelTexture(d.c), night: pixelTexture(n.c) };
}

/** 벽 구간 무늬: 무늬 번호 (-1 = 짙은 홈, 무늬 없음) */
interface Landmark {
  name: string;
  /** 무늬들 (bays: 건물 둘레의 칸 수 — 둘레 전체를 한 장으로) */
  facades: (bays:number) => Facade[];
  /** 구간마다 쓸 무늬 번호 (len: 구간 길이, i: 구간 번호, lens: 모든 구간 길이) */
  pick: (len:number, i:number, lens:number[]) => number;
  /** 홈 색 */
  groove: string;
  /** 지붕 위·모서리 덧붙임 (안 막는 작은 것만 — 안테나·항공등 등) */
  extras?: (ring:{ x: number; z: number; }[], cx:number, cz:number, h:number) => THREE.Object3D[];
  /**
   * 블렌더 외형 (.glb, scripts/blender): 있으면 불러오는 대로 위 도트 외벽·덧붙임을 치우고 갈아 끼운다 (실내·판정은 원래대로).
   * 모델은 바닥 다각형 점들의 평균이 원점, 방향은 지도와 같다. 옥상 설비·난간 판정은 yeouido-sim landmark-boxes
   */
  model?: string;
}

const LANDMARKS:Landmark[] = [
  {
    name: '63빌딩',
    model: '/models/lab/63-building.glb',
    facades: (bays) => [ paint63('front', bays), paint63('side', bays), paint63('strip', bays) ],
    // 넓은 앞뒤 면(30m 이상)은 매끈한 유리, 끝면의 짧은 꺾임(2.5m 미만)은 짙은 홈, 홈 사이 5~7m는 은청색 띠, 나머지 옆면은 기계층 띠가 있는 금색
    pick: (len, i, lens) => {
      if (len < 2.5) return -1;
      if (len >= 30) return 0;
      const n = lens.length;
      const near = (d:number) => lens[(i + d + n) % n] < 2.5;
      if (len >= 4.5 && len <= 7 && near(-1) && near(1)) return 2;
      return 1;
    },
    groove: '#2b2926',
    extras: (ring, cx, cz, h) => {
      const group = new THREE.Group();
      // 꼭대기 안테나: 빨강·흰 줄무늬 철탑, 끝에 붉은 항공등 (작아서 지나간다 — 판정 없음)
      const red = new THREE.MeshLambertMaterial({ color: '#d9483b' });
      const white = new THREE.MeshLambertMaterial({ color: '#f4f4f8' });
      for (let k = 0; k < 8; k++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.9 - k * 0.07, 2.2, 0.9 - k * 0.07), k % 2 ? white : red);
        seg.position.set(cx, h + 1.1 + k * 2.2, cz);
        seg.castShadow = true;
        group.add(seg);
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 6), new THREE.MeshLambertMaterial({ color: '#4a4741' }));
      base.position.set(cx, h + 0.6, cz);
      group.add(base);
      const lamp = new THREE.MeshBasicMaterial({ color: '#ff3a2a' });
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), lamp);
      tip.position.set(cx, h + 18.4, cz);
      group.add(tip);
      // 모서리 항공등: 바닥 다각형의 가장 바깥 네 점, 세 높이에 (벽에서 살짝 밖으로)
      const far = [ ...ring ].sort((a, b) => Math.hypot(b.x - cx, b.z - cz) - Math.hypot(a.x - cx, a.z - cz)).slice(0, 4);
      far.forEach((q) => [ 0.35, 0.65, 0.98 ].forEach((t) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), lamp);
        const dl = Math.hypot(q.x - cx, q.z - cz) || 1;
        m.position.set(q.x + ((q.x - cx) / dl) * 0.3, h * t, q.z + ((q.z - cz) / dl) * 0.3);
        group.add(m);
      }));
      return [ group ];
    },
  },
];

/** 밤 빛을 켤 재질들 (도트 외벽 Lambert, 블렌더 외형 Standard) */
const nightMats:(THREE.MeshLambertMaterial | THREE.MeshStandardMaterial)[] = [];
let nightNow = 0;

/** 밤 정도(0 낮 ~ 1 밤)만큼 창 불빛을 켠다 (낮밤이 바뀔 때) */
export function setLandmarkNight(k:number) {
  nightNow = k;
  nightMats.forEach((m) => {
    m.emissiveIntensity = k;
  });
}

/** 반사 유리가 비칠 하늘 (위 파랑 → 지평선 밝게, 아래 밝은 땅) — 모델 재질에만 쓴다 */
export function landmarkEnvironment(renderer:THREE.WebGLRenderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const sky = new THREE.Scene();
  const geo = new THREE.SphereGeometry(100, 32, 16);
  const pos = geo.attributes.position;
  const cols:number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 100;
    if (y > 0) c.set('#ffffff').lerp(new THREE.Color('#5b8fd6'), Math.min(1, y * 1.6));
    else c.set('#d8dccf').lerp(new THREE.Color('#9a9d8f'), Math.min(1, -y * 3));
    cols.push(c.r * 1.6, c.g * 1.6, c.b * 1.6);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  sky.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const env = pmrem.fromScene(sky, 0.02).texture;
  geo.dispose();
  pmrem.dispose();
  return env;
}

/** 블렌더 외형이 있는 건물 번호 (지도 지붕을 그리지 않는다 — 모델에 지붕이 있어 겹치면 깨진다) */
export function landmarkModelIndices(data:WorldData) {
  const names = new Set(LANDMARKS.filter((l) => l.model).map((l) => l.name));
  return new Set(Object.entries(data.buildingNames).filter(([ , n ]) => names.has(n)).map(([ i ]) => Number(i)));
}

/** 블렌더 외형 하나 손질: 건물 번호(실내 자르기·문 구멍)·같은 셰이더·그림자·도트 텍스처·밤 불빛 */
function prepareModel(root:THREE.Object3D, bid:number) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    const n = m.geometry.attributes.position.count;
    m.geometry.setAttribute('bid', new THREE.Float32BufferAttribute(new Float32Array(n).fill(bid), 1));
    const mat = m.material as THREE.MeshStandardMaterial;
    [ mat.map, mat.emissiveMap ].forEach((t) => {
      if (!t) return;
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 8;
      t.needsUpdate = true;
    });
    // 밤 불빛: glTF에는 텍스처만 실려 있다 (블렌더에선 꺼 둠) — 밤 정도만큼 켠다. 왕관 아래 빛 줄(색만 있는 것)도 밤에만
    if (mat.emissiveMap || mat.emissive.getHex() !== 0) {
      if (mat.emissiveMap) mat.emissive.set('#ffffff');
      mat.emissiveIntensity = nightNow;
      nightMats.push(mat);
    }
    seeThrough(mat);
  });
}

/** 이 건물 번호들은 일반 벽 대신 랜드마크 벽으로 (지붕은 일반 그대로) */
export function landmarkIndices(data:WorldData) {
  const names = new Set(LANDMARKS.map((l) => l.name));
  return new Set(Object.entries(data.buildingNames).filter(([ , n ]) => names.has(n)).map(([ i ]) => Number(i)));
}

/** 랜드마크 벽·덧붙임 메시 */
export function buildLandmarks(data:WorldData):THREE.Object3D[] {
  const out:THREE.Object3D[] = [];
  nightMats.length = 0;
  const byName = new Map(Object.entries(data.buildingNames).map(([ i, n ]) => [ n, Number(i) ]));
  LANDMARKS.forEach((lm) => {
    const bi = byName.get(lm.name);
    if (bi === undefined) return;
    const row = data.buildings[bi];
    const h = row[0];
    const ring = toPoints(row, 4);
    if (ring.length < 3) return;
    const lens = ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length];
      return Math.hypot(b.x - a.x, b.z - a.z);
    });
    const perimeter = lens.reduce((t, l) => t + l, 0);
    const bays = Math.ceil(perimeter / BAY);
    const facades = lm.facades(bays);
    // 이 랜드마크의 도트 외벽·덧붙임 (블렌더 외형을 불러오면 치운다)
    const mine:THREE.Object3D[] = [];
    // 무늬마다 한 덩어리 (+ 홈)
    const parts = [ ...facades.map(() => ({ pos: [] as number[], nor: [] as number[], uv: [] as number[] })), { pos: [] as number[], nor: [] as number[], uv: [] as number[] }];
    // 바깥쪽 판별: 구간 가운데에서 살짝 나간 점이 건물 안이면 반대쪽 (일반 벽과 같은 방법)
    const inside = (x:number, z:number) => {
      let hit = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const pi = ring[i];
        const pj = ring[j];
        if ((pi.z > z) !== (pj.z > z) && x < ((pj.x - pi.x) * (z - pi.z)) / (pj.z - pi.z) + pi.x) hit = !hit;
      }
      return hit;
    };
    let u = 0;
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const len = lens[i];
      if (len < 0.01) return;
      let nx = (b.z - a.z) / len;
      let nz = -(b.x - a.x) / len;
      if (inside((a.x + b.x) / 2 + nx * 0.05, (a.z + b.z) / 2 + nz * 0.05)) {
        nx = -nx;
        nz = -nz;
      }
      const style = lm.pick(len, i, lens);
      const part = parts[style < 0 ? parts.length - 1 : style];
      // 둘레 전체가 텍스처 한 장 (0~1)
      const u0 = u / (bays * BAY);
      const u1 = (u + len) / (bays * BAY);
      const sameSide = nx * -(b.z - a.z) + nz * (b.x - a.x) > 0;
      const quad:[typeof a, number, number, number][] = sameSide
        ? [[ a, 0, u0, 0 ], [ b, 0, u1, 0 ], [ b, h, u1, 1 ], [ a, 0, u0, 0 ], [ b, h, u1, 1 ], [ a, h, u0, 1 ]]
        : [[ a, 0, u0, 0 ], [ b, h, u1, 1 ], [ b, 0, u1, 0 ], [ a, 0, u0, 0 ], [ a, h, u0, 1 ], [ b, h, u1, 1 ]];
      quad.forEach(([ p, y, uu, vv ]) => {
        part.pos.push(p.x, y, p.z);
        part.nor.push(nx, 0, nz);
        part.uv.push(uu, vv);
      });
      u += len;
    });
    parts.forEach((part, k) => {
      if (!part.pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(part.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(part.uv, 2));
      // 실내에 들어갔을 때 이 건물만 층 위를 자르고 문을 뚫는 데 쓰는 건물 번호 (일반 벽과 같게)
      geo.setAttribute('bid', new THREE.Float32BufferAttribute(new Float32Array(part.pos.length / 3).fill(bi + 1), 1));
      const groove = k === parts.length - 1;
      let mat:THREE.MeshLambertMaterial;
      if (groove) mat = new THREE.MeshLambertMaterial({ color: lm.groove });
      else {
        mat = new THREE.MeshLambertMaterial({ map: facades[k].day, emissive: '#ffffff', emissiveMap: facades[k].night, emissiveIntensity: 0 });
        nightMats.push(mat);
      }
      const mesh = new THREE.Mesh(geo, seeThrough(mat));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `landmark ${lm.name}`;
      mine.push(mesh);
    });
    const cx = ring.reduce((t, q) => t + q.x, 0) / ring.length;
    const cz = ring.reduce((t, q) => t + q.z, 0) / ring.length;
    if (lm.extras) mine.push(...lm.extras(ring, cx, cz, h));
    out.push(...mine);
    if (lm.model) {
      new GLTFLoader().load(lm.model, (gltf) => {
        const parent = mine[0]?.parent;
        if (!parent) return;
        mine.forEach((o) => parent.remove(o));
        gltf.scene.position.set(cx, 0, cz);
        gltf.scene.name = `landmark model ${lm.name}`;
        prepareModel(gltf.scene, bi + 1);
        parent.add(gltf.scene);
      });
    }
  });
  return out;
}