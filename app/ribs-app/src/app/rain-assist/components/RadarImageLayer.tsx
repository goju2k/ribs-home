/* eslint-disable @next/next/no-img-element */

'use client';

import { MapControlWrapper, MapMarkerWrapper, Position, useMintMapController } from '@mint-ui/map';
import { useEffect, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import styled from 'styled-components';

import { Flex } from 'ui-base-pack';

import { MapControlState, useUpdateMapControl } from '../../rain/state/map-controls';
import { getOffset } from '../../rain/util/map-util';
import { useCurrentDataHook } from '../hook/use-current-data-hook';
import { LatLngBounds, warpToLatLngRectangle } from '../util/radar-lcc-warp';
import { Legends } from '../util/radar-legend';

// /rain의 RainRadarLayer.tsx(파일 미수정)를 대체하는 /rain-assist 전용 레이더 이미지 레이어.
// 기상청 레이더(Lambert Conformal Conic)와 네이버지도는 투영법이 달라 원본 이미지는 위경도
// 상에서 사각형이 아니라 사다리꼴을 이룬다. weather.go.kr 자체 페이지의 실제 렌더링 로직(JS
// 레벨로 확인, kma-lcc-projection.ts 참고 — 정확한 LCC 투영식+extent)을 그대로 재현해
// radar-lcc-warp.ts가 이 사다리꼴을 위경도 기준 순수 직사각형으로 캔버스에서 한 번 미리
// 재샘플링한 뒤에는, RainRadarLayer.tsx가 이미 하는 것과 동일한 "2개 꼭짓점만으로 폭/높이를
// 재는" 단순 CSS 스트레치로도 정확하게 배치할 수 있다.
//
// (이전 두 차례 시도 모두 폐기 — 자세한 경위는 project_rain_assist_feature 메모리 참고:
// 1차 CSS matrix3d projective 변환은 이미지 중심에서 약 37km 오차, 2차 RADAR_CORNERS 4점
// bilinear 근사는 실제 KMA extent와 비교해 약 5~7km 오차였음. 지금은 근사가 아니라 KMA
// 자신이 쓰는 정확한 투영 공식+extent를 그대로 사용.)
export function RadarImageLayer() {

  const controller = useMintMapController();

  const [ warpedSrc, setWarpedSrc ] = useState<string | null>(null);
  const [ nwPosition, setNwPosition ] = useState<Position | null>(null);
  const boundsRef = useRef<LatLngBounds | null>(null);

  const [ screenWidth, setScreenWidth ] = useState(0);
  const [ screenHeight, setScreenHeight ] = useState(0);
  const [ imageShow, setImageShow ] = useState(false);
  const recomputeSizeRef = useRef<() => void>(() => {});

  const { opacity, temperatureFlag } = useRecoilValue(MapControlState);
  const updateControl = useUpdateMapControl();

  const data = useCurrentDataHook();
  const rawImageSrc = data ? `data:image/png;base64,${data.latestPngBase64}` : undefined;

  // 새 프레임이 도착할 때마다 사다리꼴 원본을 위경도 기준 직사각형으로 재샘플링.
  useEffect(() => {
    if (!rawImageSrc) {
      return undefined;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) {
        return;
      }
      const result = warpToLatLngRectangle(img, img.naturalWidth, img.naturalHeight);
      if (!result || cancelled) {
        return;
      }
      boundsRef.current = result.bounds;
      setWarpedSrc(result.dataUrl);
      setNwPosition(new Position(result.bounds.north, result.bounds.west));
      recomputeSizeRef.current();
    };
    img.src = rawImageSrc;
    return () => {
      cancelled = true;
    };
  }, [ rawImageSrc ]);

  useEffect(() => {

    const recomputeSize = () => {
      const bounds = boundsRef.current;
      if (!bounds) {
        return;
      }

      const offsetNw = getOffset(controller, new Position(bounds.north, bounds.west));
      const offsetNe = getOffset(controller, new Position(bounds.north, bounds.east));
      const offsetSw = getOffset(controller, new Position(bounds.south, bounds.west));

      setScreenWidth(Math.floor(offsetNe.x - offsetNw.x));
      setScreenHeight(Math.floor(offsetSw.y - offsetNw.y));
      setImageShow(true);
    };
    recomputeSizeRef.current = recomputeSize;

    const handleZoomStart = () => setImageShow(false);

    recomputeSize();
    controller.addEventListener('ZOOMSTART', handleZoomStart);
    controller.addEventListener('ZOOM_CHANGED', recomputeSize);

    return () => {
      controller.removeEventListener('ZOOMSTART', handleZoomStart);
      controller.removeEventListener('ZOOM_CHANGED', recomputeSize);
    };

  }, []);

  // RainRadarLayer.tsx가 갱신하던 recoil tmText를 이어받는다 — RadarTimeLabel.tsx가 이 값에 의존.
  useEffect(() => {
    if (!data) {
      return;
    }
    const { latestTm: tm } = data;
    updateControl('tmText', `${tm.substring(4, 6)}월 ${tm.substring(6, 8)}일 ${tm.substring(8, 10)}시 ${tm.substring(10, 12)}분`);
  }, [ data?.latestTm ]);

  return (
    <>
      {!temperatureFlag && imageShow && (
        <MapControlWrapper positionHorizontal='right' positionVertical='bottom'>
          <MapLegendContainer>
            <Flex flexrow flexgap='4px'>
              <Flex>
                {Legends.map(([ color ], idx) => <LegendItem key={`legend-item-${idx}`} style={{ width: '10px', background: color, opacity }} />)}
              </Flex>
              <Flex flexfit>
                {Legends.map(([ , value ], idx) => <LegendItem key={`legend-item-value-${idx}`}>{value}</LegendItem>)}
              </Flex>
            </Flex>
            <Flex flexfit style={{ fontSize: '12px' }}>mm/h</Flex>
          </MapLegendContainer>
        </MapControlWrapper>
      )}

      {warpedSrc && nwPosition && (
        <MapMarkerWrapper position={nwPosition} disablePointerEvent>
          <div style={{ width: `${screenWidth}px`, height: `${screenHeight}px` }}>
            <img
              src={warpedSrc}
              alt='radar'
              style={{ width: '100%', height: '100%', opacity, visibility: imageShow ? 'visible' : 'hidden' }}
            />
          </div>
        </MapMarkerWrapper>
      )}
    </>
  );
}

const MapLegendContainer = styled.div({
  background: 'white',
  border: '1px solid gray',
  borderRadius: '8px',
  padding: '5px',
  marginBottom: '20px',
  marginRight: '10px',
  fontSize: '14px',
});
const LegendItem = styled.div({ height: '14px', fontSize: '12px' });