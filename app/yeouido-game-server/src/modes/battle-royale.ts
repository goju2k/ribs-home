import {
  ACT_MELEE, BR_MODE, BrServerMsg, Corpse, FIST, HP_MAX, HURT_MS, hpGauge, insideZone, makeMatchPlan, MATCH_MS, MatchPlan, meleeReaches,
  pickSpawn, respawnDelay, SPAWN_SHIELD_MS, ST_DEAD, ST_FROZEN, ST_HURT, ST_SHIELD, ST_SWING, zoneAt, zoneDps,
} from 'yeouido-br';
import { Body, newBody } from 'yeouido-sim';

import { GameMode, ModeHost, ModePlayer } from '../mode';

/** 판 정보를 이만큼마다 다시 보낸다 (시계 맞춤) */
const MATCH_EVERY_MS = 5000;
/** 아무도 없이 이만큼 지나면 판을 닫는다 */
const EMPTY_CLOSE_MS = 60_000;
/** 시체는 이만큼까지만 남긴다 (오래된 것부터 치운다) */
const MAX_CORPSES = 150;
/** 전장 밖 피해 간격 (ms) */
const ZONE_TICK_MS = 1000;

interface Fighter {
  hp: number;
  /** 죽었으면 다시 시작할 시각, 살아 있으면 0 */
  respawnAt: number;
  shieldUntil: number;
  nextAttackAt: number;
  swingUntil: number;
  hurtUntil: number;
  /** 전장 밖이면 다음 피해 시각 */
  zoneAt: number;
}

/**
 * 배틀로얄 모드 (게임성 측정용 PoC — 확정 아님).
 * 20분 판, 전장 원 10단계 축소, 무작위 시작, 체력·맨손 근접·전장 밖 피해, 죽으면 시체를 남기고 단계만큼 기다렸다 다시 시작(무적 5초).
 */
export class BattleRoyale implements GameMode {

  readonly name = BR_MODE;

  private host:ModeHost;

  private match:MatchPlan | null = null;

  private matchAt = 0;

  private matchSentAt = 0;

  private emptyAt = 0;

  private nextMatchId = 1;

  private fighters = new Map<number, Fighter>();

  private corpses:Corpse[] = [];

  private nextCorpseId = 1;

  /** 이번 틱 사람 명단 (tick에서 갱신) */
  private all:ModePlayer[] = [];

  constructor(host:ModeHost) {
    this.host = host;
  }

  private get elapsed() {
    return Date.now() - this.matchAt;
  }

  private zone() {
    return zoneAt(this.match!, this.elapsed);
  }

  private send(p:ModePlayer, m:BrServerMsg) {
    this.host.send(p, m);
  }

  private broadcast(m:BrServerMsg) {
    this.host.broadcast(m);
  }

  private matchMsg():BrServerMsg {
    const m = this.match!;
    const r1 = (n:number) => Math.round(n * 10) / 10;
    return { k: 'match', id: m.id, circles: m.circles.map((c) => [ r1(c.cx), r1(c.cz), r1(c.r) ]), elapsed: this.elapsed };
  }

  private newMatch() {
    const id = this.nextMatchId++;
    this.match = makeMatchPlan(this.host.sim, id, (Math.random() * 2 ** 32) >>> 0); // eslint-disable-line no-bitwise
    this.matchAt = Date.now();
    this.corpses = [];
    const last = this.match.circles[this.match.circles.length - 1];
    console.log(`[br] match #${id} start (final ${last.cx.toFixed(0)},${last.cz.toFixed(0)} r${last.r})`);
  }

  /** 지금 원 안 무작위 자리 (지상·옥상·실내) */
  private spawnBody():Body {
    const s = pickSpawn(this.host.sim, this.zone());
    const body = newBody(s.x, s.y, s.z);
    body.b = s.b;
    body.l = s.l;
    return body;
  }

  /** 살려서 자리에 놓는다 (처음 입장·다시 시작·새 판) */
  private revive(p:ModePlayer, body:Body, now:number) {
    body.fly = p.debug ? 1 : 0; // 비행은 로켓슈트(3단계) 전까지 개발용만
    p.body = body;
    p.queue.length = 0;
    this.fighters.set(p.id, { hp: HP_MAX, respawnAt: 0, shieldUntil: now + SPAWN_SHIELD_MS, nextAttackAt: 0, swingUntil: 0, hurtUntil: 0, zoneAt: 0 });
  }

  join(p:ModePlayer, requested:Body | null) {
    if (!this.match) this.newMatch();
    this.revive(p, requested ?? this.spawnBody(), Date.now());
    this.send(p, this.matchMsg());
    this.send(p, { k: 'corpses', list: this.corpses });
  }

  leave(p:ModePlayer) {
    this.fighters.delete(p.id);
  }

