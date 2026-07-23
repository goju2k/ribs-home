import { useEffect, useRef, useState } from 'react';

// webview-interface.md 3절 계약과 동일한 셰이프.
export interface BridgeLatLng {
  lat:number;
  lon:number;
}

export interface BridgeForecastBlob {
  id:string;
  sizeCells:number;
  centroid:BridgeLatLng;
  headingDeg:number;
  speedKmh:number;
  peakMmh:number;
  // webview-interface.md 3.1.3 — true면 이 blob의 경로가 실제로 forecast.state/etaMinutes를
  // 만든 장본인(내 위치에 도달 예정). path를 다른 색으로 강조해서 그리는 데 사용.
  isForecastTarget:boolean;
  path:{ minutesFromNow:number; lat:number; lon:number; }[];
}

export interface BridgeForecastPayload {
  generatedAtEpochMs:number;
  userLocation:BridgeLatLng;
  forecast:{
    willArrive:boolean;
    etaMinutes:number | null;
    state:'NONE' | 'INCOMING' | 'ACTIVE';
    intensityMmh:number | null;
  };
  blobs:BridgeForecastBlob[];
}

export type BridgeNotificationState = 'INCOMING' | 'ACTIVE' | 'STOPPED' | 'MISSED';

export interface BridgeNotificationPayload {
  state:BridgeNotificationState;
  message:string;
  etaMinutes:number | null;
  intensityMmh:number | null;
  timestampEpochMs:number;
}

declare global {
  interface Window {
    RainAssistBridge?:{
      applyForecast:(forecast:BridgeForecastPayload) => void;
      showNotification:(notification:BridgeNotificationPayload) => void;
      refreshPosition:() => void;
    };
  }
}

// 웹뷰는 한 번 로드되면 앱이 껐다 켜지 않는 한 계속 살아있는데, 이 페이지는 그 사이에
// 새로 배포될 수 있다 — 새로고침을 트리거할 이벤트가 따로 없어 계속 구버전을 붙들고 있게
// 된다. Docker 이미지가 빌드될 때(next.config.js) 한 번 굽힌 값이라 배포마다 값이 달라지고,
// /api/rain-assist/version은 "지금 실제로 떠 있는" 서버가 굽힌 값을 항상 그대로 돌려주므로
// 두 값을 비교하면 "내가 들고 있는 코드가 구버전인지"를 알 수 있다.
const CURRENT_BUILD_ID = process.env.NEXT_PUBLIC_RAIN_ASSIST_BUILD_ID ?? '';

// 리로드해도 (드물게) 계속 구버전으로 판정되는 상황(예: 중간 캐시)에서 무한 리로드 루프에
// 빠지지 않도록 하는 가드. "재요청 시 처리할 데이터"를 들고 있는 게 아니라 순전히
// "최근에 이미 한 번 리로드했다"는 타임스탬프만 저장한다 — 리로드 자체가 위치 재조회/레이더
// 리마운트를 처음부터 다시 실행해주므로 재개할 상태를 따로 보관해 둘 필요가 없다.
const STALE_RELOAD_GUARD_KEY = 'rain-assist-stale-reload-at';
const STALE_RELOAD_GUARD_COOLDOWN_MS = 5 * 60 * 1000;

async function isRunningStaleBuild():Promise<boolean> {
  try {
    const res = await fetch('/api/rain-assist/version', { cache: 'no-store' });
    const { buildId }:{ buildId:string | null; } = await res.json();
    return !!buildId && buildId !== CURRENT_BUILD_ID;
  } catch {
    // 버전 확인 자체가 실패하면(오프라인 등) 안전하게 "최신"으로 간주 — 불확실한 상태에서
    // 리로드를 강행하지 않는다.
    return false;
  }
}

function recentlyReloadedForStaleVersion():boolean {
  try {
    const lastReloadAt = Number(sessionStorage.getItem(STALE_RELOAD_GUARD_KEY) ?? 0);
    return Date.now() - lastReloadAt < STALE_RELOAD_GUARD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markReloadedForStaleVersion() {
  try {
    sessionStorage.setItem(STALE_RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // sessionStorage를 못 쓰는 환경이면 루프 가드 없이 진행 — 매번 리로드될 수 있지만
    // 배포가 실제로 최신화되면 자연히 멈춘다.
  }
}

export interface RainAssistBridgeState {
  forecast:BridgeForecastPayload | null;
  notification:BridgeNotificationPayload | null;
}

// webview-interface.md 3절: 앱이 각 메서드 호출 전에 typeof 체크를 하고, 아직 정의 안 됐으면
// 조용히 무시(에러 없음, 화면 무반응)하므로 window.RainAssistBridge는 가능한 한 이르게 정의해야
// 한다 — 로딩 게이트(위치 획득 대기)보다 먼저, 이 훅을 호출하는 컴포넌트의 최초 마운트 시점에.
export function useRainAssistBridgeHook(enabled:boolean, onRefreshPosition:() => void):RainAssistBridgeState {

  const [ forecast, setForecast ] = useState<BridgeForecastPayload | null>(null);
  const [ notification, setNotification ] = useState<BridgeNotificationPayload | null>(null);
  const onRefreshPositionRef = useRef(onRefreshPosition);
  onRefreshPositionRef.current = onRefreshPosition;

  useEffect(() => {

    if (!enabled) {
      return undefined;
    }

    window.RainAssistBridge = {
      applyForecast: (payload) => {
        setForecast(payload);
      },
      showNotification: (payload) => {
        setNotification(payload);
      },
      refreshPosition: () => {
        (async () => {
          if (!recentlyReloadedForStaleVersion() && await isRunningStaleBuild()) {
            markReloadedForStaleVersion();
            window.location.reload();
            return;
          }
          onRefreshPositionRef.current();
        })();
      },
    };

    return () => {
      delete window.RainAssistBridge;
    };

  }, [ enabled ]);

  return { forecast, notification };
}