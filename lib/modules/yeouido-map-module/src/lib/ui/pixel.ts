import styled from 'styled-components';

export const PIXEL_FONT = 'Galmuri11, sans-serif';

// 도트 게임 느낌의 각진 테두리
export const pixelBorder = (light = 'rgba(255,255,255,0.22)', dark = 'rgba(0,0,0,0.45)') => ({ boxShadow: `inset -2px -2px 0 ${dark}, inset 2px 2px 0 ${light}, 0 0 0 2px #0b0e22` });

export const Panel = styled.div({
  background: 'rgba(22,26,52,0.9)',
  color: '#f4f4f8',
  fontFamily: PIXEL_FONT,
  fontSize: '11px',
  lineHeight: '15px',
  ...pixelBorder(),
});

export const PixelButton = styled.button<{ $active?: boolean; }>(({ $active }) => ({
  fontFamily: PIXEL_FONT,
  fontSize: '11px',
  lineHeight: '13px',
  color: $active ? '#1d1d33' : '#f4f4f8',
  background: $active ? '#ffd84a' : '#3a4272',
  border: 0,
  padding: '7px 7px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  ...pixelBorder(),
  '&:active': { transform: 'translateY(1px)' },
}));