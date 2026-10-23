import { ChangeEvent, useEffect, useRef, useState } from 'react';

import { Site, SunShadowLayer } from './sun-shadow-layer';

import { testdata } from '../../../components/library/map-libre/data';
import { SunPositionUtil } from '../../../components/library/map-libre/util/SunPositionUtil';
import { NaverMap3d } from '../../../components/library/naver-map/components/map/naver-map-types';
import { NaverMarker } from '../../../components/library/naver-map/components/marker/NaverMarker';
import { useKBLandNaverMap } from '../../../components/library/naver-map/KBLandNaverMap';

/** 3D 건물을 올린 장소들: 시험 건물(바닥 다각형 세우기) · 63빌딩(블렌더 모델) */
const SITES:(Site & { name: string; zoom: number; })[] = [
  {
    id: 'dasan',
    name: '다산 시험 건물',
    origin: testdata.properties.center as [number, number],
    zoom: 16,
    buildings: [{ ring: testdata.geometry.coordinates[0], height: testdata.properties.height }],
  },
  {
    id: 'yeouido-63',
    name: '여의도 63빌딩',
    // 모델 원점 = 지도 바닥 다각형 점들의 평균 (scripts/blender/build63.py)
    origin: [ 126.9402258, 37.5198342 ],
    zoom: 15.6,
    buildings: [{ model: '/models/places/63-building.glb' }],
  },
];

export function Building3dLayer() {

  const [ bear, setBear ] = useState(0);
  const [ zoom, setZoom ] = useState(0);
  const [ mapCenter, setMapCenter ] = useState({ lng: 127.03131258991324, lat: 37.49558589225379 });
  const [ sunAzimuth, setSunAzimuth ] = useState(0);
  const [ sunAltitude, setSunAltitude ] = useState(0);
  const [ currTime, setCurrTime ] = useState(new Date());
  const [ hour, setHour ] = useState(new Date().getHours());
  const [ minute, setMinute ] = useState(new Date().getMinutes());
  const [ siteId, setSiteId ] = useState(SITES[0].id);
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
  const layer = useRef<SunShadowLayer>();
  const timeRef = useRef(currTime);
  const siteRef = useRef(SITES[0]);

  /** 지금 장소·시각의 해를 3D 레이어에 넣는다 */
  const applySun = () => {
    const site = siteRef.current;
    const { sunAltitude, sunAzimuth } = SunPositionUtil.getSunPositionInfo({ lat: site.origin[1], lng: site.origin[0], date: timeRef.current });
    layer.current?.setSun(sunAzimuth, sunAltitude);
    setSunAzimuth(sunAzimuth);
    setSunAltitude(sunAltitude);
  };

  useEffect(() => {
    
    map.current = mapInstance;
    
    if (mapInstance) {

      mapInstance.on('load', () => {
      
        // 3D 건물 + 해 그림자 (three.js)
        layer.current = new SunShadowLayer(SITES);
        mapInstance.addLayer(layer.current);
        // ?site=yeouido-63 처럼 장소를 골라 바로 연다
        const start = SITES.find((s) => s.id === new URLSearchParams(window.location.search).get('site'));
        if (start) {
          siteRef.current = start;
          setSiteId(start.id);
          mapInstance.jumpTo({ center: start.origin, zoom: start.zoom });
        }
        applySun();
      
        window.mypath = [];
        mapInstance.on('click', (e) => {
          const path = [ e.lngLat.lng, e.lngLat.lat ];
          window.mypath.push(path);
          console.log('click', path);
        });
  
        // 스크롤 속도 2배
        mapInstance.scrollZoom.setWheelZoomRate(0.0015);
  
        mapInstance.on('idle', () => {
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

  const moveToSite = (id:string) => {
    const site = SITES.find((s) => s.id === id) ?? SITES[0];
    siteRef.current = site;
    setSiteId(site.id);
    applySun();
    map.current?.flyTo({ center: site.origin, zoom: site.zoom, pitch: 55, duration: 2500 });
  };
  
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
    timeRef.current = newTime;
    applySun();
  
    updateStat();
  
  };
  
  const updateStat = () => {
    const { current } = map;
    if (current) {
      setBear((current.getBearing() + 360) % 360);
      setZoom(current.getZoom());
      setMapCenter(current.getCenter());
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
            {SITES.map((s) => (
              <button
                key={s.id}
                type='button'
                onClick={() => moveToSite(s.id)}
                style={{
                  padding: '6px 8px',
                  border: '1px solid lightgray',
                  borderRadius: '4px',
                  background: s.id === siteId ? '#3d6fd8' : 'white',
                  color: s.id === siteId ? 'white' : 'black',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {s.name}
              </button>
            ))}
          </div>

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