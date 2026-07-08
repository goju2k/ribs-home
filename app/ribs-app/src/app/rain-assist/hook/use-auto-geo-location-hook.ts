import { useCallback, useEffect, useRef, useState } from 'react';

export interface LatLng {
  lat:number;
  lng:number;
}

// 기존 rain/hook/geo-location-hook.ts(수동 버튼 트리거, 1회성)와 달리
// 마운트 시 즉시 1회 조회 후 intervalMs 간격으로 계속 재조회해 위치를 자동 갱신한다.
// 반환하는 두번째 값(refetch)은 웹뷰 모드에서 앱의 refreshPosition() 브릿지 호출에 대응해
// 즉시 재조회하기 위한 것 — 새로고침 없이 위치만 다시 요청한다.
export function useAutoGeoLocationHook(intervalMs:number = 5 * 60 * 1000):[LatLng | undefined, () => void] {

  const [ currPosition, setCurrPosition ] = useState<LatLng>();
  const fetchPositionRef = useRef<() => void>(() => {});

  useEffect(() => {

    if (!('geolocation' in navigator)) {
      console.log('Geolocation is not supported by this browser.');
      return undefined;
    }

    const fetchPosition = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCurrPosition({ lat: latitude, lng: longitude });
        },
        (error) => {
          console.error('Error retrieving location:', error);
        },
      );
    };

    fetchPositionRef.current = fetchPosition;

    fetchPosition();
    const interval = setInterval(fetchPosition, intervalMs);

    return () => {
      clearInterval(interval);
    };

  }, [ intervalMs ]);

  const refetch = useCallback(() => {
    fetchPositionRef.current();
  }, []);

  return [ currPosition, refetch ];
}