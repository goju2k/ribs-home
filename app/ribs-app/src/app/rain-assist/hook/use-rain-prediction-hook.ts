import { useEffect, useRef, useState } from 'react';

import { LatLng } from '../util/grid-projection';
import { decodePngToGrid } from '../util/motion-estimation';
import { computeRainForecast, RainForecastResult } from '../util/rain-forecast';

interface ApiFrame {
  tm:string;
  pngBase64:string;
}
interface ApiResponse {
  corners:[number, number][];
  frames:ApiFrame[];
}

interface UseRainPredictionOptions {
  userPosition?:LatLng;
  enabled:boolean;
  pollMs?:number;
}

const IDLE_RESULT:RainForecastResult = { status: 'no-signal' };

// 백엔드 API/DB 없이, my-bot-server-app의 RainRadarBot이 5분마다 발행하는
// S3 정적 JSON(NEXT_PUBLIC_RAIN_ASSIST_JSON_URL)을 모든 클라이언트가 동일하게 fetch한다.
// TemperatureLayer.tsx가 쓰는 순수 fetch-in-useEffect 컨벤션을 따름 (react-query 미사용)
export function useRainPredictionHook(opts:UseRainPredictionOptions):RainForecastResult {

  const { userPosition, enabled, pollMs = 60000 } = opts;

  const [ result, setResult ] = useState<RainForecastResult>(IDLE_RESULT);
  const lastKeyRef = useRef<string>('');

  useEffect(() => {

    if (!enabled || !userPosition) {
      return undefined;
    }

    let cancelled = false;

    const run = async () => {
      try {

        const url = `${process.env.NEXT_PUBLIC_RAIN_ASSIST_JSON_URL}?t=${Date.now()}`;
        const res = await fetch(url);
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
        const frames = await Promise.all(data.frames.map(async (f) => ({
          tm: f.tm,
          grid: await decodePngToGrid(f.pngBase64),
        })));

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

  }, [ enabled, userPosition?.lat, userPosition?.lng, pollMs ]);

  return result;
}