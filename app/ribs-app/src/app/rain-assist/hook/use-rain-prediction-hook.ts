import { useEffect, useRef, useState } from 'react';

import { LatLng } from '../util/grid-projection';
import { decodeGridBase64 } from '../util/motion-estimation';
import { computeRainForecast, RainForecastResult } from '../util/rain-forecast';

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

interface UseRainPredictionOptions {
  userPosition?:LatLng;
  enabled:boolean;
  frameCount?:number;
  pollMs?:number;
}

const IDLE_RESULT:RainForecastResult = { status: 'no-signal' };

// TemperatureLayer.tsx가 쓰는 순수 fetch-in-useEffect 컨벤션을 따름 (react-query 미사용)
export function useRainPredictionHook(opts:UseRainPredictionOptions):RainForecastResult {

  const { userPosition, enabled, frameCount = 4, pollMs = 60000 } = opts;

  const [ result, setResult ] = useState<RainForecastResult>(IDLE_RESULT);
  const lastKeyRef = useRef<string>('');

  useEffect(() => {

    if (!enabled || !userPosition) {
      return undefined;
    }

    let cancelled = false;

    const run = async () => {
      try {

        const res = await fetch(`/api/rain-assist/radar-frames?count=${frameCount}`, { next: { revalidate: 0 } });
        const data = await res.json() as ApiResponse;

        if (cancelled || !data.frames || data.frames.length < 2) {
          return;
        }

        const latestTm = data.frames[data.frames.length - 1].tm;
        const key = `${latestTm}:${userPosition.lat.toFixed(3)}:${userPosition.lng.toFixed(3)}`;
        if (key === lastKeyRef.current) {
          return;
        }
        lastKeyRef.current = key;

        const corners:LatLng[] = data.corners.map(([ lat, lng ]) => ({ lat, lng }));
        const frames = data.frames.map((f) => ({
          tm: f.tm,
          grid: decodeGridBase64(f.gridDataBase64, f.gridWidth, f.gridHeight),
        }));

        const forecast = computeRainForecast({ corners, frames, userPosition });
        if (!cancelled) {
          setResult(forecast);
        }

      } catch (e) {
        console.error('useRainPredictionHook fetch error', e);
      }
    };

    run();
    const interval = setInterval(run, pollMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };

  }, [ enabled, userPosition?.lat, userPosition?.lng, frameCount, pollMs ]);

  return result;
}