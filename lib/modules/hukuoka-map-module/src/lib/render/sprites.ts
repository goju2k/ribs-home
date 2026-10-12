import { PlaceIcon } from '../data/places';
import { MoveMode } from '../data/schedule';

// 도트 스프라이트 — 문자 한 개가 픽셀 한 개, '.'은 투명
const PALETTE:Record<string, string> = {
  k: '#26263a',
  w: '#ffffff',
  r: '#e8484f',
  o: '#f59e0b',
  y: '#f7d148',
  p: '#f38bb0',
  c: '#8fd8f5',
  g: '#3fbf6b',
  s: '#f6c99f',
  b: '#3e7be6',
  n: '#4a3a6a',
};

function build(rows:string[], palette:Record<string, string> = PALETTE) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(...rows.map((r) => r.length));
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) => [ ...row ].forEach((ch, x) => {
    const color = palette[ch];
    if (!color) return;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  }));
  return canvas;
}

// ── 장소 배지 (16x17: 둥근 사각형 + 아래 꼬리, 안에 10x10 그림) ──

const GLYPHS:Record<PlaceIcon, string[]> = {
  airport: [ '....ww....', '....ww....', '...wwww...', '.wwwwwwww.', 'wwwwwwwwww', '....ww....', '....ww....', '...wwww...', '..wwwwww..', '..........' ],
  hotel: [ '..........', '..........', 'w.........', 'w.ww......', 'wwwwwwwwww', 'wwwwwwwwww', 'wwwwwwwwww', 'w........w', 'w........w', '..........' ],
  cafe: [ '...wwww...', '.wwwwwwww.', '.wwkwwkww.', 'wwwkwwkwww', 'wwwwwwwwww', 'wrrwwwwrrw', 'wwwwkkwwww', '.wwwwwwww.', '..wwwwww..', '.rrr..rrr.' ],
  mall: [ '...wwww...', '..w....w..', '..w....w..', 'wwwwwwwwww', 'wwwwwwwwww', 'wwwwwwwwww', 'wwwwwwwwww', 'wwwwwwwwww', 'wwwwwwwwww', '.wwwwwwww.' ],
  ramen: [ '.w.w.w....', 'w.w.w...k.', '.w.w.w.k..', '......k...', 'wwwwwkwwww', 'yyyyyyyyyy', '.wwwwwwww.', '..wwwwww..', '...wwww...', '..wwwwww..' ],
  udon: [ '.w.w.w....', 'w.w.w.....', '.w.w.w....', '..........', 'wwwwwwwwww', 'kwwpwwwwwk', '.kwwwwwwk.', '..kkkkkk..', '...kkkk...', '..kkkkkk..' ],
  station: [ '..wwwwww..', '.wwwwwwww.', '.wkkkkkkw.', '.wkkkkkkw.', '.wwwwwwww.', '.wywwwwyw.', '.wwwwwwww.', '..w....w..', '.w......w.', 'w........w' ],
  shrine: [ 'wwwwwwwwww', '.wwwwwwww.', '..w....w..', 'wwwwwwwwww', '..w....w..', '..w....w..', '..w....w..', '..w....w..', '..w....w..', '..w....w..' ],
  inari: [ 'w........w', 'ww......ww', 'wwwwwwwwww', 'wwwwwwwwww', 'wkkwwwwkkw', 'wwwwwwwwww', '.wwwwwwww.', '..wwkkww..', '...wwww...', '....ww....' ],
  kaisendon: [ '..........', '..rr..oo..', '.wrrwwoow.', 'wwwwwwwwww', 'kkkkkkkkkk', '.wwwwwwww.', '..wwwwww..', '...wwww...', '....ww....', '..wwwwww..' ],
  sushi: [ '..........', '..........', '..rrrrrr..', '.rrwrrrwr.', '.rrrrrrrr.', '.wwwwwwww.', '.wwwwwwww.', '..wwwwww..', '..........', '..........' ],
  shop: [ '.w......w.', '..w....w..', '...w..w...', 'wwwwwwwwww', 'wkkkkkkkkw', 'wkcckkkkkw', 'wkckkkkkkw', 'wkkkkkkkkw', 'wwwwwwwwww', '..w....w..' ],
  yatai: [ '....ww....', '..rrrrrr..', '.rrrrrrrr.', '.yyyyyyyy.', '.rrrrrrrr.', '.yyyyyyyy.', '.rrrrrrrr.', '..rrrrrr..', '....ww....', '....ww....' ],
  meeting: [ '.wwwww....', '.wwwwwww..', '.wwwwwwww.', '.wwwwwww..', '.wwww.....', '.w........', '.w........', '.w........', '.w........', 'www.......' ],
  rest: [ '..w..w....', '...w..w...', '..w..w....', 'wwwwwwww..', 'wwwwwwwwww', 'wwwwwwww.w', 'wwwwwwwwww', 'wwwwwwww..', '.wwwwww...', 'wwwwwwwwww' ],
  onsen: [ '.w..w..w..', 'w..w..w...', '.w..w..w..', '..w..w..w.', '.w..w..w..', '..........', 'w........w', 'ww......ww', '.wwwwwwww.', '..wwwwww..' ],
  roundhouse: [ '..........', '.ww.......', '.ww...www.', 'wwwwwwwwww', 'wwwwwwkkww', 'wwwwwwkkww', 'wwwwwwwwww', 'wwwwwwwwww', '.kk.kk.kk.', '.kk.kk.kk.' ],
  village: [ '....ww....', '...wwww...', '..wwwwww..', '.wwwwwwww.', 'wwwwwwwwww', '.wkkwwkkw.', '.wkkwwkkw.', '.wwwwwwww.', '.wwwkkwww.', '.wwwkkwww.' ],
};

