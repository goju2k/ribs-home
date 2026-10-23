/**
 * 여의도 3D 다중접속 프로토콜 (서버·클라이언트 공용).
 * 서버 권위: 클라이언트는 입력만 보내고, 서버가 공용 시뮬레이션(yeouido-sim)으로 위치를 확정한다.
 * 스냅숏·입력은 바이너리(binary.ts), 나머지(입장·퇴장·신호)는 JSON.
 * 스냅숏에는 받는 사람 주변(보이는 범위)·같은 공간의 사람만 담는다.
 *
 * 엔진/게임 모드 구분: 이 파일은 장르와 무관한 엔진 프로토콜이다. 게임 규칙(배틀로얄 등)은
 * - 입력의 행동 비트(act), 사람마다 상태 비트(s)·게이지(v)에 뜻을 붙이고
 * - 자기 메시지는 { t: 'mode' } 통로로만 주고받는다 (형식은 모드 모듈이 정한다).
 */

export const PROTOCOL_VERSION = 18;

/** 클라이언트가 알려 주는 화면 지연(다른 사람을 얼마나 늦게 보는지)의 상한 (ms) — 지연 보정이 이보다 더 되감지 않는다 */
export const MAX_LAG_MS = 300;

/** 상태 비트 중 엔진이 쓰는 것: 움직일 수 없음 (입력은 받되 이동하지 않는다 — 클라이언트 예측도 멈춘다). 나머지 비트는 모드가 쓴다 */
export const ST_FROZEN = 0x80;

/** 상태 비트 중 엔진이 쓰는 것: 세상에 없음 (관전 등) — 다른 사람 스냅숏에서 빠지고 화면에 안 그린다 */
export const ST_HIDDEN = 0x40;

/** 행동 비트(입력 act): 엔진은 뜻을 모르고 모드에 넘긴다. 0~7 (3비트) */
export const ACT_MAX = 7;

/** 입력의 보는 방향이 없다는 표시 */
export const NO_FACE = 99;

/** 보이는 범위(반경 m): 클라이언트가 알려 주면 서버가 이 안으로 자른다 */
export const VIEW_MIN = 80;
export const VIEW_MAX = 1200;
export const VIEW_DEFAULT = 300;

/** 이보다 먼 사람은 스냅숏 두 번에 한 번만 (m) */
export const NEAR = 150;

/**
 * 서버 시뮬레이션 빈도 = 입력 한 걸음 빈도 (Hz, yeouido-sim STEP과 같아야 함).
 * 배그 방식 30Hz·스냅숏 15Hz (v14): 60/30보다 한 판에 약 1.7배 더 받고 송신량은 절반 — 손맛에 문제가 느껴지면 다시 올린다
 */
export const SIM_HZ = 30;

/** 서버가 스냅숏을 뿌리는 빈도 (Hz) */
export const SNAP_HZ = 15;

/** 다른 사람 위치를 이만큼 늦게 그려 두 스냅숏 사이를 보간한다 (ms, 스냅숏 간격 67ms의 약 2배) */
export const INTERP_DELAY_MS = 120;

/** 실외면 -1, 실내면 건물 번호 */
export const OUTDOOR = -1;

/** 내 시뮬레이션 상태 전부: [x, y, z, f, spd, a, b, l, lw, fly, vy, sm, fm] (yeouido-sim Body와 같은 순서) */
export type BodyTuple = [number, number, number, number, number, number, number, number, number, number, number, number, number];

/** 입력 한 걸음: [순번, mx, mz, 달리기(0/1), 높이(-1/0/1), 보는 방향(라디안, 없으면 NO_FACE), 행동 비트(0~7), 조준 높이각(라디안, +는 아래)] */
export type InputTuple = [number, number, number, number, number, number, number, number];

/** 다른 사람에게 보이는 상태 */
export interface PlayerState {
  x: number;
  y: number;
  z: number;
  /** 바라보는 방향(라디안) */
  f: number;
  /** 걷는 애니메이션 속도(m/s, 0이면 서 있음) */
  a: number;
  /** 건물 번호(실외 -1)와 층 */
  b: number;
  l: number;
  /** 상태 비트(모드가 정함, ST_FROZEN만 엔진)와 게이지(0~255, 모드가 정함 — 예: 체력) */
  s: number;
  v: number;
  /** 모습 종류: 0 = 접속한 사람, 그 밖은 모드가 만든 NPC(예: 좀비) — 뜻은 모드가 정한다 */
  k: number;
}

