'use client';

import { MouseEvent, PointerEvent, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import { useGalmuriFont } from './hooks/use-galmuri-font';
import { createInput } from './input';
import { GameCanvas, GameStatus } from './ui/GameCanvas';
import { Panel, PIXEL_FONT, PixelButton } from './ui/pixel';
import { VirtualJoystick } from './ui/VirtualJoystick';

const place = (s:GameStatus) => {
  if (s.indoor) return `${s.indoor.name} ${s.indoor.level}F${s.indoor.elevator ? ' · 엘리베이터 ▲▼' : ''}`;
  if (s.flying) return '비행';
  return s.onRoof ? '지붕' : '지상';
};

// ?debug 를 붙이면 서버 보정 크기와 확인 대기 입력 수를 보여 준다
const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

const netLabel = (s:GameStatus) => {
  if (s.net.error) return s.net.error;
  if (s.net.state === 'online') return `접속 ${s.net.count}명${DEBUG ? ` (${s.net.transport === 'rtc' ? 'UDP' : 'TCP'}·보정 ${Math.round(s.net.correction * 100)}cm·대기 ${s.net.pending})` : ''}`;
  return s.net.state === 'connecting' ? '접속 중…' : '오프라인';
};

const isTouch = () => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export function Yeouido3DPage() {
  useGalmuriFont();
  const inputRef = useRef(createInput());
  const statusRef = useRef<GameStatus>({ ready: false, buildMs: 0, pixel: 0, x: 0, z: 0, running: false, alt: 0, flying: false, onRoof: false, indoor: null, net: { state: 'connecting', count: 0, error: '', correction: 0, pending: 0, transport: 'ws' } });
  const [ ready, setReady ] = useState(false);
  const [ touch ] = useState(isTouch);
  const [ status, setStatus ] = useState<GameStatus>(statusRef.current);

  // 상태 표시는 4번/초면 충분
  useEffect(() => {
    const id = setInterval(() => setStatus({ ...statusRef.current }), 250);
    return () => clearInterval(id);
  }, []);

  // 누르고 있는 동안만 켜지는 버튼 — 손가락이 버튼 밖으로 미끄러져도 놓을 때까지 유지
  const holdProps = (key:'upHeld' | 'downHeld') => ({
    onPointerDown: (e:PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      inputRef.current[key] = true;
    },
    onPointerUp: () => {
      inputRef.current[key] = false;
    },
    onPointerCancel: () => {
      inputRef.current[key] = false;
    },
    onLostPointerCapture: () => {
      inputRef.current[key] = false;
    },
    onContextMenu: (e:MouseEvent) => e.preventDefault(),
  });
  const [ run, setRun ] = useState(() => inputRef.current.runToggle);
  const toggleRun = () => {
    inputRef.current.runToggle = !inputRef.current.runToggle;
    setRun(inputRef.current.runToggle);
  };
  // 키보드 T로 바꾼 것도 버튼 표시에 반영
  useEffect(() => {
    setRun(inputRef.current.runToggle);
  }, [ status ]);

  return (
    <Root>
      <GameCanvas inputRef={inputRef} statusRef={statusRef} onReady={() => setReady(true)} />

      <TopBar>
        <Title>
          <b>여의도 3D</b>
          <Sub>
            {netLabel(status)} · {place(status)}{status.indoor ? '' : ` ${Math.round(status.alt)}m`} · {status.running ? '달리기' : '걷기'} · 도트 {status.pixel}px
          </Sub>
        </Title>
        <Buttons>
          <PixelButton
            onClick={() => {
              inputRef.current.rotate -= 1;
            }}
            aria-label='왼쪽으로 회전'
          >⟲
          </PixelButton>
          <PixelButton
            onClick={() => {
              inputRef.current.rotate += 1;
            }}
            aria-label='오른쪽으로 회전'
          >⟳
          </PixelButton>
          <PixelButton
            onClick={() => {
              inputRef.current.zoom *= 0.75;
            }}
            aria-label='확대'
          >＋
          </PixelButton>
          <PixelButton
            onClick={() => {
              inputRef.current.zoom *= 1.33;
            }}
            aria-label='축소'
          >－
          </PixelButton>
        </Buttons>
      </TopBar>

      {touch && <VirtualJoystick inputRef={inputRef} />}
      <SideButtons>
        <LiftButton {...holdProps('upHeld')} aria-label='위로'>▲</LiftButton>
        <LiftButton {...holdProps('downHeld')} aria-label='아래로'>▼</LiftButton>
        <RunButton $active={run} onClick={toggleRun} onContextMenu={(e) => e.preventDefault()}>
          {run ? '달리기' : '걷기'}
        </RunButton>
      </SideButtons>
      {!touch && <KeyHint>이동 WASD/방향키 · 달리기 T(전환)/Shift · 높이 Space·R / C·F · 회전 Q/E · 확대 휠/+/-</KeyHint>}

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

const SideButtons = styled.div({
  position: 'absolute',
  right: 22,
  bottom: 40,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
});

const LiftButton = styled(PixelButton)({
  width: 56,
  height: 56,
  fontSize: 18,
  touchAction: 'none',
});

const RunButton = styled(PixelButton)({
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