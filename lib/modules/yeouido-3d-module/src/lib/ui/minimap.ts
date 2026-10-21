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
  // 들어갈 수 있는 건물은 노랗게
  g.strokeStyle = '#ffd84a';
  g.lineWidth = 2;
  highlight.forEach((bid) => {
    g.beginPath();
    ringPath(g, data.buildings[bid].slice(4), ox, oz);
    g.fill();
    g.stroke();
  });
  return c;
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

  constructor(canvas:HTMLCanvasElement, data:WorldData, highlight:number[]) {
    this.canvas = canvas;
    this.data = data;
    this.base = bakeBase(data, highlight);
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
    // 북쪽 표시: 월드 북쪽 (0,-1)을 yaw만큼 돌리면 캔버스에서 (sin yaw, -cos yaw) 방향
    g.setTransform(1, 0, 0, 1, 0, 0);
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