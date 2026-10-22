/* eslint-disable no-bitwise -- 상태 비트 */
import { BALL, BOSS, bossHp, BrServerMsg, Circle, Difficulty, hpGauge, meleeReaches, ST_DEAD, ST_FROZEN, ST_HURT, ST_SLAM, ST_SWING, Z_BOSS } from 'yeouido-br';
import { SIM_HZ } from 'yeouido-net';
import { BLOCK, Body, castRay, newBody } from 'yeouido-sim';

import type { ShotTarget } from './br-shots';

import { ModeHost, ModeNpc, ModePlayer } from '../mode';

/** 맞은 표시 (ms) */
const HURT_MS = 200;
/** 내려치는 동작 (ms) */
const SWING_MS = 500;

export interface BossHooks {
  alive(p:ModePlayer): boolean;
  /** 보스가 사람을 때림 (갑옷·무적은 받는 쪽에서) */
  hurt(p:ModePlayer, dmg:number, now:number): void;
  /** 좀비 부르기 */
  summon(x:number, z:number, n:number, now:number): void;
  /** 날아오름 알림 (착지 자리·시간) */
  leap(x:number, z:number, ms:number): void;
  /** 독 파이어볼에 맞음: 피해(갑옷·무적은 받는 쪽에서) + 중독 */
  poison(p:ModePlayer, dmg:number, now:number): void;
}

/** 날아가는 독 파이어볼 */
interface Ball {
  id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; born: number;
}

const r2 = (n:number) => Math.round(n * 100) / 100;

/**
 * 최종 보스 (배틀로얄 모드): 엔진 NPC 하나 + 생각. 가까운 사람을 쫓아 내려치고, 주기적으로 땅을 울려(높이 무관) 주변을 치고, 좀비를 부른다.
 */
export class Boss {

  private host:ModeHost;

  private hooks:BossHooks;

  npc:ModeNpc | null = null;

  hp = 0;

  max = 0;

  spawnedAt = 0;

  /** 쓰러뜨린 사람 (마지막 일격) */
  killer:string | null = null;

  /** 보스에게 준 피해 (이름별) */
  dmgBy = new Map<string, number>();

  private smashAt = 0;

  private slamAt = 0;

  /** 땅 울리기 준비 시작 시각 (0이면 준비 중 아님) */
  private windupAt = 0;

  private summonAt = 0;

  /** 막힘 확인: 이 시각에 목표까지 거리가 얼마였는지 */
  private stuckAt = 0;

  private stuckD = Infinity;

  /** 도약 중: 시작 시각(0 = 아님)·출발·착지 자리 */
  private leapAt = 0;

  private leapFrom = { x: 0, z: 0 };

  private leapTo = { x: 0, z: 0 };

  private swingUntil = 0;

  private hurtUntil = 0;

  /** 독 파이어볼: 모으기 시작한 시각(0 = 아님)·노리는 사람, 다음 난사 시각, 날아가는 공 */
  private castAt = 0;

  private castTarget:ModePlayer | null = null;

  private ballAt = 0;

  private balls:Ball[] = [];

  private nextBallId = 1;

  constructor(host:ModeHost, hooks:BossHooks) {
    this.host = host;
    this.hooks = hooks;
  }

  get alive() {
    return !!this.npc && this.hp > 0;
  }

  /** 최종 원 가운데 근처 땅에 나타난다. 체력은 살아 있는 사람 수와 난이도로 */
  spawn(c:Circle, alivePlayers:number, difficulty:Difficulty, now:number) {
    this.clear();
    const { collision } = this.host.sim;
    let at:Body | null = null;
    for (let i = 0; i < 200 && !at; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.min(c.r * 0.5, 5 + i);
      const x = c.cx + Math.cos(a) * d;
      const z = c.cz + Math.sin(a) * d;
      if (collision.floorAt(x, z, 1e4) === 0 && collision.at(x, z) !== BLOCK.WATER && !collision.blocked(x, z, 1.2)) at = newBody(x, 0, z);
    }
    const body = at ?? newBody(c.cx, 0, c.cz);
    this.npc = this.host.addNpc(Z_BOSS, body);
    this.max = bossHp(alivePlayers, difficulty);
    this.hp = this.max;
    this.spawnedAt = now;
    this.smashAt = now + 2000;
    this.slamAt = now + BOSS.slamEveryMs;
    this.summonAt = now + BOSS.summonEveryMs / 2;
    this.ballAt = now + BALL.everyMs;
    this.castAt = 0;
    this.balls = [];
    this.killer = null;
    this.dmgBy.clear();
    console.log(`[br] boss spawn hp ${this.max} (${alivePlayers}명, ${difficulty})`);
  }

