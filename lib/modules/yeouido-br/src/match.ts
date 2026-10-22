/* eslint-disable no-continue -- 무작위 자리 찾기 반복문 */
import { BLOCK, SimWorld } from 'yeouido-sim';

/**
 * 한 판의 일정과 무작위 시작 위치 (서버가 원을 정하고, 클라이언트는 같은 함수로 지금 원을 계산한다).
 * 20분, 10단계: 단계마다 앞 절반은 멈춰 있고 뒤 절반에 다음 원으로 줄어든다.
 */

export const MATCH_MS = 20 * 60 * 1000;
export const STAGES = 10;
export const STAGE_MS = MATCH_MS / STAGES;
/** 최종 원 반경 (m) */
export const FINAL_R = 300;

export interface Circle {
  cx: number; cz: number; r: number;
}

/** 판 정보: circles[0]은 처음 원(섬 전체), circles[k]는 k단계가 끝났을 때의 원 */
export interface MatchPlan {
  id: number; circles: Circle[];
}

export interface ZoneNow extends Circle {
  /** 지금 단계 (1~10, 끝나면 11) */
  stage: number;
  /** 줄어드는 중인지 */
  shrinking: boolean;
  /** 다음 원 (마지막 단계 뒤에는 지금 원) */
  next: Circle;
  /** 다음 변화까지 남은 시간 (ms): 멈춰 있으면 줄기 시작까지, 줄고 있으면 다 줄 때까지 */
  untilChange: number;
  /** 판 끝까지 남은 시간 (ms) */
  remain: number;
}

/** 결정적 난수 (같은 seed면 같은 판) */
export function rng(seed:number) {
  let a = seed >>> 0; // eslint-disable-line no-bitwise
  return () => {
    /* eslint-disable no-bitwise */
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    /* eslint-enable no-bitwise */
  };
}

/**
 * 원 11개를 정한다: 처음은 섬 전체를 덮는 원, 반경은 FINAL_R까지 같은 비율로 줄고,
 * 다음 원 중심은 이전 원 안에 쏙 들어가는 자리 중 물이 아닌 곳.
 */
export function makeMatchPlan(sim:SimWorld, id:number, seed:number):MatchPlan {
  const rand = rng(seed);
  const { half } = sim.data;
  const r0 = Math.ceil(Math.hypot(half.w, half.d));
  const circles:Circle[] = [{ cx: 0, cz: 0, r: r0 }];
  for (let k = 1; k <= STAGES; k++) {
    const prev = circles[k - 1];
    const r = r0 * (FINAL_R / r0) ** (k / STAGES);
    let best:Circle = { cx: prev.cx, cz: prev.cz, r };
    for (let tries = 0; tries < 40; tries++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * (prev.r - r);
      const cx = prev.cx + Math.cos(a) * d;
      const cz = prev.cz + Math.sin(a) * d;
      // 지도 밖·물 위는 피한다 (원 중심 기준)
      if (Math.abs(cx) > half.w - 50 || Math.abs(cz) > half.d - 50) continue;
      if (sim.collision.at(cx, cz) === BLOCK.WATER) continue;
      best = { cx, cz, r };
      break;
    }
    circles.push(best);
  }
  return { id, circles };
}

const lerp = (a:number, b:number, t:number) => a + (b - a) * t;

/** 판이 시작된 지 elapsed ms일 때의 원 */
export function zoneAt(plan:MatchPlan, elapsed:number):ZoneNow {
  const { circles } = plan;
  if (elapsed >= MATCH_MS) {
    const last = circles[STAGES];
    return { ...last, stage: STAGES + 1, shrinking: false, next: last, untilChange: 0, remain: 0 };
  }
  const t = Math.max(0, elapsed);
  const k = Math.floor(t / STAGE_MS); // 0부터
  const inStage = t - k * STAGE_MS;
  const from = circles[k];
  const to = circles[k + 1];
  const hold = STAGE_MS / 2;
  const remain = MATCH_MS - t;
  if (inStage < hold) return { ...from, stage: k + 1, shrinking: false, next: to, untilChange: hold - inStage, remain };
  const p = (inStage - hold) / (STAGE_MS - hold);
  return { cx: lerp(from.cx, to.cx, p), cz: lerp(from.cz, to.cz, p), r: lerp(from.r, to.r, p), stage: k + 1, shrinking: true, next: to, untilChange: STAGE_MS - inStage, remain };
}

