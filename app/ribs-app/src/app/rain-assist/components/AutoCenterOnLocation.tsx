'use client';

import { Position, useMintMapController } from '@mint-ui/map';
import { useEffect, useRef } from 'react';

import { LatLng } from '../util/grid-projection';

interface AutoCenterOnLocationProps {
  userPosition?:LatLng;
}

// 최초로 위치를 얻은 시점에 한해 지도를 사용자 위치로 이동시키고 줌레벨 14로 확대한다(랜딩
// 직후 기본 줌(7, 전국 단위)으로는 내 주변 지역을 자세히 보기 어렵다는 피드백에 따름).
// 5분마다의 자동 위치 재갱신 때는 사용자가 이미 지도를 직접 움직였을 수 있으므로
// 다시 강제로 재중심/재줌하지 않는다(최초 1회만).
export function AutoCenterOnLocation({ userPosition }:AutoCenterOnLocationProps) {

  const controller = useMintMapController();
  const centeredRef = useRef(false);

  useEffect(() => {
    if (userPosition && !centeredRef.current) {
      centeredRef.current = true;
      controller.setCenter(new Position(userPosition.lat, userPosition.lng));
      controller.setZoomLevel(14);
    }
  }, [ userPosition ]);

  return null;
}