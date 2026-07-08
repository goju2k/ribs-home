'use client';

import { createGlobalStyle } from 'styled-components';

// RainRadarLayer.tsx(/rain, 파일 미수정 원칙이라 직접 고칠 수 없음)가 "지도 중심의 강수 색상"을
// 표시하려고 그리는 초록 점(#65ff78, 테두리 #109500) — flex 정렬과 position:absolute가 맞물려
// 화면 정중앙에서 몇 픽셀 어긋나며, 우리 페이지의 "현재위치" 빨간 점과 겹칠 때 정렬 안 맞는
// 게 눈에 띈다. /rain-assist는 이 정보(mm/h 좌하단 표시)와 무관하므로 이 점만 시각적으로
// 숨긴다. 브라우저가 인라인 style을 rgb()로 정규화해 저장하므로 hex가 아니라 rgb 문자열로 매칭.
export const HideRainCenterDotStyle = createGlobalStyle`
  div[style*="rgb(101, 255, 120)"] {
    display: none !important;
  }
`;