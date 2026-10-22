import type { Gear, ItemKind } from './items';

/**
 * 원거리 무기 6종 (게임성 측정용 PoC — 수치는 첫 감, 밸런싱은 뒤로 미룸).
 * 1인 1무기, 무기 없이 시작. 예비 탄약 무한(탄창·재장전은 있음). 같은 무기를 주우면 강화(+1~+10).
 * 화면·서버가 같은 걸음(seq)에서 같은 계산을 하도록 여기 순수 함수로만 둔다 (탄 퍼짐도 걸음 번호로 정해지는 의사 난수).
 */

export const WEAPON_KINDS = [ 'pistol', 'smg', 'rifle', 'shotgun', 'sniper', 'crossbow' ] as const;
export type WeaponKind = typeof WEAPON_KINDS[number];

export interface WeaponStats {
  /** 바로 맞음(총알) 또는 날아가는 투사체(석궁) */
  hitscan: boolean;
  /** 한 알 피해 (산탄은 알마다) */
  damage: number;
  /** 한 번에 나가는 알 수 */
  pellets: number;
  /** 강화 단계마다 더 나가는 알 수 (석궁 화살) */
  pelletsPerLv: number;
  /** 부채꼴 (라디안): 0이 아니면 알을 퍼뜨리지 않고 좌우로 이 간격씩 나란히 (가운데 기준) */
  fan: number;
  /** 탄 퍼짐: 원뿔 반각(라디안), 움직일 때 더함 */
  spread: number;
  moveSpread: number;
  /** 다음 발까지 (ms) */
  intervalMs: number;
  /** 탄창·재장전 (ms) */
  mag: number;
  reloadMs: number;
  /** 사거리 (m), 위력 감소: falloffFrom m부터 사거리 끝에서 falloffMin 배 */
  range: number;
  falloffFrom: number;
  falloffMin: number;
  /** 머리 맞으면 배율 */
  headMul: number;
  /** 투사체 속도 (m/s)·낙차 (m/s², 0이면 곧게) */
  speed: number;
  gravity: number;
  /** 들고 다닐 때 이동 속도 배율 (무게) */
  moveMul: number;
  /** 스코프 배율 (0 = 없음: 우클릭 바로 발사 / 있으면 우클릭 → 스코프, 다시 우클릭 → 발사, 좌클릭 → 취소) */
  scope: number;
  /** 소리가 닿는 거리 (m): 이 안의 좀비가 쏜 사람에게 몰려온다 (0 = 무소음) */
  noise: number;
}

type Base = Omit<WeaponStats, 'pellets' | 'pelletsPerLv' | 'fan' | 'speed' | 'gravity' | 'scope' | 'falloffFrom' | 'falloffMin'> & Partial<WeaponStats>;

const BASE:Record<WeaponKind, Base> = {
  // 권총: 가볍고 무난, 재장전 빠름 — 뭐든 어중간
  pistol: { hitscan: true, damage: 18, spread: 0.006, moveSpread: 0.012, intervalMs: 250, mag: 12, reloadMs: 1200, range: 40, headMul: 2, moveMul: 1, noise: 40 },
  // 기관단총: 근거리 순삭, 움직이며 쏴도 정확 — 멀면 약함, 시끄러움
  smg: { hitscan: true, damage: 9, spread: 0.02, moveSpread: 0.006, intervalMs: 83, mag: 30, reloadMs: 1800, range: 25, falloffFrom: 10, falloffMin: 0.5, headMul: 1.5, moveMul: 1, noise: 50 },
  // 돌격소총: 만능 — 움직이며 쏘면 퍼짐
  rifle: { hitscan: true, damage: 13, spread: 0.008, moveSpread: 0.03, intervalMs: 111, mag: 30, reloadMs: 2400, range: 70, falloffFrom: 40, falloffMin: 0.7, headMul: 2, moveMul: 0.92, noise: 60 },
  // 산탄총: 9알 원뿔, 붙으면 한 방 — 일반 좀비는 9m까지 거의 한 방(11m 93%), 멀면 약해진다
  shotgun: { hitscan: true, damage: 12, pellets: 9, spread: 0.07, moveSpread: 0, intervalMs: 900, mag: 6, reloadMs: 3000, range: 15, falloffFrom: 8, falloffMin: 0.5, headMul: 1.2, moveMul: 0.95, noise: 60 },
  // 저격소총: 스코프 ×4, 머리 한 방 — 무겁고, 빗나가면 끝, 멀리까지 소리
  sniper: { hitscan: true, damage: 90, spread: 0.001, moveSpread: 0.05, intervalMs: 1400, mag: 5, reloadMs: 3500, range: 250, headMul: 2, moveMul: 0.85, scope: 4, noise: 120 },
  // 석궁: 무소음(좀비가 안 몰림), 낙차 있는 화살 — 3발을 10도 간격 부채꼴로, 강화마다 2발씩 더 (7단계 15발 = 140도, 10단계 21발 = 200도)
  crossbow: { hitscan: false, damage: 70, pellets: 3, pelletsPerLv: 2, fan: Math.PI / 18, spread: 0.002, moveSpread: 0.01, intervalMs: 300, mag: 1, reloadMs: 1500, range: 90, speed: 60, gravity: 9.8, headMul: 1.5, moveMul: 0.95, noise: 0 },
};