const BADGE_COLORS:Record<PlaceIcon, string> = {
  airport: '#3b82f6',
  hotel: '#8b5cf6',
  cafe: '#f472b6',
  mall: '#ec4899',
  ramen: '#f59e0b',
  udon: '#eab308',
  station: '#10b981',
  shrine: '#dc2626',
  inari: '#ea580c',
  kaisendon: '#0ea5e9',
  sushi: '#14b8a6',
  shop: '#6366f1',
  yatai: '#1e3a8a',
  meeting: '#22c55e',
  rest: '#64748b',
  onsen: '#e11d48',
  roundhouse: '#475569',
  village: '#a16207',
};

const BADGE_SHAPE = [
  '..kkkkkkkkkkkk..',
  '.kHHHHHHHHHHHHk.',
  'kHFFFFFFFFFFFFFk',
  'kFFFFFFFFFFFFFFk',
  'kFFFFFFFFFFFFFFk',
  'kFFFFFFFFFFFFFFk',
  'kFFFFFFFFFFFFFFk',
  'kFFFFFFFFFFFFFFk',
  'kFFFFFFFFFFFFFFk',
  'kFFFFFFFFFFFFFFk',
  'kFFFFFFFFFFFFFFk',
  'kFFFFFFFFFFFFFFk',
  'kFFFFFFFFFFFFFDk',
  '.kDDDDDDDDDDDDk.',
  '..kkkkkFFkkkkk..',
  '......kFFk......',
  '.......kk.......',
];

export const BADGE_W = 16;
export const BADGE_H = BADGE_SHAPE.length;

