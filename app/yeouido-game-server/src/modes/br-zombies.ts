/* eslint-disable no-bitwise -- 상태 비트 */
import { hpGauge, RUNNER_RATE, ST_BURN, ST_DEAD, ST_FROZEN, ST_HURT, ST_SWING, Z_FORGET_MS, Z_RUNNER, Z_SIGHT, Z_WALKER, ZOMBIES } from 'yeouido-br';
import { BLOCK, Body, newBody } from 'yeouido-sim';

import { ModeHost, ModeNpc, ModePlayer } from '../mode';

/** 사람마다 근처(NEAR_R m)에 이만큼 있게 채운다 */
const PER_PLAYER = 8;
const NEAR_R = 50;
/** 전체 상한 (서버 비용) */
const MAX_ZOMBIES = 350;
/** 채우는 간격 (ms)·한 번에 사람마다 최대 마리, 생기자마자 그 사람을 쫓는 비율 */
const SPAWN_EVERY_MS = 1200;
const SPAWN_AT_ONCE = 2;
const HUNT_RATE = 0.3;
/** 사람이 이보다 멀면 치운다 (m) */
const DESPAWN_R = 120;
/** 생각(목표 찾기) 간격 (ms) */
const THINK_MS = 250;
/** 불타 사라지는 데 걸리는 시간 (ms) */
const BURN_MS = 2000;
/** 쓰러진 뒤 치우기까지 (클라이언트가 숨김 상태를 받을 시간, ms) */
const DEAD_MS = 600;
/** 맞은 표시 (ms) */
const HURT_MS = 250;
/** 때리는 동작 (ms) */
const SWING_MS = 400;

interface Zed {
  npc: ModeNpc;
  hp: number;
  /** 쫓는 사람 */
  target: ModePlayer | null;
  /** 쫓던 사람이 시야 밖으로 나간 시각 (보이면 0) */
  lostAt: number;
  /** 가장 가까운 사람 쪽 방향 (시야 밖이어도 어슬렁거리며 그쪽으로 끌려간다), 없으면 NaN */
  smell: number;
  thinkAt: number;
  attackAt: number;
  wander: number;
  wanderAt: number;
  burnAt: number;
  deadAt: number;
  swingUntil: number;
  hurtUntil: number;
}

/** 같은 공간인지 (실외끼리 높이 차 2.5m 안, 실내는 같은 건물·층) */
const sameSpace = (a:Body, b:Body) => a.b === b.b && (a.b >= 0 ? a.l === b.l : Math.abs(a.y - b.y) <= 2.5);

export interface HordeHooks {
  /** 이 사람을 노려도 되는지 (살아 있음) */
  alive(p:ModePlayer): boolean;
  /** 좀비가 사람을 때림 */
  bite(p:ModePlayer, dmg:number, now:number): void;
  /** 사람이 좀비를 쓰러뜨림 (쓰러진 자리·모습 종류) */
  killed(at:Body, k:number, by:ModePlayer): void;
}

/**
 * 좀비 무리 (배틀로얄 모드): 밤에 사람 근처에 생기고, 보이면 쫓아가 때린다. 해가 뜨면 불타 사라진다.
 * 몸은 엔진 NPC (사람과 같은 이동·충돌), 생각은 여기서.
 */
export class Horde {

  private host:ModeHost;

  private hooks:HordeHooks;

  private zeds = new Map<number, Zed>();

  private spawnAt = 0;

  private wasNight = false;

  constructor(host:ModeHost, hooks:HordeHooks) {
    this.host = host;
    this.hooks = hooks;
  }

  get size() {
    return this.zeds.size;
  }

  clear() {
    this.zeds.forEach((z) => this.host.removeNpc(z.npc.id));
    this.zeds.clear();
  }

