import { Collision } from './collision';
import { createIndoorGrids, IndoorGrid } from './indoor/indoor-grid';
import { WorldData } from './world-data';

/**
 * 한 사람의 이동 시뮬레이션 (서버·클라이언트가 같은 코드를 돌린다).
 * 서버는 받은 입력으로 위치를 확정하고, 클라이언트는 같은 입력으로 먼저 움직여 보인 뒤 서버 결과로 맞춘다.
 */

/** 고정 시뮬레이션 간격 (초). 입력 하나 = 한 걸음 */
export const STEP = 1 / 30;

/** 걷기·달리기 (m/s) — 실제보다 1.5배 (게임이 답답하지 않게) */
export const WALK = 2.1;
export const RUN = 7.2;
export const FLY = 12; // 날 때 수평 속도
export const FLY_RUN = 36;
export const LIFT = 10; // 오르내리는 속도
export const LIFT_RUN = 30;
export const MAX_ALT = 500;
/** 날 수 없으면 떨어진다 (m/s², 게임이라 실제보다 조금 세게) */
export const GRAVITY = 20;
/** 점프: 날 수 없을 때 위(Space·▲)를 누르면 이 속도로 뛰어오른다 (약 1m) */
export const JUMP_V = 6.4;
export const RADIUS = 0.28;
/** 엘리베이터: 누르고 있으면 이 간격마다 한 층 (초) */
export const LIFT_WAIT = 0.6;

/** 한 걸음 입력: 이동 방향은 월드 기준(카메라 회전은 클라이언트가 이미 반영), 길이 0~1 */
export interface Input {
  mx: number;
  mz: number;
  run: boolean;
  /** 위(+1)·아래(-1)·정지(0) */
  lift: number;
  /** 보는 방향(라디안, 몸 방향 f와 같은 기준). 있으면 이동과 상관없이 몸이 이쪽을 본다 (1인칭·조준) */
  face?: number;
}

/** 시뮬레이션 상태 — 서버와 클라이언트가 똑같이 들고 있어야 하는 값 전부 */
export interface Body {
  x: number;
  y: number;
  z: number;
  /** 바라보는 방향 */
  f: number;
  /** 부드럽게 따라가는 현재 속도 */
  spd: number;
  /** 마지막 걸음에서 실제로 움직인 수평 속도 (걷는 애니메이션용) */
  a: number;
  /** 들어가 있는 건물 번호 (-1 = 실외)와 층 */
  b: number;
  l: number;
  /** 엘리베이터 다음 층까지 남은 시간 */
  lw: number;
  /** 날 수 있는지 (로켓슈트, 개발용 허용) 1/0 */
  fly: number;
  /** 떨어지는 속도 (m/s, 아래가 음수) */
  vy: number;
  /** 속도 배율: 땅(걷기·달리기)과 비행 — 게임 모드가 정한다 (예: 신발·로켓슈트). 기본 1 */
  sm: number;
  fm: number;
}

export interface SimWorld {
  data: WorldData;
  collision: Collision;
  indoors: IndoorGrid[];
  /** 건물 번호 → 실내 */
  byBid: Map<number, IndoorGrid>;
}

export function createSimWorld(data:WorldData):SimWorld {
  const indoors = createIndoorGrids(data);
  return { data, collision: new Collision(data), indoors, byBid: new Map(indoors.map((g) => [ g.bid, g ])) };
}

export const newBody = (x:number, y:number, z:number):Body => ({ x, y, z, f: 0, spd: 0, a: 0, b: -1, l: 1, lw: 0, fly: 0, vy: 0, sm: 1, fm: 1 });

export const copyBody = (b:Body):Body => ({ ...b });

/** 지금 상태를 화면·판정에 쓸 말로 풀어 준다 */
export function describe(w:SimWorld, b:Body) {
  const room = b.b >= 0 ? w.byBid.get(b.b) : undefined;
  if (room) return { room, floor: room.baseY(b.l), flying: false, cab: room.cabAt(b.x, b.z) };
  const floor = w.collision.floorAt(b.x, b.z, b.y);
  return { room: undefined, floor, flying: b.y - floor > 0.5 && b.fly === 1, cab: -1 };
}