/** 무기 + 강화 단계 → 수치 (단계마다 피해 +8%, 연사 간격 -3%, 재장전 -6%, 퍼짐 -5%) */
export function weaponStats(kind:WeaponKind, lv:number):WeaponStats {
  const b = BASE[kind];
  const k = Math.max(0, lv - 1);
  return {
    pelletsPerLv: 0,
    fan: 0,
    speed: 0,
    gravity: 0,
    scope: 0,
    falloffFrom: 0,
    falloffMin: 1,
    ...b,
    pellets: (b.pellets ?? 1) + (b.pelletsPerLv ?? 0) * k,
    damage: Math.round(b.damage * (1 + 0.08 * k)),
    intervalMs: Math.round(b.intervalMs * (1 - 0.03 * k)),
    reloadMs: Math.round(b.reloadMs * (1 - 0.06 * k)),
    spread: b.spread * (1 - 0.05 * k),
  } as WeaponStats;
}

export const isWeapon = (k:ItemKind):k is WeaponKind => (WEAPON_KINDS as readonly string[]).includes(k);

/** 들고 있는 무기 (없으면 null) */
export const heldWeapon = (g:Gear):WeaponKind | null => WEAPON_KINDS.find((k) => g[k] > 0) ?? null;

/** 거리 d(m)에서 위력 배율 */
export function falloff(st:WeaponStats, d:number) {
  if (!st.falloffFrom || d <= st.falloffFrom) return 1;
  const t = Math.min(1, (d - st.falloffFrom) / Math.max(1, st.range - st.falloffFrom));
  return 1 + (st.falloffMin - 1) * t;
}

/** 걸음 수로 (재장전·연사 간격 — 화면·서버 같은 셈) */
export const msToSteps = (ms:number, stepSec:number) => Math.max(1, Math.round(ms / 1000 / stepSec));

/** 탄창 상태: 남은 탄, 다음에 쏠 수 있는 걸음, 재장전 중인지 (재장전이 끝나는 걸음 = nextSeq) */
export interface FireState {
  ammo: number; nextSeq: number; reloading: boolean;
}

export const fullMag = (st:WeaponStats):FireState => ({ ammo: st.mag, nextSeq: 0, reloading: false });

/** 이 걸음의 남은 탄 (재장전이 끝났으면 가득) */
export const ammoAt = (fs:FireState, st:WeaponStats, seq:number) => (fs.reloading && seq >= fs.nextSeq ? st.mag : fs.ammo);

/** 이 걸음에 쏠 수 있나 */
export const canFire = (fs:FireState, seq:number) => seq >= fs.nextSeq;

/** 쏜다 (canFire일 때만): 탄 하나, 다음 발까지 — 비면 바로 재장전 */
export function fire(fs:FireState, st:WeaponStats, seq:number, stepSec:number) {
  // 쉬지 않고 이어 쏘면(쏠 수 있게 된 바로 그 걸음) 걸음 단위로 못 채운 자투리를 다음 발로 넘긴다
  // → 걸음이 굵어도(30Hz = 33ms) 평균 연사 속도·강화 차이가 그대로 (예: 83ms면 2·3걸음을 번갈아)
  const base = !fs.reloading && seq - fs.nextSeq < 1 ? fs.nextSeq : seq;
  if (fs.reloading) {
    fs.reloading = false;
    fs.ammo = st.mag;
  }
  fs.ammo -= 1;
  if (fs.ammo <= 0) {
    fs.ammo = 0;
    fs.reloading = true;
    fs.nextSeq = seq + msToSteps(st.reloadMs, stepSec);
  } else fs.nextSeq = base + Math.max(1, st.intervalMs / 1000 / stepSec);
}

/** 손으로 재장전 (R): 탄이 덜 찼고 재장전 중이 아니면. 시작했으면 true */
export function reload(fs:FireState, st:WeaponStats, seq:number, stepSec:number) {
  if (fs.reloading || ammoAt(fs, st, seq) >= st.mag) return false;
  fs.reloading = true;
  fs.nextSeq = Math.max(fs.nextSeq, seq) + msToSteps(st.reloadMs, stepSec);
  return true;
}

/** 걸음 번호·알 번호로 정해지는 0~1 의사 난수 (화면·서버가 같은 퍼짐을 그린다) */
function hash01(seq:number, i:number, salt:number) {
  let h = (seq * 374761393 + i * 668265263 + salt * 2147483647) | 0; // eslint-disable-line no-bitwise
  h = Math.imul(h ^ (h >>> 13), 1274126177); // eslint-disable-line no-bitwise
  h ^= h >>> 16; // eslint-disable-line no-bitwise
  return (h >>> 0) / 4294967296; // eslint-disable-line no-bitwise
}

/**
 * 한 번 쏠 때 알마다의 방향 (길이 1). face·pitch = 조준(+pitch 아래), moving = 이 걸음에 움직이는 중.
 * 원뿔 안에 고르게 (반지름은 √u로 퍼뜨린다)
 */
export function shotDirs(st:WeaponStats, face:number, pitch:number, seq:number, moving:boolean):[number, number, number][] {
  const cone = st.spread + (moving ? st.moveSpread : 0);
  const out:[number, number, number][] = [];
  for (let i = 0; i < st.pellets; i++) {
    const r = Math.sqrt(hash01(seq, i, 1)) * cone;
    const a = hash01(seq, i, 2) * Math.PI * 2;
    // 부채꼴이면 알마다 좌우로 fan씩 (가운데가 조준선), 그 위에 작은 퍼짐
    const f = face + (st.fan ? (i - (st.pellets - 1) / 2) * st.fan : 0) + Math.cos(a) * r;
    const p = pitch + Math.sin(a) * r;
    const c = Math.cos(p);
    out.push([ Math.sin(f) * c, -Math.sin(p), Math.cos(f) * c ]);
  }
  return out;
}

/** 움직이는 중으로 볼 속도 (m/s) */
export const MOVING_SPEED = 1;