  act(p:ModePlayer, act:number, now:number) {
    const me = this.fighters.get(p.id);
    // eslint-disable-next-line no-bitwise -- 행동 비트
    if (!me || me.respawnAt || !(act & ACT_MELEE) || now < me.nextAttackAt) return;
    me.nextAttackAt = now + FIST.cooldownMs;
    me.swingUntil = now + FIST.swingMs;
    me.shieldUntil = 0; // 먼저 때리면 무적이 풀린다
    // 닿는 사람 중 가장 가까운 한 명
    let best:ModePlayer | null = null;
    let bestD = Infinity;
    // 지난 틱의 명단을 쓴다 (공격마다 배열을 새로 만들지 않게 — 300명이 몰려 주먹질할 때 비용)
    this.all.forEach((o) => {
      if (o === p || Math.abs(o.body.x - p.body.x) > FIST.range || Math.abs(o.body.z - p.body.z) > FIST.range) return;
      const f = this.fighters.get(o.id);
      if (!f || f.respawnAt || now < f.shieldUntil || !meleeReaches(p.body, o.body)) return;
      const d = Math.hypot(o.body.x - p.body.x, o.body.z - p.body.z);
      if (d < bestD) {
        best = o;
        bestD = d;
      }
    });
    if (best) this.damage(best, FIST.damage, p, now);
  }

  private damage(t:ModePlayer, dmg:number, by:ModePlayer | null, now:number) {
    const f = this.fighters.get(t.id);
    if (!f || f.respawnAt) return;
    f.hp = Math.max(0, f.hp - dmg);
    f.hurtUntil = now + HURT_MS;
    this.send(t, { k: 'hurt', dmg, from: by?.name ?? null });
    if (by) this.send(by, { k: 'hit', target: t.id, dmg });
    if (f.hp <= 0) this.die(t, f, by, now);
  }

  private die(p:ModePlayer, f:Fighter, by:ModePlayer | null, now:number) {
    const wait = respawnDelay(this.zone().stage);
    f.respawnAt = now + wait;
    const { x, y, z, f: face, b, l } = p.body;
    const r2 = (n:number) => Math.round(n * 100) / 100;
    const c:Corpse = { id: this.nextCorpseId++, name: p.name, x: r2(x), y: r2(y), z: r2(z), f: r2(face), b, l };
    this.corpses.push(c);
    this.broadcast({ k: 'corpse', c });
    if (this.corpses.length > MAX_CORPSES) this.broadcast({ k: 'corpseGone', id: this.corpses.shift()!.id });
    this.broadcast({ k: 'kill', killer: by?.name ?? null, victim: p.name });
    this.send(p, { k: 'dead', by: by?.name ?? null, wait });
  }

  tick(now:number) {
    if (!this.match) return;
    const all = [ ...this.host.players() ];
    this.all = all;
    if (!all.length) {
      if (!this.emptyAt) this.emptyAt = now;
      else if (now - this.emptyAt > EMPTY_CLOSE_MS) {
        console.log(`[br] match #${this.match.id} closed (empty)`);
        this.match = null;
        this.emptyAt = 0;
      }
      return;
    }
    this.emptyAt = 0;
    if (this.elapsed >= MATCH_MS) {
      // 시간 끝 → 새 판 (보스·승리는 7단계): 모두 새 원 안에서 살아난다
      this.newMatch();
      all.forEach((p) => this.revive(p, this.spawnBody(), now));
      this.broadcast(this.matchMsg());
      this.broadcast({ k: 'corpses', list: [] });
      this.matchSentAt = now;
    } else if (now - this.matchSentAt >= MATCH_EVERY_MS) {
      this.broadcast(this.matchMsg());
      this.matchSentAt = now;
    }
    const zone = this.zone();
    all.forEach((p) => {
      const f = this.fighters.get(p.id);
      if (!f) return;
      if (f.respawnAt && now >= f.respawnAt) {
        this.revive(p, this.spawnBody(), now);
        this.send(p, { k: 'respawn' });
        return;
      }
      // 전장 밖: 1초마다 피해 (무적이어도 맞는다 — 원 밖에 버티는 걸 막는다)
      if (!f.respawnAt && !insideZone(zone, p.body.x, p.body.z)) {
        if (!f.zoneAt) f.zoneAt = now + ZONE_TICK_MS;
        else if (now >= f.zoneAt) {
          f.zoneAt = now + ZONE_TICK_MS;
          this.damage(p, zoneDps(zone.stage), null, now);
        }
      } else f.zoneAt = 0;
    });
    // 엔진에 넘길 상태 비트·게이지
    all.forEach((p) => {
      const f = this.fighters.get(p.id);
      if (!f) return;
      /* eslint-disable no-bitwise -- 상태 비트 */
      p.st = (f.respawnAt ? ST_DEAD | ST_FROZEN : 0)
        | (now < f.shieldUntil ? ST_SHIELD : 0)
        | (now < f.swingUntil ? ST_SWING : 0)
        | (now < f.hurtUntil ? ST_HURT : 0);
      /* eslint-enable no-bitwise */
      p.gv = hpGauge(f.hp);
    });
  }

  info() {
    if (!this.match) return { mode: this.name, match: null };
    const z = this.zone();
    const dead = [ ...this.fighters.values() ].filter((f) => f.respawnAt).length;
    return { mode: this.name, match: { id: this.match.id, stage: z.stage, r: Math.round(z.r), remainS: Math.round(z.remain / 1000) }, alive: this.fighters.size - dead, dead, corpses: this.corpses.length };
  }

}