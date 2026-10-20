'use client';

import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import { useGalmuriFont } from './hooks/use-galmuri-font';
import { createInput } from './input';
import { GameCanvas, GameStatus } from './ui/GameCanvas';
import { Panel, PIXEL_FONT, PixelButton } from './ui/pixel';
import { VirtualJoystick } from './ui/VirtualJoystick';

const isTouch = () => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export function Yeouido3DPage() {
  useGalmuriFont();
  const inputRef = useRef(createInput());
  const statusRef = useRef<GameStatus>({ ready: false, buildMs: 0, pixel: 0, x: 0, z: 0, running: false });
  const [ ready, setReady ] = useState(false);
  const [ touch ] = useState(isTouch);
  const [ status, setStatus ] = useState<GameStatus>(statusRef.current);

  // 상태 표시는 4번/초면 충분
  useEffect(() => {
    const id = setInterval(() => setStatus({ ...statusRef.current }), 250);
    return () => clearInterval(id);
  }, []);

  const hold = (on:boolean) => () => { inputRef.current.runHeld = on; };

  return (
    <Root>
      <GameCanvas inputRef={inputRef} statusRef={statusRef} onReady={() => setReady(true)} />

      <TopBar>
        <Title>
          <b>여의도 3D</b>
          <Sub>
            PoC · 실제 비율 · {status.running ? '달리는 중' : '걷는 중'} · 도트 {status.pixel}px
          </Sub>
        </Title>
        <Buttons>
          <PixelButton onClick={() => { inputRef.current.rotate -= 1; }} aria-label='왼쪽으로 회전'>⟲</PixelButton>
          <PixelButton onClick={() => { inputRef.current.rotate += 1; }} aria-label='오른쪽으로 회전'>⟳</PixelButton>
          <PixelButton onClick={() => { inputRef.current.zoom *= 0.75; }} aria-label='확대'>＋</PixelButton>
          <PixelButton onClick={() => { inputRef.current.zoom *= 1.33; }} aria-label='축소'>－</PixelButton>
        </Buttons>
      </TopBar>

      {touch ? (
        <>
          <VirtualJoystick inputRef={inputRef} />
          <RunButton
            onPointerDown={hold(true)}
            onPointerUp={hold(false)}
            onPointerCancel={hold(false)}
            onPointerLeave={hold(false)}
          >
            달리기
          </RunButton>
        </>
      ) : (
        <KeyHint>이동 WASD/방향키 · 달리기 Shift · 회전 Q/E · 확대 휠/+/-</KeyHint>
      )}

      {!ready && <Loading>여의도를 세우는 중…</Loading>}
      <Attribution href='https://www.openstreetmap.org/copyright' target='_blank' rel='noreferrer'>
        © OpenStreetMap contributors
      </Attribution>
    </Root>
  );
}

const Root = styled.div({
  position: 'fixed',
  inset: 0,
  overflow: 'hidden',
  background: '#a8dcf5',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
});

const TopBar = styled(Panel)({
  position: 'absolute',
  top: 10,
  left: 10,
  right: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 10px',
  flexWrap: 'wrap',
});

const Title = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  b: { fontFamily: 'Galmuri14, sans-serif', fontSize: 14, fontWeight: 'normal', color: '#ffd84a' },
});

const Sub = styled.span({ color: '#b9bfe0' });

const Buttons = styled.div({ display: 'flex', gap: 6 });

const RunButton = styled(PixelButton)({
  position: 'absolute',
  right: 22,
  bottom: 40,
  width: 76,
  height: 76,
  borderRadius: '50%',
  fontSize: 13,
  touchAction: 'none',
});

const KeyHint = styled(Panel)({
  position: 'absolute',
  left: 10,
  bottom: 10,
  padding: '6px 10px',
});

const Loading = styled(Panel)({
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  padding: '12px 16px',
  fontSize: 13,
});

const Attribution = styled.a({
  position: 'absolute',
  right: 6,
  bottom: 6,
  padding: '2px 6px',
  fontFamily: PIXEL_FONT,
  fontSize: 10,
  color: '#e6e6ee',
  background: 'rgba(11,14,34,0.7)',
  textDecoration: 'none',
});