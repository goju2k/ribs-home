// KEEP IN SYNC WITH app/ribs-app/src/app/rain-assist/util/rle.ts (decode 쪽)
// 그리드 대부분이 no-data(255)나 인접한 동일 값으로 이루어진 희소 데이터이므로
// 단순 Run-Length Encoding만으로도 큰 압축 효과를 얻는다. 포맷: [marker:1byte] + ([value:1byte][count:2byte LE])*
const RAW_MARKER = 0;
const ENCODED_MARKER = 1;
const MAX_RUN_LENGTH = 0xffff;

export function rleEncode(data:Buffer):Buffer {

  const bytes:number[] = [];
  let i = 0;

  while (i < data.length) {
    const value = data[i];
    let runLength = 1;
    while (i + runLength < data.length && data[i + runLength] === value && runLength < MAX_RUN_LENGTH) {
      runLength += 1;
    }
    bytes.push(value, runLength % 256, Math.floor(runLength / 256));
    i += runLength;
  }

  const encoded = Buffer.from(bytes);

  // 반복이 거의 없는 pathological 입력에서는 RLE가 원본보다 커질 수 있으므로 원본 그대로 저장하는 폴백을 둔다.
  if (encoded.length >= data.length) {
    return Buffer.concat([ Buffer.from([ RAW_MARKER ]), data ]);
  }

  return Buffer.concat([ Buffer.from([ ENCODED_MARKER ]), encoded ]);
}