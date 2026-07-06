import { useEffect, useRef, useState } from 'react';

import { LatLng } from './use-auto-geo-location-hook';

const MIN_LOADING_MS = 1000;
const MAX_WAIT_MS = 3000;

export interface InitialMapView {
  ready:boolean;
  // 게이트가 닫히는 시점에 위치를 이미 얻었으면 그 위치, 못 얻었으면 null(전국 줌으로 시작).
  // 한번 정해지면 이후 위치가 뒤늦게 도착해도 바뀌지 않는다(지도를 다시 이동/재줌하지 않기 위함).
  initialCenter:LatLng | null;
}

// 지도를 처음 마운트할 때부터 자연스러운 시작 상태(위치를 얻었으면 그 위치+줌14, 못 얻었으면
// 전국 줌)로 시작하기 위한 게이트. 지도가 뜬 뒤에 재이동/재줌하면 화면이 부자연스럽게 튀어
// 보이므로, 위치를 얻을 때까지 최대 MAX_WAIT_MS(3초)까지 지도 마운트 자체를 지연시킨다.
// 위치가 아주 빨리 도착해도(예: 200ms) 로딩 화면이 깜빡이지 않도록 최소 MIN_LOADING_MS(1초)는
// 유지한다.
export function useInitialMapViewHook(userPosition?:LatLng):InitialMapView {

  const [ ready, setReady ] = useState(false);
  const initialCenterRef = useRef<LatLng | null>(null);
  const resolvedRef = useRef(false);
  const mountedAtRef = useRef(Date.now());

  useEffect(() => {

    if (resolvedRef.current) {
      return undefined;
    }

    const elapsed = Date.now() - mountedAtRef.current;
    const hitMax = elapsed >= MAX_WAIT_MS;
    const metMin = elapsed >= MIN_LOADING_MS;

    const resolveNow = () => {
      if (resolvedRef.current) {
        return;
      }
      resolvedRef.current = true;
      initialCenterRef.current = userPosition ?? null;
      setReady(true);
    };

    if (metMin && (userPosition || hitMax)) {
      resolveNow();
      return undefined;
    }

    // 아직 조건 미충족: 다음으로 만족될 시점(위치가 있으면 최소시간까지, 없으면 최대시간까지)에
    // 재확인. userPosition이 바뀌면 이 effect가 재실행되어 즉시 재평가된다.
    const remainingMs = userPosition ? (MIN_LOADING_MS - elapsed) : (MAX_WAIT_MS - elapsed);
    const timer = setTimeout(resolveNow, Math.max(0, remainingMs));

    return () => clearTimeout(timer);

  }, [ userPosition ]);

  return { ready, initialCenter: initialCenterRef.current };
}