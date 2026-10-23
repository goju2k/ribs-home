/* eslint-disable no-console, no-continue, no-bitwise, no-restricted-syntax, no-nested-ternary -- 일회성 굽기 스크립트 */
// 여의도 OSM 데이터 → 3D용 벡터 묶음 굽기 (단위: 미터, x=동쪽, z=남쪽, 원점=영역 중앙)
//   node lib/modules/yeouido-3d-module/tools/bake-yeouido-3d.mjs
// 입력: yeouido-map-module/tools/.cache/osm.json (그쪽 bake-yeouido.mjs --fetch 로 받는 캐시를 같이 쓴다)
// 출력: src/lib/data/yeouido-3d.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '..', '..', 'yeouido-map-module', 'tools', '.cache', 'osm.json');
// 결과는 서버·클라이언트 공용 시뮬레이션 모듈에 둔다
const OUT = path.join(HERE, '..', '..', 'yeouido-sim', 'src', 'data', 'yeouido-3d.json');

const BBOX = { s: 37.515, w: 126.905, n: 37.538, e: 126.948 };
const LAT0 = (BBOX.s + BBOX.n) / 2;
const LNG0 = (BBOX.w + BBOX.e) / 2;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const HALF_W = ((BBOX.e - BBOX.w) * M_PER_DEG_LNG) / 2;
const HALF_D = ((BBOX.n - BBOX.s) * M_PER_DEG_LAT) / 2;

const r1 = (v) => Math.round(v * 10) / 10;
const project = (lat, lng) => ({ x: (lng - LNG0) * M_PER_DEG_LNG, z: (LAT0 - lat) * M_PER_DEG_LAT });
const geomToPts = (geom) => geom.map((g) => project(g.lat, g.lon));
const flat = (pts) => pts.flatMap((p) => [ r1(p.x), r1(p.z) ]);
const samePt = (a, b) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9;

// ---------------------------------------------------------------- 도형 유틸
function assembleRings(ways) {
  const pending = ways.map((w) => w.slice());
  const rings = [];
  while (pending.length) {
    let ring = pending.shift();
    let guard = 0;
    while (!samePt(ring[0], ring[ring.length - 1]) && guard++ < 10000) {
      const end = ring[ring.length - 1];
      const idx = pending.findIndex((w) => samePt(w[0], end) || samePt(w[w.length - 1], end));
      if (idx < 0) break;
      const [ w ] = pending.splice(idx, 1);
      ring = ring.concat(samePt(w[0], end) ? w.slice(1) : w.slice(0, -1).reverse());
    }
    rings.push(ring);
  }
  return rings;
}

function ringArea(r) {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j].x + r[i].x) * (r[j].z - r[i].z);
  return s / 2;
}

function inRing(p, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i].z > p.z) !== (r[j].z > p.z) && p.x < ((r[j].x - r[i].x) * (p.z - r[i].z)) / (r[j].z - r[i].z) + r[i].x) inside = !inside;
  }
  return inside;
}

/** 링 목록 → [바깥 링, ...구멍] 다각형 목록 (다른 링 몇 개 안에 들어가는지로 바깥/구멍 판정) */
function toPolygons(rings) {
  const rs = rings.filter((r) => r.length >= 4).map((r) => {
    const pts = r[0].x === r[r.length - 1].x && r[0].z === r[r.length - 1].z ? r.slice(0, -1) : r;
    return { pts, area: Math.abs(ringArea(pts)) };
  });
  rs.sort((a, b) => b.area - a.area);
  const polys = [];
  rs.forEach((r, i) => {
    const containers = rs.slice(0, i).filter((o) => inRing(r.pts[0], o.pts));
    if (containers.length % 2 === 0) polys.push({ outer: r, holes: [] });
    else {
      const parent = containers[containers.length - 1];
      const poly = polys.find((p) => p.outer === parent);
      if (poly) poly.holes.push(r);
    }
  });
  return polys.map((p) => [ p.outer.pts, ...p.holes.map((h) => h.pts) ]);
}

function ringsOf(el) {
  if (el.type === 'way') {
    if (!el.geometry || el.geometry.length < 4 || !samePt(el.geometry[0], el.geometry[el.geometry.length - 1])) return null;
    return [ geomToPts(el.geometry) ];
  }
  if (el.type === 'relation') {
    const ways = (el.members || []).filter((m) => m.type === 'way' && m.geometry && (m.role === 'outer' || m.role === 'inner' || m.role === '')).map((m) => m.geometry);
    if (!ways.length) return null;
    return assembleRings(ways).map(geomToPts);
  }
  return null;
}

