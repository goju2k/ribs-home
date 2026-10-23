/* eslint-disable no-bitwise -- 바이너리 인코딩 비트 묶음 */
/**
 * 자주 오가는 두 메시지(스냅숏, 입력)의 바이너리 형식. 나머지(입장·퇴장·신호)는 JSON.
 * 모두 리틀 엔디언. 첫 바이트가 종류.
 *
 * 스냅숏 (서버 → 클라이언트)
 *   u8 1 | u32 tick | u32 ack | me: f64 × ME (x y z f spd a b l lw fly vy sm fm car fuel — 예측 보정용이라 정밀값) | u8 내 상태 비트 | u8 내 게이지
 *   u16 행 수 | 행마다 20바이트:
 *     u16 id | i32 x(cm) | i32 z(cm) | u16 y(cm) | u8 방향(256단계) | u8 걷는 속도(×10, 25.5m/s까지) | i16 건물 | u8 층 | u8 상태 비트 | u8 게이지 | u8 모습 종류(0 사람, 그 밖은 모드의 NPC)
 * 입력 (클라이언트 → 서버)
 *   u8 2 | u8 개수 | 개마다 13바이트: u32 순번 | i16 mx×1000 | i16 mz×1000 | u8 (bit0 달리기, bit1 위, bit2 아래, bit3 보는 방향 있음, bit4~6 행동) | i16 보는 방향×10000 | i16 조준 높이각×10000
 */
import { NO_FACE } from './index';
import type { BodyTuple, InputTuple, SnapRow } from './index';

export const BIN_SNAP = 1;
export const BIN_INPUT = 2;

const ROW = 20;
/** 내 상태 값 개수 (BodyTuple 길이) */
const ME = 15;
const HEAD = 1 + 4 + 4 + ME * 8 + 2;
const IN = 13;
const TAU = Math.PI * 2;

export interface Snap {
  tick: number; ack: number; me: BodyTuple; ms: number; mv: number; rows: SnapRow[];
}

const u8 = (n:number) => Math.max(0, Math.min(255, Math.round(n)));

/** 행 하나를 o 자리에 (ROW 바이트) */
function writeRow(d:DataView, o:number, [ id, x, y, z, f, a, b, l, s, v, k ]:SnapRow) {
  d.setUint16(o, id, true);
  d.setInt32(o + 2, Math.round(x * 100), true);
  d.setInt32(o + 6, Math.round(z * 100), true);
  d.setUint16(o + 10, Math.max(0, Math.min(65535, Math.round(y * 100))), true);
  d.setUint8(o + 12, Math.round((((f % TAU) + TAU) % TAU) / TAU * 256) & 255);
  d.setUint8(o + 13, Math.max(0, Math.min(255, Math.round(a * 10))));
  d.setInt16(o + 14, b, true);
  d.setUint8(o + 16, Math.max(0, Math.min(255, l)));
  d.setUint8(o + 17, u8(s));
  d.setUint8(o + 18, u8(v));
  d.setUint8(o + 19, u8(k));
}

/** 머리 (행 수까지) — 끝 자리를 돌려준다 */
function writeHead(d:DataView, tick:number, ack:number, me:BodyTuple, ms:number, mv:number, n:number) {
  let o = 0;
  d.setUint8(o, BIN_SNAP);
  o += 1;
  d.setUint32(o, tick, true);
  o += 4;
  d.setUint32(o, ack, true);
  o += 4;
  me.forEach((v) => {
    d.setFloat64(o, v, true);
    o += 8;
  });
  d.setUint8(o, u8(ms));
  d.setUint8(o + 1, u8(mv));
  o += 2;
  d.setUint16(o, n, true);
  return o + 2;
}

export function encodeSnap(tick:number, ack:number, me:BodyTuple, ms:number, mv:number, rows:SnapRow[]) {
  const buf = new ArrayBuffer(HEAD + 2 + rows.length * ROW);
  const d = new DataView(buf);
  let o = writeHead(d, tick, ack, me, ms, mv, rows.length);
  rows.forEach((r) => {
    writeRow(d, o, r);
    o += ROW;
  });
  return buf;
}

/**
 * 서버용: 이번 틱의 모든 행을 한 번만 바이트로 만들어 두고(packRows), 받는 사람마다 고른 행만 복사한다 (encodeSnap과 같은 결과).
 * 받는 사람이 많을수록 같은 행을 사람 수만큼 다시 쓰지 않아도 된다
 */
export function packRows(rows:SnapRow[]) {
  const out = new Uint8Array(rows.length * ROW);
  const d = new DataView(out.buffer);
  rows.forEach((r, i) => writeRow(d, i * ROW, r));
  return out;
}

