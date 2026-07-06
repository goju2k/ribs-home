'use client';

import { MapType, MintMap, Position } from '@mint-ui/map';
import { useEffect } from 'react';

import { MapLoadingOverlay } from './components/MapLoadingOverlay';
import { RainForecastLayer } from './components/RainForecastLayer';
import { RainVisualizationLayer } from './components/RainVisualizationLayer';
import { VisualizationModeToggle } from './components/VisualizationModeToggle';
import { useAutoGeoLocationHook } from './hook/use-auto-geo-location-hook';
import { useInitialMapViewHook } from './hook/use-initial-map-view-hook';
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

const DEFAULT_CENTER = new Position(37.496837, 127.028104);

function WeatherMap({ mapType = 'naver' }:{mapType?:MapType;}) {

  // 5분 간격 자동 위치 갱신 (기존 /rain의 수동 "현재위치" 버튼과 별개)
  const userPosition = useAutoGeoLocationHook();
  const updateControl = useUpdateMapControl();
  const [ visualizationMode, setVisualizationMode ] = useVisualizationModeHook();

  // 최초 위치 획득까지 최대 3초 지도 마운트를 지연시켜, 위치를 얻었으면 처음부터 그 위치+줌14로
  // 시작하고(마운트 후 재이동/재줌하면 부자연스럽게 튀어 보임), 못 얻었으면 기존 전국 줌으로
  // 시작한다. 이 게이트가 닫힌 뒤에는 위치가 뒤늦게 와도 다시 이동하지 않는다.
  const { ready, initialCenter } = useInitialMapViewHook(userPosition);

  useEffect(() => {
    if (userPosition) {
      updateControl('currPosition', new Position(userPosition.lat, userPosition.lng));
    }
  }, [ userPosition ]);

  if (!ready) {
    return <MapLoadingOverlay />;
  }

  return (
    <>
      <MintMap
        mapType={mapType}
        mapKey={MapKeys[mapType]}
        dissolveEffectWhenLoaded={false}
        base={{
          center: initialCenter ? new Position(initialCenter.lat, initialCenter.lng) : DEFAULT_CENTER,
          zoomLevel: initialCenter ? 14 : 7,
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