import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { PropType } from './plan';

/** 색 입힌 상자 하나 (x=가로, y=높이, z=깊이, 바닥 기준 위치) */
function box(w:number, h:number, d:number, x:number, y:number, z:number, color:string) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y + h / 2, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cols.set([ c.r, c.g, c.b ], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.deleteAttribute('uv');
  return g;
}

function cyl(r:number, h:number, x:number, y:number, z:number, color:string, seg = 6) {
  const g = new THREE.CylinderGeometry(r, r, h, seg).toNonIndexed();
  g.translate(x, y + h / 2, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cols.set([ c.r, c.g, c.b ], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.deleteAttribute('uv');
  return g;
}

const WOOD = '#cdb48c';
const METAL = '#8d939b';
const DARK = '#2b2f36';
const FABRIC = '#3f5272';

/**
 * 가구 모양 (지역 좌표: 앞 = +z 쪽에 사람이 앉거나 선다)
 * 크기는 실제 사무 가구 치수 기준
 */
const BUILDERS:Record<PropType, () => THREE.BufferGeometry[]> = {
  // 1.6×0.8m 책상 + 모니터(뒤쪽, 앞을 봄)
  desk: () => [
    box(1.6, 0.04, 0.8, 0, 0.7, 0, WOOD),
    box(0.04, 0.7, 0.7, -0.76, 0, 0, METAL),
    box(0.04, 0.7, 0.7, 0.76, 0, 0, METAL),
    box(1.6, 0.35, 0.02, 0, 0.74, -0.39, '#b9c2c9'), // 마주 보는 책상 사이 가림판
    box(0.56, 0.34, 0.03, 0, 0.86, -0.22, DARK),
    box(0.06, 0.12, 0.06, 0, 0.74, -0.22, DARK),
  ],
  chair: () => [
    cyl(0.05, 0.42, 0, 0, 0, DARK, 5),
    box(0.5, 0.07, 0.48, 0, 0.42, 0, FABRIC),
    box(0.48, 0.5, 0.06, 0, 0.5, 0.24, FABRIC),
    box(0.56, 0.04, 0.56, 0, 0.02, 0, DARK),
  ],
  // 3.0×1.2m 회의 탁자 (긴 쪽이 x)
  meetTable: () => [
    box(3.0, 0.05, 1.2, 0, 0.7, 0, '#e6e1d6'),
    box(0.12, 0.7, 0.6, -1.1, 0, 0, METAL),
    box(0.12, 0.7, 0.6, 1.1, 0, 0, METAL),
  ],
  // 2인 소파 (등받이가 -z, 앉는 쪽 +z)
  sofa: () => [
    box(2.0, 0.42, 0.85, 0, 0, 0, '#5d6f8a'),
    box(2.0, 0.45, 0.2, 0, 0.42, -0.33, '#55657e'),
    box(0.18, 0.25, 0.85, -0.91, 0.42, 0, '#55657e'),
    box(0.18, 0.25, 0.85, 0.91, 0.42, 0, '#55657e'),
  ],
  coffeeTable: () => [ box(1.2, 0.05, 0.6, 0, 0.4, 0, WOOD), box(1.0, 0.4, 0.04, 0, 0, 0, METAL) ],
  // 4.6m 안내 데스크 (손님 쪽 +z)
  reception: () => [
    box(4.6, 1.05, 0.5, 0, 0, 0.2, '#f1eee7'),
    box(4.6, 0.05, 0.62, 0, 1.05, 0.2, '#8a6a4a'),
    box(4.4, 0.75, 0.55, 0, 0, -0.35, '#d9d2c4'),
    box(0.56, 0.34, 0.03, -1, 0.8, -0.35, DARK),
    box(0.56, 0.34, 0.03, 1, 0.8, -0.35, DARK),
  ],
  // 탕비실 싱크대 2.4m (등 쪽 -z가 벽)
  counter: () => [
    box(2.4, 0.86, 0.6, 0, 0, 0, '#e4e0d8'),
    box(2.4, 0.04, 0.62, 0, 0.86, 0, '#6f7378'),
    box(0.5, 0.03, 0.36, -0.5, 0.88, 0.02, '#9aa4ad'),
    box(0.04, 0.22, 0.04, -0.5, 0.9, -0.2, '#c9ced3'),
    box(0.35, 0.3, 0.3, 0.7, 0.9, -0.05, DARK), // 커피 머신
  ],
  fridge: () => [ box(0.7, 1.8, 0.68, 0, 0, 0, '#d9dde0'), box(0.04, 0.5, 0.04, 0.28, 1.0, 0.35, '#8d939b') ],
  plant: () => {
    const leaf = new THREE.IcosahedronGeometry(0.42, 0).toNonIndexed();
    leaf.translate(0, 1.0, 0);
    const c = new THREE.Color('#4c9a52');
    const cols = new Float32Array(leaf.attributes.position.count * 3);
    for (let i = 0; i < cols.length; i += 3) cols.set([ c.r, c.g, c.b ], i);
    leaf.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    leaf.deleteAttribute('uv');
    return [ cyl(0.24, 0.5, 0, 0, 0, '#e9e4da', 7), leaf ];
  },
};

const cache = new Map<PropType, THREE.BufferGeometry>();

export function propGeometry(type:PropType) {
  let g = cache.get(type);
  if (!g) {
    g = mergeGeometries(BUILDERS[type]());
    cache.set(type, g);
  }
  return g;
}