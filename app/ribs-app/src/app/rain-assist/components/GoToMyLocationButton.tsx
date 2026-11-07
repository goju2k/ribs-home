'use client';

import { MapControlWrapper, Position, useMintMapController } from '@mint-ui/map';
import { useEffect, useState } from 'react';
import styled from 'styled-components';

import { MAP_BUTTON_BOTTOM_PX, MAP_BUTTON_SIDE_PX, mapButtonStyle } from './map-button-style';

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
    <MapControlWrapper positionHorizontal='right' positionVertical='bottom' disablePointerEvent>
      {/* MapControlWrapper 자체의 내부 래퍼 div가 기본적으로 pointer-events:auto라 fit-content
          크기 계산이 어긋나면 그 영역 아래 지도(마커 포함) 클릭이 최상단에서부터 막힐 수 있다
          — disablePointerEvent로 그 레이어 전체를 뚫어놓고, 아래 스페이서(마진 전용)도 한 번 더
          none 처리한 뒤, 실제 눌리는 버튼에서만 auto로 되돌려 지도 클릭/터치가 가려지지 않게 한다. */}
      <div style={{ marginBottom: `${MAP_BUTTON_BOTTOM_PX}px`, marginRight: `${MAP_BUTTON_SIDE_PX}px`, pointerEvents: 'none' }}>
        <LocationButton type='button' onClick={handleClick} aria-label='내 위치로 이동' $active={isAtMyLocation}>
          <svg width='22' height='22' viewBox='0 0 24 24' fill='none'>
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
  ...mapButtonStyle,
  color: $active ? '#1f6feb' : '#2B3640',
}));