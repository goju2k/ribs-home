import { useEffect } from 'react';

// 한글 도트 글꼴 Galmuri (SIL 오픈 폰트 라이선스)
const GALMURI_CSS = 'https://cdn.jsdelivr.net/npm/galmuri@2.40.3/dist/galmuri.css';
const LINK_ID = 'galmuri-font';

export function useGalmuriFont() {
  useEffect(() => {
    if (document.getElementById(LINK_ID)) return;
    const link = document.createElement('link');
    link.id = LINK_ID;
    link.rel = 'stylesheet';
    link.href = GALMURI_CSS;
    document.head.appendChild(link);
    // 캔버스 글자는 글꼴이 실제로 로드돼야 그려지므로 미리 요청
    link.onload = () => {
      document.fonts.load('11px Galmuri11', '가').catch(() => undefined);
      document.fonts.load('14px Galmuri14', '가').catch(() => undefined);
    };
  }, []);
}