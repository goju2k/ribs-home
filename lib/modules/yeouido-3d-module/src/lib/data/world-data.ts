/* eslint-disable no-bitwise -- varint 디코딩 */
import raw from './yeouido-3d.json';

/** 미터 단위 좌표 x=동쪽, z=남쪽 (원점 = 영역 중앙). 링은 [x0, z0, x1, z1, ...] */
export type FlatRing = number[];

export interface WorldData {
  attribution: string;
  half: { w: number; d: number; };
  maxBuildingHeight: number;
  spawn: { x: number; z: number; };
  /** 종류별 다각형 목록, 다각형 = [바깥 링, ...구멍] */
  areas: Record<string, FlatRing[][]> & { waterLine?: number[][]; };
  /** [등급(0 일반/1 간선), 폭, 차선 수, 일방통행, 다리, ...xz] */
  roads: number[][];
  /** [종류(0 보도/1 자전거/2 광장), 폭, 다리, ...xz] */
  paths: number[][];
  /** [다리, ...xz] */
  rails: number[][];
  /** [높이, 벽색, 지붕색, 막힘, ...xz] */
  buildings: number[][];
  /** buildings와 같은 순서: [OSM 종류(0 way/1 relation), OSM id, 층수(모르면 0)] */
  buildingMeta: [number, number, number][];
  /** 이름 있는 건물만: 인덱스 → 이름 */
  buildingNames: Record<string, string>;
  /** [x, z, 크기*10, ...] */
  trees: number[];
  collision: { cell: number; w: number; h: number; rle: string; };
}

export const WORLD = raw as unknown as WorldData;

export const BLOCK = { NONE: 0, BUILDING: 1, WATER: 2 } as const;

function base64Bytes(b64:string):Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function decodeCollision(c:WorldData['collision']):Uint8Array {
  const bytes = base64Bytes(c.rle);
  const out = new Uint8Array(c.w * c.h);
  let p = 0;
  const varint = () => {
    let n = 0;
    let shift = 0;
    let b;
    do {
      b = bytes[p++];
      n |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    return n;
  };
  let i = 0;
  while (p < bytes.length) {
    const v = varint();
    const len = varint();
    out.fill(v, i, i + len);
    i += len;
  }
  return out;
}

/** 평평한 [x, z, ...] 배열 → 점 목록 */
export function toPoints(flat:number[], from = 0):{ x: number; z: number; }[] {
  const pts = [];
  for (let i = from; i + 1 < flat.length; i += 2) pts.push({ x: flat[i], z: flat[i + 1] });
  return pts;
}