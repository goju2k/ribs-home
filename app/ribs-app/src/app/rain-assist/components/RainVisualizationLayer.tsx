'use client';

import { MapMarkerWrapper, useMintMapController } from '@mint-ui/map';
import { useEffect, useRef, useState } from 'react';

import { getOffset } from '../../rain/util/map-util';
import { useCurrentDataHook } from '../hook/use-current-data-hook';
import { detectBlobs, RainBlob, traceBlobOutline } from '../util/blob-detection';
import { matchNearestBlobs } from '../util/blob-tracking';
import { drawSmoothClosedPath } from '../util/canvas-smooth-path';
import { RadarGrid } from '../util/motion-estimation';
import { toPositions } from '../util/radar-geo';
import { Legends, RAIN_THRESHOLD_INDEX } from '../util/radar-legend';

// 캔버스 내부 래스터 해상도 상한. 줌 레벨에 따라 화면 픽셀 크기(screenWidth/Height)는
// 계속 커지지만, 이걸 그대로 canvas.width/height에 넣으면 브라우저의 캔버스 크기 한도를
// 넘어서 화면이 하얗게 나오는 문제가 생긴다. CSS(style)로만 확대하고 실제 래스터 해상도는
// 고정 상한 이하로 유지 — 확대할수록 오히려 작은 셀도 더 크게 보이는 효과도 덤으로 얻는다.
const MAX_RASTER_DIMENSION = 1400;

// 아주 작은 블롭(몇 셀)은 얇은 외곽선만으로는 잘 안 보이므로 원으로 표시
const SMALL_BLOB_CELL_THRESHOLD = 4;
const SMALL_BLOB_RADIUS = 4;

function capRasterSize(width:number, height:number) {
  if (width <= MAX_RASTER_DIMENSION && height <= MAX_RASTER_DIMENSION) {
    return { width, height };
  }
  const aspect = width / height;
  if (aspect >= 1) {
    return { width: MAX_RASTER_DIMENSION, height: Math.round(MAX_RASTER_DIMENSION / aspect) };
  }
  return { width: Math.round(MAX_RASTER_DIMENSION * aspect), height: MAX_RASTER_DIMENSION };
}

// current.json을 사람이 눈으로 검증하기 위한 시각화. RainRadarLayer.tsx와 스위치 관계이며
// 이 레이어 자체는 마운트/언마운트로만 켜고 끄므로(page.tsx) 별도 on/off 플래그가 없다.
export function RainVisualizationLayer() {

  const controller = useMintMapController();
  const positions = useRef(toPositions());
  const radarStartPosition = positions.current[1];

  // RainRadarLayer.tsx와 동일한 앵커링 패턴: top-left 꼭짓점에 고정, 줌마다 폭/높이 재계산
  const [ screenWidth, setScreenWidth ] = useState(1453);
  const [ screenHeight, setScreenHeight ] = useState(1381);
  const [ rasterWidth, setRasterWidth ] = useState(1400);
  const [ rasterHeight, setRasterHeight ] = useState(1332);
  const [ canvasShow, setCanvasShow ] = useState(false);

  useEffect(() => {

    const handleZoomStart = () => {
      setCanvasShow(false);
    };

    const handleZoomChanged = () => {

      const offset1 = getOffset(controller, positions.current[2]);
      const offset2 = getOffset(controller, positions.current[1]);
      const width = Math.floor(offset1.x - offset2.x);

      const offset1y = getOffset(controller, positions.current[1]);
      const offset2y = getOffset(controller, positions.current[0]);
      const height = Math.floor(offset2y.y - offset1y.y);

      const raster = capRasterSize(width, height);

      setScreenWidth(width);
      setScreenHeight(height);
      setRasterWidth(raster.width);
      setRasterHeight(raster.height);
      setCanvasShow(true);
    };

    handleZoomChanged();
    controller.addEventListener('ZOOMSTART', handleZoomStart);
    controller.addEventListener('ZOOM_CHANGED', handleZoomChanged);

    return () => {
      controller.removeEventListener('ZOOMSTART', handleZoomStart);
      controller.removeEventListener('ZOOM_CHANGED', handleZoomChanged);
    };

  }, []);

  const data = useCurrentDataHook();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {

    const canvas = canvasRef.current;
    if (!canvas || !data || data.frames.length === 0) {
      return;
    }

    canvas.width = rasterWidth;
    canvas.height = rasterHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, rasterWidth, rasterHeight);

    const frameCount = data.frames.length;
    const denom = Math.max(frameCount - 1, 1);
    const opacityOf = (frameIndex:number) => 0.25 + (0.75 * (frameIndex / denom));

    const toCanvasPoint = (grid:RadarGrid, row:number, col:number) => ({
      x: (col / grid.width) * rasterWidth,
      y: (row / grid.height) * rasterHeight,
    });

    const blobsByFrame:RainBlob[][] = data.frames.map((f) => detectBlobs(f.grid, RAIN_THRESHOLD_INDEX));

    data.frames.forEach((frame, frameIndex) => {

      const opacity = opacityOf(frameIndex);

      blobsByFrame[frameIndex].forEach((blob) => {

        const legendEntry = Legends[blob.peakIndex] ?? Legends[Legends.length - 1];
        const [ color ] = legendEntry;

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        ctx.lineWidth = 1.5;

        if (blob.cells.length <= SMALL_BLOB_CELL_THRESHOLD) {
          const center = toCanvasPoint(frame.grid, blob.centroidRow, blob.centroidCol);
          ctx.beginPath();
          ctx.arc(center.x, center.y, SMALL_BLOB_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const outline = traceBlobOutline(frame.grid, blob)
            .map((p) => toCanvasPoint(frame.grid, p.row, p.col));
          // 실제 레이더 이미지처럼 면이 채워져 보이도록 외곽선(stroke) + 반투명 채우기(fill)를 함께 그린다
          drawSmoothClosedPath(ctx, outline, { fill: true });
        }
      });
    });

    for (let i = 0; i < data.frames.length - 1; i += 1) {

      const fromBlobs = blobsByFrame[i];
      const toBlobs = blobsByFrame[i + 1];
      const pairs = matchNearestBlobs(fromBlobs, toBlobs);

      ctx.strokeStyle = 'white';
      ctx.globalAlpha = (opacityOf(i) + opacityOf(i + 1)) / 2;
      ctx.lineWidth = 1;

      pairs.forEach(({ from, to }) => {
        const p1 = toCanvasPoint(data.frames[i].grid, from.centroidRow, from.centroidCol);
        const p2 = toCanvasPoint(data.frames[i + 1].grid, to.centroidRow, to.centroidCol);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });
    }

    ctx.globalAlpha = 1;

  }, [ data, rasterWidth, rasterHeight ]);

  if (!canvasShow) {
    return null;
  }

  return (
    <MapMarkerWrapper position={radarStartPosition} disablePointerEvent>
      <canvas
        ref={canvasRef}
        style={{ width: `${screenWidth}px`, height: `${screenHeight}px` }}
      />
    </MapMarkerWrapper>
  );
}