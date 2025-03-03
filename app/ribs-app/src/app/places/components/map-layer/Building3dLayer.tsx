import { GeoJSONSource } from 'maplibre-gl';
import { ChangeEvent, useEffect, useRef, useState } from 'react';

import { testdata } from '../../../components/library/map-libre/data';
import { ShadowUtil } from '../../../components/library/map-libre/util/ShadowUtil';
import { SunPositionUtil } from '../../../components/library/map-libre/util/SunPositionUtil';
import { useLibreMap } from '../map/PlaceMap';

export function Building3dLayer() {

  const [ bear, setBear ] = useState(0);
  const [ zoom, setZoom ] = useState(0);
  const [ mapCenter, setMapCenter ] = useState({ lng: 127.03131258991324, lat: 37.49558589225379 });
  const [ sunAzimuth, setSunAzimuth ] = useState(0);
  const [ sunAltitude, setSunAltitude ] = useState(0);
  const [ currTime, setCurrTime ] = useState(new Date());
  const [ hour, setHour ] = useState(new Date().getHours());
  const [ minute, setMinute ] = useState(new Date().getMinutes());

  const mapInstance = useLibreMap();
  const map = useRef<maplibregl.Map>();
  useEffect(() => {
    
    map.current = mapInstance;
    if (mapInstance) {

      mapInstance.on('load', () => {
      
        // sun position
        const { sunAltitude, sunAzimuth } = SunPositionUtil.getSunPositionInfo({ lat: testdata.properties.center[1], lng: testdata.properties.center[0] });
      
        // Add shadows to the map
        mapInstance.addSource('shadows', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [ testdata ].map((building) => ({
              type: 'Feature',
              geometry: {
                type: 'MultiPolygon',
                coordinates: sunAltitude > 0 ? ShadowUtil.calculateShadowPolygon(building) : [[[]]],
                // coordinates: ShadowUtil.getSample(),
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
            'fill-extrusion-color': 'lightgray',
            'fill-extrusion-height': [ 'get', 'height' ],
            'fill-extrusion-base': [ 'get', 'min_height' ],
            'fill-extrusion-opacity': 1,
            'fill-extrusion-translate-anchor': 'map',
            'fill-extrusion-vertical-gradient': true,
          },
        });
      
        // set light
        mapInstance.setLight({
          position: [ 1.15, sunAzimuth, sunAltitude ], // Adjust sun altitude and azimuth
          intensity: 0.2,
          anchor: 'map',
        });
      
        window.mypath = [];
        mapInstance.on('click', (e) => {
          const path = [ e.lngLat.lng, e.lngLat.lat ];
          window.mypath.push(path);
          console.log('click', path);
        });
  
        // 스크롤 속도 2배
        mapInstance.scrollZoom.setWheelZoomRate(0.0015);
  
        mapInstance.on('idle', (e) => {
          // console.log('idle', e);
          updateStat();
        });
      
        // Adjust camera for 3D view
        setTimeout(() => {
      
          mapInstance.easeTo({
            pitch: 45,
            // bearing: -30,
            duration: 2000,
          });
      
        }, 500);
                  
      });
      
    }

  }, [ mapInstance ]);
  
  const setTimeWithHours = (hour:number, minute:number) => {
      
    setHour(hour);
    setMinute(minute);
  
    const newTime = new Date();
    newTime.setHours(hour);
    newTime.setMinutes(minute);
    setCurrTime(newTime);
  
    // sun position
    const { sunAltitude, sunAzimuth } = SunPositionUtil.getSunPositionInfo({ 
      lat: testdata.properties.center[1],
      lng: testdata.properties.center[0],
      date: newTime,
    });
  
    // Add shadows to the map
    map.current?.getSource<GeoJSONSource>('shadows')?.setData({
      type: 'FeatureCollection',
      features: [ testdata ].map((building) => ({
        type: 'Feature',
        geometry: {
          type: 'MultiPolygon',
          coordinates: sunAltitude > 0 ? ShadowUtil.calculateShadowPolygon(building, newTime) : [[[]]],
          // coordinates: ShadowUtil.getSample(),
        },
        properties: building.properties,
      })),
    });
  
    // set light
    map.current?.setLight({
      position: [ 1.15, sunAzimuth, sunAltitude ], // Adjust sun altitude and azimuth
      intensity: 0.2,
      anchor: 'map',
    });
  
    updateStat();
  
  };
  
  const updateStat = () => {
    const { current } = map;
    if (current) {
      setBear(current.getBearing());
      setZoom(current.getZoom());
      setMapCenter(current.getCenter());
      const [ , azi, alti ] = current.getLight().position as number[];
      setSunAzimuth(azi);
      setSunAltitude(alti);
    }
  };
  
  // Sunset effect 계산
  let sunsetOpacity = 0;
  if (sunAltitude <= 0) {
    sunsetOpacity = 0.7;
  } else if (sunAltitude < 16) {
    sunsetOpacity = Math.min(0.7, 0.7 - (sunAltitude * 0.04));
  }

  return (
    <>
      {/* Sunset Effect Layer */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        background: 'black',
        backdropFilter: 'blur(orange)',
        opacity: sunsetOpacity,
      }}
      />

      {/* Tool Layer */}
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
          left: 'calc(100% - 5px)',
          top: '5px',
          transform: 'translate(-100%, 0%)',
          background: 'white',
          border: '1px solid lightgray',
          padding: '15px',
          pointerEvents: 'auto',
          fontSize: '12px',
        }}
        >
          <div>bear : {bear.toFixed(2)}</div>
          <div>zoom : {zoom.toFixed(2)}</div>
          <div>lng : {mapCenter.lng.toFixed(7)}</div>
          <div>lat : {mapCenter.lat.toFixed(7)}</div>
          <div>sunAzimuth : {`${sunAzimuth.toFixed(0)}º`}</div>
          <div>sunAltitude : {`${sunAltitude.toFixed(0)}º`}</div>
          <div>{currTime.toLocaleString()}</div>

          <TimeInput
            value={hour}
            unitText='시'
            min={0}
            max={23}
            onChange={(e) => {
              const hour = Number(e.target.value);
              setTimeWithHours(hour, minute);
            }}
          />

          <TimeInput
            value={minute}
            unitText='분'
            min={0}
            max={59}
            onChange={(e) => {
              const minute = Number(e.target.value);
              setTimeWithHours(hour, minute);
            }}
          />

        </div>
      </div>
    </>
  );
}

interface TimeInputProps {
  value:number;
  unitText?:string;
  min?:number;
  max?:number;
  onChange?:(e:ChangeEvent<HTMLInputElement>) => void;
}
const TimeInput = ({
  value,
  unitText = '',
  max,
  min,
  onChange,
}:TimeInputProps) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
    <input
      style={{ width: 'calc(100% - 58px)' }}
      type='range'
      min={min}
      max={max}
      step={1}
      value={value}
      onChange={onChange}
    /> {value}{unitText}
  </div>
);