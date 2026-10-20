/* eslint-disable no-continue, no-restricted-syntax -- 도형 생성 반복문 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { seeThrough } from './see-through';

import { FlatRing, toPoints, WorldData } from '../data/world-data';

interface P {
  x: number; z: number;
}

// 바닥 겹침 순서 — 정사영 카메라라 몇 cm 차이로 충분하다
const Y = { ground: 0, water: 0.02, area: 0.04, bridge: 0.06, path: 0.08, rail: 0.09, road: 0.1, mark: 0.12 };

const AREA_COLORS:Record<string, string> = {
  water: '#4f8fcf',
  grass: '#8cc56b',
  forest: '#77b562',
  pitch: '#5fae6a',
  pave: '#b9b8b3',
  plaza: '#e3ddd0',
  sand: '#e8d7a5',
  construction: '#c9a77a',
  bridge: '#a3a6ab',
};
const AREA_Y:Record<string, number> = { water: Y.water, bridge: Y.bridge };

/** 바닥 띠(도로·보도) — 꺾이는 점은 마이터로 이어 붙인다 */
function ribbon(pts:P[], width:number, y:number, offset = 0):THREE.BufferGeometry | null {
  if (pts.length < 2) return null;
  const pos:number[] = [];
  const left:P[] = [];
  const right:P[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const segs:P[] = [];
    if (i > 0) segs.push(norm(pts[i - 1], pts[i]));
    if (i < pts.length - 1) segs.push(norm(pts[i], pts[i + 1]));
    let nx = segs.reduce((s, n) => s + n.x, 0);
    let nz = segs.reduce((s, n) => s + n.z, 0);
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    const ref = norm(a, b);
    const k = 1 / Math.max(0.35, nx * ref.x + nz * ref.z);
    const p = pts[i];
    const o = offset * k;
    left.push({ x: p.x + nx * (o + (width / 2) * k), z: p.z + nz * (o + (width / 2) * k) });
    right.push({ x: p.x + nx * (o - (width / 2) * k), z: p.z + nz * (o - (width / 2) * k) });
  }
  for (let i = 1; i < pts.length; i++) {
    const l0 = left[i - 1];
    const r0 = right[i - 1];
    const l1 = left[i];
    const r1 = right[i];
    // 위(+y)를 보도록 감는 순서
    pos.push(l0.x, y, l0.z, r0.x, y, r0.z, l1.x, y, l1.z);
    pos.push(r0.x, y, r0.z, r1.x, y, r1.z, l1.x, y, l1.z);
  }
  return flatGeometry(pos);
}

function norm(a:P, b:P):P {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: -dz / len, z: dx / len };
}

function flatGeometry(pos:number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const normals = new Float32Array(pos.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  // 감는 방향이 섞여도 위를 보게 법선은 고정, 면은 양면으로 그린다
  return g;
}

/** 폴리라인을 따라 점선 조각들 */
function dashes(pts:P[], offset:number, width:number, y:number, on:number, off:number):THREE.BufferGeometry[] {
  const out:THREE.BufferGeometry[] = [];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = norm(a, b);
    let s = carry;
    while (s < len) {
      const e = Math.min(len, s + on);
      const p0 = { x: a.x + ((b.x - a.x) * s) / len + n.x * offset, z: a.z + ((b.z - a.z) * s) / len + n.z * offset };
      const p1 = { x: a.x + ((b.x - a.x) * e) / len + n.x * offset, z: a.z + ((b.z - a.z) * e) / len + n.z * offset };
      const g = ribbon([ p0, p1 ], width, y);
      if (g) out.push(g);
      s += on + off;
    }
    carry = s - len;
  }
  return out;
}

/** [바깥, 구멍...] 링 → 바닥 면 */
function polygonGeometry(poly:FlatRing[], y:number):THREE.BufferGeometry {
  const toV = (ring:FlatRing) => toPoints(ring).map((p) => new THREE.Vector2(p.x, -p.z));
  const shape = new THREE.Shape(toV(poly[0]));
  poly.slice(1).forEach((h) => shape.holes.push(new THREE.Path(toV(h))));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g.toNonIndexed();
}

function mergedMesh(geos:(THREE.BufferGeometry | null)[], material:THREE.Material, name:string) {
  const list = geos.filter((g):g is THREE.BufferGeometry => !!g).map((g) => {
    g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  });
  if (!list.length) return null;
  const mesh = new THREE.Mesh(mergeGeometries(list), material);
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}

const flatMat = (color:string) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });

