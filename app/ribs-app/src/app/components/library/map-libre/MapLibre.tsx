import axios from 'axios';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { NaverMapForLibre, NaverMapOptions } from './naver-map-for-libre';

export type MapLibreOptions = Partial<maplibregl.MapOptions>;
export interface MapLibreProps extends React.PropsWithChildren {
  type?:'demo'|'naver';
  onLoad?:(map:maplibregl.Map)=>void;
  options?: MapLibreOptions;
  naverOption?: NaverMapOptions;
}

export const MapLibre = forwardRef<maplibregl.Map|undefined, MapLibreProps>(({
  type = 'demo',
  onLoad,
  options,
  naverOption,
  children,
}:MapLibreProps, ref) => {

  const container = useRef(null);

  const [ map, setMap ] = useState<maplibregl.Map>();
  const mapRef = useRef<maplibregl.Map>();

  useEffect(() => {

    (async () => {

      if (container.current) {
        
        let mapInstance: maplibregl.Map;

        if (type === 'naver') {

          const { data } = await axios.get('https://nrbe.pstatic.net/styles/basic.json?fmt=png');
          
          mapInstance = new NaverMapForLibre(
            {
              container: container.current, // container id
              center: [ 127.15744426154328, 37.62122112865127 ], // starting position [lng, lat]
              zoom: 16, // starting zoom,
              pixelRatio: window.devicePixelRatio,
              ...options,
            },
            { 
              tiles: data.tiles, 
              ...naverOption, 
            },
          );

          mapRef.current = mapInstance;
          setMap(mapInstance);
          
          onLoad && onLoad(mapInstance);
          
        } else {
          mapInstance = new maplibregl.Map({
            container: container.current, // container id
            style: 'https://demotiles.maplibre.org/style.json', // style URL
            center: [ 127.028104, 37.496837 ], // starting position [lng, lat]
            zoom: 6, // starting zoom,
          });
        }

      }

    })();

    return () => {
      mapRef.current && mapRef.current.remove();
    };

  }, []);

  useImperativeHandle(ref, () => mapRef.current, [ map ]);

  return (
    <>
      {/* Map */}
      <div
        ref={container}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
      {children}
    </>
  );

});

MapLibre.displayName = 'MapLibre';