export const insideZone = (z:Circle, x:number, zz:number) => Math.hypot(x - z.cx, zz - z.cz) <= z.r;

/** 다시 시작까지 기다리는 시간: 1단계 5초, 단계마다 +5초 */
export const respawnDelay = (stage:number) => 5000 + 5000 * (Math.min(STAGES, Math.max(1, stage)) - 1);

/** 다시 시작 직후 무적 시간 (ms) */
export const SPAWN_SHIELD_MS = 5000;

export interface Spawn {
  x: number; y: number; z: number; b: number; l: number;
}

/** 실내가 있는 건물 g의 옥상 위 무작위 자리 (원 안이어야 하면 inZone) */
export function pickRoofOf(sim:SimWorld, g:SimWorld['indoors'][number], rand:() => number = Math.random, ok:(x:number, z:number) => boolean = () => true):Spawn | null {
  const { frame } = g.plan;
  for (let i = 0; i < 200; i++) {
    const u = (rand() - 0.5) * frame.L;
    const v = (rand() - 0.5) * frame.W;
    const x = frame.ox + frame.ux * u - frame.uz * v;
    const z = frame.oz + frame.uz * u + frame.ux * v;
    const h = sim.collision.floorAt(x, z, 1e4);
    if (g.contains(x, z) && ok(x, z) && h > 2) return { x, y: h, z, b: -1, l: 1 };
  }
  return null;
}

/**
 * 원 안의 무작위 시작 자리: 지상 70%, 옥상 15%, 실내 층 15% (실내가 원 안에 없으면 지상). 옥상·실내는 실내가 만들어진 건물(지금 5채)만
 */
/** share: 옥상·실내 비율 (사람 시작은 옥상 15%·실내 15%, 아이템·물건 흩뿌리기는 옥상이 좁아 3%만) */
export function pickSpawn(sim:SimWorld, zone:Circle, rand:() => number = Math.random, share:{ roof: number; indoor: number; } = { roof: 0.15, indoor: 0.15 }):Spawn {
  const { collision, data } = sim;
  const inZone = (x:number, z:number) => Math.hypot(x - zone.cx, z - zone.cz) <= zone.r * 0.95
    && Math.abs(x) < data.half.w - 5 && Math.abs(z) < data.half.d - 5;
  const randomIn = () => {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * zone.r * 0.95;
    return { x: zone.cx + Math.cos(a) * d, z: zone.cz + Math.sin(a) * d };
  };
  const ground = ():Spawn | null => {
    for (let i = 0; i < 200; i++) {
      const p = randomIn();
      if (inZone(p.x, p.z) && !collision.blocked(p.x, p.z, 0.6)) return { x: p.x, y: 0, z: p.z, b: -1, l: 1 };
    }
    return null;
  };
  // 옥상: 실내가 만들어진 건물 옥상만 (내부가 없는 건물 옥상에 서면 내려올 길이 없다)
  const roof = ():Spawn | null => {
    const tops = sim.indoors.filter((g) => inZone(g.plan.frame.ox, g.plan.frame.oz));
    if (!tops.length) return null;
    return pickRoofOf(sim, tops[Math.floor(rand() * tops.length)], rand, inZone);
  };
  const indoor = ():Spawn | null => {
    const rooms = sim.indoors.filter((g) => inZone(g.plan.frame.ox, g.plan.frame.oz));
    if (!rooms.length) return null;
    const g = rooms[Math.floor(rand() * rooms.length)];
    const level = 1 + Math.floor(rand() * g.levels);
    const { frame } = g.plan;
    for (let i = 0; i < 200; i++) {
      const u = (rand() - 0.5) * frame.L;
      const v = (rand() - 0.5) * frame.W;
      const x = frame.ox + frame.ux * u - frame.uz * v;
      const z = frame.oz + frame.uz * u + frame.ux * v;
      if (g.contains(x, z) && g.cell(level, x, z) === 0 && !g.isOutside(level, x, z)) return { x, y: g.baseY(level), z, b: g.bid, l: level };
    }
    return null;
  };
  const roll = rand();
  const first = roll < share.roof ? roof : roll < share.roof + share.indoor ? indoor : ground; // eslint-disable-line no-nested-ternary
  return first() ?? ground() ?? roof() ?? { x: zone.cx, y: 0, z: zone.cz, b: -1, l: 1 };
}