import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';

import { NaverMapForLibre } from './naver-map-for-libre';

export function MapLibre({ type = 'demo' }:{type?:'demo'|'naver';}) {
  
  const container = useRef(null);

  const map = useRef<maplibregl.Map>();
  useEffect(() => {

    if (container.current) {
      
      let mapInstance: maplibregl.Map;
      if (type === 'naver') {
        mapInstance = new NaverMapForLibre(
          {
            container: container.current, // container id
            center: [ 127.028104, 37.496837 ], // starting position [lng, lat]
            zoom: 6, // starting zoom,
          },
          { mapKey: 'yc2mrw1mz8' },
        );
      } else {
        mapInstance = new maplibregl.Map({
          container: container.current, // container id
          style: 'https://demotiles.maplibre.org/style.json', // style URL
          center: [ 127.028104, 37.496837 ], // starting position [lng, lat]
          zoom: 6, // starting zoom,
        });
      }

      // 스크롤 속도 2배
      mapInstance.scrollZoom.setWheelZoomRate(0.0015);
  
      mapInstance.on('idle', (e) => {
        console.log('idle', e);
      });
  
      map.current = mapInstance;

    }

    return () => {
      map.current && map.current.remove();
    };

  }, []);

  return (
    <>
      <div
        ref={container}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </>
  );

}