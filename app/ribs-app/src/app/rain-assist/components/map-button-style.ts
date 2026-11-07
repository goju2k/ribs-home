import { BOTTOM_BAR_HEIGHT_PX, BOTTOM_BAR_MARGIN_PX } from './BottomBar';

// 오른쪽 지도 버튼(내 위치, CCTV)의 공통 모양과 자리. 하단 줄(BottomBar) 위로 아래에서부터 쌓는다:
// 내 위치가 맨 아래, CCTV가 그 위. 두 버튼은 각자 우하단 MapControlWrapper라 서로 크기를 모르므로
// marginBottom을 이 상수로 맞춘다.
export const MAP_BUTTON_SIZE_PX = 48;
export const MAP_BUTTON_GAP_PX = 10;
export const MAP_BUTTON_SIDE_PX = 16;
export const MAP_BUTTON_BOTTOM_PX = BOTTOM_BAR_MARGIN_PX + BOTTOM_BAR_HEIGHT_PX + 12;

export const mapButtonStyle = {
  pointerEvents: 'auto',
  width: `${MAP_BUTTON_SIZE_PX}px`,
  height: `${MAP_BUTTON_SIZE_PX}px`,
  borderRadius: '16px',
  background: 'white',
  border: 'none',
  boxShadow: '0 2px 10px rgba(21, 32, 43, 0.16)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  cursor: 'pointer',
} as const;