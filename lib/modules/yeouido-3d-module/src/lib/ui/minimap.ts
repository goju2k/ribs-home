/* eslint-disable no-restricted-syntax -- 지도 그리기 반복문 */
import { WorldData } from 'yeouido-sim';

/** 바탕 지도 해상도: 1px = 2m */
const MPP = 2;

/** 누를 때마다 바뀌는 보이는 반경(m) — 마지막은 섬 전체 */
const RANGES = [ 250, 800, 1600 ];

const COLORS:Record<string, string> = {
  water: '#7fb3d5',
  grass: '#9fcd7f',
  forest: '#6fa65c',
  pitch: '#8cc46f',
  pave: '#c9c3b5',
  plaza: '#d8d1c2',
  bridge: '#a9a399',
  construction: '#c8b48c',
};

/** 지역 좌표 링 [x0,z0,x1,z1,...] → 캔버스 경로 */
function ringPath(g:CanvasRenderingContext2D, ring:number[], ox:number, oz:number) {
  for (let i = 0; i + 1 < ring.length; i += 2) {
    const x = (ring[i] + ox) / MPP;
    const y = (ring[i + 1] + oz) / MPP;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

function line(g:CanvasRenderingContext2D, flat:number[], from:number, ox:number, oz:number) {
  g.beginPath();
  for (let i = from; i + 1 < flat.length; i += 2) {
    const x = (flat[i] + ox) / MPP;
    const y = (flat[i + 1] + oz) / MPP;
    if (i === from) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

/** 여의도 전체 바탕 지도를 한 번 그려 둔다 */
function bakeBase(data:WorldData, highlight:number[]) {
  const ox = data.half.w;
  const oz = data.half.d;
  const c = document.createElement('canvas');
  c.width = Math.ceil((data.half.w * 2) / MPP);
  c.height = Math.ceil((data.half.d * 2) / MPP);
  const g = c.getContext('2d')!;
  g.fillStyle = '#d4cfc1';
  g.fillRect(0, 0, c.width, c.height);
  // 면: 물 먼저, 그 위에 공원·광장 등
  const order = [ 'water', 'pave', 'plaza', 'construction', 'grass', 'pitch', 'forest', 'bridge' ];
  order.forEach((kind) => {
    const polys = data.areas[kind] as number[][][] | undefined;
    if (!polys) return;
    g.fillStyle = COLORS[kind];
    polys.forEach((poly) => {
      g.beginPath();
      poly.forEach((ring) => ringPath(g, ring, ox, oz));
      g.fill('evenodd');
    });
  });
  // 길: 보행로는 얇고 밝게, 도로는 폭대로 어둡게
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#b8ad97';
  data.paths.forEach((p) => {
    g.lineWidth = Math.max(1, p[1] / MPP);
    line(g, p, 3, ox, oz);
  });
  g.strokeStyle = '#5c5f66';
  data.roads.forEach((r) => {
    g.lineWidth = Math.max(1.5, r[1] / MPP);
    line(g, r, 5, ox, oz);
  });
  // 건물
  g.fillStyle = '#8b94a7';
  data.buildings.forEach((b) => {
    g.beginPath();
    ringPath(g, b.slice(4), ox, oz);
    g.fill();
  });
  // 들어갈 수 있는 건물은 노랗게 채우고 진한 테두리 (테두리만이면 둘레 건물에 묻혀 KB국민은행 말고는 잘 안 보였다)
  g.fillStyle = '#f2c94c';
  g.strokeStyle = '#7a5a00';
  g.lineWidth = 2;
  highlight.forEach((bid) => {
    g.beginPath();
    ringPath(g, data.buildings[bid].slice(4), ox, oz);
    g.fill();
    g.stroke();
  });
  return c;
}

/**
 * 미니맵 대표 지명: 건물 이름(OSM)이 있으면 그 건물 가운데, 없으면(공원·길·동네) 정한 자리.
 * 중요한 순서 — 넓게 보아 글씨가 겹치면 뒤엣것은 그리지 않는다
 */
const PLACES:{ text: string; building?: string; at?: [number, number]; }[] = [
  { text: '국회의사당', building: '국회의사당' },
  { text: '63빌딩', building: '63빌딩' },
  { text: '여의도공원', at: [ -330, 60 ] },
  { text: 'IFC', building: 'Three IFC' },
  { text: '더현대', building: '더현대 서울' },
  { text: 'KBS', building: 'KBS 본관' },
  { text: '윤중로', at: [ -1150, -880 ] },
  { text: '파크원', building: '파크원 타워1' },
  { text: 'LG트윈타워', building: 'LG트윈타워' },
  { text: '증권가', at: [ -190, 380 ] },
];

/** 지명 → 월드 자리 (건물은 바닥 꼭짓점 평균) */
function placeLabels(data:WorldData) {
  const byName = new Map(Object.entries(data.buildingNames).map(([ i, n ]) => [ n, Number(i) ]));
  return PLACES.flatMap(({ text, building, at }) => {
    if (at) return [{ text, x: at[0], z: at[1], bid: -1 }];
    const i = building ? byName.get(building) : undefined;
    if (i === undefined) return [];
    const ring = data.buildings[i].slice(4);
    let x = 0;
    let z = 0;
    for (let k = 0; k + 1 < ring.length; k += 2) {
      x += ring[k];
      z += ring[k + 1];
    }
    return [{ text, x: x / (ring.length / 2), z: z / (ring.length / 2), bid: i }];
  });
}

export interface MiniDot {
  x: number; z: number;
}

/** 화면 오른쪽 위 미니맵. 위쪽 = 화면 위쪽(카메라 방향), 북쪽은 N 표시 */
export class Minimap {

  private base:HTMLCanvasElement;

  private range = 0;

  private canvas:HTMLCanvasElement;

  private data:WorldData;

  private labels:{ text: string; x: number; z: number; bid: number; }[];

  /** 들어갈 수 있는 건물 (지명도 노랗게 — 지명 상자가 건물 가운데를 덮어 노란 칠이 가려졌다) */
  private enterable:Set<number>;

  constructor(canvas:HTMLCanvasElement, data:WorldData, highlight:number[]) {
    this.canvas = canvas;
    this.data = data;
    this.labels = placeLabels(data);
    this.base = bakeBase(data, highlight);
    this.enterable = new Set(highlight);
  }

  /** 지금 보이는 반경(m) */
  get radius() {
    return RANGES[this.range];
  }

  /** 누를 때마다 다음 배율 */
  cycle() {
    this.range = (this.range + 1) % RANGES.length;
  }

  /**
   * @param yaw 카메라 회전 (화면 위쪽 = 월드 (-sin yaw, -cos yaw))
   * @param facing 내가 바라보는 방향 (월드 (sin f, cos f))
   */
  /** overlay: 게임 모드가 월드 좌표로 위에 그린다 (k = 캔버스 px/m) */
  draw(x:number, z:number, yaw:number, facing:number, others:MiniDot[], overlay?:(g:CanvasRenderingContext2D, k:number, dpr:number) => void) {
    const cv = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = cv.clientWidth;
    if (cv.width !== Math.round(size * dpr)) {
      cv.width = Math.round(size * dpr);
      cv.height = Math.round(size * dpr);
    }
    const g = cv.getContext('2d')!;
    const S = cv.width;
    const R = RANGES[this.range];
    const k = S / (2 * R); // 캔버스 px / m
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#7fb3d5';
    g.fillRect(0, 0, S, S);
    g.imageSmoothingEnabled = false;
    // 가운데 = 나, 화면 위쪽 방향이 위로 오게 돌린다
    g.translate(S / 2, S / 2);
    g.rotate(yaw);
    g.scale(k, k);
    g.translate(-x, -z);
    g.drawImage(this.base, -this.data.half.w, -this.data.half.d, this.base.width * MPP, this.base.height * MPP);
    if (overlay) {
      g.save();
      overlay(g, k, dpr);
      g.restore();
    }
    // 다른 사람
    g.fillStyle = '#2fb3b0';
    const dot = 3 * dpr / k;
    others.forEach((o) => g.fillRect(o.x - dot, o.z - dot, dot * 2, dot * 2));
    // 나: 바라보는 방향 화살표
    const a = 7 * dpr / k;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    g.beginPath();
    g.moveTo(x + fx * a, z + fz * a);
    g.lineTo(x - fx * a * 0.6 + fz * a * 0.6, z - fz * a * 0.6 - fx * a * 0.6);
    g.lineTo(x - fx * a * 0.6 - fz * a * 0.6, z - fz * a * 0.6 + fx * a * 0.6);
    g.closePath();
    g.fillStyle = '#e2574c';
    g.fill();
    g.lineWidth = 1.5 * dpr / k;
    g.strokeStyle = '#0b0e22';
    g.stroke();
    // 지명: 지도는 돌아도 글씨는 똑바로 (월드 자리를 같은 변환으로 캔버스 자리로 옮겨 그 위에)
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.font = `${9 * dpr}px Galmuri11, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const drawn:[number, number, number, number][] = [];
    this.labels.forEach((lb) => {
      const dx = (lb.x - x) * k;
      const dz = (lb.z - z) * k;
      const px = S / 2 + dx * cy - dz * sy;
      const py = S / 2 + dx * sy + dz * cy;
      const w = g.measureText(lb.text).width + 4 * dpr;
      if (px < w / 2 || px > S - w / 2 || py < 8 * dpr || py > S - 18 * dpr) return;
      const box:[number, number, number, number] = [ px - w / 2, py - 6 * dpr, px + w / 2, py + 6 * dpr ];
      if (drawn.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) return;
      drawn.push(box);
      const open = this.enterable.has(lb.bid);
      g.fillStyle = open ? '#f2c94c' : 'rgba(11,14,34,0.6)';
      g.fillRect(px - w / 2, py - 6 * dpr, w, 12 * dpr);
      g.fillStyle = open ? '#2a1f00' : '#f4f4f8';
      g.fillText(lb.text, px, py + 0.5 * dpr);
    });
    // 북쪽 표시: 월드 북쪽 (0,-1)을 yaw만큼 돌리면 캔버스에서 (sin yaw, -cos yaw) 방향
    const edge = S / 2 - 9 * dpr;
    const north = { x: S / 2 + Math.sin(yaw) * edge, y: S / 2 - Math.cos(yaw) * edge };
    g.font = `${10 * dpr}px Galmuri11, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(11,14,34,0.75)';
    g.fillRect(north.x - 6 * dpr, north.y - 6 * dpr, 12 * dpr, 12 * dpr);
    g.fillStyle = '#ffd84a';
    g.fillText('N', north.x, north.y + 0.5 * dpr);
    // 배율 표시
    g.fillStyle = 'rgba(11,14,34,0.7)';
    g.fillRect(0, S - 13 * dpr, 40 * dpr, 13 * dpr);
    g.fillStyle = '#f4f4f8';
    g.textAlign = 'left';
    g.fillText(R >= 1600 ? '전체' : `${R * 2}m`, 4 * dpr, S - 6 * dpr);
  }

}