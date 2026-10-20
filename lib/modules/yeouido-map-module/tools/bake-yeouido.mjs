/* eslint-disable no-console, no-continue, no-bitwise, no-restricted-syntax, no-nested-ternary -- 일회성 굽기 스크립트 */
// 여의도 OSM 데이터 → 도트 그리드 굽기.
//   node lib/modules/yeouido-map-module/tools/bake-yeouido.mjs --fetch   Overpass에서 새로 받아 캐시에 저장 후 굽기
//   node lib/modules/yeouido-map-module/tools/bake-yeouido.mjs           캐시(tools/.cache/osm.json)로 굽기
// 결과: src/lib/data/yeouido-baked.ts (브라우저는 이 그리드를 칠하기만 한다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '.cache', 'osm.json');
const OUT = path.join(HERE, '..', 'src', 'lib', 'data', 'yeouido-baked.ts');

// 영역(남, 서, 북, 동) — 여의도 섬 + 샛강 + 한강 양안 일부
const BBOX = { s: 37.515, w: 126.905, n: 37.538, e: 126.948 };
const METERS_PER_DOT = 4;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG = 111320 * Math.cos((((BBOX.s + BBOX.n) / 2) * Math.PI) / 180);

const W = Math.round(((BBOX.e - BBOX.w) * M_PER_DEG_LNG) / METERS_PER_DOT);
const H = Math.round(((BBOX.n - BBOX.s) * M_PER_DEG_LAT) / METERS_PER_DOT);

const project = (lat, lng) => ({ x: ((lng - BBOX.w) * M_PER_DEG_LNG) / METERS_PER_DOT, y: ((BBOX.n - lat) * M_PER_DEG_LAT) / METERS_PER_DOT });
const geomToPts = (geom) => geom.map((g) => project(g.lat, g.lon));

// 타일 종류 — src/lib/render/palette.ts 와 번호를 맞춘다
const T = {
  GROUND: 0,
  GRASS: 1,
  FOREST: 2,
  WATER: 3,
  ROAD: 4,
  ROAD_MINOR: 5,
  FOOT: 6,
  BRIDGE: 7,
  RAIL: 8,
  PITCH: 9,
  PAVE: 10,
  SAND: 11,
  LANE: 12,
  CYCLE: 13,
  PLAZA: 14,
  CONSTRUCTION: 15,
};

// ---------------------------------------------------------------- OSM 받기
async function fetchOsm() {
  const bb = `${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e}`;
  const q = `[out:json][timeout:120];(
    way["building"](${bb});relation["building"](${bb});
    way["highway"](${bb});way["railway"](${bb});
    nwr["natural"="water"](${bb});nwr["waterway"](${bb});nwr["water"](${bb});
    nwr["leisure"~"park|pitch|garden|playground|marina"](${bb});
    nwr["landuse"](${bb});nwr["natural"~"wood|scrub|grassland|sand|beach"](${bb});
    nwr["amenity"="parking"](${bb});way["man_made"~"bridge|pier"](${bb});
  );out geom;`;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'User-Agent': 'ribs-home-yeouido-map/0.1', Accept: 'application/json' },
        body: new URLSearchParams({ data: q }),
        signal: AbortSignal.timeout(180000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      fs.mkdirSync(path.dirname(CACHE), { recursive: true });
      fs.writeFileSync(CACHE, text);
      console.log(`fetched ${(text.length / 1024).toFixed(0)}KB`);
      return;
    } catch (e) {
      console.log(`overpass try ${i + 1} failed: ${e.message}`);
      await new Promise((r) => {
        setTimeout(r, 15000); 
      });
    }
  }
  throw new Error('overpass fetch failed');
}

// ---------------------------------------------------------------- 래스터화
const tiles = new Uint8Array(W * H);
const bld = new Uint16Array(W * H);

/** 짝홀(even-odd) 규칙 스캔라인 채우기 — 여러 링을 한꺼번에 넘기면 inner 링이 구멍이 된다 */
function fillRings(rings, fn) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of rings) {
    for (const p of r) {
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); 
    }
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    const xs = [];
    for (const r of rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[i];
        const b = r[j];
        if ((a.y > cy) !== (b.y > cy)) xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) fn(y * W + x);
    }
  }
}

