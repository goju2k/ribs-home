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
import { Legends, NO_DATA_INDEX, RAIN_THRESHOLD_INDEX } from '../util/radar-legend';

// 캔버스 내부 래스터 해상도 상한. 브라우저의 캔버스 크기 한도를 넘어서면 화면이 하얗게 나온다.
const MAX_RASTER_DIMENSION = 1400;

// 화면 표시 크기(CSS)도 무한정 키우면 (줌 레벨에 따라 코너 간 거리가 계속 커짐) 마커 자체가
// 사라지는 문제가 있었다(/rain의 RainRadarLayer.tsx도 동일 앵커링 패턴이라 같은 증상 확인됨,
// 다만 그 파일은 규칙상 수정하지 않음). 표시 크기도 상한을 둬서 이 레이어만 더 안정적으로 만든다.
const MAX_SCREEN_DIMENSION = 6000;

function capSize(width:number, height:number, maxDimension:number) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  const aspect = width / height;
  if (aspect >= 1) {
    return { width: maxDimension, height: Math.round(maxDimension / aspect) };
  }
  return { width: Math.round(maxDimension * aspect), height: maxDimension };
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

      const screen = capSize(width, height, MAX_SCREEN_DIMENSION);
      const raster = capSize(width, height, MAX_RASTER_DIMENSION);

      setScreenWidth(screen.width);
      setScreenHeight(screen.height);
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

    // 프레임별로 실제 레이더 이미지와 동일하게 "셀 하나하나를 자기 색으로" 칠한다.
    // (이전 버전은 블롭 전체를 대표색 1개로 뭉뚱그려 채워서 실제 이미지와 모양·색이 크게 달라 보였다.)
    data.frames.forEach((frame, frameIndex) => {

      const opacity = opacityOf(frameIndex);
      ctx.globalAlpha = opacity;

      const cellWidth = rasterWidth / frame.grid.width;
      const cellHeight = rasterHeight / frame.grid.height;

      for (let row = 0; row < frame.grid.height; row += 1) {
        for (let col = 0; col < frame.grid.width; col += 1) {

          const value = frame.grid.data[(row * frame.grid.width) + col];

          if (value !== NO_DATA_INDEX) {
            const [ color ] = Legends[value] ?? Legends[Legends.length - 1];
            ctx.fillStyle = color;
            // 반올림 경계에서 셀 사이 흰 틈이 보이지 않도록 1px씩 여유를 두고 채운다
            ctx.fillRect(
              col * cellWidth,
              row * cellHeight,
              cellWidth + 1,
              cellHeight + 1,
            );
          }
        }
      }
    });

    // 블롭 검출은 (1) 외곽선 강조선, (2) 프레임 간 이동 추적선을 그리는 용도로만 사용
    const blobsByFrame:RainBlob[][] = data.frames.map((f) => detectBlobs(f.grid, RAIN_THRESHOLD_INDEX));

    data.frames.forEach((frame, frameIndex) => {

      const opacity = opacityOf(frameIndex);

      blobsByFrame[frameIndex].forEach((blob) => {

        if (blob.cells.length > 4) {
          const [ color ] = Legends[blob.peakIndex] ?? Legends[Legends.length - 1];
          ctx.strokeStyle = color;
          ctx.globalAlpha = opacity;
          ctx.lineWidth = 1.5;

          const outline = traceBlobOutline(frame.grid, blob)
            .map((p) => toCanvasPoint(frame.grid, p.row, p.col));
          drawSmoothClosedPath(ctx, outline);
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

  return (
    <MapMarkerWrapper position={radarStartPosition} disablePointerEvent>
      <canvas
        ref={canvasRef}
        // 줌 트랜지션 중에는 CSS로만 숨긴다 (canvasShow=false일 때 언마운트하면 캔버스 DOM 노드가
        // 새로 생기는데, rasterWidth/Height 값이 이전과 같으면 크기 설정 effect가 재실행되지
        // 않아 새 캔버스가 브라우저 기본 크기(300x150)로 남아 아무것도 안 보이는 버그가 있었다)
        style={{
          width: `${screenWidth}px`,
          height: `${screenHeight}px`,
          visibility: canvasShow ? 'visible' : 'hidden',
        }}
      />
    </MapMarkerWrapper>
  );
}