import { bilinearInverse, LatLng } from './grid-projection';

export interface LatLngBounds {
  north:number;
  south:number;
  west:number;
  east:number;
}

export interface WarpedImage {
  dataUrl:string;
  bounds:LatLngBounds;
}

// RADAR_CORNERS(사다리꼴 — LCC 격자를 위경도로 표현하면 사각형이 아니다)로 표현된 source 이미지를
// 위경도 기준 "순수 직사각형"으로 재샘플링한다. 출력 캔버스의 각 픽셀(위경도 선형 격자)이 원본의
// 어느 (u,v) 지점에서 왔는지 bilinearInverse로 역산해 그 픽셀을 샘플링 — CSS `matrix3d` 같은
// 단일 projective 변환으로는 bilinear 보간(u*v 교차항 포함)을 표현할 수 없어서(이 프로젝트의
// 예보 로직이 실제 강수 데이터로 이미 여러 차례 검증한 grid-projection.ts의 bilinearForward/
// Inverse가 bilinear 모델이다 — quad-warp.ts의 projective 근사는 이미지 중심에서 이 모델과
// 약 37km나 어긋나는 것으로 확인되어 폐기) 캔버스에서 한 번 미리 보정해 순수 직사각형으로 만들어
// 두면, 이후엔 RainRadarLayer.tsx가 이미 하는 것과 동일한 "2개 꼭짓점만으로 폭/높이를 재는" 단순
// CSS 스트레치로도 (이제 실제로 직사각형이므로) 정확하게 화면에 배치할 수 있다.
export function warpToLatLngRectangle(
  source:CanvasImageSource,
  sourceWidth:number,
  sourceHeight:number,
  corners:[number, number][], // RADAR_CORNERS 형식, [bottomLeft, topLeft, topRight, bottomRight]
  outputSize = 1200,
):WarpedImage | null {

  const latLngCorners:LatLng[] = corners.map(([ lat, lng ]) => ({ lat, lng }));
  const lats = latLngCorners.map((c) => c.lat);
  const lngs = latLngCorners.map((c) => c.lng);
  const north = Math.max(...lats);
  const south = Math.min(...lats);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = sourceWidth;
  srcCanvas.height = sourceHeight;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) {
    return null;
  }
  srcCtx.drawImage(source, 0, 0, sourceWidth, sourceHeight);
  const srcData = srcCtx.getImageData(0, 0, sourceWidth, sourceHeight).data;

  const aspect = (east - west) / (north - south);
  const outputWidth = Math.max(1, Math.round(aspect >= 1 ? outputSize : outputSize * aspect));
  const outputHeight = Math.max(1, Math.round(aspect >= 1 ? outputSize / aspect : outputSize));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outputWidth;
  outCanvas.height = outputHeight;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    return null;
  }
  const outImage = outCtx.createImageData(outputWidth, outputHeight);

  for (let oy = 0; oy < outputHeight; oy += 1) {
    const lat = north - ((oy / Math.max(1, outputHeight - 1)) * (north - south));
    for (let ox = 0; ox < outputWidth; ox += 1) {
      const lng = west + ((ox / Math.max(1, outputWidth - 1)) * (east - west));
      const outIdx = ((oy * outputWidth) + ox) * 4;

      const uv = bilinearInverse(latLngCorners, { lat, lng });
      const outOfBounds = !uv || uv.u < 0 || uv.u > 1 || uv.v < 0 || uv.v > 1;

      if (outOfBounds) {
        outImage.data[outIdx + 3] = 0; // 사다리꼴 바깥(위경도 직사각형의 모서리 삼각형) — 투명
      } else {
        const sx = Math.min(sourceWidth - 1, Math.max(0, Math.round(uv.u * (sourceWidth - 1))));
        const sy = Math.min(sourceHeight - 1, Math.max(0, Math.round(uv.v * (sourceHeight - 1))));
        const srcIdx = ((sy * sourceWidth) + sx) * 4;

        outImage.data[outIdx] = srcData[srcIdx];
        outImage.data[outIdx + 1] = srcData[srcIdx + 1];
        outImage.data[outIdx + 2] = srcData[srcIdx + 2];
        outImage.data[outIdx + 3] = srcData[srcIdx + 3];
      }
    }
  }

  outCtx.putImageData(outImage, 0, 0);

  return {
    dataUrl: outCanvas.toDataURL('image/png'),
    bounds: { north, south, west, east },
  };
}