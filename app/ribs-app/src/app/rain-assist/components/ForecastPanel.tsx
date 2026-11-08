'use client';

import { MapControlWrapper } from '@mint-ui/map';
import { useState } from 'react';
import styled from 'styled-components';

import { useRadarTimeText } from './RadarTimeLabel';

import { useBackToCloseHook } from '../hook/use-back-to-close-hook';
import { BridgeForecastPayload, BridgeNotificationState, RainAssistBridgeState } from '../hook/use-rain-assist-bridge-hook';
import { clockAfter, comingFromText, formatMmh, intensityColor } from '../util/rain-format';

interface Tone {
  kicker:string;
  ink:string;
  soft:string;
}

// 카드 머리말과 색은 앱 알림 상태를 따른다 — 본문 문구(알림 message)와 늘 같은 상황을 가리키도록.
const TONES:Record<BridgeNotificationState, Tone> = {
  INCOMING: { kicker: '비 소식', ink: '#A85F00', soft: '#FFF1D6' },
  ACTIVE: { kicker: '지금 비', ink: '#1556C0', soft: '#E3EDFD' },
  STOPPED: { kicker: '비 그침', ink: '#2F7A47', soft: '#E3F4E8' },
  MISSED: { kicker: '지나간 비', ink: '#4A5560', soft: '#EEF1F4' },
  IDLE: { kicker: '주변 살피는 중', ink: '#2F7A47', soft: '#E3F4E8' },
};

const FORECAST_TO_NOTIFICATION:Record<BridgeForecastPayload['forecast']['state'], BridgeNotificationState> = {
  INCOMING: 'INCOMING',
  ACTIVE: 'ACTIVE',
  NONE: 'IDLE',
};

function targetBlob(forecast:BridgeForecastPayload | null) {
  return forecast?.blobs.find((blob) => blob.isForecastTarget);
}

// 카드 둘째 줄: 앱이 보낸 수치를 짧게 풀어 쓴다(본문 문구는 앱 것을 그대로 쓴다).
function cardDetail(forecast:BridgeForecastPayload | null):string | null {
  if (!forecast) {
    return null;
  }
  const { state, intensityMmh } = forecast.forecast;
  const target = targetBlob(forecast);
  if (state === 'INCOMING' && target) {
    const mmh = intensityMmh ? ` · ${formatMmh(intensityMmh)}mm/h 안팎` : '';
    return `${comingFromText(target.headingDeg)} 시속 ${Math.round(target.speedKmh)}km로 다가오는 중${mmh}`;
  }
  if (state === 'ACTIVE' && intensityMmh) {
    return `지금 ${formatMmh(intensityMmh)}mm/h 안팎`;
  }
  if (state === 'NONE') {
    return '반경 150km 안의 비구름을 지켜보고 있어요';
  }
  return null;
}

interface SheetHeader {
  kicker:string;
  big:string;
  side:string;
}

function sheetHeader(forecast:BridgeForecastPayload):SheetHeader {
  const { state, etaMinutes, rainEndMinutes } = forecast.forecast;
  const now = forecast.generatedAtEpochMs;
  if (state === 'INCOMING' && etaMinutes != null) {
    return { kicker: '비가 다가와요', big: `${etaMinutes}분 뒤`, side: `${clockAfter(now, etaMinutes)}쯤 시작` };
  }
  if (state === 'ACTIVE') {
    return rainEndMinutes != null
      ? { kicker: '지금 비가 와요', big: `${rainEndMinutes}분 뒤 그침`, side: `${clockAfter(now, rainEndMinutes)}쯤 그쳐요` }
      : { kicker: '지금 비가 와요', big: '30분 넘게', side: '예보 범위 안에 안 그쳐요' };
  }
  return { kicker: '주변이 맑아요', big: '비 없음', side: '앞으로 30분' };
}

// 다른 지도 컨트롤(기본 101: 상태 카드, 범례 바, 지도 버튼)보다 위 — 시트와 어두운 배경이 모두를 덮는다.
const SHEET_Z_INDEX = 200;

const BAR_MAX_MMH = 30;

function barHeightPx(mmh:number):number {
  if (mmh <= 0) {
    return 3;
  }
  return Math.round(8 + (48 * Math.min(1, Math.log1p(mmh) / Math.log1p(BAR_MAX_MMH))));
}

