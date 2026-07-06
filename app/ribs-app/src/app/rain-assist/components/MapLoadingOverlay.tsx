'use client';

import styled from 'styled-components';

// 위치 획득 대기 중(useInitialMapViewHook 게이트) 지도 대신 보여주는 전체화면 로딩 화면.
export function MapLoadingOverlay() {
  return (
    <Overlay>
      <LoadingText>로딩중...</LoadingText>
    </Overlay>
  );
}

const Overlay = styled.div({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'white',
});

const LoadingText = styled.div({
  fontSize: '16px',
  color: '#555',
});