function lighten(hexColor:string, k:number) {
  const ch = [ 1, 3, 5 ].map((i) => parseInt(hexColor.slice(i, i + 2), 16)).map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${ch.join(',')})`;
}

const badgeCache = new Map<PlaceIcon, HTMLCanvasElement>();

export function getBadge(icon:PlaceIcon) {
  let c = badgeCache.get(icon);
  if (c) return c;
  const fill = BADGE_COLORS[icon];
  const rows = BADGE_SHAPE.map((row, y) => {
    const glyph = GLYPHS[icon][y - 2];
    if (!glyph) return row;
    return row.slice(0, 3) + [ ...glyph ].map((ch, i) => (ch === '.' ? row[3 + i] : ch)).join('') + row.slice(13);
  });
  c = build(rows, { ...PALETTE, F: fill, H: lighten(fill, 0.3), D: lighten(fill, -0.25) });
  badgeCache.set(icon, c);
  return c;
}

// ── 여행자 (8x12) ──

const PERSON_TOP = [ '..rrrr..', '.rrrrrrr', '..ssss..', '..sskk..', '..ssss..', '.bbbbbb.', 'sbbbbbbs', 'sbbbbbbs', '..bbbb..' ];
const PERSON_FRAMES = [
  [ ...PERSON_TOP, '..nnnn..', '..n..n..', '..k..k..' ],
  [ ...PERSON_TOP, '..nn.n..', '.n....n.', '.k....k.' ],
  [ ...PERSON_TOP, '...nn...', '...nn...', '...kk...' ],
];

// ── 탈것 (오른쪽을 향함) ──

const VEHICLES:Record<Exclude<MoveMode, 'walk'>, string[]> = {
  bus: [
    '.kkkkkkkkkkkkkk.',
    'kooooooooooooook',
    'kocckcckcckccook',
    'kocckcckcckcccok',
    'kooooooooooooook',
    'kwwwwwwwwwwwwwwk',
    'kkkkkkkkkkkkkkkk',
    '..kkk......kkk..',
    '...k........k...',
  ],
  train: [
    '.kkkkkkkkkkkkkk.',
    'kwwwwwwwwwwwwwwk',
    'kwcckcckcckccckk',
    'kwcckcckcckcccck',
    'kggggggggggggggk',
    'kwwwwwwwwwwwwwwk',
    '.kk.kk....kk.kk.',
  ],
  taxi: [
    '...kkkkk....',
    '..kcckcck...',
    '.kyyyyyyyyk.',
    'kyyyyyyyyyyk',
    'kyyyyyyyyyyk',
    '.kkkkkkkkkk.',
    '..kk....kk..',
  ],
  plane: [
    '......kk........',
    '......kwk.......',
    'k.....kwwk......',
    'kk....kwwwk.....',
    'kwkkkkkwwwwkkkk.',
    'kwwwwwwwwwwwwwck',
    'kkkkkkkwwwwkkkk.',
    '......kwwwk.....',
    '......kwwk......',
    '......kk........',
  ],
};

let personCache:HTMLCanvasElement[] | null = null;
const vehicleCache = new Map<string, HTMLCanvasElement>();

export function getPersonFrame(frame:number) {
  if (!personCache) personCache = PERSON_FRAMES.map((rows) => build(rows));
  return personCache[frame % personCache.length];
}

export function getVehicle(mode:Exclude<MoveMode, 'walk'>) {
  let c = vehicleCache.get(mode);
  if (!c) {
    c = build(VEHICLES[mode]);
    vehicleCache.set(mode, c);
  }
  return c;
}

// ── 구름 (도트 단위, 랜덤 원 합집합) ──

export function makeCloud(rand:() => number) {
  const w = 24 + Math.floor(rand() * 40);
  const h = Math.floor(w * 0.45);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const blobs = Array.from({ length: 5 }, () => ({
    x: w * (0.2 + rand() * 0.6),
    y: h * (0.45 + rand() * 0.2),
    r: h * (0.25 + rand() * 0.25),
  }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = blobs.some((b) => Math.hypot(x - b.x, (y - b.y) * 1.3) < b.r) && y < h * 0.82;
      if (inside) {
        const below = !blobs.some((b) => Math.hypot(x - b.x, (y + 2 - b.y) * 1.3) < b.r) || y + 2 >= h * 0.82;
        ctx.fillStyle = below ? '#dfe8f2' : '#ffffff';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return canvas;
}