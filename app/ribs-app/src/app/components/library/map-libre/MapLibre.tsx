import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';

export function MapLibre() {
  
  const container = useRef(null);

  const map = useRef<maplibregl.Map>();
  useEffect(() => {

    if (container.current) {
      
      const mapInstance = new maplibregl.Map({
        container: container.current, // container id
        style: 'https://demotiles.maplibre.org/style.json', // style URL
        center: [ 127.028104, 37.496837 ], // starting position [lng, lat]
        zoom: 5, // starting zoom,
      });
  
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