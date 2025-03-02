import axios from 'axios';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';

import { testdata } from './data';
import { NaverMapForLibre } from './naver-map-for-libre';
import { ShadowUtil } from './util/ShadowUtil';
import { SunPositionUtil } from './util/SunPositionUtil';

export function MapLibre({ type = 'demo' }:{type?:'demo'|'naver';}) {
  
  const container = useRef(null);

  const map = useRef<maplibregl.Map>();
  useEffect(() => {

    (async () => {

      if (container.current) {
        let mapInstance: maplibregl.Map;
        if (type === 'naver') {

          const { data } = await axios.get('https://nrbe.pstatic.net/styles/basic.json?fmt=png');

          mapInstance = new NaverMapForLibre(
            {
              container: container.current, // container id
              center: [ 127.03131258991324, 37.49558589225379 ], // starting position [lng, lat]
              zoom: 18, // starting zoom,
              pixelRatio: window.devicePixelRatio,
            },
            { tiles: data.tiles },
          );

          mapInstance.on('load', () => {

            // Add shadows to the map
            mapInstance.addSource('shadows', {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: [ testdata ].map((building) => ({
                  type: 'Feature',
                  geometry: {
                    type: 'Polygon',
                    coordinates: ShadowUtil.calculateShadowPolygon(building),
                  },
                  properties: building.properties,
                })),
              }, 
            });
  
            mapInstance.addLayer({
              id: 'building-shadows',
              source: 'shadows',
              type: 'fill',
              paint: {
                'fill-color': 'rgba(0, 0, 0, 0.5)',
                'fill-opacity': 0.5,
              },
            });

            // Add GeoJSON source
            mapInstance.addSource('buildings', {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: [ testdata ].map((building) => ({
                  type: 'Feature',
                  geometry: {
                    type: 'Polygon',
                    coordinates: building.geometry.coordinates,
                  },
                  properties: building.properties,
                })),
              },
            });

            // Add 3D building layer
            mapInstance.addLayer({
              id: '3d-buildings',
              source: 'buildings',
              type: 'fill-extrusion',
              paint: {
                'fill-extrusion-color': '#a4b9cc',
                'fill-extrusion-height': [ 'get', 'height' ],
                'fill-extrusion-base': [ 'get', 'min_height' ],
                'fill-extrusion-opacity': 1,
                'fill-extrusion-vertical-gradient': false,
              },
            });

            const { sunAltitude, sunAzimuth } = SunPositionUtil.getSunPositionInfo({ lat: testdata.properties.center[1], lng: testdata.properties.center[0] });
            mapInstance.setLight({
              position: [ 1.15, sunAzimuth, sunAltitude ], // Adjust sun altitude and azimuth
              intensity: 1,
              anchor: 'map',
            });

            // Adjust camera for 3D view
            setTimeout(() => {

              mapInstance.easeTo({
                pitch: 90,
                // bearing: -30,
                duration: 2000,
              });

            }, 500);
            
          });
          
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
          setBear(mapInstance.getBearing());
          setZoom(mapInstance.getZoom());
          setMapCenter(mapInstance.getCenter());
          const [ , azi, alti ] = mapInstance.getLight().position as number[];
          setSunAzimuth(azi);
          setSunAltitude(alti);
        });
  
        map.current = mapInstance;
      }

    })();

    return () => {
      map.current && map.current.remove();
    };

  }, []);

  const [ bear, setBear ] = useState(0);
  const [ zoom, setZoom ] = useState(0);
  const [ mapCenter, setMapCenter ] = useState({ lng: 127.03131258991324, lat: 37.49558589225379 });
  const [ sunAzimuth, setSunAzimuth ] = useState(0);
  const [ sunAltitude, setSunAltitude ] = useState(0);

  return (
    <>
      <div
        ref={container}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
      >
        <div style={{
          position: 'absolute',
          width: '200px',
          left: 'calc(100% - 20px)',
          top: '20px',
          transform: 'translate(-100%, 0%)',
          background: 'white',
          border: '1px solid lightgray',
          padding: '15px',
          pointerEvents: 'auto',
        }}
        >
          <div>bear : {bear.toFixed(2)}</div>
          <div>zoom : {zoom.toFixed(2)}</div>
          <div>lng : {mapCenter.lng.toFixed(7)}</div>
          <div>lat : {mapCenter.lat.toFixed(7)}</div>
          <div>sunAzimuth : {sunAzimuth.toFixed(8)}</div>
          <div>sunAltitude : {sunAltitude.toFixed(8)}</div>
        </div>
      </div>
    </>
  );

}