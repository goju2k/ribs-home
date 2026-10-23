/* eslint-disable no-bitwise, no-restricted-syntax -- 고정 난수(mulberry32)·무늬 그리기 반복문 */
import * as THREE from 'three';

import FACADES from './facade-classes.json';

/**
 * 외벽 종류별 무늬 (사진 기반, 2026-10-23).
 * 건물마다 사진을 붙이지 않고, 대표 사진에서 읽은 특징(창 크기·간격·색·띠)을 사양으로 적어 무늬 한 칸을 그려 같은 종류 건물 전체에 되풀이한다.
 * 종류는 tools/bake-facades.mjs 가 OSM 태그·층수·높이로 미리 정한다 (facade-classes.json).
 *
 * 무늬 한 칸 = 폭 w(m) × 층 floors개 (층 높이는 실내 층과 같은 FLOOR). 1층은 따로(ground) — 상가 유리·로비·기단.
 * 같은 종류도 건물마다 색 변형·밝기·무늬 시작 위치를 바꿔 똑같아 보이지 않게 한다.
 */
export const FLOOR = 3.4;
/** 1m = 10도트 (게임 도트 렌더라 이보다 촘촘해도 화면에서 차이가 없다) */
const PPM = 10;

type Paint = (r:(x0:number, z0:number, x1:number, z1:number, c:string) => void, w:number, h:number) => void;

interface TileSpec {
  w: number;
  floors?: number;
  paint: Paint;
}

/** 종류 하나: 색 변형마다 앞면 무늬(+판상형 끝벽), 1층 무늬 */
interface Variant {
  front: TileSpec;
  end?: TileSpec;
  ground: TileSpec;
}

