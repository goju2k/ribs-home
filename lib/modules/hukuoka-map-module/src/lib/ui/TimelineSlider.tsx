import { useRef } from 'react';
import styled from 'styled-components';

import { parseTripTime } from '../data/time';
import { PLAN_EVENTS } from '../data/trip-plan';

interface TimelineSliderProps {
  t: number;
  start: number;
  end: number;
  onScrubStart: () => void;
  onScrub: (t:number) => void;
  onScrubEnd: () => void;
}

const DAYS = [ 14, 15, 16, 17 ];

export function TimelineSlider({ t, start, end, onScrubStart, onScrub, onScrubEnd }:TimelineSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const ratio = (v:number) => Math.min(1, Math.max(0, (v - start) / (end - start)));
  const pct = (v:number) => `${ratio(v) * 100}%`;

  const timeAt = (clientX:number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return start + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (end - start);
  };

  return (
    <Wrap
      ref={trackRef}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onScrubStart();
        onScrub(timeAt(e.clientX));
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) onScrub(timeAt(e.clientX));
      }}
      onPointerUp={onScrubEnd}
      onPointerCancel={onScrubEnd}
    >
      {DAYS.map((d) => {
        const dayStart = Math.max(start, parseTripTime(`${d} 00:00`));
        const dayEnd = Math.min(end, parseTripTime(`${d + 1} 00:00`));
        return (
          <DayLabel key={d} style={{ left: pct(dayStart), width: `${(ratio(dayEnd) - ratio(dayStart)) * 100}%` }}>
            {d}일
          </DayLabel>
        );
      })}
      <Track>
        <Fill style={{ width: pct(t) }} />
        {DAYS.slice(1).map((d) => <DaySep key={d} style={{ left: pct(parseTripTime(`${d} 00:00`)) }} />)}
        {PLAN_EVENTS.map((e) => <Tick key={`${e.t}-${e.title}`} $past={e.t <= t} style={{ left: pct(e.t) }} />)}
      </Track>
      <Knob style={{ left: pct(t) }} />
    </Wrap>
  );
}

const Wrap = styled.div({
  position: 'relative',
  height: '38px',
  margin: '0 8px',
  touchAction: 'none',
  cursor: 'pointer',
  userSelect: 'none',
});

const DayLabel = styled.div({
  position: 'absolute',
  top: 0,
  textAlign: 'center',
  color: '#a9b0d6',
  pointerEvents: 'none',
});

const Track = styled.div({
  position: 'absolute',
  left: 0,
  right: 0,
  top: '22px',
  height: '8px',
  background: '#0b0e22',
  boxShadow: '0 0 0 2px #0b0e22',
});

const Fill = styled.div({
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  background: '#ff5a4e',
});

const DaySep = styled.div({
  position: 'absolute',
  top: '-6px',
  bottom: '-2px',
  width: '2px',
  marginLeft: '-1px',
  background: '#a9b0d6',
});

const Tick = styled.div<{ $past: boolean; }>(({ $past }) => ({
  position: 'absolute',
  top: '2px',
  width: '2px',
  height: '4px',
  marginLeft: '-1px',
  background: $past ? '#ffd84a' : '#5a6290',
}));

const Knob = styled.div({
  position: 'absolute',
  top: '18px',
  width: '12px',
  height: '16px',
  marginLeft: '-6px',
  background: '#ffd84a',
  boxShadow: 'inset -2px -2px 0 #c99a1a, 0 0 0 2px #0b0e22',
  pointerEvents: 'none',
});