// 웹뷰 전용: 위쪽 상태 카드 + 누르면 올라오는 하단 시트(디자인 시안 A+B).
export function ForecastPanel({ bridge }:{ bridge:RainAssistBridgeState; }) {

  const { forecast, notification } = bridge;
  const [ open, setOpen ] = useState(false);
  const radarTime = useRadarTimeText();
  // 뒤로 가기 = 시트 닫기(앱이 꺼지지 않게).
  useBackToCloseHook(open, () => setOpen(false), 'forecast-sheet');

  const toneKey = notification?.state ?? (forecast ? FORECAST_TO_NOTIFICATION[forecast.forecast.state] : 'IDLE');
  const tone = TONES[toneKey] ?? TONES.IDLE;
  const detail = cardDetail(forecast);
  const canOpen = !!forecast;

  return (
    <>
      <MapControlWrapper positionHorizontal='left' positionVertical='top' width='100%' disablePointerEvent>
        <TopArea>
          <Card type='button' onClick={() => canOpen && setOpen(true)} aria-label='비 소식 자세히 보기' aria-expanded={open} disabled={!canOpen}>
            <CardIcon style={{ background: tone.soft, color: tone.ink }}>
              <svg aria-hidden width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                <path d='M7 15a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 .5 7' />
                <path d='M9 18l-1 2M13 18l-1 2M17 18l-1 2' />
              </svg>
            </CardIcon>
            <CardText>
              <Kicker style={{ color: tone.ink }}>{tone.kicker}</Kicker>
              <Title $placeholder={!notification}>{notification?.message ?? '비 소식을 불러오는 중이에요'}</Title>
              {detail && <Detail>{detail}</Detail>}
            </CardText>
            {canOpen && (
              <svg aria-hidden width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='#8A949E' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' style={{ flex: 'none' }}>
                <path d='M6 9l6 6 6-6' />
              </svg>
            )}
          </Card>
          {radarTime && <TimeChip>{`레이더 ${radarTime.clock} · ${radarTime.elapsedMinutes}분 전`}</TimeChip>}
        </TopArea>
      </MapControlWrapper>

      {forecast && (
        <MapControlWrapper width='100%' height='100%' zIndex={SHEET_Z_INDEX} disablePointerEvent>
          <Backdrop type='button' aria-label='닫기' tabIndex={open ? 0 : -1} $open={open} onClick={() => setOpen(false)} />
          <Sheet $open={open} aria-hidden={!open}>
            <Handle type='button' aria-label='시트 내리기' tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>
              <span />
            </Handle>
            <SheetBody forecast={forecast} inkColor={tone.ink} />
          </Sheet>
        </MapControlWrapper>
      )}
    </>
  );
}

function SheetBody({ forecast, inkColor }:{ forecast:BridgeForecastPayload; inkColor:string; }) {

  const header = sheetHeader(forecast);
  const series = forecast.forecast.intensityByMinute;
  const target = targetBlob(forecast);
  const peak = series && series.length > 0 ? Math.max(...series) : forecast.forecast.intensityMmh ?? 0;

  return (
    <>
      <HeaderRow>
        <div>
          <SheetKicker style={{ color: inkColor }}>{header.kicker}</SheetKicker>
          <Big>{header.big}</Big>
        </div>
        <Side>{header.side}</Side>
      </HeaderRow>

      <div>
        <SectionLabel>내 위치 · 앞으로 30분</SectionLabel>
        {series && series.length > 0 ? (
          <>
            <Bars role='img' aria-label={`앞으로 30분 동안 최대 ${formatMmh(peak)}mm/h`}>
              {series.map((mmh, minute) => (
                // eslint-disable-next-line react/no-array-index-key
                <Bar key={minute} style={{ height: `${barHeightPx(mmh)}px`, background: mmh > 0 ? intensityColor(mmh) : '#E3E7EB' }} />
              ))}
            </Bars>
            <Ticks><span>지금</span><span>10분</span><span>20분</span><span>30분</span></Ticks>
          </>
        ) : (
          <Notice>앱을 최신 버전으로 업데이트하면 시간대별 비 세기를 볼 수 있어요.</Notice>
        )}
      </div>

      <Tiles>
        <Tile>
          <TileLabel>가장 셀 때</TileLabel>
          <TileValue>{peak > 0 ? `${formatMmh(peak)}mm/h 안팎` : '—'}</TileValue>
        </Tile>
        <Tile>
          <TileLabel>비구름 이동</TileLabel>
          <TileValue>{target ? `${comingFromText(target.headingDeg, false)} ${Math.round(target.speedKmh)}km/h` : '—'}</TileValue>
        </Tile>
      </Tiles>
    </>
  );
}

