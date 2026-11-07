'use client';

import { MapType, MintMap, Position } from '@mint-ui/map';
import { ReactNode, useCallback, useEffect, useState } from 'react';

import { AppDownloadButton } from './components/AppDownloadButton';
import { BottomBar, EventLogButton } from './components/BottomBar';
import { CctvLayer } from './components/CctvLayer';
import { ForecastPanel } from './components/ForecastPanel';
import { GoToMyLocationButton } from './components/GoToMyLocationButton';
import { HideRainCenterDotStyle } from './components/HideRainCenterDotStyle';
import { MapLoadingOverlay } from './components/MapLoadingOverlay';
import { WebviewForecastLayer } from './components/WebviewForecastLayer';
import { useAutoGeoLocationHook } from './hook/use-auto-geo-location-hook';
import { useInitialMapViewHook } from './hook/use-initial-map-view-hook';
import { useNativeEventLogHook } from './hook/use-native-ui-hook';
import { useRainAssistBridgeHook } from './hook/use-rain-assist-bridge-hook';
import { useWebviewModeHook } from './hook/use-webview-mode-hook';

import { MapControlLayer } from '../rain/components/map-layer/MapControl';
import { RainRadarLayer } from '../rain/components/map-layer/RainRadarLayer';
import { TemperatureLayer } from '../rain/components/map-layer/TemperatureLayer';
import { useUpdateMapControl } from '../rain/state/map-controls';

// epoch ms -> KMA tm(yyyyMMddHHmm, KST). KST는 DST가 없어 고정 +9h로 충분하다.
function toKstTm(epochMs:number):string {
  const d = new Date(epochMs + (9 * 60 * 60 * 1000));
  const pad = (n:number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

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
  const [ isWebview ] = useWebviewModeHook();

  // RainRadarLayer(/rain 재사용, 파일 미수정)는 마운트 시 한 번만 레이더 이미지 시각을 계산할 뿐
  // 자체적인 주기 갱신이 전혀 없다 — 앱이 오래 백그라운드에 있다가 돌아와도 이 컴포넌트를 직접
  // 건드릴 수 없으니, refreshPosition() 시점에 key를 바꿔 강제로 리마운트시켜 새 이미지를
  // 받아오게 한다(webview-interface.md 3.3절 신규 요구사항).
  const [ radarRefreshKey, setRadarRefreshKey ] = useState(0);
  const handleRefreshPosition = useCallback(() => {
    refetchPosition();
    setRadarRefreshKey((key) => key + 1);
  }, [ refetchPosition ]);

  // window.RainAssistBridge는 앱이 호출 전 typeof 체크만 하고 재시도하지 않으므로(정의 안 돼
  // 있으면 조용히 무시) 가능한 한 이르게 정의해야 한다 — 아래 로딩 게이트(!ready) 이전, 이
  // 컴포넌트 최초 마운트 시점에 바로 등록. 상세 계약은 webview-interface.md 참고.
  const bridge = useRainAssistBridgeHook(isWebview, handleRefreshPosition);
  // 앱 0.6~: "기록" 버튼을 페이지가 그린다(앱은 자체 버튼을 숨김). 구버전 앱이면 그 자리를 비워 둔다.
  const nativeEventLog = useNativeEventLogHook(isWebview);

  // 웹뷰에서는 앱 예보가 근거한 바로 그 레이더 프레임을 그린다 — 웹이 따로 고른 최신 이미지와
  // 앱의 프레임이 5~15분 어긋나면, 화살표가 지도 속 비구름 위치와 그만큼 엇나가 보였다.
  const radarFrameEpochMs = bridge.forecast?.radarFrameEpochMs;
  const forcedRadarTm = isWebview && radarFrameEpochMs ? toKstTm(radarFrameEpochMs) : undefined;

  // 최초 위치 획득까지 최대 3초 지도 마운트를 지연시켜, 위치를 얻었으면 처음부터 그 위치+줌14로
  // 시작하고(마운트 후 재이동/재줌하면 부자연스럽게 튀어 보임), 못 얻었으면 기존 전국 줌으로
  // 시작한다. 이 게이트가 닫힌 뒤에는 위치가 뒤늦게 와도 다시 이동하지 않는다.
  const { ready, initialCenter } = useInitialMapViewHook(userPosition);

  useEffect(() => {
    if (userPosition) {
      updateControl('currPosition', new Position(userPosition.lat, userPosition.lng));
    }
  }, [ userPosition ]);

  let bottomLeft:ReactNode | 'native-space' = <AppDownloadButton />;
  if (isWebview) {
    bottomLeft = nativeEventLog ? <EventLogButton onClick={() => window.RainAssistNative?.openEventLog()} /> : 'native-space';
  }

  if (!ready) {
    return <MapLoadingOverlay />;
  }

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

        {/* 레이어: 강수 레이더. key=radarRefreshKey: 웹뷰 모드가 아니면 절대 바뀌지 않으므로
            (refreshPosition은 웹뷰에서만 활성화) 일반 모드에는 영향 없음. */}
        <RainRadarLayer key={radarRefreshKey} forcedTm={forcedRadarTm} showLegend={false} />

        {/* 강수 예보 배지/화살표: 이제 예보는 앱이 직접 계산해 웹뷰 브릿지로 주입하는 방식으로만
            제공한다(웹 자체 계산 로직은 제거됨) — 일반 브라우저에서는 예보 영역 자체가 없다. */}
        {isWebview && <WebviewForecastLayer bridge={bridge} />}

        {/* 하단 줄: 왼쪽 버튼 + 강수 범례 바(RainRadarLayer의 세로 범례 대신). 왼쪽은 웹뷰면 "기록"
            (구버전 앱이면 앱 버튼 자리 비움), 일반 브라우저면 Android 앱 받기. */}
        <BottomBar left={bottomLeft} />

        {/* 웹뷰: 위쪽 상태 카드(알림 문구 + 레이더 시각) — 누르면 하단 시트(분별 비 세기 등)가 올라온다. */}
        {isWebview && <ForecastPanel bridge={bridge} />}

        {/* 웹뷰 모드는 /rain의 MapControlLayer("현재위치 바로가기" 버튼 포함)를 숨기므로 원래는
            웹뷰 전용으로 뒀으나, CCTV 토글과 세로로 짝을 이루는 UI라 일반 브라우저에서도
            노출한다(MapControlLayer의 "현재위치" 행과는 별개로 둘 다 보임). */}
        <GoToMyLocationButton userPosition={userPosition} />

        {/* 도로 CCTV 위치 + 정지 이미지 확인(수동 토글) — "내 위치로" 버튼 바로 위에 쌓이도록
            CctvLayer 내부에서 위치를 잡는다. 웹뷰에서도 실제 강수 여부를 눈으로 확인할 수 있어야
            하므로 웹뷰 모드에서도 노출한다. */}
        <CctvLayer />

      </MintMap>
    </>
  );
}