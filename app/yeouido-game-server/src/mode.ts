import { Body, Input, SimWorld } from 'yeouido-sim';

/**
 * 게임 모드 = 엔진(World: 접속·입력·이동·스냅숏) 위에 얹는 게임 규칙.
 * 지금은 배틀로얄(modes/battle-royale.ts, 게임성 측정용 PoC)뿐이고, 다른 게임을 만들면 이 인터페이스로 모드를 바꾼다.
 * 엔진은 모드가 뭘 하는지 모른다: 모드는 사람마다 상태 비트(st)·게이지(gv)를 정하고, 자기 메시지는 send/broadcast로 보낸다.
 */

/** 모드가 보고 바꿀 수 있는 사람 정보 */
export interface ModePlayer {
  readonly id: number;
  readonly name: string;
  /** 개발용 접속 (?debug) */
  readonly debug: boolean;
  /** 모드가 바꿔도 된다 (다시 시작 자리 등). 바꾸면 클라이언트는 큰 차이를 순간이동으로 받는다 */
  body: Body;
  /** 상태 비트 (ST_FROZEN = 0x80은 엔진: 입력을 받되 움직이지 않는다) */
  st: number;
  /** 게이지 0~255 (예: 체력) */
  gv: number;
  /** 입력 대기열 (새 판 등으로 자리를 옮길 때 비운다) */
  queue: unknown[];
  /** 이 사람 화면 지연 (ms, MAX_LAG_MS 안) — 지연 보정에 쓴다 */
  readonly lagMs: number;
}

/** 입력 한 걸음의 조준: 보는 방향(없으면 몸 방향)과 높이각(+는 아래) */
export interface Aim {
  face: number; pitch: number;
  /** 이 행동이 실린 입력 걸음 번호 — 재장전을 받은 시각이 아니라 걸음 수로 재야 클라이언트와 같은 걸음에서 쏜다 */
  seq: number;
}

/** 지난 위치 (지연 보정) */
export interface PastPose {
  x: number; y: number; z: number; b: number; l: number;
}

/**
 * NPC: 모드가 만들고 매 틱 입력(input)을 정하면, 엔진이 사람과 같은 이동·충돌로 움직이고 스냅숏에 담는다 (예: 좀비, 봇).
 * k = 모습 종류(0은 접속한 사람 몫이라 1부터) — 클라이언트 모드가 모습을 고른다
 */
export interface ModeNpc {
  readonly id: number;
  readonly k: number;
  body: Body;
  /** 상태 비트(ST_FROZEN이면 안 움직임)·게이지 — 사람과 같은 뜻 */
  st: number;
  gv: number;
  input: Input;
}

/** 엔진이 모드에 빌려주는 것 */
export interface ModeHost {
  readonly sim: SimWorld;
  players(): Iterable<ModePlayer>;
  get(id:number): ModePlayer | undefined;
  /** 모드 메시지 보내기 (엔진의 { t: 'mode', d }로 감싸 보낸다) */
  send(p:ModePlayer, d:unknown): void;
  broadcast(d:unknown, except?:ModePlayer): void;
  /** NPC 만들기·없애기 (없애면 클라이언트에서는 소식이 끊긴 뒤 사라지니, 먼저 숨김 상태를 잠깐 보여 주는 게 좋다) */
  addNpc(k:number, body:Body): ModeNpc;
  removeNpc(id:number): void;
  npcs(): Iterable<ModeNpc>;
  /** 사람·NPC가 msAgo 전에 있던 자리 (지난 1초까지, 기록이 없으면 null) — 지연 보정 판정용 */
  past(id:number, msAgo:number): PastPose | null;
}

export interface GameMode {
  /** 클라이언트가 화면을 고르는 이름 */
  readonly name: string;
  /**
   * 입장: 시작 자리(p.body)·상태를 정하고 처음 알릴 것을 보낸다.
   * requested: 개발용 접속이 원한 자리 (엔진이 범위만 확인한 것 — 모드가 쓸지 정한다)
   */
  join(p:ModePlayer, requested:Body | null): void;
  leave(p:ModePlayer): void;
  /** 입력 한 걸음을 처리한 뒤 (act: 행동 비트, 0이어도 부른다 — 누르고 있는 동안 계속 들어온다) */
  act(p:ModePlayer, act:number, now:number, aim:Aim): void;
  /** 틱마다 (모든 입력을 처리한 뒤) */
  tick(now:number): void;
  /** 클라이언트가 보낸 모드 요청 */
  message?(p:ModePlayer, d:unknown): void;
  /** 상태 확인용 (/ 의 JSON) */
  info(): unknown;
}