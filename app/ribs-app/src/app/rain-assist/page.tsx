'use client';

import { MapType, MintMap, Position } from '@mint-ui/map';
import { useEffect } from 'react';

import { HideRainCenterDotStyle } from './components/HideRainCenterDotStyle';
import { MapLoadingOverlay } from './components/MapLoadingOverlay';
import { RainForecastLayer } from './components/RainForecastLayer';
import { RainVisualizationLayer } from './components/RainVisualizationLayer';
import { VisualizationModeToggle } from './components/VisualizationModeToggle';
import { WebviewForecastLayer } from './components/WebviewForecastLayer';
import { useAutoGeoLocationHook } from './hook/use-auto-geo-location-hook';
import { useInitialMapViewHook } from './hook/use-initial-map-view-hook';
import { useRainAssistBridgeHook } from './hook/use-rain-assist-bridge-hook';
import { useVisualizationModeHook } from './hook/use-visualization-mode-hook';
import { useWebviewModeHook } from './hook/use-webview-mode-hook';

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

  // 5분 간격 자동 위치 갱신 (기존 /rain의 수동 "현재위치" 버튼과 별개). refetchPosition은
  // 웹뷰 모드에서 앱의 refreshPosition() 브릿지 호출에 대응하기 위한 즉시 재조회 함수.
  const [ userPosition, refetchPosition ] = useAutoGeoLocationHook();
  const updateControl = useUpdateMapControl();
  const [ visualizationMode, setVisualizationMode ] = useVisualizationModeHook();
  const [ isWebview ] = useWebviewModeHook();

  // window.RainAssistBridge는 앱이 호출 전 typeof 체크만 하고 재시도하지 않으므로(정의 안 돼
  // 있으면 조용히 무시) 가능한 한 이르게 정의해야 한다 — 아래 로딩 게이트(!ready) 이전, 이
  // 컴포넌트 최초 마운트 시점에 바로 등록. 상세 계약은 webview-interface.md 참고.
  const bridge = useRainAssistBridgeHook(isWebview, refetchPosition);

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

  // 웹뷰 모드에서는 시각화 확인 모드(디버그용)를 진입할 수 없다 — 항상 실제 레이더 오버레이만 표시.
  const showVisualization = visualizationMode && !isWebview;

  return (
    <>
      <HideRainCenterDotStyle />
      <MintMap
        mapType={mapType}
        mapKey={MapKeys[mapType]}
        dissolveEffectWhenLoaded={false}
        base={{
          center: initialCenter ? new Position(initialCenter.lat, initialCenter.lng) : DEFAULT_CENTER,
          zoomLevel: initialCenter ? 14 : 7,
        }}
      >

        {/* 맵 컨트롤(투명도/기온/현재위치 버튼) — 웹뷰 모드는 앱 임베드 전용 화면이라 디버그/수동
            컨트롤을 숨긴다 (기존 /rain 컴포넌트 재사용, 파일 미수정) */}
        {!isWebview && <MapControlLayer />}

        {/* 레이어: 전국 기온 (재사용) */}
        <TemperatureLayer />

        {/* 레이어: 강수 레이더 <-> current.json 시각화 확인 모드 (스위치 관계). 원본 KMA 레이더
            오버레이는 예측 파이프라인과 무관한 별개 컴포넌트라 웹뷰 모드에서도 그대로 유지한다. */}
        {!showVisualization && <RainRadarLayer />}
        {showVisualization && <RainVisualizationLayer />}

        {/* 강수 예보 배지/화살표: 웹뷰 모드는 앱이 주입하는 데이터만 그리고(자체 예측 로직 없음),
            일반 브라우저는 기존처럼 자체 계산 */}
        {isWebview
          ? <WebviewForecastLayer bridge={bridge} />
          : <RainForecastLayer userPosition={userPosition} />}

        {!isWebview && <VisualizationModeToggle checked={visualizationMode} onChange={setVisualizationMode} />}

      </MintMap>
    </>
  );
}