  clear() {
    this.leapAt = 0;
    this.castAt = 0;
    this.castTarget = null;
    this.balls = [];
    if (this.npc) this.host.removeNpc(this.npc.id);
    this.npc = null;
    this.hp = 0;
    this.windupAt = 0;
  }

  /** 사람이 보스를 침. 쓰러지면 true */
  hit(dmg:number, by:ModePlayer, now:number) {
    if (!this.alive) return false;
    const real = Math.min(this.hp, dmg);
    this.hp -= real;
    this.hurtUntil = now + HURT_MS;
    this.dmgBy.set(by.name, (this.dmgBy.get(by.name) ?? 0) + real);
    if (this.hp > 0) return false;
    this.killer = by.name;
    return true;
  }

  /** 근접 공격이 보스에게 닿는지 (몸이 커서 사거리에 반지름을 더한다) */
  reaches(at:Body, range:number, cosArc:number) {
    return this.alive && meleeReaches(at, this.npc!.body, range + BOSS.radius, cosArc);
  }

  /** 총·화살 대상 (큰 원기둥) */
  shotTarget(by:(p:ModePlayer) => void, pos:(id:number, b:Body) => { x: number; y: number; z: number; }, now:number):ShotTarget<ModePlayer> | null {
    if (!this.alive) return null;
    const { body, id } = this.npc!;
    const at = pos(id, body);
    return {
      id,
      x: at.x,
      y: at.y,
      z: at.z,
      b: body.b,
      l: body.l,
      r: BOSS.radius,
      h: BOSS.height,
      hit: (dmg, p) => {
        this.hit(dmg, p, now);
        by(p);
      },
    };
  }

