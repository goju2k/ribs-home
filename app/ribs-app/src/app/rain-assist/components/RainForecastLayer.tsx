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

  let badgeText = '감지된 강수 없음';
  if (forecast.status === 'result') {
    badgeText = `${Math.round(forecast.etaMinutes)}분 후 비 예상`;
  } else if (forecast.status === 'raining') {
    badgeText = '비가 오는 중';
  }

  return (
    <>
      <MapControlWrapper positionHorizontal='left' positionVertical='top'>
        <BadgeContainer>
          <Flex flexfit>{badgeText}</Flex>
          {/* 지도는 최초 3초 대기(useInitialMapViewHook) 이후에도 위치를 못 얻으면 시작되므로,
              여기서 userPosition이 없다는 건 그 이후에도 백그라운드에서 계속 위치를 찾는 중이라는 뜻 */}
          {!userPosition && <SearchingText>위치를 찾는 중...</SearchingText>}
        </BadgeContainer>
      </MapControlWrapper>

      {forecast.status === 'result' && userPosition && (
        <MapMarkerWrapper position={new Position(userPosition.lat, userPosition.lng)} disablePointerEvent>
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
  marginTop: '10px',
  marginLeft: '10px',
  fontSize: '14px',
});

const SearchingText = styled.div`
  margin-top: 4px;
  font-size: 12px;
  color: #888;
  animation: rain-assist-blink 1.2s ease-in-out infinite;

  @keyframes rain-assist-blink {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.2;
    }
  }
`;

// 마커 기준점에서 우상단으로 살짝 띄워 RainRadarLayer의 "현재위치" 점/화살표와 겹치지 않도록 함
const ArrowOffset = styled.div({
  position: 'absolute',
  transform: 'translate(-50%, -50%) translate(20px, -20px)',
});

const ArrowRotate = styled.div({ transformOrigin: 'center' });