const isUnderground = (t) => t.tunnel === 'yes' || t.tunnel === 'building_passage' || Number(t.layer) < 0 || t.location === 'underground' || t.covered === 'yes';

// ---------------------------------------------------------------- 1m 격자 (충돌·나무 배치용)
const GRID = 1;
const GW = Math.ceil((HALF_W * 2) / GRID);
const GH = Math.ceil((HALF_D * 2) / GRID);
const BLOCK = { NONE: 0, BUILDING: 1, WATER: 2 };
const block = new Uint8Array(GW * GH);
const busy = new Uint8Array(GW * GH); // 나무를 심으면 안 되는 곳(도로·보도·건물·물)
const toCell = (p) => ({ x: (p.x + HALF_W) / GRID, y: (p.z + HALF_D) / GRID });

function fillRings(rings, fn) {
  const cr = rings.map((r) => r.map(toCell));
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of cr) for (const p of r) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(GH - 1, Math.ceil(maxY)); y++) {
    const cy = y + 0.5;
    const xs = [];
    for (const r of cr) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[i];
        const b = r[j];
        if ((a.y > cy) !== (b.y > cy)) xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(GW - 1, Math.floor(xs[k + 1] - 0.5)); x++) fn(y * GW + x);
    }
  }
}

function strokeLine(pts, halfWidth, fn) {
  const cp = pts.map(toCell);
  const r = halfWidth / GRID;
  for (let k = 1; k < cp.length; k++) {
    const a = cp[k - 1];
    const b = cp[k];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5));
    for (let s = 0; s <= steps; s++) {
      const px = a.x + ((b.x - a.x) * s) / steps;
      const py = a.y + ((b.y - a.y) * s) / steps;
      for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++) {
        if (y < 0 || y >= GH) continue;
        for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++) {
          if (x < 0 || x >= GW) continue;
          if ((x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2 <= Math.max(r * r, 0.3)) fn(y * GW + x);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- 건물 색·높이 (2.5D 버전과 같은 규칙)
const hex = (c) => parseInt(c.slice(1), 16);
const OSM_COLORS = { white: '#f2f2ee', grey: '#a9adb3', gray: '#a9adb3', silver: '#c7ccd2', black: '#3d3f45', red: '#c4554a', brown: '#9a6b4a', beige: '#e3d6b8', blue: '#6f93c2', green: '#7fa38a', yellow: '#e8cf6a' };
const soften = (n) => {
  const c = [ (n >> 16) & 255, (n >> 8) & 255, n & 255 ].map((v) => Math.round(v * 0.5 + 175 * 0.5));
  return (c[0] << 16) | (c[1] << 8) | c[2];
};
const parseColor = (c) => {
  if (!c) return null;
  if (/^#[0-9a-f]{6}$/i.test(c)) return soften(hex(c));
  return OSM_COLORS[c.toLowerCase()] ? hex(OSM_COLORS[c.toLowerCase()]) : null;
};
const LANDMARK_COLORS = [
  [ /^63빌딩/, '#e0b04a', '#f0cc6a' ],
  [ /국회의사당$/, '#e9e4d6', '#7fa89a' ],
  [ /파크원 타워/, '#c9c6c0', '#b8473b' ],
  [ /IFC/, '#7fa3c7', '#9bb8d6' ],
  [ /Conrad/, '#8fa9c2', '#a9bdd0' ],
  [ /KBS/, '#d8d2c4', '#b9b3a6' ],
  [ /순복음/, '#e6e0d2', '#c9a46a' ],
];
const GLASS = [ '#7b9cc0', '#8fb0cf', '#6d8fb3', '#9ab7c9', '#8aa3b8', '#a7bccc' ];
const APART = [ '#ece6d6', '#e4dccb', '#efe9df', '#dcd5c8', '#e9e1cf' ];
const LOW = [ '#d9c9ae', '#c9b7a0', '#e5b8a3', '#d4c4b0', '#bfb3a3', '#e0d3bd' ];
const pick = (arr, seed) => hex(arr[Math.abs(seed) % arr.length]);

function buildingStyle(t, id, heightM) {
  const name = t.name || '';
  for (const [ re, wall, roof ] of LANDMARK_COLORS) if (re.test(name)) return { wall: hex(wall), roof: hex(roof) };
  let wall;
  if (t.building === 'apartments' || t.building === 'residential' || t['building:flats']) wall = pick(APART, id);
  else if (heightM >= 40) wall = pick(GLASS, id);
  else wall = pick(LOW, id);
  wall = parseColor(t['building:colour']) || wall;
  const lighter = [ (wall >> 16) & 255, (wall >> 8) & 255, wall & 255 ].map((v) => Math.min(255, Math.round(v * 1.08 + 6)));
  const roof = parseColor(t['roof:colour']) || ((lighter[0] << 16) | (lighter[1] << 8) | lighter[2]);
  return { wall, roof };
}

// OSM에 높이·층수가 없는 랜드마크 높이 (m, 사진으로 정함) — 없으면 9m로 너무 낮다
const HEIGHT_FIX = [
  // KBS 본관: 층고 높은 4층 + 1층 로비 (사진), 지붕면 높이 (처마는 난간 판정으로 그 위 1.2m)
  [ /^KBS 본관$/, 29 ],
];

function heightMeters(t) {
  for (const [ re, fix ] of HEIGHT_FIX) if (re.test(t.name || '')) return fix;
  const h = parseFloat(t.height);
  if (Number.isFinite(h) && h > 0) return h;
  const lv = parseFloat(t['building:levels']);
  if (Number.isFinite(lv) && lv > 0) return lv * 3.4;
  if (t.building === 'roof' || t.building === 'kiosk' || t.building === 'shed') return 4;
  return 9;
}

// 결정적 난수 (매번 같은 나무 배치)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- 굽기
const { elements } = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const tg = (el) => el.tags || {};

// 1) 면 (물·잔디·숲 등)
const AREA_KIND = (t) => {
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'basin' || t.landuse === 'reservoir') return 'water';
  if (t.landuse === 'forest' || t.natural === 'wood' || t.natural === 'scrub') return 'forest';
  if (t.leisure === 'pitch') return 'pitch';
  if (t.leisure === 'playground') return 'plaza';
  if (t.amenity === 'parking') return 'pave';
  if (t.natural === 'sand' || t.natural === 'beach') return 'sand';
  if (t.landuse === 'construction') return 'construction';
  if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass' || t.natural === 'grassland' || t.landuse === 'recreation_ground' || t.landuse === 'village_green' || t.landuse === 'meadow') return 'grass';
  if (t.man_made === 'bridge') return 'bridge';
  return null;
};
const areas = {};
const areaPolys = []; // 나무 심기용
for (const el of elements) {
  const t = tg(el);
  if (t.building) continue;
  const kind = AREA_KIND(t);
  if (!kind) continue;
  const rings = ringsOf(el);
  if (!rings) continue;
  for (const poly of toPolygons(rings)) {
    (areas[kind] ||= []).push(poly.map(flat));
    if (kind === 'water') fillRings(poly, (i) => { block[i] = BLOCK.WATER; busy[i] = 1; });
    if (kind === 'grass' || kind === 'forest') areaPolys.push({ kind, poly, isPark: t.leisure === 'park' });
  }
}
// 하천 선(샛강 상류 등)
for (const el of elements) {
  const t = tg(el);
  if (el.type !== 'way' || !t.waterway || isUnderground(t) || !(t.waterway === 'stream' || t.waterway === 'canal' || t.waterway === 'ditch')) continue;
  const pts = geomToPts(el.geometry);
  const w = t.waterway === 'canal' ? 4 : 6;
  (areas.waterLine ||= []).push([ w, ...flat(pts) ]);
  strokeLine(pts, w / 2, (i) => { block[i] = BLOCK.WATER; busy[i] = 1; });
}

// 2) 도로·보행로
const ROAD_W = {
  motorway: 26, trunk: 24, primary: 20, secondary: 15, tertiary: 11, busway: 8,
  motorway_link: 8, trunk_link: 8, primary_link: 8, secondary_link: 7, tertiary_link: 6,
  residential: 7, unclassified: 7, living_street: 6, service: 4.5,
};
const PATH_W = { footway: 2.5, path: 2, steps: 2.5, pedestrian: 6, cycleway: 2.5 };
const roads = [];
const paths = [];
const bridgeRoads = [];
for (const el of elements) {
  const t = tg(el);
  if (el.type !== 'way' || !t.highway || isUnderground(t) || t.area === 'yes') continue;
  const pts = geomToPts(el.geometry);
  const onBridge = !!(t.bridge && t.bridge !== 'no');
  if (PATH_W[t.highway]) {
    if (t.highway === 'pedestrian' && samePt(el.geometry[0], el.geometry[el.geometry.length - 1]) && el.geometry.length > 3) continue;
    const w = PATH_W[t.highway];
    paths.push([ t.highway === 'cycleway' ? 1 : t.highway === 'pedestrian' ? 2 : 0, w, onBridge ? 1 : 0, ...flat(pts) ]);
    // 보도는 다리가 아니어도 물 위로 그려지면 걸을 수 있게 (강변 산책로가 물 영역 가장자리에 걸친다 — 보이는데 막히지 않게)
    strokeLine(pts, w / 2, (i) => { busy[i] = 1; if (block[i] === BLOCK.WATER) block[i] = BLOCK.NONE; });
    strokeLine(pts, w / 2 + 0.5, (i) => { busy[i] = 1; if (onBridge && block[i] === BLOCK.WATER) block[i] = BLOCK.NONE; });
    continue;
  }
  const base = ROAD_W[t.highway];
  if (!base) continue;
  const lanes = parseInt(t.lanes, 10);
  const oneway = t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' || t.highway.endsWith('_link') || t.highway === 'motorway';
  const w = Number.isFinite(lanes) && lanes > 0 ? Math.max(lanes * 3.3 + (oneway ? 1 : 1.5), 3.5) : base;
  const major = base >= 15;
  // [등급(0=일반,1=간선), 폭, 차선 수(0=모름), 일방통행, 다리, x,z...]
  const row = [ major ? 1 : 0, r1(w), Number.isFinite(lanes) ? lanes : 0, oneway ? 1 : 0, onBridge ? 1 : 0, ...flat(pts) ];
  roads.push(row);
  if (onBridge) bridgeRoads.push(row);
  // 다리 위 도로는 그려진 폭(+0.5m)만 물에서 뺀다 — 더 넓히면 다리 옆 물 위를 걸어 다닌다 (나무 안 심는 자리는 그대로 +1.5m)
  strokeLine(pts, w / 2 + 1.5, (i) => { busy[i] = 1; });
  strokeLine(pts, w / 2 + 0.5, (i) => { if (onBridge && block[i] === BLOCK.WATER) block[i] = BLOCK.NONE; });
}
// 다리 상판(면)은 걸어서 건널 수 있게
for (const poly of areas.bridge || []) {
  const rings = poly.map((f) => { const pts = []; for (let i = 0; i < f.length; i += 2) pts.push({ x: f[i], z: f[i + 1] }); return pts; });
  fillRings(rings, (i) => { if (block[i] === BLOCK.WATER) block[i] = BLOCK.NONE; busy[i] = 1; });
}

// 3) 철도 (지상만)
const rails = [];
for (const el of elements) {
  const t = tg(el);
  if (el.type !== 'way' || !(t.railway === 'rail' || t.railway === 'subway' || t.railway === 'light_rail') || isUnderground(t)) continue;
  const pts = geomToPts(el.geometry);
  rails.push([ t.bridge && t.bridge !== 'no' ? 1 : 0, ...flat(pts) ]);
  strokeLine(pts, 2.5, (i) => { busy[i] = 1; });
}

// 4) 건물 (가장 큰 바깥 링만 — PoC)
const buildings = [];
// buildings와 같은 순서: [OSM 종류(0 way/1 relation), OSM id, 층수(모르면 0)] — 실내 생성에서 건물을 찾을 때 쓴다
const buildingMeta = [];
const buildingNames = {};
let maxH = 0;
for (const el of elements) {
  const t = tg(el);
  if (!t.building || t.building === 'construction' || isUnderground(t)) continue;
  const rings = ringsOf(el);
  if (!rings) continue;
  const polys = toPolygons(rings);
  if (!polys.length) continue;
  const outer = polys[0][0];
  if (Math.abs(ringArea(outer)) < 4) continue;
  const h = r1(heightMeters(t));
  maxH = Math.max(maxH, h);
  const style = buildingStyle(t, el.id, h);
  // 지붕만 있는 구조물(주유소 캐노피 등)은 들어갈 수 있게 충돌에서 뺀다
  const solid = t.building !== 'roof';
  buildings.push([ h, style.wall, style.roof, solid ? 1 : 0, ...flat(outer) ]);
  const levels = parseInt(t['building:levels'], 10);
  buildingMeta.push([ el.type === 'relation' ? 1 : 0, el.id, Number.isFinite(levels) && levels > 0 ? levels : 0 ]);
  if (t.name) buildingNames[buildings.length - 1] = t.name;
  fillRings([ outer ], (i) => { if (solid) block[i] = BLOCK.BUILDING; busy[i] = 1; });
}

// 5) 나무 — 숲은 촘촘히, 공원·잔디는 듬성듬성, 간선도로 보도엔 가로수
const rand = mulberry32(20261020);
const trees = [];
const tryTree = (x, z, scale) => {
  const c = toCell({ x, z });
  const i = Math.floor(c.y) * GW + Math.floor(c.x);
  if (c.x < 0 || c.y < 0 || c.x >= GW || c.y >= GH || busy[i]) return;
  trees.push(r1(x), r1(z), Math.round(scale * 10));
  // 주변 2m 안엔 다시 심지 않게
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const j = (Math.floor(c.y) + dy) * GW + Math.floor(c.x) + dx;
    if (j >= 0 && j < busy.length) busy[j] = 1;
  }
};
for (const { kind, poly, isPark } of areaPolys) {
  const spacing = kind === 'forest' ? 5 : isPark ? 9 : 14;
  const keep = kind === 'forest' ? 0.9 : 0.55;
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const p of poly[0]) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  for (let z = minZ; z < maxZ; z += spacing) {
    for (let x = minX; x < maxX; x += spacing) {
      if (rand() > keep) continue;
      const p = { x: x + (rand() - 0.5) * spacing * 0.8, z: z + (rand() - 0.5) * spacing * 0.8 };
      if (!inRing(p, poly[0]) || poly.slice(1).some((h) => inRing(p, h))) continue;
      tryTree(p.x, p.z, 0.8 + rand() * 0.6);
    }
  }
}
for (const row of roads) {
  if (!row[0] || row[4]) continue; // 간선 & 다리 아님
  const w = row[1];
  const pts = [];
  for (let i = 5; i < row.length; i += 2) pts.push({ x: row[i], z: row[i + 1] });
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1) continue;
    const nx = -(b.z - a.z) / len;
    const nz = (b.x - a.x) / len;
    for (let s = 4; s < len; s += 9) {
      const cx = a.x + ((b.x - a.x) * s) / len;
      const cz = a.z + ((b.z - a.z) * s) / len;
      for (const side of [ -1, 1 ]) {
        const off = w / 2 + 2.2;
        // 도로 판정이 걸리지 않게 잠깐 비켜 놓고 시도
        const x = cx + nx * off * side;
        const z = cz + nz * off * side;
        const c = toCell({ x, z });
        const i = Math.floor(c.y) * GW + Math.floor(c.x);
        if (i < 0 || i >= busy.length || block[i]) continue;
        busy[i] = 0;
        tryTree(x, z, 0.7 + rand() * 0.3);
      }
    }
  }
}

