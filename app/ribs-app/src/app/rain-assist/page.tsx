'use client';

import { MapType, MintMap, Position } from '@mint-ui/map';
import { useEffect } from 'react';

import { RainForecastLayer } from './components/RainForecastLayer';
import { RainVisualizationLayer } from './components/RainVisualizationLayer';
import { VisualizationModeToggle } from './components/VisualizationModeToggle';
import { useAutoGeoLocationHook } from './hook/use-auto-geo-location-hook';
import { useVisualizationModeHook } from './hook/use-visualization-mode-hook';

import { MapControlLayer } from '../rain/components/map-layer/MapControl';
import { RainRadarLayer } from '../rain/components/map-layer/RainRadarLayer';
import { TemperatureLayer } from '../rain/components/map-layer/TemperatureLayer';
import { useUpdateMapControl } from '../rain/state/map-controls';

export default function RainAssistPage() {
  return (
    <>
      <WeatherMap />
    </>
  );
}

const MapKeys = {
  naver: '868psyu6ui', // new maps key for gl
  google: 'AIzaSyBgPrwr9buZ0EjOxFumRyXyqrkVtEZEtkk',
} as Record<MapType, string>;

function WeatherMap({ mapType = 'naver' }:{mapType?:MapType;}) {

  // 5분 간격 자동 위치 갱신 (기존 /rain의 수동 "현재위치" 버튼과 별개)
  const userPosition = useAutoGeoLocationHook();
  const updateControl = useUpdateMapControl();
  const [ visualizationMode, setVisualizationMode ] = useVisualizationModeHook();

  useEffect(() => {
    if (userPosition) {
      updateControl('currPosition', new Position(userPosition.lat, userPosition.lng));
    }
  }, [ userPosition ]);

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

        {/* 맵 컨트롤 (기존 /rain 컴포넌트 재사용, 파일 미수정) */}
        <MapControlLayer />

        {/* 레이어: 전국 기온 (재사용) */}
        <TemperatureLayer />

        {/* 레이어: 강수 레이더 <-> current.json 시각화 확인 모드 (스위치 관계) */}
        {!visualizationMode && <RainRadarLayer />}
        {visualizationMode && <RainVisualizationLayer />}

        {/* 레이어: 강수 예보 배지/화살표 (신규, 모드와 무관하게 항상 표시) */}
        <RainForecastLayer userPosition={userPosition} />

        <VisualizationModeToggle checked={visualizationMode} onChange={setVisualizationMode} />

      </MintMap>
    </>
  );
}