'use client';

import { MapType, MintMap, Position } from '@mint-ui/map';

import { RainRadarLayer } from './components/map-layer/RainRadarLayer';

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
        
        {/* 레이어: 강수 레이더 */}
        <RainRadarLayer />

      </MintMap>
    </>
  );
}