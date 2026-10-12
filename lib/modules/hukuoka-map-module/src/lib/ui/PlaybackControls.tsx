import styled from 'styled-components';

import { PixelButton } from './pixel';

import { SPEEDS } from '../hooks/use-playback';

interface PlaybackControlsProps {
  playing: boolean;
  speedIndex: number;
  onTogglePlay: () => void;
  onSpeed: (index:number) => void;
}

export function PlaybackControls({ playing, speedIndex, onTogglePlay, onSpeed }:PlaybackControlsProps) {
  return (
    <Row>
      <PlayButton $active={playing} onClick={onTogglePlay} aria-label={playing ? '일시정지' : '재생'}>
        {playing ? '❚❚' : '▶'}
      </PlayButton>
      <Speeds>
        {SPEEDS.map((s, i) => (
          <PixelButton key={s.label} $active={i === speedIndex} onClick={() => onSpeed(i)}>{s.label}</PixelButton>
        ))}
      </Speeds>
    </Row>
  );
}

const Row = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
});

const PlayButton = styled(PixelButton)({
  width: '44px',
  height: '36px',
  fontSize: '14px',
  flexShrink: 0,
});

const Speeds = styled.div({
  display: 'flex',
  gap: '5px',
  overflowX: 'auto',
  padding: '2px',
  scrollbarWidth: 'none',
});