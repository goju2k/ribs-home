'use client';

import { MapControlWrapper, Position, useMintMapController } from '@mint-ui/map';
import { useEffect, useState } from 'react';
import styled from 'styled-components';

import { LatLng } from '../hook/use-auto-geo-location-hook';
import { haversineDistanceKm } from '../util/grid-projection';

interface GoToMyLocationButtonProps {
  userPosition?:LatLng;
}

// useInitialMapViewHook이 위치 획득 시 사용하는 기본 줌레벨과 동일해야 "내 위치로" 클릭 결과가
// 최초 랜딩 화면과 같은 느낌을 준다 — page.tsx의 `zoomLevel: initialCenter ? 14 : 7`과 동기화 필요.
const MY_LOCATION_ZOOM = 14;

// "조금이라도 벗어나면 inactive"의 실제 판정 기준값. 0(완전 일치)으로 하면 setCenter 직후
// 지도 라이브러리 자체의 부동소수점/투영 반올림 오차만으로도 "벗어남"으로 오판될 수 있어,
// 사람이 인지할 수 없는 수준(약 30m)만 허용오차로 흡수한다.
const AT_LOCATION_THRESHOLD_KM = 0.03;

// RainRadarLayer.tsx(파일 미수정)가 그리는 우하단 범례(MapLegendContainer, 24개 항목 + "mm/h"
// 라벨)의 실측 높이(366px, 자체 marginBottom 20px 포함 386px) 위에 버튼을 띄우기 위한 값.
// 두 MapControlWrapper는 서로의 크기를 모른 채 독립적으로 우하단에 고정되므로, 이 컴포넌트의
// marginBottom을 범례가 차지하는 공간(386px)보다 크게 주면 그 위에 쌓인 것처럼 보인다.
// RainRadarLayer.tsx의 범례 구성이 바뀌면(항목 수/폰트 등) 이 값도 Playwright로 재측정 필요.
const LEGEND_RESERVED_HEIGHT_PX = 386;
const BUTTON_GAP_PX = 10;

export function GoToMyLocationButton({ userPosition }:GoToMyLocationButtonProps) {

  const controller = useMintMapController();
  const [ isAtMyLocation, setIsAtMyLocation ] = useState(false);

  useEffect(() => {
    if (!userPosition) {
      return undefined;
    }

    const checkDistance = (center:Position) => {
      const distanceKm = haversineDistanceKm(userPosition, center);
      setIsAtMyLocation(distanceKm <= AT_LOCATION_THRESHOLD_KM);
    };

    checkDistance(controller.getCenter());

    const handleCenterChanged:Parameters<typeof controller.addEventListener>[1] = ({ param }) => {
      checkDistance(param.center);
    };

    controller.addEventListener('CENTER_CHANGED', handleCenterChanged);
    return () => {
      controller.removeEventListener('CENTER_CHANGED', handleCenterChanged);
    };

  }, [ userPosition ]);

  if (!userPosition) {
    return null;
  }

  const handleClick = () => {
    controller.setCenter(new Position(userPosition.lat, userPosition.lng));
    controller.setZoomLevel(MY_LOCATION_ZOOM);
    // 네이버 지도 컨트롤러는 프로그래매틱 setCenter에 대해 CENTER_CHANGED를 신뢰성 있게
    // 재발화하지 않는다(사용자 드래그 팬에는 정상 발화 — Playwright로 확인) — 이벤트에만
    // 의존하지 않고 클릭 시점에 직접 active로 전환한다. 이후 사용자가 다시 지도를 움직이면
    // CENTER_CHANGED가 정상 발화되어 inactive로 되돌아간다.
    setIsAtMyLocation(true);
  };

  return (
    <MapControlWrapper positionHorizontal='right' positionVertical='bottom'>
      <div style={{ marginBottom: `${LEGEND_RESERVED_HEIGHT_PX + BUTTON_GAP_PX}px`, marginRight: '10px' }}>
        <LocationButton type='button' onClick={handleClick} aria-label='내 위치로 이동' $active={isAtMyLocation}>
          <svg width='20' height='20' viewBox='0 0 24 24' fill='none'>
            <circle cx='12' cy='12' r='7' stroke='currentColor' strokeWidth='2' />
            <circle cx='12' cy='12' r='2' fill='currentColor' />
            <line x1='12' y1='1' x2='12' y2='4' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
            <line x1='12' y1='20' x2='12' y2='23' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
            <line x1='1' y1='12' x2='4' y2='12' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
            <line x1='20' y1='12' x2='23' y2='12' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
          </svg>
        </LocationButton>
      </div>
    </MapControlWrapper>
  );
}

const LocationButton = styled.button<{ $active:boolean; }>(({ $active }) => ({
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  background: 'white',
  border: '1px solid #ccc',
  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.3)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  cursor: 'pointer',
  color: $active ? '#1f6feb' : '#666',
}));