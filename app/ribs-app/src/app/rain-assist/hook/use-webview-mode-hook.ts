import { useState } from 'react';

function readInitialWebviewMode():boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return new URLSearchParams(window.location.search).get('webview') === 'true';
}

// ?webview=true로 접속하면(Android 앱 WebView) 자체 예측 로직을 끄고 앱이 window.RainAssistBridge로
// 주입하는 데이터만 그려주는 모드로 전환한다. 자세한 계약은 webview-interface.md 참고.
export function useWebviewModeHook() {
  return useState<boolean>(readInitialWebviewMode);
}