/** 폴리라인을 반지름 r(도트)의 원으로 찍어 굵은 선으로 */
function strokeLine(pts, r, fn) {
  const r2 = r * r;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / 0.4));
    for (let s = 0; s <= steps; s++) {
      const px = a.x + ((b.x - a.x) * s) / steps;
      const py = a.y + ((b.y - a.y) * s) / steps;
      for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++) {
        if (y < 0 || y >= H) continue;
        for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++) {
          if (x < 0 || x >= W) continue;
          const dx = x + 0.5 - px;
          const dy = y + 0.5 - py;
          if (dx * dx + dy * dy <= Math.max(r2, 0.36)) fn(y * W + x);
        }
      }
    }
  }
}

/** 멀티폴리곤 멤버 way들을 끝점끼리 이어 닫힌 링으로 */
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
const samePt = (a, b) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9;

function areaOf(rings) {
  let s = 0;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j].x + r[i].x) * (r[j].y - r[i].y);
  }
  return Math.abs(s / 2);
}

/** 면 안에서 가장자리로부터 가장 먼 칸(체스판 거리 변환) — 이름표 자리 */
function widestPoint(rings) {
  const dist = new Int32Array(W * H);
  let any = false;
  fillRings(rings, (i) => {
    dist[i] = 1 << 20; any = true; 
  });
  if (!any) return null;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : dist[y * W + x]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (dist[i]) dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1, at(x + 1, y - 1) + 1);
    }
  }
  let best = -1;
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!dist[i]) continue;
      dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1, at(x - 1, y + 1) + 1);
      if (best < 0 || dist[i] > dist[best]) best = i;
    }
  }
  return { x: (best % W) + 0.5, y: Math.floor(best / W) + 0.5 };
}

/** way/relation → 링 목록(도트 좌표). 닫히지 않은 way는 null */
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