function pointInRing(x:number, z:number, r:P[]) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i].z > z) !== (r[j].z > z) && x < ((r[j].x - r[i].x) * (z - r[i].z)) / (r[j].z - r[i].z) + r[i].x) inside = !inside;
  }
  return inside;
}

/** 창문 무늬 — 한 칸 = 폭 3m × 한 층 3.4m. 벽색은 정점색으로 곱해진다 */
function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 8, 8);
  g.fillStyle = '#7f95ad';
  g.fillRect(1, 2, 6, 4);
  g.fillStyle = '#b9c9da';
  g.fillRect(1, 2, 6, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const BAY = 3;
const FLOOR = 3.4;

function buildBuildings(data:WorldData) {
  const wallPos:number[] = [];
  const wallNor:number[] = [];
  const wallUv:number[] = [];
  const wallCol:number[] = [];
  // 건물 번호+1 (0은 건물 아님) — 실내에 들어갔을 때 그 건물만 층 위를 자르고 문을 뚫는 데 쓴다
  const wallBid:number[] = [];
  const roofGeos:THREE.BufferGeometry[] = [];
  const color = new THREE.Color();

  let bi = -1;
  for (const row of data.buildings) {
    bi++;
    const [ h, wallHex, roofHex ] = row;
    const ring = toPoints(row, 4);
    if (ring.length < 3) continue;
    color.setHex(wallHex);
    let u = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.01) continue;
      // 바깥쪽 법선 찾기: 한쪽으로 살짝 나간 점이 건물 안이면 반대쪽
      let nx = (b.z - a.z) / len;
      let nz = -(b.x - a.x) / len;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      if (pointInRing(mx + nx * 0.05, mz + nz * 0.05, ring)) {
        nx = -nx;
        nz = -nz;
      }
      const u0 = u / BAY;
      const u1 = (u + len) / BAY;
      const v1 = h / FLOOR;
      // 법선 방향에 맞게 감기: (b-a)×up = (-dz, dx) 와 같은 쪽이면 a,b 순서 그대로
      const sameSide = nx * -(b.z - a.z) + nz * (b.x - a.x) > 0;
      const quad = sameSide
        ? [[ a, 0, u0, 0 ], [ b, 0, u1, 0 ], [ b, h, u1, v1 ], [ a, 0, u0, 0 ], [ b, h, u1, v1 ], [ a, h, u0, v1 ]]
        : [[ a, 0, u0, 0 ], [ b, h, u1, v1 ], [ b, 0, u1, 0 ], [ a, 0, u0, 0 ], [ a, h, u0, v1 ], [ b, h, u1, v1 ]];
      for (const [ p, y, uu, vv ] of quad as [P, number, number, number][]) {
        wallPos.push(p.x, y, p.z);
        wallNor.push(nx, 0, nz);
        wallUv.push(uu, vv);
        wallCol.push(color.r, color.g, color.b);
        wallBid.push(bi + 1);
      }
      u += len;
    }
    try {
      const roof = polygonGeometry([ row.slice(4) ], h);
      const n = roof.attributes.position.count;
      const rc = new THREE.Color().setHex(roofHex);
      const cols = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) cols.set([ rc.r, rc.g, rc.b ], i * 3);
      roof.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      roof.deleteAttribute('uv');
      roof.setAttribute('bid', new THREE.BufferAttribute(new Float32Array(n).fill(bi + 1), 1));
      roofGeos.push(roof);
    } catch {
      // 자기 교차 등으로 지붕 삼각분할이 실패하면 지붕만 생략
    }
  }

  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
  walls.setAttribute('normal', new THREE.Float32BufferAttribute(wallNor, 3));
  walls.setAttribute('uv', new THREE.Float32BufferAttribute(wallUv, 2));
  walls.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3));
  walls.setAttribute('bid', new THREE.Float32BufferAttribute(wallBid, 1));
  const wallMesh = new THREE.Mesh(walls, seeThrough(new THREE.MeshLambertMaterial({ vertexColors: true, map: windowTexture() })));
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  wallMesh.name = 'walls';

  const roofMesh = new THREE.Mesh(mergeGeometries(roofGeos), seeThrough(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  roofMesh.name = 'roofs';
  return [ wallMesh, roofMesh ];
}

function buildTrees(data:WorldData) {
  const n = data.trees.length / 3;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 2.2, 5).translate(0, 1.1, 0), seeThrough(new THREE.MeshLambertMaterial({ color: '#7a5636' })), n);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.5, 0).translate(0, 3.2, 0), seeThrough(new THREE.MeshLambertMaterial({ color: '#ffffff' })), n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const greens = [ '#4f9a4f', '#5aa856', '#438a45', '#6bb35e', '#3f7f43' ];
  for (let i = 0; i < n; i++) {
    const x = data.trees[i * 3];
    const z = data.trees[i * 3 + 1];
    const k = data.trees[i * 3 + 2] / 10;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.399) % (Math.PI * 2));
    p.set(x, 0, z);
    s.set(k, k, k);
    m.compose(p, q, s);
    trunk.setMatrixAt(i, m);
    crown.setMatrixAt(i, m);
    crown.setColorAt(i, c.set(greens[i % greens.length]));
  }
  [ trunk, crown ].forEach((t) => {
    t.castShadow = true;
    t.receiveShadow = true;
  });
  return [ trunk, crown ];
}