// 6) 충돌 격자 RLE (varint 값, varint 길이) base64
const rle = (arr) => {
  const out = [];
  const varint = (n) => { while (n >= 0x80) { out.push((n & 0x7f) | 0x80); n >>>= 7; } out.push(n); };
  for (let i = 0; i < arr.length;) {
    let j = i + 1;
    while (j < arr.length && arr[j] === arr[i]) j++;
    varint(arr[i]); varint(j - i);
    i = j;
  }
  return Buffer.from(out).toString('base64');
};

const spawn = project(37.5258, 126.9236); // 여의도공원 가운데
const data = {
  attribution: '© OpenStreetMap contributors (ODbL)',
  origin: { lat: LAT0, lng: LNG0 },
  half: { w: r1(HALF_W), d: r1(HALF_D) },
  maxBuildingHeight: maxH,
  spawn: { x: r1(spawn.x), z: r1(spawn.z) },
  areas,
  roads,
  paths,
  rails,
  buildings,
  buildingMeta,
  buildingNames,
  trees,
  collision: { cell: GRID, w: GW, h: GH, rle: rle(block) },
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const json = JSON.stringify(data);
fs.writeFileSync(OUT, json);
console.log(`buildings ${buildings.length}, roads ${roads.length}, paths ${paths.length}, rails ${rails.length}, trees ${trees.length / 3}, areas ${Object.entries(areas).map(([ k, v ]) => `${k}:${v.length}`).join(' ')}`);
console.log(`collision ${GW}x${GH}, max height ${maxH}m, wrote ${path.relative(process.cwd(), OUT)} (${(json.length / 1024).toFixed(0)}KB)`);
