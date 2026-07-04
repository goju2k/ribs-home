// KEEP IN SYNC WITH app/my-bot-server-app/src/rain-radar/rle.ts (encode 쪽)
// 포맷: [marker:1byte] + ([value:1byte][count:2byte LE])*, marker===0이면 압축 없이 원본 그대로.
const RAW_MARKER = 0;

export function rleDecode(encoded:Uint8Array, expectedLength:number):Uint8Array {

  const marker = encoded[0];
  const payload = encoded.subarray(1);

  if (marker === RAW_MARKER) {
    return payload.subarray(0, expectedLength);
  }

  const data = new Uint8Array(expectedLength);
  let outIdx = 0;

  for (let i = 0; i + 2 < payload.length && outIdx < expectedLength; i += 3) {
    const value = payload[i];
    const runLength = payload[i + 1] + (payload[i + 2] * 256);
    const end = Math.min(outIdx + runLength, expectedLength);
    data.fill(value, outIdx, end);
    outIdx = end;
  }

  return data;
}