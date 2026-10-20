import { MutableRefObject, useRef, useState } from 'react';
import styled from 'styled-components';

import { InputState } from '../input';

const RADIUS = 52;

/** 화면 왼쪽 아래 영역 아무 데나 누르면 그 자리에 조이스틱이 생긴다 (끝까지 밀면 달리기) */
export function VirtualJoystick({ inputRef }:{ inputRef: MutableRefObject<InputState>; }) {
  const [ base, setBase ] = useState<{ x: number; y: number; } | null>(null);
  const [ knob, setKnob ] = useState({ x: 0, y: 0 });
  const pointerId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  const update = (cx:number, cy:number) => {
    let dx = cx - origin.current.x;
    let dy = cy - origin.current.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    inputRef.current.joy = { x: dx / RADIUS, y: dy / RADIUS };
  };

  const end = () => {
    pointerId.current = null;
    setBase(null);
    setKnob({ x: 0, y: 0 });
    inputRef.current.joy = { x: 0, y: 0 };
  };

  return (
    <Zone
      onPointerDown={(e) => {
        if (pointerId.current !== null) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pointerId.current = e.pointerId;
        const r = e.currentTarget.getBoundingClientRect();
        origin.current = { x: e.clientX, y: e.clientY };
        setBase({ x: e.clientX - r.left, y: e.clientY - r.top });
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pointerId.current) update(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => { if (e.pointerId === pointerId.current) end(); }}
      onPointerCancel={(e) => { if (e.pointerId === pointerId.current) end(); }}
    >
      {base ? (
        <Base style={{ left: base.x - RADIUS, top: base.y - RADIUS }}>
          <Knob style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </Base>
      ) : <Hint>여기를 눌러 이동</Hint>}
    </Zone>
  );
}

const Zone = styled.div({
  position: 'absolute',
  left: 0,
  bottom: 0,
  width: '50%',
  height: '45%',
  touchAction: 'none',
  userSelect: 'none',
});

const Base = styled.div({
  position: 'absolute',
  width: RADIUS * 2,
  height: RADIUS * 2,
  borderRadius: '50%',
  background: 'rgba(11,14,34,0.35)',
  boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
});

const Knob = styled.div({
  width: 44,
  height: 44,
  borderRadius: '50%',
  background: 'rgba(255,216,74,0.85)',
  boxShadow: 'inset -3px -3px 0 rgba(0,0,0,0.25), 0 0 0 2px #0b0e22',
});

const Hint = styled.div({
  position: 'absolute',
  left: 18,
  bottom: 22,
  padding: '4px 8px',
  fontFamily: 'Galmuri11, sans-serif',
  fontSize: 11,
  color: '#f4f4f8',
  background: 'rgba(11,14,34,0.55)',
  pointerEvents: 'none',
});