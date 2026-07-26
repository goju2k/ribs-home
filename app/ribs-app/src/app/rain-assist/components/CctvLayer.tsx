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
const BOUNDS_FETCH_DEBOUNCE_MS = 500;

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
      <MapControlWrapper positionHorizontal='right' positionVertical='top'>
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
  marginTop: '10px',
  marginRight: '10px',
  fontSize: '14px',
});

const HintText = styled.div({
  marginTop: '4px',
  fontSize: '12px',
  color: '#888',
});