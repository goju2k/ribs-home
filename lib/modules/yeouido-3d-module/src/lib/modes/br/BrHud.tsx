/* eslint-disable no-bitwise -- 행동 비트 */
import { MouseEvent, MutableRefObject, PointerEvent, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { ACT_FARM, ACT_FIRE, ACT_RELOAD, isConsumable, isWeapon, ITEM_KINDS, ITEM_NAMES, STAGES } from 'yeouido-br';

import type { BrHudState } from './br-client';
import { ITEM_COLORS } from './item-meshes';

import { capturePointer, InputState } from '../../input';
import { Panel, PIXEL_FONT, pixelBorder } from '../../ui/pixel';

/** 낮밤 한 줄: 밤이 오기 15초 전부터 경고 */
const dayLabel = (d:NonNullable<BrHudState['day']>) => {
  if (d.night) return `밤 · 좀비 출몰 · 해 뜨기까지 ${clock(d.remain)}`;
  return d.remain <= 15 ? `곧 밤! 좀비가 나온다 · ${clock(d.remain)}` : `낮 · 밤까지 ${clock(d.remain)}`;
};

const endTitle = (e:NonNullable<BrHudState['end']>) => {
  if (e.chicken) return e.mine ? '치킨 획득! 탈출 성공' : `${e.chicken} 탈출 · 치킨 획득`;
  if (e.why === 'noescape') return '아무도 탈출하지 못했다';
  return e.why === 'wiped' ? '패배… 모두 쓰러졌다' : '패배… 시간 안에 보스를 쓰러뜨리지 못했다';
};

/** 휴전·탈출 안내 한 줄 */
const escapeLabel = (e:NonNullable<BrHudState['escape']>) => {
  if (e.exitDist === null) return '보스전 휴전 중 · 사람끼리는 피해 없음';
  if (e.truce) return `${e.opensIn}초 뒤 휴전 끝 · 탈출구 열림 (${Math.round(e.exitDist)}m)`;
  return `탈출구 열림! 먼저 닿으면 치킨 · ${Math.round(e.exitDist)}m`;
};

const hpColor = (hp:number) => {
  if (hp > 50) return '#5fd35f';
  return hp > 25 ? '#ffd84a' : '#ff5a4a';
};

const clock = (s:number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const zoneLabel = (z:NonNullable<BrHudState['zone']>) => {
  if (z.stage > STAGES) return '최종 원 · 최종 보스';
  return `전장 ${z.stage}/${STAGES} · ${z.shrinking ? '줄어드는 중' : '다음 축소'} ${clock(z.untilChange)} · 남은 시간 ${clock(z.remain)}`;
};

/**
 * 배틀로얄 모드 HUD (게임성 측정용 PoC): 전장·체력·무적, 사망 화면, 알림, 때린 피해, 공격 버튼(터치).
 */
export function BrHud({ state, inputRef, touch }:{ state: BrHudState; inputRef: MutableRefObject<InputState>; touch: boolean; }) {
  const hold = (bit:number, on:boolean) => {
    if (on) inputRef.current.act |= bit;
    else inputRef.current.act &= ~bit;
  };
  // 누르고 있는 동안 켜지는 버튼 (파밍·사격·재장전). press가 있으면 모드가 먼저 받는다 (스코프 켜기·끄기)
  const holdProps = (bit:number, press?:'left' | 'right') => ({
    onPointerDown: (e:PointerEvent<HTMLButtonElement>) => {
      capturePointer(e.currentTarget, e.pointerId);
      if (press && state.press(press)) return;
      hold(bit, true);
    },
    onPointerUp: () => hold(bit, false),
    onPointerCancel: () => hold(bit, false),
    onLostPointerCapture: () => hold(bit, false),
    onContextMenu: (e:MouseEvent) => e.preventDefault(),
  });
  const z = state.zone;
  // 시작 대기: Enter로 게임 시작(준비) 켜기·끄기 — 1인칭에서 마우스가 잠겨 있어도 된다
  const lobbyRef = useRef(state.lobby);
  lobbyRef.current = state.lobby;
  const readyRef = useRef(state.setReady);
  readyRef.current = state.setReady;
  useEffect(() => {
    const onKey = (e:KeyboardEvent) => {
      const lb = lobbyRef.current;
      if (e.code !== 'Enter' || !lb || e.repeat) return;
      e.preventDefault();
      readyRef.current(!lb.me);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      {/* 스코프는 HUD 맨 아래층 (스코프 중에도 체력·탄창이 보이게) */}
      {state.weapon?.scoped && <Scope />}
      {state.poison > 0 && <Poison />}
      <Left>
        {z && (
          <ZoneBar $warn={z.outside > 0}>
            {zoneLabel(z)}
            {state.day && <DayLine $night={state.day.night}>{dayLabel(state.day)}</DayLine>}
            {z.outside > 0 && <b>전장 밖! 원 안으로 {Math.ceil(z.outside)}m</b>}
          </ZoneBar>
        )}
        <HpPanel>
          {state.spec ? <span>관전 중 · 다음 판에 참여</span> : (
            <>
              <span>체력</span>
              <HpBar><HpTrail style={{ width: `${state.hp}%` }} /><HpFill style={{ width: `${state.hp}%`, background: hpColor(state.hp) }} /></HpBar>
              <span>{state.hp}</span>
              {state.shield && <Shield>무적</Shield>}
              {state.poison > 0 && <PoisonTag>중독 {state.poison}초</PoisonTag>}
            </>
          )}
        </HpPanel>
        <GearRow>
          {/* 무기는 한 칸 (1인 1무기), 나머지 장비는 칸마다 */}
          <Slot $on={!!state.weapon} title='무기'>
            <i style={{ background: state.weapon ? ITEM_COLORS[state.weapon.kind] : '#3a3f58' }} />
            <span>{state.weapon ? state.weapon.name : '무기 없음'}</span>
            <b>{state.weapon ? `+${state.weapon.lv}` : '-'}</b>
          </Slot>
          {ITEM_KINDS.filter((k) => !isWeapon(k) && !isConsumable(k)).map((k) => (
            <Slot key={k} $on={state.gear[k] > 0} title={ITEM_NAMES[k]}>
              <i style={{ background: ITEM_COLORS[k] }} />
              <span>{ITEM_NAMES[k]}</span>
              <b>{state.gear[k] ? `+${state.gear[k]}` : '-'}</b>
            </Slot>
          ))}
        </GearRow>
        {state.weapon && (
          <Ammo>
            <b>{state.weapon.name} +{state.weapon.lv}</b>
            {state.weapon.reload !== null ? (
              <>
                <span>재장전</span>
                <HpBar><ReloadFill key={state.weapon.reloadFrom} from={state.weapon.reloadFrom} to={state.weapon.reloadTo} /></HpBar>
              </>
            ) : <big>{state.weapon.ammo} / {state.weapon.mag}</big>}
          </Ammo>
        )}
      </Left>

      {state.prompt && <Prompt>{state.prompt}</Prompt>}

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

      {state.hitMark && <HitMark $head={state.hitMark.head} style={{ opacity: 1 - state.hitMark.age }}>✕</HitMark>}

      {state.hits.map((h) => (
        <HitNum key={h.id} $head={h.head} style={{ transform: `translate(-50%, ${-30 - h.age * 40}px)`, opacity: 1 - h.age }}>{h.head ? '머리 ' : ''}-{h.dmg}</HitNum>
      ))}

      {state.escape && !state.end && <EscapeBar $open={!state.escape.truce}>{escapeLabel(state.escape)}</EscapeBar>}

      {state.boss && (
        <BossBar>
          <span>최종 보스 · 남은 시간 {clock(state.boss.remain)}</span>
          <HpBar style={{ width: '100%', height: 10 }}><HpFill style={{ width: `${Math.round(state.boss.ratio * 100)}%`, background: '#c04ad9' }} /></HpBar>
          <span>{state.boss.hp.toLocaleString()}</span>
        </BossBar>
      )}

      {state.end && (
        <End $win={state.end.result === 'win'}>
          <b>{endTitle(state.end)}</b>
          {state.end.killer && <span>마지막 일격: {state.end.killer}</span>}
          {state.end.top.length > 0 && (
            <ol>
              {state.end.top.map(([ n, d ]) => <li key={n}>{n} · 보스 피해 {d.toLocaleString()}</li>)}
            </ol>
          )}
          {state.end.zk.length > 0 && (
            <>
              <span>좀비 처치</span>
              <ol>
                {state.end.zk.map(([ n, c ]) => <li key={n}>{n} · {c}마리</li>)}
              </ol>
            </>
          )}
          <span>{state.end.next}초 뒤 새 판</span>
        </End>
      )}

      {state.lobby && (
        <Lobby>
          <b>게임 시작 대기</b>
          <span>준비 {state.lobby.ready} / {state.lobby.total}명 · 모두 누르면 5초 후 시작</span>
          {state.lobby.startIn !== null && <Count>{state.lobby.startIn}</Count>}
          <ReadyButton $on={state.lobby.me} onClick={() => state.setReady(!state.lobby!.me)}>
            {state.lobby.me ? '준비 취소 (Enter)' : '게임 시작 (Enter)'}
          </ReadyButton>
        </Lobby>
      )}

      {state.spec && !state.end && (
        <Spec>
          <span>{state.spec.reason === 'late' ? '보스전이 진행 중이라 이번 판은 관전합니다 · 다음 판에 참여' : '이번 판은 관전합니다 · 다음 판에 참여'}</span>
          <SpecRow>
            <SpecButton onClick={() => state.watch(-1)} aria-label='이전 사람'>◀</SpecButton>
            <b>{state.spec.target ? `관전 중: ${state.spec.target}` : '관전 중: 최종 보스'}</b>
            <SpecButton onClick={() => state.watch(1)} aria-label='다음 사람'>▶</SpecButton>
          </SpecRow>
        </Spec>
      )}

      {state.dead && !state.end && (
        <Dead>
          <b>쓰러졌다</b>
          <span>{state.dead.by ? `${state.dead.by}에게 당함` : '전장 밖에서 버티지 못함'}</span>
          <span>{state.dead.wait < 0 ? '보스전 중에는 다시 시작할 수 없다 · 곧 관전으로' : `${state.dead.wait}초 뒤 원 안 어딘가에서 다시 시작`}</span>
        </Dead>
      )}

      {touch ? (
        <>
          <AttackButton {...holdProps(ACT_FARM, 'left')} aria-label='파밍'>{state.weapon?.scoped ? '스코프 끄기' : '파밍'}</AttackButton>
          {state.weapon && <ShootButton {...holdProps(ACT_FIRE, 'right')} aria-label='사격'>{state.weapon.scope && !state.weapon.scoped ? '스코프' : '사격'}</ShootButton>}
          {state.weapon && <ReloadButton {...holdProps(ACT_RELOAD)} aria-label='재장전'>장전</ReloadButton>}
        </>
      ) : (
        <Hint>
          좌클릭: 파밍(줍기·시체 털기·부수기) · 우클릭: 사격 · R: 재장전
          {state.weapon?.scope ? ' · 저격: 우클릭 스코프 → 우클릭 발사, 좌클릭 스코프 끄기' : ''}
        </Hint>
      )}
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

const DayLine = styled.span<{ $night: boolean; }>(({ $night }) => ({ color: $night ? '#b7a0ff' : '#ffe9a8' }));

const HpPanel = styled(Panel)({
  alignSelf: 'flex-start',
  padding: '5px 8px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
});

const HpBar = styled.div({ position: 'relative', width: 110, height: 8, background: '#0b0e22', boxShadow: '0 0 0 1px #3a4272' });

const HpFill = styled.div({ position: 'relative', height: '100%', transition: 'width 120ms steps(4)' });

/** 체력 막대 잔상: 채움 뒤에 깔린 흰 막대 — 0.45초 있다가 0.5초 동안 따라 줄어든다 */
const HpTrail = styled.div({ position: 'absolute', left: 0, top: 0, height: '100%', background: '#f4f4f8', transition: 'width 500ms ease-in 450ms' });

/**
 * 재장전 막대: HUD는 0.25초마다만 다시 그려 계단처럼 찼다 → 재장전마다 새로 만들고(key) 브라우저 애니메이션으로 남은 시간 동안 매끄럽게.
 * 시작 시점(지난 시간)은 처음 그릴 때 한 번만 잰다 (다시 그려도 애니메이션이 이어지게)
 */
function ReloadFill({ from, to }:{ from: number; to: number; }) {
  const delay = useRef(-(performance.now() - from)).current;
  return <ReloadBarFill style={{ animationDuration: `${Math.max(1, to - from)}ms`, animationDelay: `${delay}ms` }} />;
}

const ReloadBarFill = styled.div({
  height: '100%',
  width: '100%',
  background: '#ffd84a',
  transformOrigin: 'left',
  animation: 'brFill linear forwards',
  '@keyframes brFill': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
});

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

const HitNum = styled.div<{ $head: boolean; }>(({ $head }) => ({
  position: 'absolute',
  left: '50%',
  top: '45%',
  fontFamily: PIXEL_FONT,
  fontSize: $head ? 20 : 16,
  color: $head ? '#ff5a4a' : '#ffd84a',
  textShadow: '2px 2px 0 #0b0e22',
  pointerEvents: 'none',
}));

/** 맞힘 표시: 조준선 자리에 X (머리면 빨강) */
const HitMark = styled.div<{ $head: boolean; }>(({ $head }) => ({
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  fontSize: $head ? 30 : 24,
  lineHeight: 1,
  fontWeight: 700,
  color: $head ? '#ff4a3a' : '#f4f4f8',
  textShadow: '0 0 2px #0b0e22, 0 0 2px #0b0e22',
  pointerEvents: 'none',
}));

/** 탄창: 왼쪽 장비 줄 아래 (화면 크기·터치 버튼과 안 겹치게) */
const Ammo = styled(Panel)({
  alignSelf: 'flex-start',
  padding: '5px 10px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  big: { fontSize: 20, color: '#f4f4f8' },
});

/** 스코프: 가운데 원만 보이고 둘레는 검게 + 십자선 */
const Scope = styled.div({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: 'radial-gradient(circle at 50% 50%, transparent 0, transparent 38vmin, #05060c 38.5vmin), linear-gradient(#05060c, #05060c) center / 1px 76vmin no-repeat, linear-gradient(#05060c, #05060c) center / 76vmin 1px no-repeat',
});

/** 좌클릭으로 할 수 있는 것 (화면 가운데 아래) */
const Prompt = styled(Panel)({
  position: 'absolute',
  left: '50%',
  top: '58%',
  transform: 'translateX(-50%)',
  padding: '4px 10px',
  color: '#f4f4f8',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
});

/** 중독: 가장자리 초록 (깜빡임) */
const Poison = styled.div({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  boxShadow: 'inset 0 0 60px 18px rgba(90, 255, 58, 0.35)',
});

const PoisonTag = styled.b({ color: '#7dff4a' });

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

const ShootButton = styled(AttackButton)({
  bottom: 136,
  width: 68,
  height: 68,
  background: '#4a6fe2',
  '&:active': { transform: 'translateY(1px)', background: '#3a58b8' },
});

/** 재장전: 파밍 버튼 왼쪽 */
const ReloadButton = styled(AttackButton)({
  right: 208,
  bottom: 48,
  width: 60,
  height: 60,
  fontSize: 13,
  background: '#5a5f7a',
  '&:active': { transform: 'translateY(1px)', background: '#454a62' },
});

/** 휴전·탈출 안내 (보스 막대 아래) */
const EscapeBar = styled(Panel)<{ $open: boolean; }>(({ $open }) => ({
  position: 'absolute',
  left: '50%',
  top: 136,
  transform: 'translateX(-50%)',
  padding: '4px 12px',
  color: $open ? '#ffd84a' : '#9fe0ff',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  '@media (max-width: 560px)': { top: 188 },
}));

const BossBar = styled(Panel)({
  position: 'absolute',
  left: '50%',
  top: 74,
  transform: 'translateX(-50%)',
  width: 'min(60vw, 420px)',
  padding: '6px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  color: '#e9c8ff',
  pointerEvents: 'none',
  '@media (max-width: 560px)': { top: 170 },
});

const End = styled(Panel)<{ $win: boolean; }>(({ $win }) => ({
  position: 'absolute',
  left: '50%',
  top: '42%',
  transform: 'translate(-50%, -50%)',
  padding: '16px 22px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  pointerEvents: 'none',
  b: { fontFamily: 'Galmuri14, sans-serif', fontWeight: 'normal', fontSize: 20, color: $win ? '#ffd84a' : '#ff7a6b' },
  ol: { margin: 0, paddingLeft: 18, color: '#d6dbf5' },
}));

const Lobby = styled(Panel)({
  position: 'absolute',
  left: '50%',
  bottom: 150,
  transform: 'translateX(-50%)',
  padding: '12px 18px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  textAlign: 'center',
  b: { fontWeight: 'normal', color: '#ffd84a', fontSize: 15 },
  span: { fontSize: 12, color: '#c9ced6' },
});

const Count = styled.div({ fontSize: 34, color: '#ffd84a', lineHeight: 1 });

const ReadyButton = styled.button<{ $on: boolean; }>(({ $on }) => ({
  fontFamily: PIXEL_FONT,
  fontSize: 15,
  color: '#f4f4f8',
  background: $on ? '#5a606b' : '#3d9a4f',
  border: 0,
  padding: '8px 18px',
  cursor: 'pointer',
  pointerEvents: 'auto',
  ...pixelBorder(),
}));

const Spec = styled(Panel)({
  position: 'absolute',
  left: '50%',
  bottom: 140,
  transform: 'translateX(-50%)',
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  b: { fontWeight: 'normal', color: '#ffd84a' },
});

const SpecRow = styled.div({ display: 'flex', alignItems: 'center', gap: 10 });

const SpecButton = styled.button({
  fontFamily: PIXEL_FONT,
  fontSize: 14,
  color: '#f4f4f8',
  background: '#3a4272',
  border: 0,
  padding: '6px 10px',
  cursor: 'pointer',
  ...pixelBorder(),
});

const Hint = styled(Panel)({
  position: 'absolute',
  left: 10,
  bottom: 44,
  padding: '4px 8px',
  pointerEvents: 'none',
});