/** 한 걸음 (STEP초). b를 바꾼다 */
export function step(w:SimWorld, b:Body, input:Input) {
  const dt = STEP;
  const { collision } = w;
  let room = b.b >= 0 ? w.byBid.get(b.b) : undefined;
  const len = Math.min(1, Math.hypot(input.mx, input.mz));
  const lift = Math.sign(input.lift);
  const faceLock = input.face !== undefined && Number.isFinite(input.face);
  if (faceLock) b.f = input.face!;

  // 높이: 실내는 엘리베이터 칸에서만 층 이동.
  // 실외는 날 수 있으면 누르는 동안 오르내리고 놓으면 그 높이에 떠 있고, 날 수 없으면 바닥까지 떨어진다
  let floor = 0;
  if (room) {
    const cab = room.cabAt(b.x, b.z);
    b.lw = Math.max(0, b.lw - dt);
    if (!lift) b.lw = 0;
    else if (cab >= 0 && b.lw <= 0) {
      b.l = Math.max(1, Math.min(room.levels, b.l + lift));
      b.lw = LIFT_WAIT;
    }
    floor = room.baseY(b.l);
    b.y = floor;
  } else {
    b.lw = 0;
    const prevY = b.y;
    if (b.fly) {
      b.vy = 0;
      if (lift) b.y = Math.min(MAX_ALT, b.y + lift * (input.run ? LIFT_RUN : LIFT) * b.fm * dt);
    } else {
      // 땅·지붕에 서 있을 때(떨어지는 중이 아님) 위를 누르면 점프
      if (lift > 0 && b.vy === 0) b.vy = JUMP_V;
      b.vy -= GRAVITY * dt;
      b.y += b.vy * dt;
    }
    // 빨리 내려오면 한 걸음에 지붕을 지나칠 수 있어 움직이기 전 높이로 바닥을 찾는다
    floor = collision.floorAt(b.x, b.z, Math.max(prevY, b.y));
    if (b.y <= floor) {
      b.y = floor;
      b.vy = 0;
    }
  }
  const grounded = !room && floor === 0 && b.y < 0.05;
  const flying = !room && b.fly === 1 && b.y - floor > 0.5;

  // 이동: 걷기↔달리기가 툭 끊기지 않게 속도를 부드럽게 따라간다
  const speeds = flying ? [ FLY * b.fm, FLY_RUN * b.fm ] : [ WALK * b.sm, RUN * b.sm ];
  const top = speeds[input.run ? 1 : 0];
  const want = len > 0.05 ? len * top : 0;
  b.spd += (want - b.spd) * (1 - Math.exp(-dt * 6));
  b.a = 0;
  if (len <= 0.05) {
    b.spd = 0;
    return;
  }
  const dx = input.mx / (Math.hypot(input.mx, input.mz) || 1);
  const dz = input.mz / (Math.hypot(input.mx, input.mz) || 1);
  const mx = dx * b.spd * dt;
  const mz = dz * b.spd * dt;
  let next:{ x: number; z: number; };
  if (room) {
    next = room.move(b.l, b.x, b.z, mx, mz, RADIUS);
    // 문으로 나가면 바깥 세상으로: 바깥 충돌 칸에 걸리지 않을 때까지 밀어 낸다
    if (room.isOutside(b.l, next.x, next.z)) {
      room = undefined;
      b.b = -1;
      b.l = 1;
      for (let k = 0; k < 15 && collision.blocked(next.x, next.z, RADIUS); k++) next = { x: next.x + dx * 0.2, z: next.z + dz * 0.2 };
    }
  } else {
    // 바깥 충돌 격자는 1m 칸이라 외벽보다 조금 앞에서 멈춘다 → 문은 1.2m 앞을 보고 판정
    const ahead = { x: b.x + dx * 1.2, z: b.z + dz * 1.2 };
    const door = grounded ? w.indoors.find((g) => g.entersAt(ahead.x, ahead.z)) : undefined;
    if (door) {
      b.b = door.bid;
      b.l = 1;
      b.y = 0;
      next = ahead;
    } else next = collision.move(b.x, b.z, mx, mz, RADIUS, grounded ? 0 : b.y);
  }
  b.a = flying ? 0 : Math.min(b.spd, Math.hypot(next.x - b.x, next.z - b.z) / dt);
  b.x = next.x;
  b.z = next.z;
  if (faceLock) return;
  const turn = Math.atan2(dx, dz);
  const diff = Math.atan2(Math.sin(turn - b.f), Math.cos(turn - b.f));
  b.f += diff * (1 - Math.exp(-dt * 14));
}

/** 같은 시작 상태에서 같은 결과가 나오는지 비교할 때 쓰는 오차 */
export const bodyError = (a:Body, c:Body) => Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z) + (a.b !== c.b || a.l !== c.l ? 1000 : 0);