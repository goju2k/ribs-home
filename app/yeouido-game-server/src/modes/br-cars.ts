import { BrServerMsg } from 'yeouido-br';
import { BLOCK, CAR, carHitDamage, carPose, inCar, isRideable, RADIUS, VEHICLES, VehicleKind, VehiclePose } from 'yeouido-sim';

import { ModeHost, ModePlayer } from '../mode';

/** 친 상대 (사람·좀비): 자리와 맞히기 */
export interface CarVictim {
  id: number; x: number; z: number; b: number;
  hit: (dmg:number, by:ModePlayer) => void;
}

/**
 * 배틀로얄의 자동차: 길가에 주차된 승용차·SUV·택시 (판마다 원래 자리, 연료는 40~100% 10단위로 다시 뽑는다).
 * 연료는 달린 만큼 줄고 다시 차지 않는다 — 다 쓴 차는 "연료가 없어 탈 수 없다".
 * 운전 중에는 몸이 곧 차 (yeouido-sim carStep). 여기서는 타고 내리기·연료 기록·운전 중인 차 판정 상자 옮기기·친 것을 본다.
 */
export class CarPark {

  /** 탈 수 있는 차 (decor 번호, 클라이언트도 같은 순서로 만든다) */
  readonly ids:number[];

  /** decor 번호 → 남은 연료 (m) */
  private fuel = new Map<number, number>();

  /** 원래 자리에서 옮겨진 차의 지금 자리 */
  private moved = new Map<number, VehiclePose>();

  /** 운전 중: 사람 번호 → decor 번호 */
  private drivers = new Map<number, number>();

  private host:ModeHost;

  private broadcast:(m:BrServerMsg) => void;

  constructor(host:ModeHost, broadcast:(m:BrServerMsg) => void) {
    this.host = host;
    this.broadcast = broadcast;
    const { sim } = host;
    this.ids = sim.collision.decor.map((_, i) => i).filter((i) => isRideable(sim, i));
  }

  /** 새 판: 모두 원래 자리, 연료를 다시 뽑는다 (타고 있던 사람은 먼저 내려야 한다 — exitAll) */
  reset() {
    const { collision } = this.host.sim;
    this.moved.forEach((_, idx) => {
      const d = collision.decor[idx];
      collision.setVehicle(idx, { x: d.x, z: d.z, dx: d.dx, dz: d.dz });
    });
    this.moved.clear();
    this.ids.forEach((idx) => this.fuel.set(idx, ((4 + Math.floor(Math.random() * 7)) / 10) * CAR.fuelFull));
  }

  /** 들어올 때·새 판에 보낼 전부 */
  listMsg():BrServerMsg {
    const r2 = (n:number) => Math.round(n * 100) / 100;
    return {
      k: 'cars',
      fuel: this.ids.map((idx) => this.pct(idx)),
      moved: [ ...this.moved.entries() ].map(([ idx, p ]) => [ idx, r2(p.x), r2(p.z), r2(p.dx), r2(p.dz) ]),
      drivers: [ ...this.drivers.entries() ],
    };
  }

  private pct(idx:number) {
    return Math.ceil(((this.fuel.get(idx) ?? 0) / CAR.fuelFull) * 100);
  }

  driving(pid:number) {
    return this.drivers.has(pid);
  }

  /** 운전 중인 사람에게 (x, z)에서 reach m로 닿는지 (차 몸체 둘레 + 좀비 몸 반지름), 운전 중이 아니면 null */
  reaches(p:ModePlayer, x:number, z:number, reach:number) {
    const idx = this.drivers.get(p.id);
    if (idx === undefined) return null;
    const { body } = p;
    return inCar(this.host.sim.collision.decor[idx].k as VehicleKind, body.x, body.z, body.f, x, z, reach + RADIUS);
  }

  /** 타기 (가장 가까운 빈 차). 못 타면 까닭 */
  enter(p:ModePlayer):string | null {
    const { body } = p;
    if (body.b >= 0) return '실내에서는 차를 탈 수 없습니다';
    const busy = new Set(this.drivers.values());
    let best = -1;
    let bestD:number = CAR.enter;
    this.ids.forEach((idx) => {
      if (busy.has(idx)) return;
      const at = this.where(idx);
      const d = Math.hypot(at.x - body.x, at.z - body.z);
      if (d < bestD) {
        bestD = d;
        best = idx;
      }
    });
    if (best < 0) return null;
    const fuel = this.fuel.get(best) ?? 0;
    if (fuel <= 0) return '연료가 없어 탈 수 없습니다';
    const at = this.where(best);
    Object.assign(body, { x: at.x, y: 0, z: at.z, f: Math.atan2(at.dx, at.dz), spd: 0, vy: 0, a: 0, car: best, fuel });
    this.drivers.set(p.id, best);
    this.host.sim.collision.setVehicle(best, at, true);
    this.broadcast({ k: 'carIn', pid: p.id, idx: best });
    return '';
  }