  /** 총·화살로 맞힐 수 있는 좀비들 (pos: 되감은 자리를 줄 수 있다) */
  shotTargets(now:number, hitMsg:(by:ModePlayer, id:number, dmg:number, killed:boolean, head:boolean) => void, pos:(id:number, b:Body) => { x: number; y: number; z: number; } = (_, b) => b) {
    const out:{ id: number; x: number; y: number; z: number; b: number; l: number; hit: (dmg:number, by:ModePlayer, head?:boolean) => void; }[] = [];
    this.zeds.forEach((z) => {
      if (z.deadAt || z.burnAt) return;
      const { body } = z.npc;
      const at = pos(z.npc.id, body);
      out.push({
        id: z.npc.id,
        x: at.x,
        y: at.y,
        z: at.z,
        b: body.b,
        l: body.l,
        hit: (dmg, by, head) => {
          // 목록은 틱마다 한 번 만들므로 같은 틱에 먼저 쓰러졌으면 넘어간다 (두 번 처치되지 않게)
          if (z.deadAt || z.burnAt) return;
          const killed = this.hit(z, dmg, now, by);
          hitMsg(by, z.npc.id, dmg, killed, !!head);
        },
      });
    });
    return out;
  }

  /** 총소리: r m 안의 (쫓는 사람이 없는) 좀비가 쏜 사람에게 몰려온다 — 시야 밖이면 잊는 시간(Z_FORGET_MS)이 지나면 포기 */
  alert(at:Body, r:number, by:ModePlayer, now:number) {
    this.zeds.forEach((z) => {
      if (z.deadAt || z.burnAt || z.target) return;
      const b = z.npc.body;
      if (b.b !== at.b || (at.b >= 0 && b.l !== at.l) || Math.abs(b.x - at.x) > r || Math.abs(b.z - at.z) > r || Math.hypot(b.x - at.x, b.z - at.z) > r) return;
      z.target = by;
      z.lostAt = now;
    });
  }

  /** 근접 공격이 닿는 가장 가까운 좀비 */
  nearest(at:Body, reaches:(t:Body) => boolean) {
    let best:Zed | null = null;
    let bestD = Infinity;
    this.zeds.forEach((z) => {
      if (z.deadAt || z.burnAt) return;
      const b = z.npc.body;
      if (Math.abs(b.x - at.x) > 3 || Math.abs(b.z - at.z) > 3 || !reaches(b)) return;
      const d = Math.hypot(b.x - at.x, b.z - at.z);
      if (d < bestD) {
        best = z;
        bestD = d;
      }
    });
    return best as Zed | null;
  }

  /** 사람이 좀비를 침 (맞으면 때린 사람을 쫓는다). 쓰러지면 true */
  hit(z:Zed, dmg:number, now:number, by:ModePlayer) {
    z.hp = Math.max(0, z.hp - dmg);
    z.hurtUntil = now + HURT_MS;
    z.target = by;
    z.lostAt = 0;
    if (z.hp > 0) return false;
    z.deadAt = now;
    this.hooks.killed(z.npc.body, z.npc.k, by);
    return true;
  }

