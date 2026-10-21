/**
 * 여의도 3D 다중접속 프로토콜 (서버·클라이언트 공용).
 * 서버 권위: 클라이언트는 입력만 보내고, 서버가 공용 시뮬레이션(yeouido-sim)으로 위치를 확정한다.
 * 스냅숏·입력은 바이너리(binary.ts), 나머지(입장·퇴장·신호)는 JSON.
 * 스냅숏에는 받는 사람 주변(보이는 범위)·같은 공간의 사람만 담는다.
 */

export const PROTOCOL_VERSION = 5;

/** 입력의 보는 방향이 없다는 표시 */
export const NO_FACE = 99;

/** 보이는 범위(반경 m): 클라이언트가 알려 주면 서버가 이 안으로 자른다 */
export const VIEW_MIN = 80;
export const VIEW_MAX = 1200;
export const VIEW_DEFAULT = 300;

/** 이보다 먼 사람은 스냅숏 두 번에 한 번만 (m) */
export const NEAR = 150;

/** 서버 시뮬레이션 빈도 = 입력 한 걸음 빈도 (Hz, yeouido-sim STEP과 같아야 함) */
export const SIM_HZ = 30;

/** 서버가 스냅숏을 뿌리는 빈도 (Hz) */
export const SNAP_HZ = 15;

/** 다른 사람 위치를 이만큼 늦게 그려 두 스냅숏 사이를 보간한다 (ms) */
export const INTERP_DELAY_MS = 120;

/** 실외면 -1, 실내면 건물 번호 */
export const OUTDOOR = -1;

/** 내 시뮬레이션 상태 전부: [x, y, z, f, spd, a, b, l, lw] (yeouido-sim Body와 같은 순서) */
export type BodyTuple = [number, number, number, number, number, number, number, number, number];

/** 입력 한 걸음: [순번, mx, mz, 달리기(0/1), 높이(-1/0/1), 보는 방향(라디안, 없으면 NO_FACE)] */
export type InputTuple = [number, number, number, number, number, number];

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
}

/** 클라이언트 → 서버 */
export type ClientMsg =
  /** spawn: 확인용 ?at= 이나 재접속 때 이어서 시작할 자리 (서버가 받아 줄지 판단) */
  | { t: 'hello'; v: number; name: string; spawn?: { x: number; y: number; z: number; b: number; l: number; }; }
  | { t: 'input'; cmds: InputTuple[]; }
  /** 화면에 보이는 반경(m) — 바뀔 때만 보낸다 */
  | { t: 'view'; r: number; }
  /** WebRTC 신호 (offer 또는 ICE 후보) */
  | ({ t: 'rtc'; } & RtcSignal);

/** WebRTC 신호: sdp+type 또는 후보(c, mid) */
export interface RtcSignal {
  sdp?: string; type?: string; c?: string; mid?: string;
}

/** 스냅숏 한 줄: [id, x, y, z, f, a, b, l] */
export type SnapRow = [number, number, number, number, number, number, number, number];

/** 서버 → 클라이언트 */
export type ServerMsg =
  /** rtc: 서버가 WebRTC 데이터채널을 받을 수 있으면 true (클라이언트가 offer를 보낸다) */
  | { t: 'welcome'; id: number; world: string; v: number; players: { id: number; name: string; }[]; me: BodyTuple; ack: number; rtc: boolean; }
  | ({ t: 'rtc'; } & RtcSignal)
  | { t: 'join'; id: number; name: string; }
  | { t: 'leave'; id: number; }
  /** ack: 이 상태까지 반영한 내 입력 순번, me: 그 시점 내 상태 (정밀값) */
  | { t: 'snap'; tick: number; ack: number; me: BodyTuple; ps: SnapRow[]; }
  | { t: 'error'; msg: string; };

const round = (n:number, k = 100) => Math.round(n * k) / k;

export const toRow = (id:number, s:PlayerState):SnapRow => [ id, round(s.x), round(s.y), round(s.z), round(s.f), round(s.a, 10), s.b, s.l ];

export const fromRow = (r:SnapRow):{ id: number; } & PlayerState => ({ id: r[0], x: r[1], y: r[2], z: r[3], f: r[4], a: r[5], b: r[6], l: r[7] });

export interface BodyLike {
  x: number; y: number; z: number; f: number; spd: number; a: number; b: number; l: number; lw: number;
}

export const toBody = (b:BodyLike):BodyTuple => [ b.x, b.y, b.z, b.f, b.spd, b.a, b.b, b.l, b.lw ];

export const fromBody = (t:BodyTuple):BodyLike => ({ x: t[0], y: t[1], z: t[2], f: t[3], spd: t[4], a: t[5], b: t[6], l: t[7], lw: t[8] });

const num = (v:unknown, lim:number) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;

/** 받은 입력 한 줄이 쓸 만한지 */
export function validInput(c:unknown):c is InputTuple {
  return Array.isArray(c) && c.length === 6 && num(c[0], 1e9) && num(c[1], 1.01) && num(c[2], 1.01) && num(c[3], 1) && num(c[4], 1) && num(c[5], NO_FACE);
}

export * from './binary';