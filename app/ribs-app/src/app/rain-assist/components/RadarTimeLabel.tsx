'use client';

import { MapControlWrapper } from '@mint-ui/map';
import { useRecoilValue } from 'recoil';

import { MapControlState } from '../../rain/state/map-controls';

// RainRadarLayer.tsx(파일 미수정, import만)가 recoil에 발행하는 tmText는 "MM월 DD일 HH시 mm분"
// 형식(연도 없음)이라 웹뷰용으로 "YYYY-MM-DD HH:mm" 형태로 재조합한다. 연도는 현재 시각 기준 —
// 레이더 tm은 최대 30분까지만 과거로 거슬러 올라가므로(RainRadarLayer의 tmBefore 재시도 한도)
// 자정 직전 연도 경계에서만 極히 드물게 어긋날 수 있음.
const TM_TEXT_PATTERN = /^(\d{2})월 (\d{2})일 (\d{2})시 (\d{2})분$/;

export function RadarTimeLabel() {

  const { tmText } = useRecoilValue(MapControlState);

  const match = tmText.match(TM_TEXT_PATTERN);
  if (!match) {
    return null;
  }

  const [ , month, day, hour, minute ] = match;
  const year = new Date().getFullYear();

  return (
    <MapControlWrapper positionHorizontal='right' positionVertical='top' disablePointerEvent>
      <div style={{ margin: '10px 10px 0 0', fontSize: '12px', color: '#333' }}>
        {`${year}-${month}-${day} ${hour}:${minute}`}
      </div>
    </MapControlWrapper>
  );
}