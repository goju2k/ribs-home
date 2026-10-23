import type { Body, Input, SimWorld } from './body';
import { isVehicle, VEHICLES, VehicleKind } from './decor';
import { BLOCK } from './world-data';

/**
 * 자동차 (서버·클라이언트 공용 — 운전도 몸 시뮬레이션의 한 모드라 클라이언트가 똑같이 예측한다).
 * 길가에 주차된 승용차·SUV·택시를 탈 수 있다 (버스는 못 탄다). 타면 몸이 곧 차: 입력의 이동 방향을 차 기준 앞뒤(가속·브레이크·후진)·좌우(핸들)로 읽는다.
 * 건물·다른 차·엄폐물·물에 부딪히면 그 자리에 선다. 사람·좀비를 친 것은 서버(모드)가 따로 본다.
 * 연료는 달린 거리만큼 줄고 다시 차지 않는다. 100%면 여의도(한 바퀴 약 8km)를 두 바퀴.
 */
export const CAR = {
  /** 후진 최고 속도 (m/s — 시속 15km). 앞 최고 속도·가속은 차 종류마다 (CAR_KINDS) */
  reverse: 4.2,
  /** 브레이크·손 놓으면 줄어드는 정도 (m/s²) */
  brake: 11,
  coast: 2,
  /** 핸들 끝까지 돌렸을 때 도는 빠르기 (rad/s, 시속 18km 이상에서 다 돈다 — 시속 80km면 반지름 약 15m) */
  yaw: 1.5,
  /** 연료 100% (m) */
  fuelFull: 16000,
  /** 타고 내리는 거리 (차 가운데에서, m) */
  enter: 3.2,
} as const;

export const RIDEABLE:readonly VehicleKind[] = [ 'sedan', 'suv', 'taxi' ];

/** 차 종류마다: 최고 속도 (m/s)·가속 (m/s²) — 승용차·택시 시속 80km, 큰 차(SUV)는 무거워 시속 70km에 가속도 느리다 */
export const CAR_KINDS:Record<'sedan' | 'suv' | 'taxi', { max: number; accel: number; }> = {
  sedan: { max: 22.2, accel: 6.5 },
  taxi: { max: 22.2, accel: 6.5 },
  suv: { max: 19.4, accel: 5 },
};

/** 한 걸음 안에서 이보다 길게 움직이면 나눠서 본다 (m — 얇은 방호벽 0.6m를 건너뛰어 통과하지 않게) */
const SUB_STEP = 0.35;

/** 이 장식 번호의 차를 탈 수 있는지 (승용차·SUV·택시) */
export const isRideable = (w:SimWorld, idx:number) => {
  const d = w.collision.decor[idx];
  return !!d && isVehicle(d.k) && RIDEABLE.includes(d.k);
};

/** 차 자리·방향(f)에서 몸체 둘레 점들 (모서리·앞뒤·옆 가운데) */
function hull(k:VehicleKind, x:number, z:number, f:number) {
  const s = VEHICLES[k];
  const fx = Math.sin(f);
  const fz = Math.cos(f);
  const hl = s.len / 2;
  const hw = s.wid / 2;
  const pts:[number, number][] = [];
  [ -1, -0.5, 0, 0.5, 1 ].forEach((a) => [ -1, 1 ].forEach((c) => pts.push([ x + fx * hl * a - fz * hw * c, z + fz * hl * a + fx * hw * c ])));
  return pts;
}

/** 차가 이 자리·방향에 있을 수 있는지 (건물·물·막는 상자 — 0.5m 높이에서, 자기 차 상자는 빼고) */
export function carFits(w:SimWorld, idx:number, k:VehicleKind, x:number, z:number, f:number) {
  const { collision } = w;
  return hull(k, x, z, f).every(([ px, pz ]) => collision.at(px, pz) === BLOCK.NONE && !collision.blocked(px, pz, 0, 0.5, idx));
}

