import { useEffect, useState } from 'react';

declare global {
  interface Window {
    // 앱 0.6~ (webview-interface.md 5절). 구버전 앱에는 없다.
    RainAssistNative?:{
      openEventLog:() => void;
      setWebOwnsEventLogButton:(owns:boolean) => void;
      // 앱 다음 버전~: 설정 화면(매일 날씨 알림)을 연다. 그 전 앱에는 없다.
      openSettings?:() => void;
    };
  }
}

// 앱이 RainAssistNative를 넣어 줬으면 "기록" 버튼을 페이지가 그리겠다고 알리고 true를 돌려준다
// (앱은 지도 위에 띄우던 자체 버튼을 숨긴다 — 하단 시트를 가리지 않도록). 없으면 false: 앱 버튼 자리를 비워 둔다.
export function useNativeEventLogHook(enabled:boolean):boolean {

  const [ available, setAvailable ] = useState(false);

  useEffect(() => {
    const native = enabled ? window.RainAssistNative : undefined;
    if (!native) {
      return undefined;
    }
    native.setWebOwnsEventLogButton(true);
    setAvailable(true);
    return () => native.setWebOwnsEventLogButton(false);
  }, [ enabled ]);

  return available;
}
// 앱이 설정 화면을 열 수 있으면(openSettings가 있으면) true — 톱니 버튼을 보여 준다.
export function useNativeSettingsAvailable(enabled:boolean):boolean {
  const [ available, setAvailable ] = useState(false);
  useEffect(() => {
    setAvailable(enabled && typeof window.RainAssistNative?.openSettings === 'function');
  }, [ enabled ]);
  return available;
}