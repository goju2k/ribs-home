import { Body, SimWorld } from 'yeouido-sim';

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
}

/** 엔진이 모드에 빌려주는 것 */
export interface ModeHost {
  readonly sim: SimWorld;
  players(): Iterable<ModePlayer>;
  get(id:number): ModePlayer | undefined;
  /** 모드 메시지 보내기 (엔진의 { t: 'mode', d }로 감싸 보낸다) */
  send(p:ModePlayer, d:unknown): void;
  broadcast(d:unknown, except?:ModePlayer): void;
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
  act(p:ModePlayer, act:number, now:number): void;
  /** 틱마다 (모든 입력을 처리한 뒤) */
  tick(now:number): void;
  /** 클라이언트가 보낸 모드 요청 */
  message?(p:ModePlayer, d:unknown): void;
  /** 상태 확인용 (/ 의 JSON) */
  info(): unknown;
}