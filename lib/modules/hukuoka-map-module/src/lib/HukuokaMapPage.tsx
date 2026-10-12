'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';

import { TRIP_END, TRIP_START } from './data/schedule';
import { nowTripTime, parseTripTime } from './data/time';
import { buildWorld } from './geo/world';
import { useGalmuriFont } from './hooks/use-galmuri-font';
import { usePlayback } from './hooks/use-playback';
import { getTravelerState } from './timeline/position';
import { EventCard } from './ui/EventCard';
import { Insets, MapCanvas, MapCanvasHandle } from './ui/MapCanvas';
import { Panel } from './ui/pixel';
import { PlaybackControls } from './ui/PlaybackControls';
import { TimelineSlider } from './ui/TimelineSlider';
import { TopBar } from './ui/TopBar';

const SPEED_REALTIME = 0;
const SPEED_DEFAULT = 3; // 15분/초

const isLive = () => {
  const now = nowTripTime();
  return now >= TRIP_START && now <= TRIP_END;
};

/** 주소 쿼리: ?t=15-10:42 (날짜-시각), play=0|1, speed=배속 번호 — 미지정 시 여행 중이면 지금 시각 실시간 재생 */
function readInitial() {
  const q = new URLSearchParams(window.location.search);
  const tParam = q.get('t')?.match(/^(\d{2})-(\d{1,2}):(\d{2})$/);
  const live = !tParam && isLive();
  let t = live ? nowTripTime() : TRIP_START;
  if (tParam) t = parseTripTime(`${tParam[1]} ${tParam[2]}:${tParam[3]}`);
  const playing = q.get('play') ? q.get('play') === '1' : true;
  let speed = live ? SPEED_REALTIME : SPEED_DEFAULT;
  if (q.get('speed')) speed = Number(q.get('speed'));
  return { t: Math.min(TRIP_END, Math.max(TRIP_START, t)), playing, speed };
}

export function HukuokaMapPage() {
  useGalmuriFont();
  const world = useMemo(() => buildWorld(), []);
  const initial = useMemo(readInitial, []);
  const playback = usePlayback(initial.t, initial.playing, initial.speed);
  const [ follow, setFollow ] = useState(true);
  const [ liveAvailable, setLiveAvailable ] = useState(isLive);
  const mapRef = useRef<MapCanvasHandle>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const insetsRef = useRef<Insets>({ top: 0, bottom: 0 });
  const resumeRef = useRef(false);

  // 상단 바/하단 패널에 가려지는 높이 → 카메라가 보이는 영역 가운데를 맞추는 데 사용
  useEffect(() => {
    const update = () => {
      insetsRef.current = {
        top: topRef.current?.getBoundingClientRect().bottom ?? 0,
        bottom: bottomRef.current ? window.innerHeight - bottomRef.current.getBoundingClientRect().top : 0,
      };
    };
    update();
    const observer = new ResizeObserver(update);
    if (topRef.current) observer.observe(topRef.current);
    if (bottomRef.current) observer.observe(bottomRef.current);
    window.addEventListener('resize', update);
    const liveTimer = setInterval(() => setLiveAvailable(isLive()), 60000);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      clearInterval(liveTimer);
    };
  }, []);

  const state = getTravelerState(playback.t, world);

  return (
    <Root>
      <MapCanvas ref={mapRef} world={world} tRef={playback.tRef} follow={follow} insetsRef={insetsRef} onManual={() => setFollow(false)} />
      <div ref={topRef}>
        <TopBar
          t={playback.t}
          follow={follow}
          liveAvailable={liveAvailable}
          onFollow={() => setFollow(true)}
          onFitAll={() => mapRef.current?.fitAll()}
          onLive={() => {
            playback.setT(nowTripTime());
            playback.setSpeedIndex(SPEED_REALTIME);
            playback.setPlaying(true);
            setFollow(true);
          }}
        />
      </div>
      <Bottom ref={bottomRef}>
        <BottomPanel>
          <EventCard t={playback.t} state={state} />
          <TimelineSlider
            t={playback.t}
            start={TRIP_START}
            end={TRIP_END}
            onScrubStart={() => {
              playback.scrubbingRef.current = true;
              resumeRef.current = playback.playing;
            }}
            onScrub={playback.setT}
            onScrubEnd={() => {
              playback.scrubbingRef.current = false;
              playback.setPlaying(resumeRef.current);
            }}
          />
          <PlaybackControls
            playing={playback.playing}
            speedIndex={playback.speedIndex}
            onTogglePlay={playback.togglePlay}
            onSpeed={playback.setSpeedIndex}
          />
        </BottomPanel>
      </Bottom>
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
  WebkitTapHighlightColor: 'transparent',
});

const Bottom = styled.div({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  padding: '0 10px calc(10px + env(safe-area-inset-bottom))',
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
});

const BottomPanel = styled(Panel)({
  width: '100%',
  maxWidth: '560px',
  padding: '10px 12px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  pointerEvents: 'auto',
});