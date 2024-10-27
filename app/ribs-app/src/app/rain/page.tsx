/* eslint-disable @next/next/no-img-element */

'use client';

import { MapControlWrapper, MapMarkerWrapper, MapType, MintMap, NaverMintMapController, Position, useMintMapController } from '@mint-ui/map';
import { useEffect, useRef, useState } from 'react';
import { BaseFlex } from 'ui-base-pack';

export default function TestPage() {
  return (
    <>
      <WeatherMap />
    </>
  );
}

const MapKeys = {
  naver: 'yc2mrw1mz8',
  google: 'AIzaSyBgPrwr9buZ0EjOxFumRyXyqrkVtEZEtkk',
} as Record<MapType, string>;

function getTime(minuteBefore?:number) {
  let now = new Date();
  if (minuteBefore) {
    now = new Date(now.setMinutes(now.getMinutes() - minuteBefore));
  }
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}`;
}

function WeatherMap({ mapType = 'naver' }:{mapType?:MapType;}) {

  return (
    <>
      <MintMap
        mapType={mapType}
        mapKey={MapKeys[mapType]}
        dissolveEffectWhenLoaded={false}
        base={{
          center: new Position(37.496837, 127.028104),
          zoomLevel: 7,
        }}
      >
        
        <Calc />

      </MintMap>
    </>
  );
}

function Calc() {
  
  // 기준 바운더리
  const pos = useRef([
    new Position(30.8101038494, 121.3322516155),
    new Position(40.1670385352, 120.609116658),
    new Position(40.0701181652, 133.0225827684),
    new Position(30.7283967663, 132.0821758282),
  ]);

  const controller = useMintMapController();

  const [ imageSize, setImageSize ] = useState<number>(1453);
  const [ imageSize2, setImageSize2 ] = useState<number>(1380.9291408325953);
  const [ imageShow, setImageShow ] = useState(false);
  
  const getOffset = (position:Position) => {
    if (controller instanceof NaverMintMapController) {
      return controller.naverPositionToOffset(position);
    }
    return controller.positionToOffset(position);
  };

  const handleZoomStart = () => {
    setImageShow(false);
  };

  const handleZoomChanged = () => {

    // x축
    const offset1 = getOffset(pos.current[2]);
    const offset2 = getOffset(pos.current[1]);
    const size = Math.floor(offset1.x - offset2.x);
  
    // y축
    const offset1_y = getOffset(pos.current[1]);
    const offset2_y = getOffset(pos.current[0]);
    const size_y = Math.floor(offset2_y.y - offset1_y.y);

    setImageSize(size);
    setImageSize2(size_y);
    // console.log('imageSize =>> ', size, size_y);
  
    setImageShow(true);

  };

  useEffect(() => {

    handleZoomChanged();
    controller.addEventListener('ZOOMSTART', handleZoomStart);
    controller.addEventListener('ZOOM_CHANGED', handleZoomChanged);

    return () => {
      controller.removeEventListener('ZOOMSTART', handleZoomStart);
      controller.removeEventListener('ZOOM_CHANGED', handleZoomChanged);
    };

  }, []);

  const [ tmBefore, setTmBefore ] = useState(4);
  const [ tm, setTm ] = useState(getTime(tmBefore));
  const [ tmText, setTmText ] = useState<string>('');
  const [ radarStartPosition ] = useState(new Position(40.1670385352, 120.609116658));
  useEffect(() => {
    setTmText(`${tm.substring(4, 6)}월 ${tm.substring(6, 8)}일 ${tm.substring(8, 10)}시 ${tm.substring(10, 12)}분`);
  }, [ tm ]);

  const [ opacity, setOpacity ] = useState(0.4);

  return (
    <>

      <MapControlWrapper positionHorizontal='right' positionVertical='top'>
        <div style={{
          background: 'white',
          border: '1px solid gray',
          borderRadius: '3px', 
          padding: '10px', 
          marginTop: '10px',
          marginRight: '10px',
          fontSize: '14px',
        }}
        >
          <BaseFlex flexgap='4px'>
            <div>기준시각 : {tmText}</div>
            <BaseFlex flexrow flexalign='center' flexspacebetween>
              <span style={{ width: '55px' }}>투명도</span>
              <input
                id='opacity'
                type='range'
                min={0.1}
                max={1.0}
                step={0.1}
                value={opacity}
                onChange={(e) => {
                  setOpacity(Number(e.target.value));
                }}
              />
            </BaseFlex>
          </BaseFlex>
        </div>
      </MapControlWrapper>

      {imageShow && (
        <MapMarkerWrapper position={radarStartPosition} disablePointerEvent>
          <div style={{ width: `${imageSize}px`, height: `${imageSize2}px`, border: '0px solid coral' }}>
            <img 
              src={`https://vapi.kma.go.kr/BUFD/rdr_sfc_pty_img_${tm}_1453.png`}
              alt={`radar-${tm}`}
              style={{ width: '100%', height: '100%', opacity }}
              onError={() => {
                if (tmBefore < 30) {

                  const nextBefore = tmBefore + 5;
                  setTmBefore(nextBefore);

                  const time = getTime(nextBefore);
                  setTm(time);
                  
                }
              }}
            />
          </div>
        </MapMarkerWrapper>
      )}

      {/* 기준점 가이드라인 */}
      {/* {pos.current.map((p, idx) => (
        <MapMarkerWrapper position={p} key={idx}>
          <div style={{
            width: '24px',
            height: '24px', 
            background: 'lightgray',
            fontSize: 12,
            textAlign: 'center',
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)', 
          }}
          >
            {`p${idx}`}
          </div>
        </MapMarkerWrapper>
      ))} */}

      {/* <PolygonMarker
        position={pos.current} 
        mode='POLYLINE'
      /> */}
        
    </>
  );
}