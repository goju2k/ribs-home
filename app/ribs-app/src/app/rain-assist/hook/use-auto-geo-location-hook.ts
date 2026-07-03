import { useEffect, useState } from 'react';

export interface LatLng {
  lat:number;
  lng:number;
}

// 기존 rain/hook/geo-location-hook.ts(수동 버튼 트리거, 1회성)와 달리
// 마운트 시 즉시 1회 조회 후 intervalMs 간격으로 계속 재조회해 위치를 자동 갱신한다.
export function useAutoGeoLocationHook(intervalMs:number = 5 * 60 * 1000) {

  const [ currPosition, setCurrPosition ] = useState<LatLng>();

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

    fetchPosition();
    const interval = setInterval(fetchPosition, intervalMs);

    return () => {
      clearInterval(interval);
    };

  }, [ intervalMs ]);

  return currPosition;
}