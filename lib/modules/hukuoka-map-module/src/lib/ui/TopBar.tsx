import styled from 'styled-components';

import { Panel, PixelButton } from './pixel';

import { formatClock, formatDayLabel } from '../data/time';

interface TopBarProps {
  t: number;
  follow: boolean;
  liveAvailable: boolean;
  onFollow: () => void;
  onFitAll: () => void;
  onLive: () => void;
}

export function TopBar({ t, follow, liveAvailable, onFollow, onFitAll, onLive }:TopBarProps) {
  return (
    <Bar>
      <Clock>
        <span>{formatDayLabel(t)}</span>
        <Time>{formatClock(t)}</Time>
      </Clock>
      <Buttons>
        {liveAvailable && <PixelButton onClick={onLive}>지금</PixelButton>}
        <PixelButton $active={follow} onClick={onFollow}>따라가기</PixelButton>
        <PixelButton onClick={onFitAll}>전체 보기</PixelButton>
      </Buttons>
    </Bar>
  );
}

const Bar = styled.div({
  position: 'absolute',
  top: 'calc(10px + env(safe-area-inset-top))',
  left: '10px',
  right: '10px',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '8px',
  pointerEvents: 'none',
  '& > *': { pointerEvents: 'auto' },
});

const Clock = styled(Panel)({
  display: 'flex',
  flexDirection: 'column',
  padding: '6px 10px',
});

const Time = styled.span({
  fontFamily: 'Galmuri14, sans-serif',
  fontSize: '28px',
  lineHeight: '30px',
  color: '#ffd84a',
});

const Buttons = styled.div({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: '8px',
});