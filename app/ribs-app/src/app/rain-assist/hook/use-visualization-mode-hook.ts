import { useState } from 'react';

function readInitialVisualizationMode():boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return new URLSearchParams(window.location.search).get('visualization') === '1';
}

// ?visualization=1 쿼리로 접속하면 시각화 확인 모드로 초기화된다.
export function useVisualizationModeHook() {
  return useState<boolean>(readInitialVisualizationMode);
}