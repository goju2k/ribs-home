'use client';

import { MapControlWrapper, MapMarkerWrapper, Position } from '@mint-ui/map';
import styled from 'styled-components';
import { Flex } from 'ui-base-pack';

import { RainDirectionArrowIcon } from './RainDirectionArrowIcon';

import { useRainPredictionHook } from '../hook/use-rain-prediction-hook';
import { LatLng } from '../util/grid-projection';

interface RainForecastLayerProps {
  userPosition?:LatLng;
}

// /rain-assist 전용 레이어. 이 페이지 자체가 예보 기능 전용이므로 별도 on/off 플래그 없이 항상 활성화된다.
export function RainForecastLayer({ userPosition }:RainForecastLayerProps) {

  const forecast = useRainPredictionHook({ userPosition, enabled: !!userPosition });

  if (!userPosition) {
    return null;
  }

  const markerPosition = new Position(userPosition.lat, userPosition.lng);

  let badgeText = '';
  if (forecast.status === 'result') {
    badgeText = `${Math.round(forecast.etaMinutes)}분 후 비 예상`;
  } else if (forecast.status === 'no-signal' || forecast.status === 'no-motion') {
    badgeText = '감지된 강수 없음';
  }

  return (
    <>
      {badgeText && (
        <MapControlWrapper positionHorizontal='left' positionVertical='top'>
          <BadgeContainer>
            <Flex flexfit>{badgeText}</Flex>
          </BadgeContainer>
        </MapControlWrapper>
      )}

      {forecast.status === 'result' && (
        <MapMarkerWrapper position={markerPosition} disablePointerEvent>
          <ArrowOffset>
            <ArrowRotate style={{ transform: `rotate(${forecast.bearingDeg}deg)` }}>
              <RainDirectionArrowIcon />
            </ArrowRotate>
          </ArrowOffset>
        </MapMarkerWrapper>
      )}
    </>
  );
}

const BadgeContainer = styled.div({
  background: 'white',
  border: '1px solid gray',
  borderRadius: '8px',
  padding: '5px 8px',
  marginTop: '20px',
  marginLeft: '10px',
  fontSize: '14px',
});

// 마커 기준점에서 우상단으로 살짝 띄워 RainRadarLayer의 "현재위치" 점/화살표와 겹치지 않도록 함
const ArrowOffset = styled.div({
  position: 'absolute',
  transform: 'translate(-50%, -50%) translate(20px, -20px)',
});

const ArrowRotate = styled.div({ transformOrigin: 'center' });