  /** 목표 근처 6~10m 빈 땅으로 (실외 땅만). 못 찾으면 false */
  private leap(to:Body) {
    const { collision } = this.host.sim;
    const me = this.npc!.body;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 6 + Math.random() * 4;
      const x = to.x + Math.cos(a) * d;
      const z = to.z + Math.sin(a) * d;
      if (collision.floorAt(x, z, 1e4) === 0 && collision.at(x, z) !== BLOCK.WATER && !collision.blocked(x, z, 1.2)) {
        this.leapAt = Date.now();
        this.leapFrom = { x: me.x, z: me.z };
        this.leapTo = { x, z };
        this.hooks.leap(x, z, BOSS.leapMs);
        return true;
      }
    }
    return false;
  }

  private send(m:BrServerMsg) {
    this.host.broadcast(m);
  }

  /** 노린 사람 쪽으로 부채꼴 난사: 수평 거리로 날아갈 시간을 잡고, 그 시간에 낙차만큼 올려 쏜다 */
  private volley(me:Body, t:Body, now:number) {
    const ox = me.x;
    const oy = me.y + BOSS.height * 0.75;
    const oz = me.z;
    const dx = t.x - ox;
    const dz = t.z - oz;
    const flat = Math.max(1, Math.hypot(dx, dz));
    const time = flat / BALL.speed;
    const vy = (t.y + 1 - oy + 0.5 * BALL.gravity * time * time) / time;
    const base = Math.atan2(dx, dz);
    for (let i = 0; i < BALL.count; i++) {
      const a = base + (BALL.count > 1 ? (i / (BALL.count - 1) - 0.5) * BALL.fan : 0);
      const b:Ball = { id: this.nextBallId++, x: ox, y: oy, z: oz, vx: Math.sin(a) * BALL.speed, vy, vz: Math.cos(a) * BALL.speed, born: now };
      this.balls.push(b);
      this.send({ k: 'ball', id: b.id, o: [ r2(ox), r2(oy), r2(oz) ], v: [ r2(b.vx), r2(b.vy), r2(b.vz) ], g: BALL.gravity });
    }
  }

  /** 공 날리기: 사람·땅·벽에 닿거나 오래 날면 터진다 (실외만) */
  private flyBalls(now:number, alive:ModePlayer[]) {
    if (!this.balls.length) return;
    const dt = 1 / SIM_HZ;
    const { sim } = this.host;
    this.balls = this.balls.filter((b) => {
      b.vy -= BALL.gravity * dt;
      const sp = Math.hypot(b.vx, b.vy, b.vz) || 1;
      const seg = sp * dt;
      const wall = castRay(sim, b.x, b.y, b.z, b.vx / sp, b.vy / sp, b.vz / sp, seg, -1, 1);
      const t = Math.min(seg, wall) / sp;
      b.x += b.vx * t;
      b.y += b.vy * t;
      b.z += b.vz * t;
      const floor = sim.collision.floorAt(b.x, b.z, b.y + 0.5);
      const hitP = alive.some((p) => p.body.b < 0 && Math.hypot(p.body.x - b.x, p.body.z - b.z) < BALL.radius + 0.4 && b.y > p.body.y - BALL.radius && b.y < p.body.y + 1.9 + BALL.radius);
      if (!hitP && wall >= seg && b.y > floor && now - b.born < BALL.lifeMs) return true;
      // 터짐: 반경 안 사람 모두 피해 + 중독
      const y = Math.max(b.y, floor);
      alive.forEach((p) => {
        if (p.body.b < 0 && Math.hypot(p.body.x - b.x, p.body.z - b.z) <= BALL.splash && Math.abs(p.body.y + 0.9 - y) <= BALL.splash) this.hooks.poison(p, BALL.damage, now);
      });
      this.send({ k: 'ballEnd', id: b.id, at: [ r2(b.x), r2(y), r2(b.z) ], splash: BALL.splash });
      return false;
    });
  }

  tick(now:number, players:ModePlayer[]) {
    const { npc } = this;
    if (!npc) return;
    if (this.hp <= 0) {
      npc.st = ST_DEAD | ST_FROZEN;
      this.balls = [];
      return;
    }
    const me = npc.body;
    const alive = players.filter((p) => this.hooks.alive(p));
    this.flyBalls(now, alive);
    // 도약 중: 포물선으로 날아가 착지하면 땅 울리기 (경고 원은 날아오를 때 이미 보였다)
    if (this.leapAt) {
      const t = Math.min(1, (now - this.leapAt) / BOSS.leapMs);
      me.x = this.leapFrom.x + (this.leapTo.x - this.leapFrom.x) * t;
      me.z = this.leapFrom.z + (this.leapTo.z - this.leapFrom.z) * t;
      me.y = 4 * BOSS.leapHeight * t * (1 - t);
      me.vy = 0;
      npc.st = ST_FROZEN | (now < this.hurtUntil ? ST_HURT : 0);
      npc.gv = hpGauge((this.hp / this.max) * 100);
      if (t < 1) return;
      this.leapAt = 0;
      me.y = 0;
      alive.forEach((p) => {
        if (Math.hypot(p.body.x - me.x, p.body.z - me.z) <= BOSS.slamRange) this.hooks.hurt(p, BOSS.slamDamage, now);
      });
      this.slamAt = now + BOSS.slamEveryMs;
      this.stuckAt = now + BOSS.stuckMs;
      this.stuckD = Infinity;
      return;
    }
    // 쫓을 사람: 가장 가까운 산 사람 (거리 무관 — 최종 원 안을 찾아다닌다). 실내 사람은 못 쫓고, 옥상 사람은 그 밑까지 가서 땅을 울린다
    let target:ModePlayer | null = null;
    let best = Infinity;
    alive.forEach((p) => {
      const d = Math.hypot(p.body.x - me.x, p.body.z - me.z);
      if (d < best && p.body.b < 0) {
        best = d;
        target = p;
      }
    });
    npc.input.mx = 0;
    npc.input.mz = 0;
    // 독 파이어볼: 노릴 사람을 고르고(멀리 있는 사람 우선 — 저격 견제) 예고한 뒤 난사. 모으는 동안은 멈춘다
    if (!this.castAt && !this.windupAt && now >= this.ballAt) {
      const inRange = alive.filter((p) => p.body.b < 0 && Math.hypot(p.body.x - me.x, p.body.z - me.z) <= BALL.range);
      const far = inRange.filter((p) => Math.hypot(p.body.x - me.x, p.body.z - me.z) > BOSS.smashRange + 4);
      const pool = far.length ? far : inRange;
      if (pool.length) {
        this.castTarget = pool[Math.floor(Math.random() * pool.length)];
        this.castAt = now;
        this.send({ k: 'bossCast', ms: BALL.windupMs });
      } else this.ballAt = now + 1000;
    }
    if (this.castAt) {
      if (now - this.castAt >= BALL.windupMs) {
        const t = this.castTarget;
        if (t && this.hooks.alive(t)) this.volley(me, t.body, now);
        this.castAt = 0;
        this.castTarget = null;
        this.ballAt = now + BALL.everyMs;
      } else {
        npc.st = ST_FROZEN | (now < this.hurtUntil ? ST_HURT : 0);
        npc.gv = hpGauge((this.hp / this.max) * 100);
        return;
      }
    }
    // 땅 울리기: 미리 알리고(경고 원) 그 뒤 반경 안 모두 (높이 무관 — 옥상에서 버티기 방지)
    if (!this.windupAt && now >= this.slamAt) this.windupAt = now;
    if (this.windupAt) {
      if (now - this.windupAt >= BOSS.slamWindupMs) {
        alive.forEach((p) => {
          if (Math.hypot(p.body.x - me.x, p.body.z - me.z) <= BOSS.slamRange) this.hooks.hurt(p, BOSS.slamDamage, now);
        });
        this.windupAt = 0;
        this.slamAt = now + BOSS.slamEveryMs;
      }
    } else if (target) {
      const t:ModePlayer = target;
      const dx = t.body.x - me.x;
      const dz = t.body.z - me.z;
      const d = Math.hypot(dx, dz);
      npc.input.face = Math.round(Math.atan2(dx, dz) * 10000) / 10000;
      me.sm = BOSS.chaseMul;
      npc.input.run = true;
      if (d > BOSS.smashRange - 0.6) {
        npc.input.mx = dx / d;
        npc.input.mz = dz / d;
      }
      // 도약: 길 찾기가 없어 건물에 막히면, 3초 동안 2m도 못 다가가면 목표 근처 빈 땅으로 뛰어올라 착지하며 땅 울리기(예고 원)
      if (now >= this.stuckAt) {
        if (d > BOSS.smashRange + 2 && this.stuckD - d < 2) this.leap(t.body);
        this.stuckAt = now + BOSS.stuckMs;
        this.stuckD = d;
      }
      // 내려치기: 앞쪽 가까운 사람 모두
      if (d <= BOSS.smashRange && now >= this.smashAt) {
        this.smashAt = now + BOSS.smashMs;
        this.swingUntil = now + SWING_MS;
        alive.forEach((p) => {
          if (Math.hypot(p.body.x - me.x, p.body.z - me.z) <= BOSS.smashRange && Math.abs(p.body.y - me.y) < 3) this.hooks.hurt(p, BOSS.smashDamage, now);
        });
      }
    }
    if (now >= this.summonAt) {
      this.summonAt = now + BOSS.summonEveryMs;
      this.hooks.summon(me.x, me.z, BOSS.summonCount, now);
    }
    npc.st = (this.windupAt ? ST_SLAM | ST_FROZEN : 0) | (now < this.swingUntil ? ST_SWING : 0) | (now < this.hurtUntil ? ST_HURT : 0);
    npc.gv = hpGauge((this.hp / this.max) * 100);
  }

}