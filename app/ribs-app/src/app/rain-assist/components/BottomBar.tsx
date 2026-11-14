'use client';

import { MapControlWrapper } from '@mint-ui/map';
import { ReactNode } from 'react';
import { useRecoilValue } from 'recoil';
import styled from 'styled-components';

import { MapControlState } from '../../rain/state/map-controls';
import { legendSteps } from '../util/rain-format';

// 화면 맨 아래 줄 높이/여백 — 오른쪽 지도 버튼들(내 위치, CCTV)이 이 위로 쌓인다(MAP_BUTTON_* 참고).
export const BOTTOM_BAR_HEIGHT_PX = 48;
export const BOTTOM_BAR_MARGIN_PX = 16;

// 구버전 앱(RainAssistNative 없음)은 자체 "기록" 버튼을 좌하단(16dp 여백, 약 80x44)에 띄우므로 그 자리를 비운다.
const NATIVE_BUTTON_SPACE_PX = 96;

interface BottomBarProps {
  // 왼쪽에 둘 것: 웹뷰의 "기록" 버튼. 'native-space'면 구버전 앱의 버튼 자리만 비운다. 없으면 범례 바만.
  left?:ReactNode | 'native-space';
}

// 하단 줄: [왼쪽 버튼] [강수 범례 바]. RainRadarLayer의 세로로 긴 기본 범례를 대신한다.
export function BottomBar({ left }:BottomBarProps) {
  const { opacity } = useRecoilValue(MapControlState);
  const steps = legendSteps(opacity);
  return (
    <MapControlWrapper positionHorizontal='left' positionVertical='bottom' width='100%' disablePointerEvent>
      <Row>
        {left === 'native-space' ? <div style={{ width: `${NATIVE_BUTTON_SPACE_PX - BOTTOM_BAR_MARGIN_PX - 10}px`, flex: 'none' }} /> : left}
        <Legend aria-label='강수 범례(mm/h)'>
          <Swatches>
            {steps.map(({ color, label }) => <div key={label} style={{ flex: 1, background: color }} />)}
          </Swatches>
          <Labels>
            {steps.map(({ label }, idx) => <span key={label}>{idx === steps.length - 1 ? `${label}+ mm/h` : label}</span>)}
          </Labels>
        </Legend>
      </Row>
    </MapControlWrapper>
  );
}

// 웹뷰의 "기록" 버튼 — 앱의 알림 기록 화면을 연다.
export function EventLogButton({ onClick }:{ onClick:() => void; }) {
  return (
    <DarkButton type='button' onClick={onClick}>
      <svg aria-hidden width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'>
        <path d='M4 6h16M4 12h16M4 18h10' />
      </svg>
      기록
    </DarkButton>
  );
}

const Row = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: `0 ${BOTTOM_BAR_MARGIN_PX}px ${BOTTOM_BAR_MARGIN_PX}px`,
  boxSizing: 'border-box',
  width: '100%',
});

const Legend = styled.div({
  pointerEvents: 'auto',
  flex: 1,
  minWidth: 0,
  maxWidth: '360px',
  marginLeft: 'auto',
  height: `${BOTTOM_BAR_HEIGHT_PX}px`,
  boxSizing: 'border-box',
  padding: '8px 12px',
  borderRadius: '16px',
  background: '#FFFFFF',
  boxShadow: '0 2px 10px rgba(21, 32, 43, 0.12)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '4px',
});

const Swatches = styled.div({ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden' });

const Labels = styled.div({ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#4A5560', whiteSpace: 'nowrap' });

const DarkButton = styled.button({
  pointerEvents: 'auto',
  flex: 'none',
  height: `${BOTTOM_BAR_HEIGHT_PX}px`,
  padding: '0 18px',
  border: 'none',
  borderRadius: '16px',
  background: '#15202B',
  color: '#FFFFFF',
  font: 'inherit',
  fontSize: '15px',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  cursor: 'pointer',
});