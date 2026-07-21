/* eslint-disable @next/next/no-img-element */

'use client';

import { MapControlWrapper, MapMarkerWrapper, useMintMapController } from '@mint-ui/map';
import { useEffect, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import styled from 'styled-components';

import { Flex } from 'ui-base-pack';

import { MapControlState, useUpdateMapControl } from '../../rain/state/map-controls';
import { getOffset } from '../../rain/util/map-util';
import { useCurrentDataHook } from '../hook/use-current-data-hook';
import { computeQuadWarpMatrix3d, Point } from '../util/quad-warp';
import { toPositions } from '../util/radar-geo';
import { Legends } from '../util/radar-legend';

// /rain의 RainRadarLayer.tsx(파일 미수정)를 대체하는 /rain-assist 전용 레이더 이미지 레이어.
// RainRadarLayer.tsx는 4개 꼭짓점 중 2쌍만 써서 폭/높이를 독립적으로 잰 뒤 그 사각형에 이미지를
// width:100%/height:100%로 늘려 넣는다 — 기상청 레이더(Lambert Conformal Conic)와 네이버지도
// (UTM-K 계열)의 투영법이 달라 실제로는 사각형이 아니라 사다리꼴에 가까운데, 높이를 "찌그러뜨려"
// 근사한 것이다. 이 컴포넌트는 RADAR_CORNERS 4점을 모두 써서 정확한 4점 투영 변환(quad-warp.ts,
// CSS matrix3d)으로 그린다. canvas 방식은 줌 시 화질이 나빠져 이미 버려진 전례가 있어(PR #9)
// <img> + CSS transform을 유지한다.
export function RadarImageLayer() {

  const controller = useMintMapController();
  const positions = useRef(toPositions()); // [bottomLeft, topLeft, topRight, bottomRight]
  const topLeft = positions.current[1];

  const [ warpMatrix, setWarpMatrix ] = useState<string | null>(null);
  const [ imageShow, setImageShow ] = useState(false);
  const naturalSizeRef = useRef<{ width:number; height:number; } | null>(null);

  // onLoad(이미지 로드 완료) 시점에도 재계산을 트리거해야 하는데, onLoad 핸들러는 아래 useEffect
  // 바깥(JSX)에 있어 그 안의 recomputeWarp를 직접 참조할 수 없다 — use-auto-geo-location-hook.ts의
  // fetchPositionRef와 동일한 패턴으로 ref에 최신 함수를 담아 컴포넌트 어디서든 호출 가능하게 한다.
  const recomputeWarpRef = useRef<() => void>(() => {});

  const { opacity, temperatureFlag } = useRecoilValue(MapControlState);
  const updateControl = useUpdateMapControl();

  const data = useCurrentDataHook();
  const imageSrc = data ? `data:image/png;base64,${data.latestPngBase64}` : undefined;

  useEffect(() => {

    const recomputeWarp = () => {
      const size = naturalSizeRef.current;
      if (!size) {
        return;
      }

      const topLeftOffset = getOffset(controller, topLeft);
      const [ bottomLeft, , topRight, bottomRight ] = positions.current.map((p) => {
        const offset = getOffset(controller, p);
        return { x: offset.x - topLeftOffset.x, y: offset.y - topLeftOffset.y };
      });
      const targetQuad:[Point, Point, Point, Point] = [{ x: 0, y: 0 }, topRight, bottomRight, bottomLeft ];

      const matrix = computeQuadWarpMatrix3d(size.width, size.height, targetQuad);
      setWarpMatrix(matrix);
      setImageShow(matrix !== null);
    };
    recomputeWarpRef.current = recomputeWarp;

    const handleZoomStart = () => setImageShow(false);

    recomputeWarp();
    controller.addEventListener('ZOOMSTART', handleZoomStart);
    controller.addEventListener('ZOOM_CHANGED', recomputeWarp);

    return () => {
      controller.removeEventListener('ZOOMSTART', handleZoomStart);
      controller.removeEventListener('ZOOM_CHANGED', recomputeWarp);
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

      {imageSrc && (
        <MapMarkerWrapper position={topLeft} disablePointerEvent>
          <img
            src={imageSrc}
            alt='radar'
            style={{
              transformOrigin: '0 0',
              transform: warpMatrix ?? 'none',
              visibility: imageShow && warpMatrix ? 'visible' : 'hidden',
              opacity,
            }}
            onLoad={(e) => {
              const img = e.currentTarget;
              naturalSizeRef.current = { width: img.naturalWidth, height: img.naturalHeight };
              recomputeWarpRef.current();
            }}
          />
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