  /** 내리기: 운전석 옆(왼쪽), 막혔으면 오른쪽·뒤·앞. 차는 그 자리에 선다 */
  exit(p:ModePlayer) {
    const idx = this.drivers.get(p.id);
    if (idx === undefined) return;
    const { body } = p;
    const { sim } = this.host;
    const d = sim.collision.decor[idx];
    const s = VEHICLES[d.k as VehicleKind];
    const pose = carPose(body.x, body.z, body.f);
    this.fuel.set(idx, body.fuel);
    this.moved.set(idx, pose);
    this.drivers.delete(p.id);
    sim.collision.setVehicle(idx, pose, false);
    // 왼쪽 = (cos f, -sin f)
    const lx = Math.cos(body.f);
    const lz = -Math.sin(body.f);
    const side = s.wid / 2 + 0.7;
    const end = s.len / 2 + 0.8;
    const spots:[number, number][] = [
      [ body.x + lx * side, body.z + lz * side ], [ body.x - lx * side, body.z - lz * side ],
      [ body.x - pose.dx * end, body.z - pose.dz * end ], [ body.x + pose.dx * end, body.z + pose.dz * end ],
    ];
    const free = spots.find(([ x, z ]) => sim.collision.at(x, z) === BLOCK.NONE && !sim.collision.blocked(x, z, RADIUS));
    const [ x, z ] = free ?? spots[0];
    Object.assign(body, { x, y: 0, z, spd: 0, vy: 0, a: 0, car: -1, fuel: 0 });
    const r2 = (n:number) => Math.round(n * 100) / 100;
    this.broadcast({ k: 'carOut', pid: p.id, idx, pose: [ r2(pose.x), r2(pose.z), r2(pose.dx), r2(pose.dz) ], fuel: this.pct(idx) });
  }

  /** 모두 내리게 (보스전·새 판) */
  exitAll() {
    [ ...this.drivers.keys() ].forEach((pid) => {
      const p = this.host.get(pid);
      if (p) this.exit(p);
      else this.drivers.delete(pid);
    });
  }

  /**
   * 틱마다: 운전 중인 차의 판정 상자를 몸 자리로 옮기고, 연료가 바닥나 멈추면 내린다.
   * 친 것: 차 몸체에 겹친 사람·좀비 — 가는 쪽 절반에 겹치면 — 시속 20km가 넘으면 피해, 속도와 상관없이 차가 선다
   */
  tick(victims:() => CarVictim[]) {
    if (!this.drivers.size) return;
    const { sim } = this.host;
    let list:CarVictim[] | null = null;
    [ ...this.drivers.entries() ].forEach(([ pid, idx ]) => {
      const p = this.host.get(pid);
      if (!p) {
        this.drivers.delete(pid);
        return;
      }
      const { body } = p;
      // 엔진이 몸을 차가 아니게 바꿨으면 (있으면 안 되지만) 정리
      if (body.car !== idx) {
        this.drivers.delete(pid);
        sim.collision.setVehicle(idx, carPose(body.x, body.z, body.f), false);
        return;
      }
      this.fuel.set(idx, body.fuel);
      sim.collision.setVehicle(idx, carPose(body.x, body.z, body.f), true);
      if (Math.abs(body.spd) > 0.3) {
        list ??= victims();
        const k = sim.collision.decor[idx].k as VehicleKind;
        // 가는 쪽 절반만 (옆·뒤에 붙은 좀비 때문에 차가 꼼짝 못 하지 않게)
        const dir = Math.sign(body.spd);
        const ahead = (v:CarVictim) => ((v.x - body.x) * Math.sin(body.f) + (v.z - body.z) * Math.cos(body.f)) * dir > 0;
        const hit = list.filter((v) => v.id !== pid && v.b < 0 && ahead(v) && inCar(k, body.x, body.z, body.f, v.x, v.z, 0.35));
        if (hit.length) {
          const dmg = carHitDamage(body.spd);
          if (dmg > 0) hit.forEach((v) => v.hit(dmg, p));
          body.spd = 0;
        }
      }
      if (body.fuel <= 0 && Math.abs(body.spd) < 0.3) {
        this.host.say('연료가 떨어져 차에서 내렸습니다', 'warn', p);
        this.exit(p);
      }
    });
  }

  /** decor 번호 차의 지금 자리 (옮겨졌으면 그 자리) */
  private where(idx:number):VehiclePose {
    const m = this.moved.get(idx);
    if (m) return m;
    const d = this.host.sim.collision.decor[idx];
    return { x: d.x, z: d.z, dx: d.dx, dz: d.dz };
  }

}