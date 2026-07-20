'use client';

import { MapControlWrapper } from '@mint-ui/map';
import { useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';

import { MapControlState } from '../../rain/state/map-controls';

// RainRadarLayer.tsx(파일 미수정, import만)가 recoil에 발행하는 tmText는 "MM월 DD일 HH시 mm분"
// 형식(연도 없음)이라 웹뷰용으로 "YYYY-MM-DD HH:mm" 형태로 재조합한다. 연도는 현재 시각 기준 —
// 레이더 tm은 최대 30분까지만 과거로 거슬러 올라가므로(RainRadarLayer의 tmBefore 재시도 한도)
// 자정 직전 연도 경계에서만 極히 드물게 어긋날 수 있음.
const TM_TEXT_PATTERN = /^(\d{2})월 (\d{2})일 (\d{2})시 (\d{2})분$/;

// tm 숫자는 항상 KST 벽시계 기준(크롤러가 kst-time.ts로 발행) — 기기의 로컬 타임존과 무관하게
// 정확한 경과분을 구하려면 "KST로 표기된 숫자"를 그대로 UTC로 읽은 뒤 9시간을 빼 실제 UTC epoch로
// 환산해야 한다(로컬 타임존이 KST가 아닌 기기에서도 정확하도록 — new Date(y,m,d,h,mi) 같은
// 로컬-타임존 기반 생성자는 기기 타임존에 따라 결과가 달라져 부정확할 수 있음).
function kstToEpochMs(year:number, month:number, day:number, hour:number, minute:number):number {
  return Date.UTC(year, month - 1, day, hour, minute) - 9 * 60 * 60 * 1000;
}

export function RadarTimeLabel() {

  const { tmText } = useRecoilValue(MapControlState);
  const [ nowMs, setNowMs ] = useState(() => Date.now());

  // "n분전"이 시간 흐름에 따라 계속 갱신되도록 — tmText는 레이더가 새 프레임을 받아올 때만
  // 바뀌므로(수 분 간격) 그 사이에도 경과분이 흘러가는 것을 반영하려면 별도 틱이 필요하다.
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(interval);
  }, []);

  const match = tmText.match(TM_TEXT_PATTERN);
  if (!match) {
    return null;
  }

  const [ , month, day, hour, minute ] = match;
  const year = new Date().getFullYear();
  const tmEpochMs = kstToEpochMs(year, Number(month), Number(day), Number(hour), Number(minute));
  const elapsedMinutes = Math.max(0, Math.floor((nowMs - tmEpochMs) / 60000));

  return (
    <MapControlWrapper positionHorizontal='right' positionVertical='top' disablePointerEvent>
      <div style={{ margin: '10px 10px 0 0', fontSize: '12px', color: '#333', textAlign: 'right' }}>
        <div>{`${year}-${month}-${day} ${hour}:${minute}`}</div>
        <div>{`${elapsedMinutes}분전`}</div>
      </div>
    </MapControlWrapper>
  );
}