'use client';

import { MapControlWrapper, MapMarkerWrapper, MapPolylineWrapper, Position } from '@mint-ui/map';
import styled from 'styled-components';
import { Flex } from 'ui-base-pack';

import { RainDirectionArrowIcon } from './RainDirectionArrowIcon';

import { RainAssistBridgeState } from '../hook/use-rain-assist-bridge-hook';
import { bearingDeg } from '../util/grid-projection';

interface WebviewForecastLayerProps {
  bridge:RainAssistBridgeState;
}

// 경로 마지막 구간(끝에서 두번째 -> 마지막 점)의 실제 방향으로 화살표머리를 회전시킨다.
// 점이 1개뿐이면 방향을 계산할 구간이 없으므로 앱이 준 headingDeg로 대체.
function computeHeadingDeg(path:{ lat:number; lon:number; }[], fallbackHeadingDeg:number):number {
  if (path.length < 2) {
    return fallbackHeadingDeg;
  }
  const from = path[path.length - 2];
  const to = path[path.length - 1];
  return bearingDeg({ lat: from.lat, lng: from.lon }, { lat: to.lat, lng: to.lon });
}

// 웹뷰 모드(?webview=true) 전용 레이어. 자체 예측 로직 없이 앱이 window.RainAssistBridge로
// 주입한 데이터만 그대로 그린다 — webview-interface.md 참고.
//
// blobs[].path를 "하나의 긴 화살표"로 표현한다(일반적인 강수/태풍 이동경로 표기 관례):
// 실제 예측 경로(직선이 아니라 앱이 준 곡선 그대로)를 선으로 잇는 몸통과, 경로의 마지막(=가장
// 먼 미래) 지점에 그 구간의 실제 진행방향으로 회전한 화살표머리를 둔다. 이전 버전은 화살표를
// 현재 위치(시작점)에 두고 회전만 시켜서 "선"과 "화살표"가 서로 다른 걸 가리키는 것처럼
// 보였는데, 화살표머리를 도착 지점으로 옮겨 하나의 벡터처럼 읽히도록 했다.
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

        const sortedPath = blob.path.slice().sort((a, b) => a.minutesFromNow - b.minutesFromNow);
        if (sortedPath.length === 0) {
          return null;
        }

        const path = sortedPath.map((p) => new Position(p.lat, p.lon));
        const startPosition = path[0];
        const endPosition = path[path.length - 1];
        const headingDeg = computeHeadingDeg(sortedPath, blob.headingDeg);

        return (
          <div key={blob.id}>
            {/* lineOpacity를 1로 둔다 — 화살표머리(RainDirectionArrowIcon, 불투명 채움)와 색을
                맞춰야 몸통(선)과 머리가 같은 색으로 보인다(0.8 등으로 반투명하면 선만 옅어 보여
                같은 색인데도 달라 보였다). */}
            {path.length > 1 && (
              <MapPolylineWrapper position={path} lineColor='#1f6feb' lineSize={3} lineOpacity={1} />
            )}

            {/* 지금(시작) 위치 — 작은 점으로만 표시, 방향은 나타내지 않음 */}
            <MapMarkerWrapper position={startPosition} disablePointerEvent>
              <StartDot />
            </MapMarkerWrapper>

            {/* 도착(예상) 지점 — 화살표머리로 진행방향 표시. 선(몸통)과 합쳐 하나의 화살표로 읽힘.
                RainDirectionArrowIcon의 실제 뾰족한 끝(SVG 22x22 기준 (11,1))이 지점 좌표에
                정확히 맞닿도록, 회전 축(transform-origin)을 그 끝점으로 두고 그 끝점을 좌표로
                당겨온다 — 박스 중심을 좌표에 맞추면 뾰족한 끝이 회전에 따라 좌표를 벗어나
                선과 화살표머리 사이에 틈이 생긴다. */}
            <MapMarkerWrapper position={endPosition} disablePointerEvent>
              <ArrowRotate style={{ transform: `translate(-11px, -1px) rotate(${headingDeg}deg)` }}>
                {/* 기본 흰 테두리는 지도 배경 위 단독 화살표용 — 여기선 선 끝에 딱 붙여야 해서
                    테두리가 곧 시각적 틈처럼 보인다. 채움과 같은 색으로 넘겨 테두리를 없앤다. */}
                <RainDirectionArrowIcon stroke='#1f6feb' />
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
  // 33px = 일반 모드 RainForecastLayer의 같은 배지 스타일(padding 5px 8px, font-size 14px)이
  // 실제로 렌더링되는 높이(line-height 21px + padding 10px + border 2px)를 실측한 값.
  boxSizing: 'border-box',
  minWidth: '140px',
  minHeight: '33px',
});

const StartDot = styled.div({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: '#1f6feb',
  border: '1px solid white',
  transform: 'translate(-50%, -50%)',
});

// transform-origin을 아이콘의 뾰족한 끝(11px, 1px) 좌표로 둬서, translate로 그 끝을 지점에
// 맞춘 뒤 회전해도(회전은 이 축을 중심으로 돎) 끝이 그 자리에 고정된 채로 방향만 바뀐다.
const ArrowRotate = styled.div({ transformOrigin: '11px 1px' });