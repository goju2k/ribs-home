'use client';

import { MapControlWrapper, MapMarkerWrapper, Position, useMintMapController } from '@mint-ui/map';
import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

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
// 버튼이 "내 위치로" 버튼 한 단 위에 오도록 한다 — 두 컴포넌트는 서로의 실제 렌더 크기를 모른 채
// 독립적으로 우하단에 고정되는 기존 컨벤션 그대로다. GoToMyLocationButton.tsx의 상수가 바뀌면
// 이 값도 같이 조정 필요.
const GO_TO_MY_LOCATION_MARGIN_BOTTOM_PX = 396;
const GO_TO_MY_LOCATION_BUTTON_HEIGHT_PX = 36;
const BUTTON_GAP_PX = 10;
const CCTV_BUTTON_MARGIN_BOTTOM_PX = GO_TO_MY_LOCATION_MARGIN_BOTTOM_PX + GO_TO_MY_LOCATION_BUTTON_HEIGHT_PX + BUTTON_GAP_PX;

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
// 버튼 자체는 항상 노출하되 마커만 없는 상태로 조용히 동작한다.
export function CctvLayer() {

  const controller = useMintMapController();
  const [ enabled, setEnabled ] = useState(false);
  const [ cctvs, setCctvs ] = useState<CctvListItem[]>([]);
  const [ zoomTooFar, setZoomTooFar ] = useState(false);
  const modalRef = useRef<CctvFrameModalControl>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  // ITS 응답이 1초 넘게 걸리는 경우가 있어, 그 사이 지도를 더 움직이면 debounce가 새 요청을
  // 내보내는데 먼저 나간 요청이 나중에 응답으로 도착해 최신 뷰포트 결과를 덮어쓸 수 있다 —
  // 새 요청을 보낼 때마다 이전 in-flight 요청을 abort한다.
  const fetchAbortRef = useRef<AbortController>();

  // 줌 레벨은 토글 on/off와 무관하게 항상 추적한다 — 버튼 자체의 disabled 표시를 결정하기 위함
  // (아직 켜지 않은 상태에서도 "지금 줌으로는 볼 수 없다"는 걸 미리 보여줘야 하므로).
  useEffect(() => {

    const checkZoom = () => {
      setZoomTooFar(controller.getZoomLevel() < MIN_ZOOM_LEVEL_TO_SHOW_CCTV);
    };

    checkZoom();
    controller.addEventListener('ZOOM_CHANGED', checkZoom);

    return () => {
      controller.removeEventListener('ZOOM_CHANGED', checkZoom);
    };

  }, []);

  useEffect(() => {

    if (!enabled || zoomTooFar) {
      setCctvs([]);
      return undefined;
    }

    const fetchByBounds = async () => {

      fetchAbortRef.current?.abort();
      const abortController = new AbortController();
      fetchAbortRef.current = abortController;

      const bounds = controller.getCurrBounds();
      const params = new URLSearchParams({
        minX: String(bounds.sw.lng),
        maxX: String(bounds.ne.lng),
        minY: String(bounds.sw.lat),
        maxY: String(bounds.ne.lat),
      });

      try {
        const res = await fetch(`/api/rain-assist/cctv/list?${params.toString()}`, { signal: abortController.signal });
        const json = await res.json() as { cctvs:CctvListItem[]; };
        setCctvs(json.cctvs ?? []);
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          return;
        }
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
      fetchAbortRef.current?.abort();
      controller.removeEventListener('IDLE', handleIdle);
    };

  }, [ enabled, zoomTooFar ]);

  return (
    <>
      <MapControlWrapper positionHorizontal='right' positionVertical='bottom' disablePointerEvent>
        {/* MapControlWrapper 자체의 내부 래퍼 div가 기본적으로 pointer-events:auto라 fit-content
            크기 계산이 어긋나면 그 영역 아래 지도(CCTV 마커 포함) 클릭이 최상단에서부터 막힐 수 있다
            — disablePointerEvent로 그 레이어 전체를 뚫어놓고, 아래 스페이서(마진 전용)도 한 번 더
            none 처리한 뒤, 실제 눌리는 버튼에서만 auto로 되돌려 지도 클릭/터치가 가려지지 않게 한다. */}
        <div style={{ marginBottom: `${CCTV_BUTTON_MARGIN_BOTTOM_PX}px`, marginRight: '10px', pointerEvents: 'none' }}>
          <CctvToggleButton
            type='button'
            aria-label='주변 CCTV 보기'
            aria-pressed={enabled}
            disabled={zoomTooFar}
            $active={enabled}
            onClick={() => setEnabled((prev) => !prev)}
          >
            <svg width='20' height='20' viewBox='0 0 24 24' fill='none'>
              <path d='M4 8a2 2 0 0 1 2-2h1.6l1-1.3A2 2 0 0 1 10.2 4h3.6a2 2 0 0 1 1.6.8l1 1.2H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z' stroke='currentColor' strokeWidth='2' strokeLinejoin='round' />
              <circle cx='12' cy='13' r='3.5' stroke='currentColor' strokeWidth='2' />
            </svg>
          </CctvToggleButton>
        </div>
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

// GoToMyLocationButton.tsx의 LocationButton과 동일한 "전형적인" 원형 지도 버튼 모양(36px, 흰
// 배경, 옅은 그림자) — 상태만 disabled(줌 이탈)/normal(off)/active(on) 3가지로 늘렸다.
const CctvToggleButton = styled.button<{ $active:boolean; }>(({ $active, disabled }) => ({
  pointerEvents: 'auto',
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  background: 'white',
  border: '1px solid #ccc',
  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.3)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.4 : 1,
  color: $active ? '#1f6feb' : '#666',
}));