export function buildCity(data:WorldData):THREE.Group {
  const city = new THREE.Group();

  // 바닥
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(data.half.w * 2 + 400, data.half.d * 2 + 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#d4cfc1' }));
  ground.receiveShadow = true;
  city.add(ground);

  // 면
  Object.entries(data.areas).forEach(([ kind, polys ]) => {
    if (kind === 'waterLine') return;
    const geos = (polys as FlatRing[][]).map((poly) => {
      try {
        return polygonGeometry(poly, AREA_Y[kind] ?? Y.area);
      } catch {
        return null;
      }
    });
    const mesh = mergedMesh(geos, flatMat(AREA_COLORS[kind] ?? '#cccccc'), kind);
    if (mesh) city.add(mesh);
  });
  const streams = (data.areas.waterLine ?? []).map((row) => ribbon(toPoints(row, 1), row[0], Y.water));
  const streamMesh = mergedMesh(streams, flatMat(AREA_COLORS.water), 'streams');
  if (streamMesh) city.add(streamMesh);

  // 보행로
  const PATH_COLORS = [ '#e6dcc4', '#c98a6c', '#e3ddd0' ];
  [ 0, 1, 2 ].forEach((kind) => {
    const geos = data.paths.filter((r) => r[0] === kind).map((r) => ribbon(toPoints(r, 3), r[1], Y.path + (r[2] ? 0.04 : 0)));
    const mesh = mergedMesh(geos, flatMat(PATH_COLORS[kind]), `paths-${kind}`);
    if (mesh) city.add(mesh);
  });

  // 철도
  const railMesh = mergedMesh(data.rails.map((r) => ribbon(toPoints(r, 1), 2.6, Y.rail)), flatMat('#6b5f55'), 'rails');
  if (railMesh) city.add(railMesh);

  // 도로 + 노면 표시
  const roadGeos:(THREE.BufferGeometry | null)[][] = [[], []];
  const yellow:THREE.BufferGeometry[] = [];
  const white:THREE.BufferGeometry[] = [];
  for (const r of data.roads) {
    const [ major, w, lanes, oneway, bridge ] = r;
    const pts = toPoints(r, 5);
    const y = Y.road + (bridge ? 0.05 : 0);
    roadGeos[major].push(ribbon(pts, w, y));
    if (!major) continue;
    // 가장자리 실선
    [ -1, 1 ].forEach((side) => {
      const g = ribbon(pts, 0.15, y + 0.02, side * (w / 2 - 0.4));
      if (g) white.push(g);
    });
    if (!oneway) {
      // 중앙 황색 복선
      [ -0.18, 0.18 ].forEach((o) => {
        const g = ribbon(pts, 0.15, y + 0.02, o);
        if (g) yellow.push(g);
      });
    }
    // 차선 점선
    const total = lanes || Math.max(2, Math.round((w - 1) / 3.3));
    const perSide = oneway ? total : Math.max(1, Math.floor(total / 2));
    const laneW = (oneway ? w - 1 : (w - 1) / 2) / perSide;
    for (let k = 1; k < perSide; k++) {
      const offs = oneway ? [ -((w - 1) / 2) + k * laneW ] : [ k * laneW, -k * laneW ];
      offs.forEach((o) => white.push(...dashes(pts, o, 0.15, y + 0.02, 3, 5)));
    }
  }
  [ '#7d8086', '#5d6168' ].forEach((color, major) => {
    const mesh = mergedMesh(roadGeos[major], flatMat(color), major ? 'roads-major' : 'roads-minor');
    if (mesh) city.add(mesh);
  });
  const whiteMesh = mergedMesh(white, flatMat('#f2f0e8'), 'marks-white');
  const yellowMesh = mergedMesh(yellow, flatMat('#f0c23a'), 'marks-yellow');
  if (whiteMesh) city.add(whiteMesh);
  if (yellowMesh) city.add(yellowMesh);

  city.add(...buildBuildings(data));
  city.add(...buildTrees(data));
  return city;
}