/** 차 자리·방향(f) → 판정·화면용 자세 */
export const carPose = (x:number, z:number, f:number) => ({ x, z, dx: Math.sin(f), dz: Math.cos(f) });

/** 차로 친 피해: 시속 HIT_KMH 이하는 피해 없이 차만 선다, 넘으면 시속 × HIT_PER_KMH (시속 50km = 60) */
export const HIT_KMH = 20;
export const HIT_PER_KMH = 1.2;
export const carHitDamage = (spd:number) => {
  const kmh = Math.abs(spd) * 3.6;
  return kmh > HIT_KMH ? Math.round(kmh * HIT_PER_KMH) : 0;
};

/** (x, z)가 차 몸체(여유 pad m 포함) 안인지 */
export function inCar(k:VehicleKind, cx:number, cz:number, f:number, x:number, z:number, pad:number) {
  const s = VEHICLES[k];
  const rx = x - cx;
  const rz = z - cz;
  const fx = Math.sin(f);
  const fz = Math.cos(f);
  return Math.abs(rx * fx + rz * fz) <= s.len / 2 + pad && Math.abs(-rx * fz + rz * fx) <= s.wid / 2 + pad;
}

/** 운전 한 걸음 */
export function carStep(w:SimWorld, b:Body, input:Input) {
  const dt = 1 / 30;
  const d = w.collision.decor[b.car];
  if (!d || !isVehicle(d.k)) {
    b.car = -1;
    return;
  }
  const fx = Math.sin(b.f);
  const fz = Math.cos(b.f);
  // 차 기준 앞(+)·뒤(-), 오른쪽(+)·왼쪽(-): 오른쪽 = (-cos f, sin f)
  let throttle = input.mx * fx + input.mz * fz;
  const steer = input.mx * -Math.cos(b.f) + input.mz * Math.sin(b.f);
  if (b.fuel <= 0) throttle = 0;
  let v = b.spd;
  const spec = CAR_KINDS[d.k as keyof typeof CAR_KINDS] ?? CAR_KINDS.sedan;
  if (throttle > 0.1) v = v < 0 ? Math.min(0, v + CAR.brake * throttle * dt) : Math.min(spec.max, v + spec.accel * throttle * dt);
  else if (throttle < -0.1) v = v > 0 ? Math.max(0, v + CAR.brake * throttle * dt) : Math.max(-CAR.reverse, v + spec.accel * 0.6 * throttle * dt);
  // 손을 놓으면 천천히, 연료가 떨어지면 엔진 브레이크로 빨리 선다 (시속 50km에서 약 2초)
  else v = Math.sign(v) * Math.max(0, Math.abs(v) - (b.fuel <= 0 ? CAR.brake * 0.6 : CAR.coast) * dt);
  // 핸들: 오른쪽으로 돌면 f가 줄어든다. 느릴수록 덜 돌고, 뒤로 가면 반대로
  const turn = -steer * CAR.yaw * Math.min(1, Math.abs(v) / 5) * Math.sign(v) * dt;
  let f = b.f + turn;
  if (turn && !carFits(w, b.car, d.k, b.x, b.z, f)) f = b.f;
  // 빠를 때는 몇 조각으로 나눠 가며 본다 — 막히면 막히기 직전 조각까지 가고 선다
  const n = Math.max(1, Math.ceil((Math.abs(v) * dt) / SUB_STEP));
  for (let i = 0; i < n && v !== 0; i++) {
    const nx = b.x + (Math.sin(f) * v * dt) / n;
    const nz = b.z + (Math.cos(f) * v * dt) / n;
    if (carFits(w, b.car, d.k, nx, nz, f)) {
      b.fuel = Math.max(0, b.fuel - (Math.abs(v) * dt) / n);
      b.x = nx;
      b.z = nz;
    } else v = 0;
  }
  b.f = Math.atan2(Math.sin(f), Math.cos(f));
  b.spd = v;
  b.a = 0;
  b.y = 0;
  b.vy = 0;
}