import { latLngToLccPixel, lccPixelToLatLng } from './kma-lcc-projection';

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

// 원본 PNG는 LCC(EPSG:980201) 좌표계에서 정확한 직사각형이지만, 위경도로 표현하면 사각형이
// 아니라 사다리꼴이다(kma-lcc-projection.ts 참고 — weather.go.kr 자체가 이 정확한 투영식+
// extent로 OpenLayers ol.source.ImageStatic에 등록해 그린다). 이 함수는 그 사다리꼴 원본을
// 위경도 기준 "순수 직사각형"으로 재샘플링한다 — 출력 캔버스의 각 픽셀(위경도 선형 격자)마다
// kma-lcc-projection.ts의 실제 LCC 역변환(근사 없음, proj4)으로 원본의 어느 픽셀에서 왔는지
// 구해 샘플링한다. CSS `matrix3d` 같은 단일 projective 변환으로는 이 관계를 표현할 수 없어서
// (첫 시도였던 quad-warp.ts, 이후 이 프로젝트가 실제 데이터로 검증해온 bilinear 근사였던
// 이전 radar-lcc-warp.ts 둘 다 폐기 — 자세한 경위는 project_rain_assist_feature 메모리 참고)
// 캔버스에서 한 번 미리 보정해 순수 직사각형으로 만들어 두면, 이후엔 RainRadarLayer.tsx가 이미
// 하는 것과 동일한 "2개 꼭짓점만으로 폭/높이를 재는" 단순 CSS 스트레치로도 정확하게 배치할 수 있다.
export function warpToLatLngRectangle(
  source:CanvasImageSource,
  sourceWidth:number,
  sourceHeight:number,
  outputSize = 1200,
):WarpedImage | null {

  // 원본 이미지 4개 꼭짓점을 실제 LCC 공식으로 위경도 변환해 정확한 경계 상자를 구한다.
  const corners = [
    lccPixelToLatLng(0, 0, sourceWidth, sourceHeight),
    lccPixelToLatLng(sourceWidth, 0, sourceWidth, sourceHeight),
    lccPixelToLatLng(0, sourceHeight, sourceWidth, sourceHeight),
    lccPixelToLatLng(sourceWidth, sourceHeight, sourceWidth, sourceHeight),
  ];
  const north = Math.max(...corners.map((c) => c.lat));
  const south = Math.min(...corners.map((c) => c.lat));
  const west = Math.min(...corners.map((c) => c.lng));
  const east = Math.max(...corners.map((c) => c.lng));

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

      const { px, py } = latLngToLccPixel({ lat, lng }, sourceWidth, sourceHeight);
      const outOfBounds = px < 0 || px > sourceWidth - 1 || py < 0 || py > sourceHeight - 1;

      if (outOfBounds) {
        outImage.data[outIdx + 3] = 0; // LCC 사각형(=사다리꼴) 바깥 — 투명
      } else {
        const sx = Math.min(sourceWidth - 1, Math.max(0, Math.round(px)));
        const sy = Math.min(sourceHeight - 1, Math.max(0, Math.round(py)));
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