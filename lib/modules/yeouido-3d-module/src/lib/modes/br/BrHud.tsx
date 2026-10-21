/* eslint-disable no-bitwise -- 행동 비트 */
import { MouseEvent, MutableRefObject, PointerEvent } from 'react';
import styled from 'styled-components';
import { ACT_MELEE, ITEM_KINDS, ITEM_NAMES, STAGES } from 'yeouido-br';

import type { BrHudState } from './br-client';
import { ITEM_COLORS } from './item-meshes';

import { capturePointer, InputState } from '../../input';
import { Panel, PIXEL_FONT, pixelBorder } from '../../ui/pixel';

const hpColor = (hp:number) => {
  if (hp > 50) return '#5fd35f';
  return hp > 25 ? '#ffd84a' : '#ff5a4a';
};

const clock = (s:number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const zoneLabel = (z:NonNullable<BrHudState['zone']>) => {
  if (z.stage > STAGES) return '최종 원 · 시간 종료';
  return `전장 ${z.stage}/${STAGES} · ${z.shrinking ? '줄어드는 중' : '다음 축소'} ${clock(z.untilChange)} · 남은 시간 ${clock(z.remain)}`;
};

/**
 * 배틀로얄 모드 HUD (게임성 측정용 PoC): 전장·체력·무적, 사망 화면, 알림, 때린 피해, 공격 버튼(터치).
 */
export function BrHud({ state, inputRef, touch }:{ state: BrHudState; inputRef: MutableRefObject<InputState>; touch: boolean; }) {
  const hold = (on:boolean) => {
    if (on) inputRef.current.act |= ACT_MELEE;
    else inputRef.current.act &= ~ACT_MELEE;
  };
  const z = state.zone;
  return (
    <>
      {state.hurt > 0 && <Hurt style={{ opacity: state.hurt }} />}
      <Left>
        {z && (
          <ZoneBar $warn={z.outside > 0}>
            {zoneLabel(z)}
            {z.outside > 0 && <b>전장 밖! 원 안으로 {Math.ceil(z.outside)}m</b>}
          </ZoneBar>
        )}
        <HpPanel>
          <span>체력</span>
          <HpBar><HpFill style={{ width: `${state.hp}%`, background: hpColor(state.hp) }} /></HpBar>
          <span>{state.hp}</span>
          {state.shield && <Shield>무적</Shield>}
        </HpPanel>
        <GearRow>
          {ITEM_KINDS.map((k) => (
            <Slot key={k} $on={state.gear[k] > 0} title={ITEM_NAMES[k]}>
              <i style={{ background: ITEM_COLORS[k] }} />
              <span>{ITEM_NAMES[k]}</span>
              <b>{state.gear[k] ? `+${state.gear[k]}` : '-'}</b>
            </Slot>
          ))}
        </GearRow>
      </Left>

      {state.feed.length > 0 && (
        <Feed>
          {state.feed.map((f) => <div key={f.id}>{f.text}</div>)}
        </Feed>
      )}

      {state.got.length > 0 && (
        <Got>
          {state.got.map((g) => <div key={g.id}>{g.text}</div>)}
        </Got>
      )}

      {state.hits.map((h) => (
        <HitNum key={h.id} style={{ transform: `translate(-50%, ${-30 - h.age * 40}px)`, opacity: 1 - h.age }}>-{h.dmg}</HitNum>
      ))}

      {state.dead && (
        <Dead>
          <b>쓰러졌다</b>
          <span>{state.dead.by ? `${state.dead.by}에게 당함` : '전장 밖에서 버티지 못함'}</span>
          <span>{state.dead.wait}초 뒤 원 안 어딘가에서 다시 시작</span>
        </Dead>
      )}

      {touch ? (
        <AttackButton
          onPointerDown={(e:PointerEvent<HTMLButtonElement>) => {
            capturePointer(e.currentTarget, e.pointerId);
            hold(true);
          }}
          onPointerUp={() => hold(false)}
          onPointerCancel={() => hold(false)}
          onLostPointerCapture={() => hold(false)}
          onContextMenu={(e:MouseEvent) => e.preventDefault()}
          aria-label='공격'
        >공격
        </AttackButton>
      ) : <Hint>공격: 왼쪽 클릭 (위 시점은 마우스 쪽으로, 뒤·1인칭은 화면 가운데로)</Hint>}
    </>
  );
}

const Left = styled.div({
  position: 'absolute',
  top: 74,
  left: 10,
  maxWidth: 'calc(100% - 190px)',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  pointerEvents: 'none',
  '@media (max-width: 560px)': { top: 126 },
});

/** 깜빡임 (styled-components 객체 스타일 안에 keyframes를 같이 둔다) */
const BLINK = { '@keyframes brBlink': { '50%': { opacity: 0.35 } } };

const ZoneBar = styled(Panel)<{ $warn: boolean; }>(({ $warn }) => ({
  padding: '6px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  b: { fontWeight: 'normal', color: '#ff7a6b', animation: $warn ? 'brBlink 0.8s steps(2) infinite' : 'none' },
  ...BLINK,
}));

const HpPanel = styled(Panel)({
  alignSelf: 'flex-start',
  padding: '5px 8px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
});

const HpBar = styled.div({ width: 110, height: 8, background: '#0b0e22', boxShadow: '0 0 0 1px #3a4272' });

const HpFill = styled.div({ height: '100%', transition: 'width 120ms steps(4)' });

const Shield = styled.span({ color: '#7fd0ff', animation: 'brBlink 0.5s steps(2) infinite', ...BLINK });

const GearRow = styled.div({ display: 'flex', gap: 4, flexWrap: 'wrap' });

const Slot = styled(Panel)<{ $on: boolean; }>(({ $on }) => ({
  padding: '3px 6px',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  opacity: $on ? 1 : 0.5,
  i: { display: 'inline-block', width: 8, height: 8 },
  b: { fontWeight: 'normal', color: $on ? '#ffd84a' : '#8a90b8' },
}));

const Got = styled(Panel)({
  position: 'absolute',
  left: '50%',
  top: '24%',
  transform: 'translateX(-50%)',
  padding: '5px 10px',
  textAlign: 'center',
  color: '#ffd84a',
  pointerEvents: 'none',
});

const Feed = styled(Panel)({
  position: 'absolute',
  right: 10,
  top: 234,
  padding: '4px 8px',
  maxWidth: 220,
  pointerEvents: 'none',
  '@media (max-width: 560px)': { top: 286 },
});

const HitNum = styled.div({
  position: 'absolute',
  left: '50%',
  top: '45%',
  fontFamily: PIXEL_FONT,
  fontSize: 16,
  color: '#ffd84a',
  textShadow: '2px 2px 0 #0b0e22',
  pointerEvents: 'none',
});

const Hurt = styled.div({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  boxShadow: 'inset 0 0 80px 20px rgba(220,30,30,0.75)',
});

const Dead = styled(Panel)({
  position: 'absolute',
  left: '50%',
  top: '40%',
  transform: 'translate(-50%, -50%)',
  padding: '14px 20px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  pointerEvents: 'none',
  b: { fontFamily: 'Galmuri14, sans-serif', fontWeight: 'normal', fontSize: 20, color: '#ff7a6b' },
});

const AttackButton = styled.button({
  position: 'absolute',
  right: 114,
  bottom: 40,
  width: 84,
  height: 84,
  borderRadius: '50%',
  border: 0,
  fontFamily: PIXEL_FONT,
  fontSize: 14,
  color: '#fff',
  background: '#e2574c',
  touchAction: 'none',
  userSelect: 'none',
  ...pixelBorder(),
  '&:active': { transform: 'translateY(1px)', background: '#c4433a' },
});

const Hint = styled(Panel)({
  position: 'absolute',
  left: 10,
  bottom: 44,
  padding: '4px 8px',
  pointerEvents: 'none',
});