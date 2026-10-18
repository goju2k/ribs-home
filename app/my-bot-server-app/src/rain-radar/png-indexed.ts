import { PNG } from 'pngjs';

import { deflateSync } from 'zlib';

// KMA 레이더 원본은 25색 팔레트 PNG다. pngjs는 RGBA로만 저장할 수 있어 타일로 잘라 다시 쓰면
// 원본보다 2배 넘게 커지므로(실측 94KB → 타일 합 234KB), 팔레트(color type 3) PNG로 직접 인코딩한다.
// 256색을 넘으면(정상 데이터에선 없음) pngjs RGBA로 대신 쓴다. 픽셀 값은 어느 쪽이든 무손실.

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      // eslint-disable-next-line no-bitwise
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf:Buffer):number {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  // eslint-disable-next-line no-bitwise
  return (c ^ -1) >>> 0;
}

function chunk(type:string, data:Buffer):Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([ Buffer.from(type, 'ascii'), data ]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([ length, typeAndData, crc ]);
}

const SIGNATURE = Buffer.from([ 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A ]);

/** RGBA 픽셀(행 우선, 4바이트/픽셀)을 PNG로. */
export function encodePng(width:number, height:number, rgba:Buffer):Buffer {

  const paletteIndex = new Map<number, number>();
  const indices = Buffer.alloc(height * (width + 1)); // 행마다 필터 바이트(0) + 인덱스
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = rgba.readUInt32BE(((y * width) + x) * 4);
      let index = paletteIndex.get(color);
      if (index === undefined) {
        if (paletteIndex.size === 256) {
          const png = new PNG({ width, height });
          rgba.copy(png.data);
          return PNG.sync.write(png);
        }
        index = paletteIndex.size;
        paletteIndex.set(color, index);
      }
      indices[(y * (width + 1)) + 1 + x] = index;
    }
  }

  const colors = [ ...paletteIndex.keys() ];
  const plte = Buffer.alloc(colors.length * 3);
  const trns = Buffer.alloc(colors.length);
  colors.forEach((color, i) => {
    const rgbaBytes = Buffer.alloc(4);
    rgbaBytes.writeUInt32BE(color);
    rgbaBytes.copy(plte, i * 3, 0, 3);
    trns.writeUInt8(rgbaBytes.readUInt8(3), i);
  });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // color type: palette
  // compression/filter/interlace = 0

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('tRNS', trns),
    chunk('IDAT', deflateSync(indices, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);

}