/** 클라이언트 → 서버 */
export type ClientMsg =
  /** spawn: 확인용 ?at= 이나 재접속 때 이어서 시작할 자리 (서버가 받아 줄지 판단) */
  /** debug: 개발용 (비행 허용, spawn 받아 줌) */
  | { t: 'hello'; v: number; name: string; debug?: boolean; spawn?: { x: number; y: number; z: number; b: number; l: number; }; }
  | { t: 'input'; cmds: InputTuple[]; }
  /** 화면에 보이는 반경(m) — 바뀔 때만 보낸다 */
  | { t: 'view'; r: number; }
  /** 왕복 시간 재기: 보낸 시각(클라이언트 시계)을 서버가 그대로 돌려준다 */
  | { t: 'ping'; c: number; }
  /** 게임 모드 전용 요청 (형식은 모드 모듈이 정한다) */
  | { t: 'mode'; d: unknown; }
  /** 내 화면 지연: 다른 사람을 지금보다 이만큼 늦게 보고 있다 (편도 지연 + 보간 지연, ms) — 서버가 판정을 이만큼 되감는다 */
  | { t: 'lag'; ms: number; }
  /** WebRTC 신호 (offer 또는 ICE 후보) */
  | ({ t: 'rtc'; } & RtcSignal);

/** WebRTC 신호: sdp+type 또는 후보(c, mid) */
export interface RtcSignal {
  sdp?: string; type?: string; c?: string; mid?: string;
}

/** 스냅숏 한 줄: [id, x, y, z, f, a, b, l, s, v, k] */
export type SnapRow = [number, number, number, number, number, number, number, number, number, number, number];

/** 서버 → 클라이언트 */
/** 방송 종류 (화면이 색·아이콘을 고른다): 입장·퇴장은 엔진이, 나머지는 모드도 쓴다 */
export type SayKind = 'info' | 'join' | 'leave' | 'event' | 'warn';

export type ServerMsg =
  /** rtc: 서버가 WebRTC 데이터채널을 받을 수 있으면 true (클라이언트가 offer를 보낸다) */
  /** mode: 이 월드에서 돌아가는 게임 모드 이름 (클라이언트가 맞는 화면을 고른다) */
  | { t: 'welcome'; id: number; world: string; mode: string; v: number; players: { id: number; name: string; }[]; me: BodyTuple; ack: number; rtc: boolean; }
  | ({ t: 'rtc'; } & RtcSignal)
  | { t: 'join'; id: number; name: string; }
  | { t: 'leave'; id: number; }
  /** 방송: 모두에게 한 줄 (입장·퇴장, 게임 모드 알림 — 예: 최종 보스 등장). 화면 위쪽 가운데에 잠깐 */
  | { t: 'say'; text: string; kind: SayKind; }
  /** ack: 이 상태까지 반영한 내 입력 순번, me: 그 시점 내 상태 (정밀값), ms·mv: 내 상태 비트·게이지 */
  | { t: 'snap'; tick: number; ack: number; me: BodyTuple; ms: number; mv: number; ps: SnapRow[]; }
  | { t: 'error'; msg: string; }
  /** 월드가 가득 차 기다리는 중: pos 내 순번(1부터), size 대기 인원, players·max 지금 인원·최대 인원 (자리가 나면 welcome이 온다) */
  | { t: 'queue'; pos: number; size: number; players: number; max: number; }
  | { t: 'pong'; c: number; }
  /** 게임 모드 전용 알림 묶음 (한 틱 동안 모은 것, 형식은 모드 모듈이 정한다) */
  | { t: 'mode'; ds: unknown[]; };

const round = (n:number, k = 100) => Math.round(n * k) / k;

export const toRow = (id:number, p:Omit<PlayerState, 's' | 'v' | 'k'>, s:number, v:number, k = 0):SnapRow => [ id, round(p.x), round(p.y), round(p.z), round(p.f), round(p.a, 10), p.b, p.l, s, v, k ];

export const fromRow = (r:SnapRow):{ id: number; } & PlayerState => ({ id: r[0], x: r[1], y: r[2], z: r[3], f: r[4], a: r[5], b: r[6], l: r[7], s: r[8], v: r[9], k: r[10] });

export interface BodyLike {
  x: number; y: number; z: number; f: number; spd: number; a: number; b: number; l: number; lw: number; fly: number; vy: number; sm: number; fm: number;
}

export const toBody = (b:BodyLike):BodyTuple => [ b.x, b.y, b.z, b.f, b.spd, b.a, b.b, b.l, b.lw, b.fly, b.vy, b.sm, b.fm ];

export const fromBody = (t:BodyTuple):BodyLike => ({ x: t[0], y: t[1], z: t[2], f: t[3], spd: t[4], a: t[5], b: t[6], l: t[7], lw: t[8], fly: t[9], vy: t[10], sm: t[11], fm: t[12] });

const num = (v:unknown, lim:number) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;

/** 받은 입력 한 줄이 쓸 만한지 */
export function validInput(c:unknown):c is InputTuple {
  return Array.isArray(c) && c.length === 8 && num(c[0], 1e9) && num(c[1], 1.01) && num(c[2], 1.01) && num(c[3], 1) && num(c[4], 1) && num(c[5], NO_FACE)
    && Number.isInteger(c[6]) && c[6] >= 0 && c[6] <= ACT_MAX && num(c[7], 1.6);
}

export * from './binary';