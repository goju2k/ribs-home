/* eslint-disable @next/next/no-img-element */

'use client';

import { MapMarkerWrapper, MapType, MintMap, NaverMintMapController, PolygonMarker, Position, useMintMapController } from '@mint-ui/map';
import { useEffect, useRef, useState } from 'react';

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
  const mi = String(Math.floor(now.getMinutes() / 10)).padEnd(2, '0');
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
  
  const pos = useRef([
    new Position(30.8101038494, 121.3322516155),
    new Position(40.1670385352, 120.609116658),
    new Position(40.0701181652, 133.0225827684),
    new Position(30.7283967663, 132.0821758282),
  ]);

  const controller = useMintMapController();

  const [ imageSize, setImageSize ] = useState<number>(1453);
  const [ imageSize2, setImageSize2 ] = useState<number>(1380.9291408325953);
  const [ imageScale, setImageScale ] = useState<number>();
  const imageSizeRef = useRef(imageSize);
  useEffect(() => {
    imageSizeRef.current = imageSize;
  }, [ imageSize ]);
  
  const getOffset = (position:Position) => {
    if (controller instanceof NaverMintMapController) {
      return controller.naverPositionToOffset(position);
    }
    return controller.positionToOffset(position);
  };

  const handleZoomStart = () => {
    setImageScale(undefined);
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
        
    if (!imageSizeRef.current) {
  
      setImageSize(size);
      setImageScale(1);
      console.log('imageSize =>> ', size, 'scale', 1);
  
    } else {
  
      const scale = Number(size) / Number(imageSizeRef.current);
      setImageScale(scale);
      setImageSize(size);
      setImageSize2(size_y);
      console.log('imageSize =>> ', size, size_y, 'scale', scale);
  
    }

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

  const [ tm, setTm ] = useState(getTime(10));
  const [ radarStartPosition ] = useState(new Position(40.1670385352, 120.609116658));

  return (
    <>

      {imageSize !== undefined && imageScale !== undefined && (
        <MapMarkerWrapper position={radarStartPosition} disablePointerEvent>
          <div style={{ width: `${imageSize}px`, height: `${imageSize2}px`, border: '1px solid coral' }}>
            <img 
              src={`https://vapi.kma.go.kr/BUFD/rdr_sfc_pty_img_${tm}_1453.png`}
              alt={`radar-${tm}`}
              style={{ width: '100%', height: '100%' }}
              onError={() => {
                setTm(getTime(20));
              }}
            />
          </div>
        </MapMarkerWrapper>
      )}

      {pos.current.map((p, idx) => (
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
      ))}

      <PolygonMarker
        position={pos.current} 
        mode='POLYLINE'
      />
        
    </>
  );
}