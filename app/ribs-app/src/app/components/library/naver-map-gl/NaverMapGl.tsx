import { createContext, forwardRef, ReactNode, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { loadNaverMapApi } from '../naver-map/script/load-naver-map-api';

// Map Context
export interface MaverMapGlContextType {
  map:naver.maps.Map;
}
export const MaverMapGlContext = createContext<MaverMapGlContextType>({ map: {} as naver.maps.Map });

// Map Interfaces
export interface NaverMapGlProps {
  ncpKeyId: string;
  mapOptions?: naver.maps.MapOptions;
  children?: ReactNode;
}

export interface NaverMapGlRef {
  map?:naver.maps.Map;
}

// Map Component
export const NaverMapGl = forwardRef<NaverMapGlRef, NaverMapGlProps>(({
  ncpKeyId,
  mapOptions,
  children, 
}:NaverMapGlProps, ref) => {

  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<naver.maps.Map>();
  const [ mapContext, setMapContext ] = useState<MaverMapGlContextType>();

  useEffect(() => {
  
    if (mapElement.current && !mapRef.current) {
        
      loadNaverMapApi({
        scriptUrl: 'https://oapi.map.naver.com/openapi/v3/maps.js',
        scriptModules: [ 'gl' ],
        scriptParams: { ncpKeyId },
      }).then((apiLoaded) => {
  
        if (!mapElement.current || !apiLoaded) {
          return;
        }
  
        const map = new naver.maps.Map(mapElement.current, {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          gl: true,
          center: new naver.maps.LatLng(37.3595704, 127.105399), // 지도의 초기 중심 좌표
          zoom: 15, // 지도의 초기 줌 레벨
          ...mapOptions,
        });
    
        mapRef.current = map;
        setMapContext({ map });
    
      });
        
    }

    return () => {
      mapRef.current?.destroy();
    };
  
  }, []);

  useImperativeHandle(ref, () => ({ map: mapContext?.map }), [ mapContext ]);

  return (
    <>
      <div ref={mapElement} style={{ width: '100%', height: '100%' }}>
        {
          mapContext ? (
            <MaverMapGlContext.Provider value={mapContext}>
              {children}
            </MaverMapGlContext.Provider>
          )
            : null
        }
      </div>
    </>
  );

});

NaverMapGl.displayName = 'NaverMapGl';