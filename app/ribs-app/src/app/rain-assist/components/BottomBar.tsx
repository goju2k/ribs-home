'use client';

import { MapControlWrapper } from '@mint-ui/map';
import { ReactNode } from 'react';
import { useRecoilValue } from 'recoil';
import styled from 'styled-components';

import { MapControlState } from '../../rain/state/map-controls';
import { TemperatureLegend as TemperatureLegendData, useKmaTemperature } from '../../rain/util/kma-temperature';
import { legendSteps } from '../util/rain-format';

// 화면 맨 아래 줄 높이/여백 — 오른쪽 지도 버튼들(내 위치, CCTV)이 이 위로 쌓인다(MAP_BUTTON_* 참고).
export const BOTTOM_BAR_HEIGHT_PX = 48;
export const BOTTOM_BAR_MARGIN_PX = 16;

// 구버전 앱(RainAssistNative 없음)은 자체 "기록" 버튼을 좌하단(16dp 여백, 약 80x44)에 띄우므로 그 자리를 비운다.
const NATIVE_BUTTON_SPACE_PX = 96;

interface BottomBarProps {
  // 왼쪽에 둘 것: 웹뷰의 "기록" 버튼. 'native-space'면 구버전 앱의 버튼 자리만 비운다. 없으면 범례 바만.
  left?:ReactNode | 'native-space';
}

// 하단 줄: [왼쪽 버튼] [강수 범례 바]. RainRadarLayer의 세로로 긴 기본 범례를 대신한다.
// 기온을 켜면 같은 자리에 기온 범례 바가 들어간다(오른쪽 지도 버튼과 겹치지 않게 — 강수 범례는
// 원래도 기온을 켜면 숨겼다).
export function BottomBar({ left }:BottomBarProps) {
  const { opacity, temperatureFlag } = useRecoilValue(MapControlState);
  const temperature = useKmaTemperature();
  const steps = legendSteps(opacity);
  const showTemperature = temperatureFlag && !!temperature;
  return (
    <MapControlWrapper positionHorizontal='left' positionVertical='bottom' width='100%' disablePointerEvent>
      <Row>
        {left === 'native-space' ? <div style={{ width: `${NATIVE_BUTTON_SPACE_PX - BOTTOM_BAR_MARGIN_PX - 10}px`, flex: 'none' }} /> : left}
        {showTemperature ? (
          <TemperatureLegendBar legend={temperature.legend} efcDate={temperature.efcDate} opacity={opacity} />
        ) : (
          <Legend aria-label='강수 범례(mm/h)'>
            <Swatches>
              {steps.map(({ color, label }) => <div key={label} style={{ flex: 1, background: color }} />)}
            </Swatches>
            <Labels>
              {steps.map(({ label }, idx) => <span key={label}>{idx === steps.length - 1 ? `${label}+ mm/h` : label}</span>)}
            </Labels>
          </Legend>
        )}
      </Row>
    </MapControlWrapper>
  );
}

// 범례에 보여 줄 범위와 눈금(℃). 색표 양 끝(-50, 50)은 실제로 거의 안 나와 뺀다.
const TEMPERATURE_MIN = -20;
const TEMPERATURE_MAX = 35;
const TEMPERATURE_TICKS = [ -20, -10, 0, 10, 20, 30 ];

function blendOverWhite(hex:string, alpha:number):string {
  const h = hex.replace('#', '');
  const mix = (i:number) => Math.round((parseInt(h.slice(i, i + 2), 16) * alpha) + (255 * (1 - alpha)));
  return `rgb(${mix(0)}, ${mix(2)}, ${mix(4)})`;
}

