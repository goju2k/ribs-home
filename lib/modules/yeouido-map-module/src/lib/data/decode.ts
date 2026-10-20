/* eslint-disable no-bitwise -- varint 디코딩 */
import { BAKED } from './yeouido-baked';

function base64Bytes(b64:string):Uint8Array {
  if (typeof atob === 'function') {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

/** (varint 값, varint 길이) 쌍 RLE → 배열 */
function unrle<A extends Uint8Array | Uint16Array>(b64:string, out:A):A {
  const bytes = base64Bytes(b64);
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

export interface Building {
  height: number;
  wall: [number, number, number];
  roof: [number, number, number];
}

export interface YeouidoGrid {
  w: number;
  h: number;
  metersPerDot: number;
  maxBuildingHeight: number;
  tiles: Uint8Array;
  buildingIds: Uint16Array;
  buildings: Building[];
  labels: typeof BAKED.labels;
}

export function decodeGrid():YeouidoGrid {
  const { w, h } = BAKED;
  const t = BAKED.buildingTable;
  const buildings:Building[] = [];
  for (let i = 0; i < t.length; i += 7) {
    buildings.push({ height: t[i], wall: [ t[i + 1], t[i + 2], t[i + 3] ], roof: [ t[i + 4], t[i + 5], t[i + 6] ] });
  }
  return {
    w,
    h,
    metersPerDot: BAKED.metersPerDot,
    maxBuildingHeight: BAKED.maxBuildingHeight,
    tiles: unrle(BAKED.tiles, new Uint8Array(w * h)),
    buildingIds: unrle(BAKED.buildings, new Uint16Array(w * h)),
    buildings,
    labels: BAKED.labels,
  };
}