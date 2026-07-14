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

// 웹뷰 모드(?webview=true) 전용 레이어. 자체 예측 로직 없이 앱이 window.RainAssistBridge로
// 주입한 데이터만 그대로 그린다 — webview-interface.md 참고.
//
// blobs[].path를 "하나의 긴 화살표"로 표현한다(일반적인 강수/태풍 이동경로 표기 관례):
// path는 minutesFromNow<0(과거 실측 관측값)와 >=0(등속 모델로 외삽한 예측값)을 함께 담으므로,
// 이 둘을 시각적으로 구분해서 그린다 — 과거 구간은 실선/불투명, "지금" 지점(=future[0], 보통
// minutesFromNow===0)부터 이어지는 미래 구간은 옅은 색(같은 색상, 낮은 opacity)으로. 화살표머리는
// 여전히 경로의 가장 먼 미래 지점에 그 구간의 실제 진행방향으로 회전해 둔다. MapPolylineWrapper가
// 점선(dash) 옵션을 노출하지 않아 "점선" 대신 "옅은 색"으로 과거/미래를 구분한다.
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

        // "지금" 지점: future의 첫 원소(보통 minutesFromNow===0). future가 비어있으면(이론상
        // 발생 안 하지만 방어적으로) 가장 최근 과거 관측점으로 대체.
        const nowPoint = futurePoints[0] ?? pastPoints[pastPoints.length - 1];
        if (!nowPoint) {
          return null;
        }

        // 과거 선(실선): 과거 관측점들 + "지금" 지점까지 이어서 미래 선과 시각적으로 끊김 없이 연결.
        const pastLinePoints = pastPoints.length > 0 ? toPositions([ ...pastPoints, nowPoint ]) : [];
        // 미래 선(옅은 색): "지금" 지점부터 가장 먼 미래까지.
        const futureLinePoints = futurePoints.length > 0 ? toPositions(futurePoints) : toPositions([ nowPoint ]);

        const endPoint = futurePoints.length > 0 ? futurePoints[futurePoints.length - 1] : nowPoint;
        const endPosition = new Position(endPoint.lat, endPoint.lon);
        const nowPosition = new Position(nowPoint.lat, nowPoint.lon);

        // 화살표 방향은 미래 구간의 실제 진행방향 우선, 미래 점이 1개뿐이면 전체 경로로 대체
        // (computeHeadingDeg가 점 2개 미만이면 알아서 blob.headingDeg로 폴백함).
        const headingDeg = computeHeadingDeg(futurePoints.length >= 2 ? futurePoints : sortedPath, blob.headingDeg);

        return (
          <div key={blob.id}>
            {pastLinePoints.length > 1 && (
              <MapPolylineWrapper position={pastLinePoints} lineColor='#1f6feb' lineSize={3} lineOpacity={1} />
            )}

            {futureLinePoints.length > 1 && (
              <MapPolylineWrapper position={futureLinePoints} lineColor='#1f6feb' lineSize={3} lineOpacity={0.4} />
            )}

            {/* "지금" 위치 — 작은 점으로만 표시, 방향은 나타내지 않음 */}
            <MapMarkerWrapper position={nowPosition} disablePointerEvent>
              <NowDot />
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

const NowDot = styled.div({
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