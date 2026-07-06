/* eslint-disable @next/next/no-img-element */

'use client';

import { MapMarkerWrapper, useMintMapController } from '@mint-ui/map';
import { useEffect, useRef, useState } from 'react';

import { getOffset } from '../../rain/util/map-util';
import { useCurrentDataHook } from '../hook/use-current-data-hook';
import { toPositions } from '../util/radar-geo';

// current.json이 실제 KMA 레이더와 맞는지 디버깅하기 위한 "가공 없는" 원본 렌더링.
// S3가 원본 KMA PNG(base64)를 그대로 발행하므로, 여기서도 그 바이트를 재가공(분류/재색칠) 없이
// <img>로 그대로 보여준다 — 재분류해서 다시 그리면 그 과정에서 원본과 미세하게 다른 모양이
// 생길 수 있으므로, 시각화 확인 모드의 목적(원본과 실제로 같은지 확인) 자체가 항상 성립하도록
// 원본 바이트를 그대로 쓴다. RainRadarLayer.tsx와 동일하게 <img> + CSS 스케일링을 사용해
// 줌 동작을 일치시킨다(캔버스를 CSS로 늘리는 방식은 확대 시 KMA 원본과 다르게 뭉개져 보였다).
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
  const imageSrc = data ? `data:image/png;base64,${data.latestPngBase64}` : undefined;

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