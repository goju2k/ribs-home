/**
 * 여의도 3D 다중접속 프로토콜 (서버·클라이언트 공용).
 * 지금은 JSON 한 줄 메시지. 사람이 많아지면 같은 모양을 유지한 채 바이너리로 바꾼다.
 */

export const PROTOCOL_VERSION = 1;

/** 서버가 스냅숏을 뿌리는 빈도, 클라이언트가 자기 상태를 보내는 빈도 (Hz) */
export const TICK_HZ = 15;

/** 다른 사람 위치를 이만큼 늦게 그려 두 스냅숏 사이를 보간한다 (ms) */
export const INTERP_DELAY_MS = 120;

/** 서버가 받아 주는 최대 이동 속도 (m/s, 달리며 비행 36 + 여유). 넘으면 순간이동으로 보고 무시 */
export const MAX_SPEED = 60;

/** 실외면 -1, 실내면 건물 번호 */
export const OUTDOOR = -1;

/** 한 사람의 공개 상태 */
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
  | { t: 'hello'; v: number; name: string; }
  | ({ t: 'state'; } & PlayerState);

/** 스냅숏 한 줄: [id, x, y, z, f, a, b, l] */
export type SnapRow = [number, number, number, number, number, number, number, number];

/** 서버 → 클라이언트 */
export type ServerMsg =
  | { t: 'welcome'; id: number; world: string; hz: number; players: { id: number; name: string; }[]; }
  | { t: 'join'; id: number; name: string; }
  | { t: 'leave'; id: number; }
  | { t: 'snap'; tick: number; ps: SnapRow[]; }
  | { t: 'error'; msg: string; };

const round = (n:number, k = 100) => Math.round(n * k) / k;

export const toRow = (id:number, s:PlayerState):SnapRow => [ id, round(s.x), round(s.y), round(s.z), round(s.f), round(s.a, 10), s.b, s.l ];

export const fromRow = (r:SnapRow):{ id: number; } & PlayerState => ({ id: r[0], x: r[1], y: r[2], z: r[3], f: r[4], a: r[5], b: r[6], l: r[7] });

/** 받은 JSON이 상태 메시지로 쓸 만한지 (숫자 범위만 확인) */
export function validState(m:unknown):m is PlayerState {
  if (!m || typeof m !== 'object') return false;
  const s = m as Record<string, unknown>;
  return [ 'x', 'y', 'z', 'f', 'a', 'b', 'l' ].every((k) => typeof s[k] === 'number' && Number.isFinite(s[k]) && Math.abs(s[k] as number) < 1e5);
}