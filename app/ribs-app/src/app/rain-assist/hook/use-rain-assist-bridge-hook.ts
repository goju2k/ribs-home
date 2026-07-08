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
        onRefreshPositionRef.current();
      },
    };

    return () => {
      delete window.RainAssistBridge;
    };

  }, [ enabled ]);

  return { forecast, notification };
}