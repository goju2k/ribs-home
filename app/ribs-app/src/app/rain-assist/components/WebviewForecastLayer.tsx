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

interface PathPoint {
  minutesFromNow:number;
  lat:number;
  lon:number;
}

// 경로 마지막 구간(끝에서 두번째 -> 마지막 점)의 실제 방향으로 화살표머리를 회전시킨다.
// 점이 1개뿐이면 방향을 계산할 구간이 없으므로 앱이 준 headingDeg로 대체.
function computeHeadingDeg(path:PathPoint[], fallbackHeadingDeg:number):number {
  if (path.length < 2) {
    return fallbackHeadingDeg;
  }
  const from = path[path.length - 2];
  const to = path[path.length - 1];
  return bearingDeg({ lat: from.lat, lng: from.lon }, { lat: to.lat, lng: to.lon });
}

function toPositions(points:PathPoint[]):Position[] {
  return points.map((p) => new Position(p.lat, p.lon));
}

// 일반 blob은 파란색, isForecastTarget(=내 위치에 실제로 도달 예정)인 blob은 주황/앰버로
// 강조 — "경고"가 아니라 "이 경로가 나에게 온다"는 강조 의미라 위험/재해를 연상시키는 빨강
// 대신 앰버를 선택 (사용자 확인 완료).
const PATH_COLOR = '#1f6feb';
const PATH_COLOR_TARGET = '#f59e0b';

// 웹뷰 모드(?webview=true) 전용 레이어. 자체 예측 로직 없이 앱이 window.RainAssistBridge로
// 주입한 데이터만 그대로 그린다 — webview-interface.md 참고.
//
// blobs[]마다 화살표 하나: 지도에 그려진 레이더 프레임 속 비구름의 중심(observedCentroid)에서
// 시작해 "지금" 위치(path의 minutesFromNow===0, 관측 지연만큼 이미 이동한 곳)를 지나 예측 끝점까지
// 진하게 그리고, 끝점에 진행방향 화살표머리를 둔다. 지도 이미지는 앱 예보와 같은 프레임이라
// (page.tsx forcedRadarTm) 화살표의 시작점이 곧 눈에 보이는 비구름의 중심이다. 과거 실측 궤적
// (minutesFromNow<0)은 "어디서 왔는지"만 보여주는 보조 정보라 가늘고 옅게, 시작점 뒤로 잇는다.
// (이전에는 과거 궤적을 진하게 그려 선이 비구름 뒤 빈 곳에서 시작하는 것처럼 보였고, 지도 이미지도
// 앱 프레임과 다른 시각이라 화살표가 비구름 중심에서 벗어나 보였다.)
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

        const pastPoints = sortedPath.filter((p) => p.minutesFromNow < 0);
        const futurePoints = sortedPath.filter((p) => p.minutesFromNow >= 0);

        // 시작점: 지도 이미지(같은 프레임) 속 비구름 중심. 구버전 앱이라 observedCentroid가 없으면
        // "지금" 지점으로 대체.
        const startPoint:PathPoint | undefined = blob.observedCentroid
          ? { minutesFromNow: 0, lat: blob.observedCentroid.lat, lon: blob.observedCentroid.lon }
          : futurePoints[0] ?? pastPoints[pastPoints.length - 1];
        if (!startPoint) {
          return null;
        }

        const mainLinePoints = toPositions([ startPoint, ...futurePoints ]);
        const pastLinePoints = pastPoints.length > 0 ? toPositions([ ...pastPoints, startPoint ]) : [];

        const endPoint = futurePoints.length > 0 ? futurePoints[futurePoints.length - 1] : startPoint;
        const endPosition = new Position(endPoint.lat, endPoint.lon);
        const startPosition = new Position(startPoint.lat, startPoint.lon);

        // 화살표 방향은 마지막 구간의 실제 진행방향, 점이 모자라면 앱이 준 headingDeg.
        const headingDeg = computeHeadingDeg([ startPoint, ...futurePoints ], blob.headingDeg);

        const pathColor = blob.isForecastTarget ? PATH_COLOR_TARGET : PATH_COLOR;

        return (
          <div key={blob.id}>
            {pastLinePoints.length > 1 && (
              <MapPolylineWrapper position={pastLinePoints} lineColor={pathColor} lineSize={2} lineOpacity={0.35} />
            )}

            {mainLinePoints.length > 1 && (
              <MapPolylineWrapper position={mainLinePoints} lineColor={pathColor} lineSize={3} lineOpacity={0.9} />
            )}

            {/* 시작점 = 지도 속 비구름 중심 */}
            <MapMarkerWrapper position={startPosition} disablePointerEvent>
              <NowDot $color={pathColor} />
            </MapMarkerWrapper>

            {/* 도착(예상) 지점 — 화살표머리로 진행방향 표시. 선(몸통)과 합쳐 하나의 화살표로 읽힘.
                RainDirectionArrowIcon의 실제 뾰족한 끝(SVG 22x22 기준 (11,1))이 지점 좌표에
                정확히 맞닿도록, 회전 축(transform-origin)을 그 끝점으로 두고 그 끝점을 좌표로
                당겨온다 — 박스 중심을 좌표에 맞추면 뾰족한 끝이 회전에 따라 좌표를 벗어나
                선과 화살표머리 사이에 틈이 생긴다. */}
            {endPoint !== startPoint && (
              <MapMarkerWrapper position={endPosition} disablePointerEvent>
                <ArrowRotate style={{ transform: `translate(-11px, -1px) rotate(${headingDeg}deg)` }}>
                  {/* 기본 흰 테두리는 지도 배경 위 단독 화살표용 — 여기선 선 끝에 딱 붙여야 해서
                      테두리가 곧 시각적 틈처럼 보인다. 채움과 같은 색으로 넘겨 테두리를 없앤다. */}
                  <RainDirectionArrowIcon fill={pathColor} stroke={pathColor} />
                </ArrowRotate>
              </MapMarkerWrapper>
            )}
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
  // 33px = 이 배지 스타일(padding 5px 8px, font-size 14px)이 실제로 렌더링되는 높이
  // (line-height 21px + padding 10px + border 2px)를 실측한 값.
  boxSizing: 'border-box',
  minWidth: '140px',
  minHeight: '33px',
});

const NowDot = styled.div<{ $color:string; }>(({ $color }) => ({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: $color,
  border: '1px solid white',
  transform: 'translate(-50%, -50%)',
}));

// transform-origin을 아이콘의 뾰족한 끝(11px, 1px) 좌표로 둬서, translate로 그 끝을 지점에
// 맞춘 뒤 회전해도(회전은 이 축을 중심으로 돎) 끝이 그 자리에 고정된 채로 방향만 바뀐다.
const ArrowRotate = styled.div({ transformOrigin: '11px 1px' });