import { useEffect, useRef, useState } from 'react';

import { decodeGridBase64, RadarGrid } from '../util/motion-estimation';

interface ApiFrame {
  tm:string;
  gridWidth:number;
  gridHeight:number;
  gridDataBase64:string;
}
interface ApiResponse {
  corners:[number, number][];
  frames:ApiFrame[];
}

export interface CurrentDataFrame {
  tm:string;
  grid:RadarGrid;
}

export interface CurrentData {
  corners:[number, number][];
  frames:CurrentDataFrame[];
}

// use-rain-prediction-hook.ts와는 독립적인 별도 fetch — 이미 검증된 예보 훅을 건드리지 않기 위한 의도적 선택.
// 이 훅을 쓰는 컴포넌트가 마운트되어 있는 동안에만 폴링하면 되므로 별도 enabled 플래그는 두지 않는다.
export function useCurrentDataHook(pollMs = 60000):CurrentData | null {

  const [ data, setData ] = useState<CurrentData | null>(null);
  const lastTmRef = useRef<string>('');

  useEffect(() => {

    let cancelled = false;

    const run = async () => {
      try {

        const url = `${process.env.NEXT_PUBLIC_RAIN_ASSIST_JSON_URL}?t=${Date.now()}`;
        const res = await fetch(url);
        const json = await res.json() as ApiResponse;

        if (cancelled || !json.frames || json.frames.length === 0) {
          return;
        }

        const latestTm = json.frames[json.frames.length - 1].tm;
        if (latestTm === lastTmRef.current) {
          return;
        }
        lastTmRef.current = latestTm;

        setData({
          corners: json.corners,
          frames: json.frames.map((f) => ({
            tm: f.tm,
            grid: decodeGridBase64(f.gridDataBase64, f.gridWidth, f.gridHeight),
          })),
        });

      } catch (e) {
        console.error('useCurrentDataHook fetch error', e);
      }
    };

    run();
    const interval = setInterval(run, pollMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };

  }, [ pollMs ]);

  return data;
}