/** packRows로 만든 행 중 pick[0..n) 번째들로 스냅숏 */
export function encodeSnapPacked(tick:number, ack:number, me:BodyTuple, ms:number, mv:number, packed:Uint8Array, pick:ArrayLike<number>, n:number) {
  const buf = new ArrayBuffer(HEAD + 2 + n * ROW);
  const o = writeHead(new DataView(buf), tick, ack, me, ms, mv, n);
  const bytes = new Uint8Array(buf);
  // 20바이트씩이라 subarray를 만들기보다 바로 옮기는 게 빠르다
  for (let i = 0; i < n; i++) {
    const src = pick[i] * ROW;
    const dst = o + i * ROW;
    for (let k = 0; k < ROW; k++) bytes[dst + k] = packed[src + k];
  }
  return buf;
}

export function decodeSnap(buf:ArrayBuffer):Snap | null {
  if (buf.byteLength < HEAD + 2) return null;
  const d = new DataView(buf);
  if (d.getUint8(0) !== BIN_SNAP) return null;
  const tick = d.getUint32(1, true);
  const ack = d.getUint32(5, true);
  const me = Array.from({ length: ME }, (_, i) => d.getFloat64(9 + i * 8, true)) as BodyTuple;
  const ms = d.getUint8(9 + ME * 8);
  const mv = d.getUint8(10 + ME * 8);
  const n = d.getUint16(HEAD, true);
  if (buf.byteLength < HEAD + 2 + n * ROW) return null;
  const rows:SnapRow[] = [];
  for (let i = 0, o = HEAD + 2; i < n; i++, o += ROW) {
    rows.push([
      d.getUint16(o, true),
      d.getInt32(o + 2, true) / 100,
      d.getUint16(o + 10, true) / 100,
      d.getInt32(o + 6, true) / 100,
      (d.getUint8(o + 12) / 256) * TAU,
      d.getUint8(o + 13) / 10,
      d.getInt16(o + 14, true),
      d.getUint8(o + 16),
      d.getUint8(o + 17),
      d.getUint8(o + 18),
      d.getUint8(o + 19),
    ]);
  }
  return { tick, ack, me, ms, mv, rows };
}

/** 입력의 mx·mz는 클라이언트가 이미 1/1000로 반올림해 계산하므로, ×1000 정수로 보내도 서버가 똑같은 값을 쓴다 */
export function encodeInputs(cmds:InputTuple[]) {
  const list = cmds.slice(-255);
  const buf = new ArrayBuffer(2 + list.length * IN);
  const d = new DataView(buf);
  d.setUint8(0, BIN_INPUT);
  d.setUint8(1, list.length);
  list.forEach(([ seq, mx, mz, run, lift, face, act, pitch ], i) => {
    const o = 2 + i * IN;
    const hasFace = face !== NO_FACE;
    d.setUint32(o, seq, true);
    d.setInt16(o + 4, Math.round(mx * 1000), true);
    d.setInt16(o + 6, Math.round(mz * 1000), true);
    d.setUint8(o + 8, (run ? 1 : 0) | (lift > 0 ? 2 : 0) | (lift < 0 ? 4 : 0) | (hasFace ? 8 : 0) | ((act & 7) << 4));
    d.setInt16(o + 9, hasFace ? Math.round(face * 10000) : 0, true);
    d.setInt16(o + 11, Math.round(Math.max(-1.6, Math.min(1.6, pitch)) * 10000), true);
  });
  return buf;
}

export function decodeInputs(buf:ArrayBuffer):InputTuple[] | null {
  if (buf.byteLength < 2) return null;
  const d = new DataView(buf);
  if (d.getUint8(0) !== BIN_INPUT) return null;
  const n = d.getUint8(1);
  if (buf.byteLength < 2 + n * IN) return null;
  const out:InputTuple[] = [];
  for (let i = 0; i < n; i++) {
    const o = 2 + i * IN;
    const flags = d.getUint8(o + 8);
    const face = flags & 8 ? d.getInt16(o + 9, true) / 10000 : NO_FACE;
    out.push([ d.getUint32(o, true), d.getInt16(o + 4, true) / 1000, d.getInt16(o + 6, true) / 1000, flags & 1, (flags & 2 ? 1 : 0) - (flags & 4 ? 1 : 0), face, (flags >> 4) & 7, d.getInt16(o + 11, true) / 10000 ]);
  }
  return out;
}

/** 서버(Node Buffer)·브라우저 어느 쪽에서 받은 바이너리든 ArrayBuffer로 */
export function toArrayBuffer(data:ArrayBuffer | ArrayBufferView):ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}