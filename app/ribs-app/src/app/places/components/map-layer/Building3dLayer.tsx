import { GeoJSONSource } from 'maplibre-gl';
import { ChangeEvent, useEffect, useRef, useState } from 'react';

import { testdata } from '../../../components/library/map-libre/data';
import { ShadowUtil } from '../../../components/library/map-libre/util/ShadowUtil';
import { SunPositionUtil } from '../../../components/library/map-libre/util/SunPositionUtil';
import { NaverMap3d } from '../../../components/library/naver-map/components/map/naver-map-types';
import { NaverMarker } from '../../../components/library/naver-map/components/marker/NaverMarker';
import { useKBLandNaverMap } from '../../../components/library/naver-map/KBLandNaverMap';

export function Building3dLayer() {

  const [ bear, setBear ] = useState(0);
  const [ zoom, setZoom ] = useState(0);
  const [ mapCenter, setMapCenter ] = useState({ lng: 127.03131258991324, lat: 37.49558589225379 });
  const [ sunAzimuth, setSunAzimuth ] = useState(0);
  const [ sunAltitude, setSunAltitude ] = useState(0);
  const [ currTime, setCurrTime ] = useState(new Date());
  const [ hour, setHour ] = useState(new Date().getHours());
  const [ minute, setMinute ] = useState(new Date().getMinutes());
  const minHour = 5;
  const maxHour = 20;
  const totalHours = maxHour - minHour;
  const totalMinutes = totalHours * 60;
  
  const getDayMinuteFromDate = (h:number, m:number) => (h - minHour) * 60 + m;

  const getDateFromDayMinutes = (dayMinutes:number) => {
    const h = minHour + Math.floor(dayMinutes / 60);
    const m = dayMinutes % 60;
    return [ h, m ];
  };

  const [ dayMinute, setDayMinute ] = useState(getDayMinuteFromDate(hour, minute));

  const mapInstance = useKBLandNaverMap<NaverMap3d>();
  const map = useRef<maplibregl.Map>();
  useEffect(() => {
    
    map.current = mapInstance;
    console.log('map', map);
    
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
          updateStat();
        });

        mapInstance.on('rotate', () => {
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
  
  const setTimeWithDayMinutes = (dayMinute:number) => {
    const [ h, m ] = getDateFromDayMinutes(dayMinute);
    setTimeWithHours(h, m);
  };

  const setTimeWithHours = (hour:number, minute:number, dayMinute?:number) => {
      
    setHour(hour);
    setMinute(minute);
    setDayMinute(dayMinute === undefined ? getDayMinuteFromDate(hour, minute) : dayMinute);
  
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
      setBear((current.getBearing() + 360) % 360);
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
      {/* test marker */}
      <NaverMarker
        lngLat={[ 127.15744426154328, 37.62122112865127 ]}
      >
        <div style={{ width: '100px', height: '30px', background: 'red', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ color: 'white', fontSize: '14px', fontWeight: 700 }}>마커테스트</div>
        </div>
      </NaverMarker>
      <NaverMarker
        lngLat={[ 127.15744426154328, 37.62122112865127 ]}
      >
        <div style={{ width: '4px', height: '4px', borderRadius: '100%', background: 'blue' }} />
      </NaverMarker>
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

      {/* 나침반 */}
      <div
        style={{
          position: 'absolute',
          left: 10,
          top: 10,
          width: '60px',
          height: '60px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '13px',
          border: '1px solid black',
          borderRadius: '50%',
          transform: `rotate(-${bear}deg)`,
          cursor: 'pointer',
        }}
        onClick={() => {
          map.current?.setBearing(0);
        }}
      >
        <div style={{
          width: '2px',
          background: 'red',
          flex: 1,
        }}
        />
        <div style={{
          width: '2px',
          background: 'blue',
          flex: 1,
        }}
        />
        <div style={{ position: 'absolute', color: 'red', fontSize: '14px', left: '50%', top: -3, transform: 'translateX(-50%)' }}>N</div>
        <div style={{ position: 'absolute', color: 'blue', fontSize: '14px', left: '50%', top: 41, transform: 'translateX(-50%)' }}>S</div>
        <div style={{ position: 'absolute', width: 'calc(100% - 4px)', margin: '0 5px', height: '1px', background: 'black', left: -3, top: '50%', transform: 'translateY(-50%)' }} />
      </div>

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
          <div>bear : {`${bear.toFixed(2)}º`}</div>
          <div>zoom : {zoom.toFixed(2)}</div>
          <div>lng : {mapCenter.lng.toFixed(7)}</div>
          <div>lat : {mapCenter.lat.toFixed(7)}</div>
          <div>sunAzimuth : {`${sunAzimuth.toFixed(0)}º`}</div>
          <div>sunAltitude : {`${sunAltitude.toFixed(0)}º`}</div>
          <div>{currTime.toLocaleString()}</div>

          <TimeInput
            value={hour}
            unitText='시'
            min={minHour}
            max={maxHour}
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

      {/* time line */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 'calc(100% - 24px)',
          transform: 'translate(-50%, -100%)',
          width: '100%',
          maxWidth: '724px',
          height: '50px',
          background: 'white',
          border: '1px solid lightgray',
          padding: '5px 20px',
        }}
      >
        <div style={{ fontSize: '14px', textAlign: 'center' }}>{currTime.toLocaleString()}</div>
        <AllTimeInput
          value={dayMinute}
          min={0}
          max={totalMinutes}
          onChange={(e) => {
            const minute = Number(e.target.value);
            setTimeWithDayMinutes(minute);
          }}
        />
      </div>
    </>
  );
}

interface TimeInputProps {
  value:number;
  unitText?:string;
  min?:number;
  max?:number;
  step?:number;
  onChange?:(e:ChangeEvent<HTMLInputElement>) => void;
}
const TimeInput = ({
  value,
  unitText = '',
  max,
  min,
  step = 1,
  onChange,
}:TimeInputProps) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
    <input
      style={{ width: 'calc(100% - 32px)' }}
      type='range'
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
    /> {value}{unitText}
  </div>
);

const AllTimeInput = ({
  value,
  unitText = '',
  max,
  min,
  step = 10,
  onChange,
}:TimeInputProps) => (
  <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '2px' }}>
    <input
      style={{ width: '100%' }}
      type='range'
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
    /> {unitText}
  </div>
);