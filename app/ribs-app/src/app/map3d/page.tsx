'use client';

import { useEffect, useRef } from 'react';

import { loadNaverMapApi } from '../components/library/naver-map/script/load-naver-map-api';

export default function Index() {
  return <div style={{ width: '100vw', height: '100vh' }}><Map3d /></div>;
}

function Map3d() {

  const mapRef = useRef<naver.maps.Map>();
  const div = useRef<HTMLDivElement>(null);
  useEffect(() => {

    if (div.current && !mapRef.current) {
      
      loadNaverMapApi({
        scriptUrl: 'https://oapi.map.naver.com/openapi/v3/maps.js',
        scriptModules: [ 'gl' ],
        scriptParams: { ncpKeyId: '868psyu6ui' },
      }).then((apiLoaded) => {

        if (!div.current || !apiLoaded) {
          return;
        }

        const map = new naver.maps.Map(div.current, {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          gl: true,
          center: new naver.maps.LatLng(37.3595704, 127.105399), // 지도의 초기 중심 좌표
          zoom: 15, // 지도의 초기 줌 레벨
        });
  
        mapRef.current = map;
  
      });
      
    }

  }, []);

  return <div ref={div} style={{ width: '100%', height: '100%' }} />;
}