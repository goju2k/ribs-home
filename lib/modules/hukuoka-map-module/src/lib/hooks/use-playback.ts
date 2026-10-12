import { useCallback, useEffect, useRef, useState } from 'react';

import { SCHEDULE, TRIP_END, TRIP_START } from '../data/schedule';
import { findSegmentIndex, isSleeping } from '../timeline/position';

/** 배속: 실제 1초에 흐르는 여행 시간(분) */
export const SPEEDS = [
  { label: '실시간', minutesPerSec: 1 / 60 },
  { label: '1분/초', minutesPerSec: 1 },
  { label: '5분/초', minutesPerSec: 5 },
  { label: '15분/초', minutesPerSec: 15 },
  { label: '1시간/초', minutesPerSec: 60 },
];

/** 자는 시간은 재생 중 자동으로 빨리 넘김 */
const SLEEP_SPEED = 90;

export function usePlayback(initialT:number, initialPlaying:boolean, initialSpeed:number) {
  const [ t, setTState ] = useState(initialT);
  const [ playing, setPlaying ] = useState(initialPlaying);
  const [ speedIndex, setSpeedIndex ] = useState(initialSpeed);
  const tRef = useRef(initialT);
  const scrubbingRef = useRef(false);

  const setT = useCallback((value:number) => {
    const clamped = Math.min(TRIP_END, Math.max(TRIP_START, value));
    tRef.current = clamped;
    setTState(clamped);
  }, []);

  useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    let last = performance.now();
    const tick = (now:number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!scrubbingRef.current) {
        const cur = tRef.current;
        const seg = SCHEDULE[findSegmentIndex(cur)];
        let rate = SPEEDS[speedIndex].minutesPerSec;
        if (isSleeping(seg, cur) && rate < SLEEP_SPEED) rate = SLEEP_SPEED;
        const next = cur + dt * rate;
        if (next >= TRIP_END) {
          setT(TRIP_END);
          setPlaying(false);
          return;
        }
        setT(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ playing, speedIndex ]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      // 끝에서 다시 누르면 처음부터
      if (!p && tRef.current >= TRIP_END) setT(TRIP_START);
      return !p;
    });
  }, []);

  return { t, tRef, setT, playing, setPlaying, togglePlay, speedIndex, setSpeedIndex, scrubbingRef };
}