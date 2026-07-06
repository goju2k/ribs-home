import { useEffect, useRef, useState } from 'react';

interface ApiFrame {
  tm:string;
  pngBase64:string;
}
interface ApiResponse {
  corners:[number, number][];
  frames:ApiFrame[];
}

export interface CurrentData {
  corners:[number, number][];
  latestTm:string;
  latestPngBase64:string;
}

// use-rain-prediction-hook.ts와는 독립적인 별도 fetch — 이미 검증된 예보 훅을 건드리지 않기 위한 의도적 선택.
// 이 훅을 쓰는 컴포넌트가 마운트되어 있는 동안에만 폴링하면 되므로 별도 enabled 플래그는 두지 않는다.
// 시각화 확인 모드는 최신 프레임의 원본 PNG를 그대로 보여주기만 하면 되므로, 그리드로 디코드하지
// 않고 base64 원문을 그대로 반환한다(가공 없는 원본 그대로).
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

        const latest = json.frames[json.frames.length - 1];
        if (latest.tm === lastTmRef.current) {
          return;
        }
        lastTmRef.current = latest.tm;

        setData({
          corners: json.corners,
          latestTm: latest.tm,
          latestPngBase64: latest.pngBase64,
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