  tick(now:number, night:boolean, players:ModePlayer[]) {
    // 새벽: 모두 불탄다
    if (this.wasNight && !night) {
      this.zeds.forEach((z) => {
        if (!z.burnAt && !z.deadAt) z.burnAt = now;
      });
    }
    this.wasNight = night;
    if (night && now >= this.spawnAt) {
      this.spawnAt = now + SPAWN_EVERY_MS;
      this.spawn(players, now);
    }
    const alive = players.filter((p) => this.hooks.alive(p));
    const gone:number[] = [];
    this.zeds.forEach((z) => {
      const { npc } = z;
      const st = ZOMBIES[npc.k];
      if (z.deadAt) {
        if (now - z.deadAt > DEAD_MS) gone.push(npc.id);
        npc.st = ST_DEAD | ST_FROZEN;
        return;
      }
      if (z.burnAt) {
        if (now - z.burnAt > BURN_MS) z.deadAt = now;
        npc.st = ST_BURN | ST_FROZEN;
        npc.gv = hpGauge((z.hp / st.hp) * 100 * (1 - (now - z.burnAt) / BURN_MS));
        return;
      }
      if (now >= z.thinkAt) {
        z.thinkAt = now + THINK_MS;
        const inSight = (p:ModePlayer) => sameSpace(p.body, npc.body) && Math.hypot(p.body.x - npc.body.x, p.body.z - npc.body.z) <= Z_SIGHT;
        // 쫓는 중: 시야 밖으로 나가면 시계를 재고, 5초 넘으면 포기 (그동안은 계속 따라간다)
        if (z.target) {
          if (!this.hooks.alive(z.target)) z.target = null;
          else if (inSight(z.target)) z.lostAt = 0;
          else if (!z.lostAt) z.lostAt = now;
          else if (now - z.lostAt > Z_FORGET_MS) z.target = null;
        }
        let far = true;
        let best = Infinity;
        let seen:ModePlayer | null = null;
        let nearD = Infinity;
        z.smell = NaN;
        alive.forEach((p) => {
          const d = Math.hypot(p.body.x - npc.body.x, p.body.z - npc.body.z);
          if (d < DESPAWN_R) far = false;
          if (d < nearD && sameSpace(p.body, npc.body)) {
            nearD = d;
            z.smell = Math.atan2(p.body.x - npc.body.x, p.body.z - npc.body.z);
          }
          if (!z.target && d < best && inSight(p)) {
            best = d;
            seen = p;
          }
        });
        // 쫓는 사람이 없으면 시야 원 안에서 가장 가까운 사람
        if (!z.target && seen) {
          z.target = seen;
          z.lostAt = 0;
        }
        // 근처에 아무도 없으면 치운다 (사람 근처에서만 유지)
        if (far) z.deadAt = now;
      }
      // 따라가는 동안은 층·높이가 달라져도 쫓는다 (계단·문을 따라가진 못하니 같은 공간일 때만 실제로 다가간다)
      const t = z.target && sameSpace(z.target.body, npc.body) ? z.target : null;
      if (t) {
        const dx = t.body.x - npc.body.x;
        const dz = t.body.z - npc.body.z;
        const d = Math.hypot(dx, dz);
        npc.input.face = Math.round(Math.atan2(dx, dz) * 10000) / 10000;
        npc.body.sm = st.chaseMul;
        if (d > st.reach) {
          npc.input.mx = dx / d;
          npc.input.mz = dz / d;
          npc.input.run = st.chaseRun;
        } else {
          npc.input.mx = 0;
          npc.input.mz = 0;
          if (now >= z.attackAt) {
            z.attackAt = now + st.cooldownMs;
            z.swingUntil = now + SWING_MS;
            this.hooks.bite(t, st.damage, now);
          }
        }
      } else {
        // 어슬렁: 몇 초마다 방향을 바꿔 천천히. 대개는 가까운 사람 쪽(±45°)으로 끌려가 언젠가 시야에 들어온다
        if (now >= z.wanderAt) {
          z.wanderAt = now + 3000 + Math.random() * 3000;
          const r = Math.random();
          if (r < 0.15) z.wander = NaN;
          else if (r < 0.6 && !Number.isNaN(z.smell)) z.wander = z.smell + (Math.random() - 0.5) * ((Math.PI * 2) / 3);
          else z.wander = Math.random() * Math.PI * 2;
        }
        npc.input.face = undefined;
        npc.input.run = false;
        npc.body.sm = st.wanderMul;
        npc.input.mx = Number.isNaN(z.wander) ? 0 : Math.sin(z.wander);
        npc.input.mz = Number.isNaN(z.wander) ? 0 : Math.cos(z.wander);
      }
      npc.st = (now < z.swingUntil ? ST_SWING : 0) | (now < z.hurtUntil ? ST_HURT : 0);
      npc.gv = hpGauge((z.hp / st.hp) * 100);
    });
    gone.forEach((id) => {
      this.zeds.delete(id);
      this.host.removeNpc(id);
    });
  }