// 기온 겹쳐 그리기와 같은 투명도(슬라이더 값)로 흰 바탕에 섞은 색 — 지도에 보이는 옅은 색과 맞춘다.
function TemperatureLegendBar({ legend, efcDate, opacity }:{ legend:TemperatureLegendData; efcDate:string; opacity:number; }) {
  // 범위 안의 색만, 낮은 기온부터. 눈금은 그 색 칸의 가운데에 둔다.
  const cells = legend.key
    .map((key, i) => ({ value: Number(key), color: blendOverWhite(legend.color[i], opacity) }))
    .filter(({ value }) => value >= TEMPERATURE_MIN && value <= TEMPERATURE_MAX)
    .sort((a, b) => a.value - b.value);
  const ticks = TEMPERATURE_TICKS
    .map((tick) => ({ tick, index: cells.findIndex(({ value }) => value >= tick) }))
    .filter(({ index }) => index >= 0);
  const hour = new Date(`${efcDate}Z`).toLocaleTimeString('ko-KR', { hour: 'numeric', timeZone: 'Asia/Seoul' });
  return (
    <Legend aria-label={`기온 범례(℃), ${hour} 예보`} style={{ flexDirection: 'row', alignItems: 'center', gap: '10px' }}>
      <TemperatureScale>
        <Swatches>
          {cells.map(({ value, color }) => <div key={value} style={{ flex: 1, background: color }} />)}
        </Swatches>
        <TickLabels>
          {ticks.map(({ tick, index }) => (
            <span key={tick} style={{ left: `${((index + 0.5) / cells.length) * 100}%` }}>{tick}</span>
          ))}
        </TickLabels>
      </TemperatureScale>
      <TemperatureUnit>
        <span>℃</span>
        <span>{`${hour} 예보`}</span>
      </TemperatureUnit>
    </Legend>
  );
}

// 웹뷰의 "기록" 버튼 — 앱의 기록 화면(0.10.0~ 최근 30일 비·눈 기록)을 연다. 앱 색(브랜드 파랑)에 맞춘다.
export function EventLogButton({ onClick }:{ onClick:() => void; }) {
  return (
    <HistoryButton type='button' onClick={onClick}>
      <svg aria-hidden width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
        <path d='M3 12a9 9 0 1 0 3-6.7' />
        <path d='M3 4v4h4' />
        <path d='M12 7.5V12l3 2' />
      </svg>
      기록
    </HistoryButton>
  );
}

const Row = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: `0 ${BOTTOM_BAR_MARGIN_PX}px ${BOTTOM_BAR_MARGIN_PX}px`,
  boxSizing: 'border-box',
  width: '100%',
});

const Legend = styled.div({
  pointerEvents: 'auto',
  flex: 1,
  minWidth: 0,
  maxWidth: '360px',
  marginLeft: 'auto',
  height: `${BOTTOM_BAR_HEIGHT_PX}px`,
  boxSizing: 'border-box',
  padding: '8px 12px',
  borderRadius: '16px',
  background: '#FFFFFF',
  boxShadow: '0 2px 10px rgba(21, 32, 43, 0.12)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '4px',
});

const Swatches = styled.div({ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden' });

const Labels = styled.div({ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#4A5560', whiteSpace: 'nowrap' });

const TickLabels = styled.div({
  position: 'relative',
  height: '14px',
  fontSize: '11px',
  color: '#4A5560',
  whiteSpace: 'nowrap',
  span: { position: 'absolute', top: 0, transform: 'translateX(-50%)' },
});

const TemperatureScale = styled.div({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' });

const TemperatureUnit = styled.div({
  flex: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  fontSize: '11px',
  lineHeight: 1.3,
  color: '#4A5560',
  whiteSpace: 'nowrap',
});

const HistoryButton = styled.button({
  pointerEvents: 'auto',
  flex: 'none',
  height: `${BOTTOM_BAR_HEIGHT_PX}px`,
  padding: '0 18px',
  border: 'none',
  borderRadius: '16px',
  background: '#1F6FEB',
  color: '#FFFFFF',
  boxShadow: '0 2px 10px rgba(31, 111, 235, 0.35)',
  font: 'inherit',
  fontSize: '15px',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  cursor: 'pointer',
});