// ---------------------------------------------------------------- 건물 색
const hex = (c) => [ parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16) ];
const OSM_COLORS = { white: '#f2f2ee', grey: '#a9adb3', gray: '#a9adb3', silver: '#c7ccd2', black: '#3d3f45', red: '#c4554a', brown: '#9a6b4a', beige: '#e3d6b8', blue: '#6f93c2', green: '#7fa38a', yellow: '#e8cf6a' };
const parseColor = (c) => {
  if (!c) return null;
  // 원색 태그는 도트 팔레트에서 튀므로 회색 쪽으로 절반 섞는다
  if (/^#[0-9a-f]{6}$/i.test(c)) return hex(c).map((v) => Math.round(v * 0.5 + 175 * 0.5));
  return OSM_COLORS[c.toLowerCase()] ? hex(OSM_COLORS[c.toLowerCase()]) : null;
};

// 이름으로 고르는 랜드마크 색 [벽, 지붕]
const LANDMARK_COLORS = [
  [ /^63빌딩/, '#e0b04a', '#f0cc6a' ],
  [ /국회의사당$/, '#e9e4d6', '#7fa89a' ],
  [ /파크원 타워/, '#c9c6c0', '#b8473b' ],
  [ /IFC/, '#7fa3c7', '#9bb8d6' ],
  [ /Conrad/, '#8fa9c2', '#a9bdd0' ],
  [ /KBS/, '#d8d2c4', '#b9b3a6' ],
  [ /순복음/, '#e6e0d2', '#c9a46a' ],
  [ /현대 서울|더현대/, '#d7cfc2', '#9fb98f' ],
];

const GLASS = [ '#7b9cc0', '#8fb0cf', '#6d8fb3', '#9ab7c9', '#8aa3b8', '#a7bccc' ];
const APART = [ '#ece6d6', '#e4dccb', '#efe9df', '#dcd5c8', '#e9e1cf' ];
const LOW = [ '#d9c9ae', '#c9b7a0', '#e5b8a3', '#d4c4b0', '#bfb3a3', '#e0d3bd' ];

function pick(arr, seed) {
  return arr[Math.abs(seed) % arr.length];
}

function buildingStyle(t, id, heightM) {
  const name = t.name || '';
  for (const [ re, wall, roof ] of LANDMARK_COLORS) if (re.test(name)) return { wall: hex(wall), roof: hex(roof) };
  const wallTag = parseColor(t['building:colour']);
  const roofTag = parseColor(t['roof:colour']);
  let wall;
  if (t.building === 'apartments' || t.building === 'residential' || t['building:flats']) wall = hex(pick(APART, id));
  else if (heightM >= 40) wall = hex(pick(GLASS, id));
  else wall = hex(pick(LOW, id));
  wall = wallTag || wall;
  const roof = roofTag || wall.map((v) => Math.min(255, Math.round(v * 1.08 + 6)));
  return { wall, roof };
}

function heightMeters(t) {
  const h = parseFloat(t.height);
  if (Number.isFinite(h) && h > 0) return h;
  const lv = parseFloat(t['building:levels']);
  if (Number.isFinite(lv) && lv > 0) return lv * 3.4;
  if (t.building === 'roof' || t.building === 'kiosk' || t.building === 'shed') return 4;
  return 9;
}

// ---------------------------------------------------------------- 굽기
function bake() {
  const { elements } = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const tg = (el) => el.tags || {};

  // 1) 토지 이용 — 큰 것부터 칠해서 작은 것이 위에 오게
  const landuseTile = (t) => {
    if (t.natural === 'water' || t.water || t.waterway === 'riverbank' || t.landuse === 'basin' || t.landuse === 'reservoir') return null;
    if (t.landuse === 'forest' || t.natural === 'wood' || t.natural === 'scrub') return T.FOREST;
    if (t.leisure === 'pitch') return T.PITCH;
    if (t.leisure === 'playground') return T.PLAZA;
    if (t.amenity === 'parking') return T.PAVE;
    if (t.natural === 'sand' || t.natural === 'beach') return T.SAND;
    if (t.landuse === 'construction') return T.CONSTRUCTION;
    if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass' || t.natural === 'grassland' || t.landuse === 'recreation_ground' || t.landuse === 'village_green' || t.landuse === 'meadow') return T.GRASS;
    if (t.leisure === 'marina') return T.PAVE;
    return null;
  };
  const areas = [];
  for (const el of elements) {
    const t = tg(el);
    if (t.building) continue;
    const tile = landuseTile(t);
    if (tile == null) continue;
    const rings = ringsOf(el);
    if (rings) areas.push({ rings, tile, area: areaOf(rings) });
  }
  areas.sort((a, b) => b.area - a.area).forEach(({ rings, tile }) => fillRings(rings, (i) => {
    tiles[i] = tile; 
  }));

  // 2) 물 — 한강은 여의도가 inner 링(구멍)인 멀티폴리곤
  let waterCount = 0;
  for (const el of elements) {
    const t = tg(el);
    if (!(t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'basin' || t.landuse === 'reservoir')) continue;
    const rings = ringsOf(el);
    if (!rings) continue;
    const open = rings.filter((r) => Math.hypot(r[0].x - r[r.length - 1].x, r[0].y - r[r.length - 1].y) > 0.01).length;
    if (open) console.log(`  water ${el.type}/${el.id} has ${open} open ring(s) — 닫히지 않은 링은 직선으로 닫아서 채움`);
    fillRings(rings, (i) => {
      tiles[i] = T.WATER; 
    });
    waterCount++;
  }
  // 하천 선(샛강 등 폭이 면으로 없는 곳)
  for (const el of elements) {
    const t = tg(el);
    if (el.type !== 'way' || !t.waterway || isUnderground(t)) continue;
    if (t.waterway === 'stream' || t.waterway === 'canal' || t.waterway === 'ditch') {
      strokeLine(geomToPts(el.geometry), t.waterway === 'canal' ? 1.2 : 1.6, (i) => {
        if (tiles[i] !== T.WATER) tiles[i] = T.WATER; 
      });
    }
  }

  // 3) 다리 상판(면)
  for (const el of elements) {
    const t = tg(el);
    if (t.man_made !== 'bridge') continue;
    const rings = ringsOf(el);
    if (rings) {
      fillRings(rings, (i) => {
        tiles[i] = T.BRIDGE; 
      });
    }
  }

  // 4) 도로 — 폭(m) 기준
  const ROAD_W = {
    motorway: 26,
    trunk: 24,
    primary: 22,
    secondary: 15,
    tertiary: 11,
    busway: 8,
    motorway_link: 8,
    trunk_link: 8,
    primary_link: 8,
    secondary_link: 7,
    tertiary_link: 6,
    residential: 7,
    unclassified: 7,
    living_street: 6,
    service: 4.5,
  };
  const roads = [];
  for (const el of elements) {
    const t = tg(el);
    if (el.type !== 'way' || !t.highway || isUnderground(t) || t.area === 'yes') continue;
    const pts = geomToPts(el.geometry);
    const onBridge = t.bridge && t.bridge !== 'no';
    if (t.highway === 'footway' || t.highway === 'path' || t.highway === 'steps' || t.highway === 'pedestrian' || t.highway === 'cycleway') {
      if (t.highway === 'pedestrian' && el.geometry.length > 3 && samePt(el.geometry[0], el.geometry[el.geometry.length - 1])) continue;
      const tile = t.highway === 'cycleway' ? T.CYCLE : t.highway === 'pedestrian' ? T.PLAZA : T.FOOT;
      roads.push({ order: 0, pts, r: (t.highway === 'pedestrian' ? 4 : 2.2) / METERS_PER_DOT / 2 + 0.25, tile, onBridge });
      continue;
    }
    const w = ROAD_W[t.highway];
    if (!w) continue;
    const major = w >= 15;
    roads.push({ order: major ? 2 : 1, pts, r: w / METERS_PER_DOT / 2, tile: major ? T.ROAD : T.ROAD_MINOR, onBridge, lane: major && !t.highway.endsWith('_link') });
  }
  // 보행로 → 일반 도로 → 간선 순, 다리 위 도로는 물 위에서만 의미가 있으니 마지막에
  roads.sort((a, b) => (a.onBridge - b.onBridge) || (a.order - b.order));
  for (const rd of roads) {
    strokeLine(rd.pts, rd.r, (i) => {
      if (rd.tile === T.FOOT || rd.tile === T.CYCLE) {
        if (tiles[i] === T.WATER && !rd.onBridge) return;
        if (tiles[i] === T.ROAD || tiles[i] === T.ROAD_MINOR || tiles[i] === T.LANE) return;
      }
      if (rd.onBridge && tiles[i] === T.WATER && rd.tile !== T.ROAD) {
        tiles[i] = T.BRIDGE; return; 
      }
      tiles[i] = rd.tile;
    });
  }
  // 간선 중앙선
  for (const rd of roads) {
    if (rd.lane) {
      strokeLine(rd.pts, 0.2, (i) => {
        if (tiles[i] === T.ROAD) tiles[i] = T.LANE; 
      });
    }
  }

  // 5) 철도 (지상만)
  for (const el of elements) {
    const t = tg(el);
    if (el.type !== 'way' || !(t.railway === 'rail' || t.railway === 'subway' || t.railway === 'light_rail') || isUnderground(t)) continue;
    strokeLine(geomToPts(el.geometry), 0.9, (i) => {
      tiles[i] = T.RAIL; 
    });
  }

  // 6) 건물 — 낮은 것부터 채워서 높은 건물이 덮게
  const buildings = [];
  for (const el of elements) {
    const t = tg(el);
    if (!t.building || t.building === 'construction' || isUnderground(t)) continue;
    const rings = ringsOf(el);
    if (!rings) continue;
    const hM = heightMeters(t);
    buildings.push({ el, t, rings, hM });
  }
  buildings.sort((a, b) => a.hM - b.hM);
  const table = [[ 0, 0, 0, 0, 0, 0, 0 ]]; // [높이(도트), 벽 r,g,b, 지붕 r,g,b], 0번은 빈 자리
  const centroid = new Map();
  for (const b of buildings) {
    const idx = table.length;
    if (idx > 65535) break;
    const style = buildingStyle(b.t, b.el.id, b.hM);
    const hDots = Math.max(1, Math.round(b.hM / METERS_PER_DOT));
    let filled = 0;
    let sx = 0;
    let sy = 0;
    fillRings(b.rings, (i) => {
      bld[i] = idx; filled++; sx += i % W; sy += Math.floor(i / W);
      if (tiles[i] === T.WATER) tiles[i] = T.PAVE;
    });
    if (!filled) continue;
    table.push([ hDots, ...style.wall, ...style.roof ]);
    centroid.set(b.el.id, { x: sx / filled, y: sy / filled, h: hDots, name: b.t.name });
  }

  // 7) 라벨 — 이름으로 고른 랜드마크
  const LABELS = [
    { label: '63빌딩', kind: 'landmark', match: (t) => /^63빌딩/.test(t.name || '') && t.building },
    { label: '국회의사당', kind: 'landmark', match: (t) => t.name === '국회의사당' && t.building },
    { label: '파크원', kind: 'landmark', match: (t) => /파크원 타워1/.test(t.name || '') && t.building },
    { label: 'IFC', kind: 'landmark', match: (t) => /Three IFC/.test(t.name || '') && t.building },
    { label: 'KBS', kind: 'landmark', match: (t) => /KBS 본관/.test(t.name || '') && t.building },
    // 섬을 둘러싼 긴 공원은 면 계산으로는 자리가 어색해서 실제 좌표로 고정
    { label: '여의도공원', kind: 'park', fixed: project(37.5255, 126.9228) },
    { label: '여의도한강공원', kind: 'park', fixed: project(37.5283, 126.933) },
    { label: '샛강생태공원', kind: 'park', fixed: project(37.5188, 126.9215) },
    { label: '마포대교', kind: 'bridge', match: (t) => t.name === '마포대교' && t.man_made === 'bridge' },
    { label: '원효대교', kind: 'bridge', match: (t) => t.name === '원효대교' && t.man_made === 'bridge' },
    { label: '서강대교', kind: 'bridge', match: (t) => t.name === '서강대교' && t.man_made === 'bridge' },
    { label: '한강', kind: 'water', fixed: project(37.5285, 126.9395) },
  ];
  const labels = [];
  for (const L of LABELS) {
    if (L.fixed) {
      labels.push({ label: L.label, kind: L.kind, x: +L.fixed.x.toFixed(1), y: +L.fixed.y.toFixed(1), h: 0 }); continue; 
    }
    const hits = elements.filter((el) => L.match(tg(el)));
    if (!hits.length) {
      console.log(`  label not found: ${L.label}`); continue; 
    }
    if (L.kind === 'landmark') {
      const c = centroid.get(hits[0].id);
      if (c) labels.push({ label: L.label, kind: L.kind, x: +c.x.toFixed(1), y: +c.y.toFixed(1), h: c.h });
      continue;
    }
    // 면: 가장 큰 면 안에서 가장 넓은 지점 — 섬을 둘러싼 긴 공원은 좌표 평균이 면 밖(섬 한가운데)으로 떨어진다
    const biggest = hits.map((h) => ({ h, r: ringsOf(h) })).filter((x) => x.r).sort((a, b) => areaOf(b.r) - areaOf(a.r))[0];
    const p = biggest && widestPoint(biggest.r);
    if (!p) continue;
    labels.push({ label: L.label, kind: L.kind, x: p.x, y: p.y, h: 0 });
  }

  // ---------------------------------------------------------------- 인코딩 (런 길이 → varint → base64)
  const rle = (arr) => {
    const out = [];
    const varint = (n) => {
      while (n >= 0x80) {
        out.push((n & 0x7f) | 0x80); n >>>= 7; 
      } out.push(n); 
    };
    for (let i = 0; i < arr.length;) {
      let j = i + 1;
      while (j < arr.length && arr[j] === arr[i]) j++;
      varint(arr[i]); varint(j - i);
      i = j;
    }
    return Buffer.from(out).toString('base64');
  };
  const tilesB64 = rle(tiles);
  const bldB64 = rle(bld);
  const maxH = table.reduce((m, r) => Math.max(m, r[0]), 0);

  const src = `/* eslint-disable */
// 자동 생성 파일 — tools/bake-yeouido.mjs 로 다시 만든다. 직접 고치지 말 것.
// 지도 데이터 © OpenStreetMap contributors (ODbL)
export const BAKED = {
  bbox: ${JSON.stringify(BBOX)},
  metersPerDot: ${METERS_PER_DOT},
  w: ${W},
  h: ${H},
  maxBuildingHeight: ${maxH},
  /** 타일 종류 RLE(varint 값, varint 길이) base64 */
  tiles: '${tilesB64}',
  /** 건물 번호(0=없음) RLE base64 */
  buildings: '${bldB64}',
  /** [높이(도트), 벽 r, g, b, 지붕 r, g, b] — 번호 0은 비어 있음 */
  buildingTable: ${JSON.stringify(table.flat())},
  labels: ${JSON.stringify(labels)} as { label: string; kind: 'landmark' | 'park' | 'bridge' | 'water'; x: number; y: number; h: number; }[],
};
`;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, src);
  const counts = {};
  tiles.forEach((v) => {
    counts[v] = (counts[v] || 0) + 1; 
  });
  console.log(`grid ${W}x${H} (${METERS_PER_DOT}m/dot), water polys ${waterCount}, buildings ${table.length - 1}, max height ${maxH} dots, labels ${labels.length}`);
  console.log('tile counts', Object.fromEntries(Object.entries(counts).map(([ k, v ]) => [ Object.keys(T).find((n) => T[n] === +k), v ])));
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(src.length / 1024).toFixed(0)}KB)`);
}

if (process.argv.includes('--fetch') || !fs.existsSync(CACHE)) await fetchOsm();
bake();