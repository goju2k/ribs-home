/* eslint-disable @next/next/no-img-element */

'use client';

import { MapMarkerWrapper, useMintMapController } from '@mint-ui/map';
import { useEffect, useRef, useState } from 'react';

import { getOffset } from '../../rain/util/map-util';
import { useCurrentDataHook } from '../hook/use-current-data-hook';
import { toPositions } from '../util/radar-geo';
import { Legends, NO_DATA_INDEX } from '../util/radar-legend';

function parseRgb(css:string):[number, number, number] {
  const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) {
    return [ 0, 0, 0 ];
  }
  return [ Number(m[1]), Number(m[2]), Number(m[3]) ];
}

const LEGEND_RGB = Legends.map(([ color ]) => parseRgb(color));

// current.json이 실제 KMA 레이더와 맞는지 디버깅하기 위한 "가공 없는" 원본 렌더링.
// 블롭 검출/외곽선/이동 추적선 없이 최신 프레임 1개만, 셀 하나하나를 원본 그대로 그린다.
// RainRadarLayer.tsx와 동일하게 <img> + CSS 스케일링을 사용해 줌 동작을 일치시킨다
// (캔버스를 CSS로 늘리는 방식은 확대 시 KMA 원본과 다르게 뭉개져 보이는 문제가 있었다).
export function RainVisualizationLayer() {

  const controller = useMintMapController();
  const positions = useRef(toPositions());
  const radarStartPosition = positions.current[1];

  const [ screenWidth, setScreenWidth ] = useState(1453);
  const [ screenHeight, setScreenHeight ] = useState(1381);
  const [ imageShow, setImageShow ] = useState(false);

  useEffect(() => {

    const handleZoomStart = () => {
      setImageShow(false);
    };

    const handleZoomChanged = () => {

      const offset1 = getOffset(controller, positions.current[2]);
      const offset2 = getOffset(controller, positions.current[1]);
      const width = Math.floor(offset1.x - offset2.x);

      const offset1y = getOffset(controller, positions.current[1]);
      const offset2y = getOffset(controller, positions.current[0]);
      const height = Math.floor(offset2y.y - offset1y.y);

      setScreenWidth(width);
      setScreenHeight(height);
      setImageShow(true);
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
  const [ imageSrc, setImageSrc ] = useState<string>();

  useEffect(() => {

    if (!data || data.frames.length === 0) {
      return;
    }

    const frame = data.frames[data.frames.length - 1];
    const { grid } = frame;

    const canvas = document.createElement('canvas');
    canvas.width = grid.width;
    canvas.height = grid.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const imageData = ctx.createImageData(grid.width, grid.height);
    for (let i = 0; i < grid.data.length; i += 1) {

      const value = grid.data[i];
      const pixelIdx = i * 4;

      if (value === NO_DATA_INDEX) {
        // 실제 KMA PNG와 동일하게 강수 없는 곳은 투명 처리(배경 지도 노출)
        imageData.data[pixelIdx + 3] = 0;
      } else {
        const [ r, g, b ] = LEGEND_RGB[value] ?? LEGEND_RGB[LEGEND_RGB.length - 1];
        imageData.data[pixelIdx] = r;
        imageData.data[pixelIdx + 1] = g;
        imageData.data[pixelIdx + 2] = b;
        imageData.data[pixelIdx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    setImageSrc(canvas.toDataURL('image/png'));

  }, [ data ]);

  return (
    <MapMarkerWrapper position={radarStartPosition} disablePointerEvent>
      <div
        style={{
          width: `${screenWidth}px`,
          height: `${screenHeight}px`,
          visibility: imageShow ? 'visible' : 'hidden',
        }}
      >
        {imageSrc && (
          <img
            src={imageSrc}
            alt='rain-assist debug'
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </div>
    </MapMarkerWrapper>
  );
}