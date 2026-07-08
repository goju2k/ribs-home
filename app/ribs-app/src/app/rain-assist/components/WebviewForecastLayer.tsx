'use client';

import { MapControlWrapper, MapMarkerWrapper, MapPolylineWrapper, Position } from '@mint-ui/map';
import styled from 'styled-components';
import { Flex } from 'ui-base-pack';

import { RainDirectionArrowIcon } from './RainDirectionArrowIcon';

import { RainAssistBridgeState } from '../hook/use-rain-assist-bridge-hook';

interface WebviewForecastLayerProps {
  bridge:RainAssistBridgeState;
}

// 웹뷰 모드(?webview=true) 전용 레이어. 자체 예측 로직 없이 앱이 window.RainAssistBridge로
// 주입한 데이터만 그대로 그린다 — webview-interface.md 참고.
export function WebviewForecastLayer({ bridge }:WebviewForecastLayerProps) {

  const { forecast, notification } = bridge;

  return (
    <>
      <MapControlWrapper positionHorizontal='left' positionVertical='top'>
        <BadgeContainer>
          {/* 문구는 앱의 showNotification.message를 그대로 표시 — 웹이 직접 생성하지 않음.
              첫 알림이 오기 전까지는 빈 배지(문구를 만들어내지 않기 위함). */}
          {notification && <Flex flexfit>{notification.message}</Flex>}
        </BadgeContainer>
      </MapControlWrapper>

      {forecast?.blobs.map((blob) => {

        const path = blob.path.map((p) => new Position(p.lat, p.lon));
        const current = path[0] ?? new Position(blob.centroid.lat, blob.centroid.lon);

        return (
          <div key={blob.id}>
            {path.length > 1 && (
              <MapPolylineWrapper position={path} lineColor='#1f6feb' lineSize={3} lineOpacity={0.8} />
            )}

            <MapMarkerWrapper position={current} disablePointerEvent>
              <ArrowRotate style={{ transform: `rotate(${blob.headingDeg}deg)` }}>
                <RainDirectionArrowIcon />
              </ArrowRotate>
            </MapMarkerWrapper>
          </div>
        );

      })}
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
  // 알림이 오기 전(빈 배지)에도 실제 문구가 들어왔을 때와 같은 기본 크기를 유지한다 —
  // 내용이 없다고 박스 자체가 쪼그라들면(패딩만 남음) 화면이 부자연스럽게 깜빡여 보인다.
  boxSizing: 'border-box',
  minWidth: '140px',
  minHeight: '24px',
});

const ArrowRotate = styled.div({ transformOrigin: 'center' });