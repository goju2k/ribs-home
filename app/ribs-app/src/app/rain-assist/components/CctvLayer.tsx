'use client';

import { MapControlWrapper, MapMarkerWrapper, Position, useMintMapController } from '@mint-ui/map';
import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import { Flex } from 'ui-base-pack';

import { CctvFrameModal, CctvFrameModalControl } from './CctvFrameModal';
import { CctvIcon } from './CctvIcon';

interface CctvListItem {
  name:string;
  lat:number;
  lng:number;
  cctvUrl:string;
}

// 전국을 한 번에 조회하면 마커가 수천 개가 될 수 있어, 이 줌 레벨 미만(많이 축소된 상태)에서는
// 조회 자체를 건너뛴다. 14부터 조회
const MIN_ZOOM_LEVEL_TO_SHOW_CCTV = 14;
const BOUNDS_FETCH_DEBOUNCE_MS = 100;

// GoToMyLocationButton.tsx가 RainRadarLayer 범례(우하단) 위에 자신을 띄우기 위해 계산해둔 값
// (LEGEND_RESERVED_HEIGHT_PX + BUTTON_GAP_PX)과 그 버튼 자신의 지름(36px)을 그대로 가져와, 이
// 토글이 "내 위치로" 버튼 한 단 위에 오도록 한다 — 두 컴포넌트는 서로의 실제 렌더 크기를 모른 채
// 독립적으로 우하단에 고정되는 기존 컨벤션 그대로다. GoToMyLocationButton.tsx의 상수가 바뀌면
// 이 값도 같이 조정 필요.
const GO_TO_MY_LOCATION_MARGIN_BOTTOM_PX = 396;
const GO_TO_MY_LOCATION_BUTTON_HEIGHT_PX = 36;
const TOGGLE_GAP_PX = 10;
const CCTV_TOGGLE_MARGIN_BOTTOM_PX = GO_TO_MY_LOCATION_MARGIN_BOTTOM_PX + GO_TO_MY_LOCATION_BUTTON_HEIGHT_PX + TOGGLE_GAP_PX;

// MapMarkerWrapper의 event prop 타입(Map<keyof DocumentEventMap, (e:Event) => boolean | void>)을
// JSX 어트리뷰트 안에서 제네릭과 함께 인라인으로 쓰면 ESLint(non-TS-aware 규칙)가 파싱을
// 혼동해 오탐(no-spaced-func)을 낸다 — 헬퍼로 분리해 타입만 여기서 한 번에 처리한다.
function toClickEvent(handler:() => void):Map<keyof DocumentEventMap, (e:Event) => boolean | void> {
  return new Map([[ 'click', () => {
    handler();
  } ]]);
}

// 도로 CCTV 위치를 지도에 표시하고, 클릭하면 정지 이미지 1장을 보여주는 토글 레이어.
// ITS_API_KEY가 배포 환경에 없는 동안은 /api/rain-assist/cctv/list가 빈 배열을 반환하므로
// 토글 자체는 항상 노출하되 마커만 없는 상태로 조용히 동작한다.
export function CctvLayer() {

  const controller = useMintMapController();
  const [ enabled, setEnabled ] = useState(false);
  const [ cctvs, setCctvs ] = useState<CctvListItem[]>([]);
  const [ zoomTooFar, setZoomTooFar ] = useState(false);
  const modalRef = useRef<CctvFrameModalControl>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {

    if (!enabled) {
      setCctvs([]);
      return undefined;
    }

    const fetchByBounds = async () => {

      const zoomLevel = controller.getZoomLevel();
      if (zoomLevel < MIN_ZOOM_LEVEL_TO_SHOW_CCTV) {
        setZoomTooFar(true);
        setCctvs([]);
        return;
      }
      setZoomTooFar(false);

      const bounds = controller.getCurrBounds();
      const params = new URLSearchParams({
        minX: String(bounds.sw.lng),
        maxX: String(bounds.ne.lng),
        minY: String(bounds.sw.lat),
        maxY: String(bounds.ne.lat),
      });

      try {
        const res = await fetch(`/api/rain-assist/cctv/list?${params.toString()}`);
        const json = await res.json() as { cctvs:CctvListItem[]; };
        setCctvs(json.cctvs ?? []);
      } catch (e) {
        console.error('CctvLayer fetch error', e);
      }

    };

    const handleIdle = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fetchByBounds, BOUNDS_FETCH_DEBOUNCE_MS);
    };

    handleIdle();
    controller.addEventListener('IDLE', handleIdle);

    return () => {
      clearTimeout(debounceRef.current);
      controller.removeEventListener('IDLE', handleIdle);
    };

  }, [ enabled ]);

  return (
    <>
      <MapControlWrapper positionHorizontal='right' positionVertical='bottom'>
        <ToggleContainer>
          <Flex flexrow flexalign='center' flexgap='6px'>
            <input
              type='checkbox'
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>주변 CCTV 보기</span>
          </Flex>
          {enabled && zoomTooFar && <HintText>더 확대하면 CCTV가 표시됩니다</HintText>}
        </ToggleContainer>
      </MapControlWrapper>

      {enabled && cctvs.map((cctv) => (
        <MapMarkerWrapper
          key={`${cctv.lat}-${cctv.lng}-${cctv.name}`}
          position={new Position(cctv.lat, cctv.lng)}
          event={toClickEvent(() => modalRef.current?.show(cctv.name, cctv.cctvUrl))}
        >
          <CctvIcon />
        </MapMarkerWrapper>
      ))}

      <CctvFrameModal ref={modalRef} />
    </>
  );

}

const ToggleContainer = styled.div({
  background: 'white',
  border: '1px solid gray',
  borderRadius: '8px',
  padding: '5px 8px',
  marginBottom: `${CCTV_TOGGLE_MARGIN_BOTTOM_PX}px`,
  marginRight: '10px',
  fontSize: '14px',
});

const HintText = styled.div({
  marginTop: '4px',
  fontSize: '12px',
  color: '#888',
});