  /** 밤: 살아 있는 사람마다 근처에 PER_PLAYER만큼 (실내면 같은 층, 옥상이면 같은 옥상, 아니면 20~45m 바깥 땅) */
  private spawn(players:ModePlayer[], now:number) {
    players.forEach((p) => {
      if (this.zeds.size >= MAX_ZOMBIES || !this.hooks.alive(p)) return;
      let near = 0;
      this.zeds.forEach((z) => {
        if (!z.deadAt && !z.burnAt && Math.hypot(z.npc.body.x - p.body.x, z.npc.body.z - p.body.z) < NEAR_R) near++;
      });
      // 한 번에 조금씩 (몰려서 생기지 않게), 일부는 생기자마자 이 사람을 쫓는다
      const want = Math.min(SPAWN_AT_ONCE, PER_PLAYER - near, MAX_ZOMBIES - this.zeds.size);
      for (let i = 0; i < want; i++) {
        const body = this.spot(p.body);
        const z = body ? this.add(body, now) : null;
        if (z && Math.random() < HUNT_RATE) {
          z.target = p;
          z.lostAt = now;
        }
      }
    });
  }

  /** (x, z) 둘레 4~10m 땅에 n마리 (보스가 부름) — 불려 온 좀비는 바로 가장 가까운 산 사람을 쫓는다 */
  summon(x:number, z:number, n:number, now:number) {
    const { collision } = this.host.sim;
    let made = 0;
    let hunt:ModePlayer | null = null;
    let best = Infinity;
    [ ...this.host.players() ].forEach((p) => {
      const d = Math.hypot(p.body.x - x, p.body.z - z);
      if (this.hooks.alive(p) && p.body.b < 0 && d < best) {
        best = d;
        hunt = p;
      }
    });
    for (let i = 0; i < n * 10 && made < n && this.zeds.size < MAX_ZOMBIES; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 4 + Math.random() * 6;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      if (collision.floorAt(px, pz, 1e4) === 0 && collision.at(px, pz) !== BLOCK.WATER && !collision.blocked(px, pz, 0.4)) {
        const zed = this.add(newBody(px, 0, pz), now);
        if (hunt) {
          zed.target = hunt;
          zed.lostAt = now;
        }
        made++;
      }
    }
  }

  private add(body:Body, now:number) {
    const k = Math.random() < RUNNER_RATE ? Z_RUNNER : Z_WALKER;
    body.f = Math.random() * Math.PI * 2;
    const npc = this.host.addNpc(k, body);
    const z:Zed = { npc, hp: ZOMBIES[k].hp, target: null, lostAt: 0, smell: NaN, thinkAt: now, attackAt: now + 1000, wander: 0, wanderAt: 0, burnAt: 0, deadAt: 0, swingUntil: 0, hurtUntil: 0 };
    this.zeds.set(npc.id, z);
    return z;
  }

  /** 사람 근처 좀비 자리 */
  private spot(at:Body):Body | null {
    const { sim } = this.host;
    const { collision } = sim;
    // 실내: 같은 건물·층, 8m 이상 떨어진 빈칸
    if (at.b >= 0) {
      const g = sim.byBid.get(at.b);
      if (!g) return null;
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 8 + Math.random() * 22;
        const x = at.x + Math.cos(a) * d;
        const z = at.z + Math.sin(a) * d;
        if (g.contains(x, z) && g.cell(at.l, x, z) === 0 && !g.isOutside(at.l, x, z)) {
          const b = newBody(x, g.baseY(at.l), z);
          b.b = at.b;
          b.l = at.l;
          return b;
        }
      }
      return null;
    }
    const floor = collision.floorAt(at.x, at.z, at.y + 0.5);
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      // 옥상이면 같은 옥상 위 8~25m, 땅이면 30~60m (넓게 흩어 생기게)
      const onRoof = floor > 1;
      const d = onRoof ? 8 + Math.random() * 17 : 30 + Math.random() * 30;
      const x = at.x + Math.cos(a) * d;
      const z = at.z + Math.sin(a) * d;
      if (Math.abs(x) > sim.data.half.w - 5 || Math.abs(z) > sim.data.half.d - 5) continue; // eslint-disable-line no-continue
      const f = collision.floorAt(x, z, 1e4);
      if (onRoof ? Math.abs(f - floor) < 0.3 : f === 0 && collision.at(x, z) !== BLOCK.WATER && !collision.blocked(x, z, 0.4)) return newBody(x, f, z);
    }
    return null;
  }

}