/* eslint-disable no-bitwise -- 상태 비트 */
import { BOSS, bossHp, Circle, Difficulty, hpGauge, meleeReaches, ST_DEAD, ST_FROZEN, ST_HURT, ST_SLAM, ST_SWING, Z_BOSS } from 'yeouido-br';
import { BLOCK, Body, newBody } from 'yeouido-sim';

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
}

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

  private swingUntil = 0;

  private hurtUntil = 0;

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
    this.killer = null;
    this.dmgBy.clear();
    console.log(`[br] boss spawn hp ${this.max} (${alivePlayers}명, ${difficulty})`);
  }

  clear() {
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

  tick(now:number, players:ModePlayer[]) {
    const { npc } = this;
    if (!npc) return;
    if (this.hp <= 0) {
      npc.st = ST_DEAD | ST_FROZEN;
      return;
    }
    const me = npc.body;
    const alive = players.filter((p) => this.hooks.alive(p));
    // 쫓을 사람: 시야 안 가장 가까운 사람 (같은 높이)
    let target:ModePlayer | null = null;
    let best:number = BOSS.sight;
    alive.forEach((p) => {
      const d = Math.hypot(p.body.x - me.x, p.body.z - me.z);
      if (d < best && p.body.b < 0 && Math.abs(p.body.y - me.y) < 2.5) {
        best = d;
        target = p;
      }
    });
    npc.input.mx = 0;
    npc.input.mz = 0;
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