// ---------- 그리기 도우미 ----------
function rng(seed:number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 창 상자: 틀 + 유리(위쪽 하늘빛 한 줄) + 창살 */
function windowBox(r:Parameters<Paint>[0], x0:number, z0:number, x1:number, z1:number, frame:string, glass:string, sky:string, mullion = 0) {
  r(x0, z0, x1, z1, frame);
  r(x0 + 0.12, z0 + 0.12, x1 - 0.12, z1 - 0.12, glass);
  r(x0 + 0.12, z1 - 0.4, x1 - 0.12, z1 - 0.12, sky);
  if (mullion > 0) for (let x = x0 + mullion; x < x1 - 0.2; x += mullion) r(x - 0.05, z0, x + 0.05, z1, frame);
}

/** 1층 상가·로비 유리 (기둥 간격 post m, 위 간판 띠 색) */
function shopfront(wall:string, glass:string, post:number, signs?:string[]):TileSpec {
  return {
    w: post * (signs ? signs.length : 2),
    paint: (r, w) => {
      r(0, 0, w, FLOOR, wall);
      for (let x = 0, k = 0; x < w - 0.01; x += post, k++) {
        r(x + 0.25, 0, x + post - 0.25, 2.6, glass);
        r(x + 0.25, 1.9, x + post - 0.25, 2.0, '#8a9aa6');
        if (signs) r(x + 0.2, 2.75, x + post - 0.2, 3.25, signs[k % signs.length]);
      }
    },
  };
}

function base(wall:string, line:string, door:string):TileSpec {
  return {
    w: 8,
    paint: (r, w) => {
      r(0, 0, w, FLOOR, wall);
      for (let x = 0; x < w; x += 2) r(x, 0, x + 0.06, FLOOR, line);
      r(0, 1.7, w, 1.76, line);
      r(3, 0, 5, 2.4, door);
      r(3.9, 0, 4.1, 2.4, line);
    },
  };
}

// ---------- 종류별 사양 (사진에서 읽은 것) ----------

/** A 중층 아파트(구축) — 사진: 한 세대마다 색 기둥(파랑·짙은 회색이 번갈아), 사이는 흰 틀 가로 창(발코니 샷시), 창 아래 실외기, 층마다 흰 슬래브 띠.
 *  끝벽: 위는 파란 판에 계단실 작은 창, 옆은 회색 판, 층마다 흰 줄·흰 세로 띠, 아래층은 짙은 회색 */
function oldApt(pier1:string, pier2:string, side:string):Variant {
  return {
    front: {
      w: 14.4,
      paint: (r) => {
        const rnd = rng(pier1.charCodeAt(1) * 7 + 3);
        r(0, 0, 14.4, FLOOR, '#e2e3e1');
        r(0, 0, 1.8, FLOOR, pier1);
        r(7.2, 0, 9.0, FLOOR, pier2);
        for (const bx of [ 1.8, 9.0 ]) {
          // 가로 창 (흰 틀, 0.9m 창살)
          windowBox(r, bx + 0.15, 1.0, bx + 5.25, 2.9, '#f0f0ee', '#5a6c7f', '#8fa3b5', 0.9);
          // 창 아래 실외기 한두 대
          for (let k = 0; k < 2; k++) {
            if (rnd() < 0.6) {
              const ax = bx + 0.4 + rnd() * 4;
              r(ax, 0.35, ax + 0.8, 0.85, '#f4f4f2');
              r(ax + 0.1, 0.45, ax + 0.5, 0.75, '#9aa0a4');
            }
          }
        }
        r(0, 0, 14.4, 0.25, '#f2f2f0');
      },
    },
    end: {
      w: 6,
      paint: (r) => {
        r(0, 0, 3.6, FLOOR, pier1);
        windowBox(r, 1.1, 1.3, 2.6, 2.4, '#eeeeec', '#4e5d6c', '#7e93a6', 0.75);
        r(4.0, 0, 6, FLOOR, side);
        r(4.0, 1.7, 6, 1.75, '#9a9fa4');
        r(3.6, 0, 4.0, FLOOR, '#e6e6e4');
        r(0, 0, 6, 0.2, '#ececea');
      },
    },
    ground: base('#5c6167', '#4c5056', '#3a4450'),
  };
}

/** N 고층 아파트 — 사진: 옥색 유리 커튼월에 흰 세로 살 (트럼프월드 계열) / 다산처럼 흰 벽에 짙은 창 상자가 층마다 엇갈림 */
const NEW_APT:Variant[] = [
  {
    front: {
      w: 3,
      paint: (r) => {
        r(0, 0, 3, FLOOR, '#a3c6c7');
        r(0, 2.2, 3, FLOOR, '#b9d7d6');
        r(1.5, 0, 3, FLOOR, '#8db4b8');
        r(1.5, 2.2, 3, FLOOR, '#a6c9ca');
        r(0, 0, 3, 0.3, '#dbe6e5');
        r(0, 0, 0.12, FLOOR, '#eef4f3');
        r(1.44, 0, 1.56, FLOOR, '#eef4f3');
      },
    },
    ground: shopfront('#d8dedd', '#4d6670', 3),
  },
  {
    front: {
      w: 6.6,
      floors: 2,
      paint: (r) => {
        r(0, 0, 6.6, 2 * FLOOR, '#e9eae8');
        for (const [ f, xs ] of [[ 0, [ 0.35, 3.65 ]], [ 1, [ 2.0, 5.3 ]]] as [number, number[]][]) {
          for (const x of xs) windowBox(r, x, f * FLOOR + 0.5, x + 2.5, f * FLOOR + 2.7, '#41454b', '#1f2730', '#4e5c6a', 1.25);
        }
      },
    },
    ground: shopfront('#d9dad8', '#2c3540', 3.3),
  },
];

/** O 중고층 오피스 — 사진: 밝은 베이지 판에 짙은 사각 창이 반듯한 격자 (판 줄눈 세로선) / 회색 화강석에 가로 띠창 / 흰 판에 푸른 창 */
const OFFICE:Variant[] = [
  {
    front: {
      w: 3.2,
      paint: (r) => {
        r(0, 0, 3.2, FLOOR, '#ddd6c8');
        r(0, 0, 0.05, FLOOR, '#c9c1b2');
        r(1.6, 0, 1.65, FLOOR, '#cfc8ba');
        windowBox(r, 0.7, 0.9, 2.5, 2.6, '#4a5058', '#38424e', '#66788a', 0.9);
      },
    },
    ground: shopfront('#cfc8b9', '#2d3943', 3.2),
  },
  {
    front: {
      w: 3,
      paint: (r) => {
        r(0, 0, 3, FLOOR, '#aaa8a3');
        r(0, 1.0, 3, 2.55, '#4f6a80');
        r(0, 2.1, 3, 2.55, '#6f8aa0');
        r(0, 1.0, 0.08, 2.55, '#8a9298');
        r(1.46, 1.0, 1.54, 2.55, '#8a9298');
        r(0, 0, 3, 0.08, '#98968f');
      },
    },
    ground: shopfront('#8f8d88', '#2a3640', 3),
  },
  {
    front: {
      w: 3,
      paint: (r) => {
        r(0, 0, 3, FLOOR, '#e4e6e8');
        windowBox(r, 0.4, 0.8, 2.6, 2.7, '#c3c9cf', '#6283a3', '#8eaac4', 1.1);
      },
    },
    ground: shopfront('#cfd3d6', '#33414d', 3),
  },
];

/** T 초고층 유리 오피스 — 사진: 푸른 회색 유리에 촘촘한 세로 살(1m), 층마다 짙은 스팬드럴 / 은녹색 유리 */
function tower(glass:string, top:string, fin:string, spandrel:string):Variant {
  return {
    front: {
      w: 3,
      paint: (r) => {
        r(0, 0, 3, FLOOR, glass);
        r(0, 2.3, 3, FLOOR, top);
        r(1, 0.35, 2, FLOOR, glass);
        r(0, 0, 3, 0.35, spandrel);
        for (const x of [ 0, 1, 2 ]) r(x, 0, x + 0.1, FLOOR, fin);
      },
    },
    ground: shopfront('#8796a3', '#33475a', 3),
  };
}
const TOWER:Variant[] = [ tower('#6487ad', '#7fa0c2', '#b9c6d3', '#4f6e90'), tower('#86a8a6', '#9dbcba', '#d4dedd', '#6f8c8b') ];

/** R 저층 상가·근린 — 사진: 베이지 회색 콘크리트, 층마다 가게 창 + 색색 간판 띠, 실외기 */
const SIGNS = [ '#d9433a', '#e8b923', '#3a6fc4', '#3e9b5c', '#f2f2f0', '#e07a2e' ];
function shops(wall:string):Variant {
  return {
    front: {
      w: 24,
      paint: (r) => {
        const rnd = rng(wall.charCodeAt(2) * 13);
        r(0, 0, 24, FLOOR, wall);
        for (let k = 0; k < 4; k++) {
          const x = k * 6;
          windowBox(r, x + 1.0, 0.9, x + 4.6, 2.4, '#8d8676', '#4d5a62', '#76858f', 1.2);
          if (rnd() < 0.75) {
            const c = SIGNS[Math.floor(rnd() * SIGNS.length)];
            r(x + 0.3, 2.6, x + 5.7, 3.2, c);
            for (let t = x + 0.8; t < x + 5.0; t += 0.7) r(t, 2.75, t + 0.45, 3.05, c === '#f2f2f0' ? '#3a3a3a' : '#f6f2e6');
          }
          if (rnd() < 0.4) r(x + 4.8, 0.3, x + 5.6, 0.8, '#efefed');
        }
      },
    },
    ground: shopfront(wall, '#3a4954', 3, SIGNS),
  };
}
const SHOPS:Variant[] = [ shops('#bdb39a'), shops('#a9aba9'), shops('#c9bfae') ];

/** C 교회 — 사진: 붉은 벽돌(엇갈려 쌓기), 길쭉한 세로 창 */
const CHURCH:Variant[] = [{
  front: {
    w: 6,
    paint: (r) => {
      const rnd = rng(77);
      r(0, 0, 6, FLOOR, '#a8553c');
      for (let z = 0, row = 0; z < FLOOR; z += 0.25, row++) {
        r(0, z, 6, z + 0.03, '#8c4632');
        for (let x = row % 2 ? 0.2 : 0; x < 6; x += 0.4) {
          r(x, z, x + 0.03, z + 0.25, '#8c4632');
          if (rnd() < 0.3) r(x + 0.03, z + 0.03, x + 0.4, z + 0.25, rnd() < 0.5 ? '#b86448' : '#97492f');
        }
      }
      r(2.6, 0, 3.3, FLOOR, '#2b2f33');
      r(2.7, 0, 3.2, FLOOR, '#4a5a68');
    },
  },
  ground: {
    w: 6,
    paint: (r) => {
      r(0, 0, 6, FLOOR, '#a8553c');
      r(1.5, 0, 4.5, 2.6, '#2b2f33');
      r(1.6, 0, 4.4, 2.5, '#3c4a56');
    },
  },
}];

/** S 학교 — 사진: 옥색 타일 벽(가는 줄눈)에 흰 틀 창 두 칸씩, 층마다 흰 띠 / 흰 판 벽 */
function school(wall:string, joint:string):Variant {
  return {
    front: {
      w: 6,
      paint: (r) => {
        r(0, 0, 6, FLOOR, wall);
        for (let z = 0; z < FLOOR; z += 0.3) r(0, z, 6, z + 0.03, joint);
        for (const x of [ 0.6, 3.4 ]) windowBox(r, x, 0.8, x + 2.0, 2.6, '#f2f4f4', '#4e6573', '#7f97a6', 1.0);
        r(0, 0, 6, 0.3, '#eef2f2');
      },
    },
    ground: base('#9aa0a4', '#868c90', '#3d4a54'),
  };
}
const SCHOOL:Variant[] = [ school('#7fbcbc', '#6daaa9'), school('#eceeee', '#d9dddd') ];

/** P 저층 공공·기관 — 학교·오피스 사이: 밝은 석재 판에 사각 창 */
function civic(wall:string, joint:string):Variant {
  return {
    front: {
      w: 3,
      paint: (r) => {
        r(0, 0, 3, FLOOR, wall);
        r(0, 1.7, 3, 1.74, joint);
        r(0, 0, 0.05, FLOOR, joint);
        windowBox(r, 0.6, 0.9, 2.4, 2.5, '#6a7076', '#55636e', '#7e8f9c', 0.9);
      },
    },
    ground: base('#a3a6a8', '#909497', '#3d4a54'),
  };
}
const CIVIC:Variant[] = [ civic('#d8d6d0', '#c4c1ba'), civic('#b9bcbe', '#a7aaac') ];

const KIT:Record<string, Variant[]> = {
  A: [ oldApt('#7d97c0', '#5a6068', '#a9adb2'), oldApt('#c4ab84', '#7d6450', '#b8ada0'), oldApt('#8eb0a0', '#646c70', '#aab0b2') ],
  N: NEW_APT,
  O: OFFICE,
  T: TOWER,
  R: SHOPS,
  C: CHURCH,
  S: SCHOOL,
  P: CIVIC,
};

// ---------- 텍스처 ----------
export interface FacadeTile {
  key: string;
  /** 무늬 한 칸 폭(m)·층 수 */
  w: number;
  floors: number;
  texture: THREE.CanvasTexture;
}

const tiles = new Map<string, FacadeTile>();

function makeTile(key:string, spec:TileSpec):FacadeTile {
  const floors = spec.floors ?? 1;
  const W = Math.round(spec.w * PPM);
  const H = Math.round(FLOOR * floors * PPM);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // (x m, z m 바닥에서) → 캔버스 (위가 0). 오른쪽으로 넘치면 왼쪽에 이어 그린다 (되풀이 이음매)
  const r = (x0:number, z0:number, x1:number, z1:number, col:string) => {
    g.fillStyle = col;
    const y0 = Math.round(H - z1 * PPM);
    const y1 = Math.round(H - z0 * PPM);
    for (const off of [ 0, -spec.w ]) {
      const a = Math.round((x0 + off) * PPM);
      const b = Math.round((x1 + off) * PPM);
      if (b > 0 && a < W) g.fillRect(a, y0, b - a, y1 - y0);
    }
  };
  spec.paint(r, spec.w, FLOOR * floors);
  const tex = new THREE.CanvasTexture(c);
  // 창문 무늬와 같게: 가까이는 도트 그대로, 멀면 밉맵 평균 색 (모아레 방지)
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { key, w: spec.w, floors, texture: tex };
}

function tile(key:string, spec:TileSpec) {
  let t = tiles.get(key);
  if (!t) {
    t = makeTile(key, spec);
    tiles.set(key, t);
  }
  return t;
}

/** 건물 번호마다 고정된 난수 (변형·밝기·무늬 시작 위치) */
function hash(bi:number, salt:number) {
  return rng(bi * 2654435761 + salt)();
}

export interface BuildingFacade {
  front: FacadeTile;
  /** 판상형 끝벽 (없으면 앞면 무늬) */
  end?: FacadeTile;
  ground: FacadeTile;
  /** 밝기 (정점색) */
  tint: number;
  /** 무늬 시작 위치 (m) */
  shift: number;
  /** 옥상 회색 밝기 (sRGB 0~1) — 콘크리트·방수 도장 옥상. 지도 색(유리 건물은 파랑 계열)을 쓰면 위에서 볼 때 너무 알록달록하다 */
  roof: number;
}

const CLASSES:string = (FACADES as { classes: string; }).classes;

/** 건물 하나의 외벽 — 종류가 없거나 부속 건물(X)이면 null (원래 창문 무늬) */
export function facadeOf(bi:number):BuildingFacade | null {
  const cls = CLASSES[bi];
  const variants = cls ? KIT[cls] : undefined;
  if (!variants) return null;
  const vi = Math.floor(hash(bi, 1) * variants.length);
  const v = variants[vi];
  const k = `${cls}${vi}`;
  return {
    front: tile(`${k}f`, v.front),
    end: v.end ? tile(`${k}e`, v.end) : undefined,
    ground: tile(`${k}g`, v.ground),
    tint: 0.9 + hash(bi, 2) * 0.12,
    shift: hash(bi, 3) * 30,
    roof: 0.55 + hash(bi, 4) * 0.17,
  };
}