const TopArea = styled.div({
  padding: '12px 12px 0',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '8px',
  boxSizing: 'border-box',
  width: '100%',
});

const Card = styled.button({
  pointerEvents: 'auto',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  padding: '14px 12px 14px 16px',
  border: 'none',
  borderRadius: '20px',
  background: '#FFFFFF',
  boxShadow: '0 6px 24px rgba(21, 32, 43, 0.14)',
  textAlign: 'left',
  color: '#15202B',
  font: 'inherit',
  cursor: 'pointer',
  '&:disabled': { cursor: 'default' },
});

const CardIcon = styled.div({
  width: '44px',
  height: '44px',
  flex: 'none',
  borderRadius: '14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

const CardText = styled.div({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' });

const Kicker = styled.div({ fontSize: '13px', fontWeight: 700 });

const Title = styled.div<{ $placeholder:boolean; }>(({ $placeholder }) => ({
  fontSize: '19px',
  fontWeight: 800,
  letterSpacing: '-0.3px',
  lineHeight: 1.3,
  color: $placeholder ? '#8A949E' : '#15202B',
}));

const Detail = styled.div({ fontSize: '13px', color: '#4A5560', lineHeight: 1.45 });

const TimeChip = styled.div({
  background: 'rgba(255, 255, 255, 0.92)',
  borderRadius: '999px',
  padding: '5px 11px',
  fontSize: '12px',
  color: '#4A5560',
  boxShadow: '0 1px 4px rgba(21, 32, 43, 0.12)',
});

const Backdrop = styled.button<{ $open:boolean; }>(({ $open }) => ({
  position: 'absolute',
  inset: 0,
  border: 'none',
  padding: 0,
  background: 'rgba(21, 32, 43, 0.32)',
  opacity: $open ? 1 : 0,
  pointerEvents: $open ? 'auto' : 'none',
  transition: 'opacity 240ms ease',
}));

const Sheet = styled.div<{ $open:boolean; }>(({ $open }) => ({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  maxHeight: '80%',
  overflowY: 'auto',
  boxSizing: 'border-box',
  padding: '4px 20px 28px',
  display: 'flex',
  flexDirection: 'column',
  gap: '18px',
  background: '#FFFFFF',
  borderRadius: '28px 28px 0 0',
  boxShadow: '0 -8px 30px rgba(21, 32, 43, 0.16)',
  color: '#15202B',
  pointerEvents: $open ? 'auto' : 'none',
  transform: $open ? 'translateY(0)' : 'translateY(110%)',
  transition: 'transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1)',
}));

const Handle = styled.button({
  alignSelf: 'center',
  width: '64px',
  height: '28px',
  border: 'none',
  background: 'transparent',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  span: { width: '40px', height: '5px', borderRadius: '3px', background: '#D5DADF' },
});

const HeaderRow = styled.div({ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px' });

const SheetKicker = styled.div({ fontSize: '14px', fontWeight: 700 });

const Big = styled.div({ fontSize: '32px', fontWeight: 800, letterSpacing: '-0.8px', lineHeight: 1.2 });

const Side = styled.div({ fontSize: '13px', color: '#4A5560', textAlign: 'right', lineHeight: 1.5 });

const SectionLabel = styled.div({ fontSize: '12px', fontWeight: 700, color: '#4A5560', marginBottom: '8px' });

const Bars = styled.div({
  height: '60px',
  display: 'flex',
  alignItems: 'flex-end',
  gap: '2px',
  borderBottom: '1px solid #E3E7EB',
});

const Bar = styled.div({ flex: 1, borderRadius: '2px 2px 0 0' });

const Ticks = styled.div({ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#4A5560', marginTop: '6px' });

const Notice = styled.div({ fontSize: '13px', color: '#4A5560', background: '#F4F6F8', borderRadius: '12px', padding: '12px 14px' });

const Tiles = styled.div({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' });

const Tile = styled.div({ background: '#F4F6F8', borderRadius: '16px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '2px' });

const TileLabel = styled.div({ fontSize: '12px', color: '#4A5560' });

const TileValue = styled.div({ fontSize: '17px', fontWeight: 800 });