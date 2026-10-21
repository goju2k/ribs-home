import {
  ACT_MELEE, ACT_RANGED, BOSS_LIMIT_MS, BrClientMsg, Difficulty, DIFFICULTY, RESULT_MS, afterPickup, heldRanged, RANGED_KINDS, rangedStats, armorCut, BR_MODE, dayNight, breakPower, PROP_KINDS, PROP_RADIUS, rollDrops, BrServerMsg, Corpse, CorpseItem, emptyGear, Gear, HP_MAX, HURT_MS, hpGauge, insideZone,
  ITEM_KINDS, makeMatchPlan, MATCH_MS, MatchPlan, meleeReaches, meleeStats, PICK_RANGE, pickSpawn, respawnDelay, rocketMul, shoeMul,
  SPAWN_SHIELD_MS, ST_DEAD, ST_FROZEN, ST_HIDDEN, ST_HURT, ST_SHIELD, ST_SWING, zoneAt, zoneDps,
} from 'yeouido-br';
import { SIM_HZ } from 'yeouido-net';
import { Body, newBody } from 'yeouido-sim';

import { Boss } from './br-boss';
import { ItemField } from './br-items';
import { Prop, PropField, propRow } from './br-props';
import { aimDir, Arrow, at3, hitscan, MUZZLE_Y, ShotTarget } from './br-shots';
import { Horde } from './br-zombies';

import { Aim, GameMode, ModeHost, ModePlayer } from '../mode';

/** 개발용: 낮밤 시계를 당겨 밤을 빨리 본다 (예: BR_DAY_OFFSET_MS=190000 → 10초 뒤 밤) */
const DAY_OFFSET = Number(process.env.BR_DAY_OFFSET_MS) || 0;
/** 개발용: 개발용 접속(?debug)은 이 장비로 시작 (예: BR_DEBUG_GEAR=pistol:3,shoes:2) */
const DEBUG_GEAR = (process.env.BR_DEBUG_GEAR ?? '').split(',').map((s) => s.split(':')).filter(([ k, v ]) => k && Number(v) > 0);
/** 보스전 중에 쓰러지면 이만큼 누워 있다가 관전으로 바뀐다 (ms) */
const SPECTATE_AFTER_MS = 3000;
/** 개발용: 판 시계를 당겨 시작 (예: BR_TIME_OFFSET_MS=1190000 → 10초 뒤 보스) */
const TIME_OFFSET = Number(process.env.BR_TIME_OFFSET_MS) || 0;
/** 난이도 (보스 체력·피해 배율): easy·normal·hard */
const DIFF:Difficulty = Object.keys(DIFFICULTY).includes(process.env.BR_DIFFICULTY ?? '') ? process.env.BR_DIFFICULTY as Difficulty : 'normal';
/** 보스 상태 알림 간격 (ms) */
const BOSS_EVERY_MS = 500;
/** 판 정보를 이만큼마다 다시 보낸다 (시계 맞춤) */
const MATCH_EVERY_MS = 5000;
/** 아무도 없이 이만큼 지나면 판을 닫는다 */
const EMPTY_CLOSE_MS = 60_000;
/** 시체는 이만큼까지만 남긴다 (오래된 것부터 치운다) */
const MAX_CORPSES = 150;
/** 전장 밖 피해 간격 (ms) */
const ZONE_TICK_MS = 1000;
/** 판 시작 때 섬에 뿌리는 아이템 수, 원이 줄면 원 넓이만큼 줄여 유지 (최소 ITEM_MIN) — 아이템은 주로 물건을 부숴서 얻는다 */
const ITEM_START = 50;
const ITEM_MIN = 5;
/** 이만큼마다 원 안 아이템을 채운다 (ms) */
const ITEM_REFILL_MS = 20_000;
/** 전장 밖 아이템을 치우는 간격 (ms) — 원이 줄면 밖에 남은 아이템은 사라진다 */
const ITEM_SWEEP_MS = 1000;
/** 부술 수 있는 물건: 판 시작 수, 최소 유지 수 (원 넓이만큼 유지, 아이템과 같은 주기) */
const PROP_START = 450;
const PROP_MIN = 50;
/** 물건 내구도 알림은 이 거리 안 사람에게만 (m) */
const PROP_HIT_RANGE = 80;
/** 총 궤적·화살은 이 거리 안 사람에게만 보낸다 (m) */
const SHOT_SEND_R = 200;
/** 줍기·시체 털기 판정은 틱 몇 번에 한 번 (사람×아이템 비용) */
const PICK_EVERY = 3;

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
  gear: Gear;
  /** 다음 원거리 발사 가능 시각 */
  nextShotAt: number;
  /**
   * 관전: 이번 판은 다시 시작 못 함 (보스전 중 쓰러짐·늦게 들어옴). respawnAt = Infinity로 두어 '살아 있지 않음'으로 취급되고,
   * specFrom부터 산 사람(없으면 보스)을 따라간다. 다음 판에 다시 참여
   */
  spectator: 'dead' | 'late' | null;
  specFrom: number;
  /** 보고 있는 사람 번호 (0 = 없음 — 보스를 본다), 그 대상을 알렸는지 */
  watch: number;
  watchSent: boolean;
}

/** 같은 공간인지 (실외끼리 높이 차 1.6m 안, 실내는 같은 건물·층) */
const sameSpace = (a:{ y: number; b: number; l: number; }, y:number, b:number, l:number) => a.b === b && (b >= 0 ? a.l === l : Math.abs(a.y - y) <= 1.6);

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

  private items = new ItemField();

  private props = new PropField();

  private horde:Horde;

  private boss:Boss;

  /** 판 단계: 진행 → 보스 → 끝(결과 보여 주는 중) */
  private phase:'play' | 'boss' | 'end' = 'play';

  private endAt = 0;

  private bossSentAt = 0;

  private arrows:Arrow[] = [];

  private nextArrowId = 1;

  /** 화살 처리 시간 (ms, 최근 최대) — 한계 점검용 */
  private arrowMs = 0;

  private refillAt = 0;

  private sweepAt = 0;

  private tickNo = 0;

  constructor(host:ModeHost) {
    this.host = host;
    this.horde = new Horde(host, {
      alive: (p) => {
        const f = this.fighters.get(p.id);
        return !!f && !f.respawnAt;
      },
      // 좀비에게 물림: 무적이면 안 들어가고, 갑옷이 줄인다
      bite: (p, dmg, now) => {
        const f = this.fighters.get(p.id);
        if (!f || now < f.shieldUntil) return;
        this.damage(p, Math.max(1, Math.round(dmg * (1 - armorCut(f.gear.armor)))), null, now, '좀비');
      },
    });
    this.boss = new Boss(host, {
      alive: (p) => {
        const f = this.fighters.get(p.id);
        return !!f && !f.respawnAt;
      },
      hurt: (p, dmg, now) => {
        const f = this.fighters.get(p.id);
        if (!f || now < f.shieldUntil) return;
        this.damage(p, Math.max(1, Math.round(dmg * DIFFICULTY[DIFF] * (1 - armorCut(f.gear.armor)))), null, now, '최종 보스');
      },
      summon: (x, z, n, now) => this.horde.summon(x, z, n, now),
    });
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
    return { k: 'match', id: m.id, circles: m.circles.map((c) => [ r1(c.cx), r1(c.cz), r1(c.r) ]), elapsed: this.elapsed, dayOffset: DAY_OFFSET };
  }

  private newMatch() {
    const id = this.nextMatchId++;
    this.match = makeMatchPlan(this.host.sim, id, (Math.random() * 2 ** 32) >>> 0); // eslint-disable-line no-bitwise
    this.matchAt = Date.now() - TIME_OFFSET;
    this.phase = 'play';
    this.boss.clear();
    this.corpses = [];
    this.horde.clear();
    this.items.clear();
    this.items.scatter(this.host.sim, this.match.circles[0], ITEM_START);
    this.props.clear();
    this.props.scatter(this.host.sim, this.match.circles[0], PROP_START);
    this.refillAt = this.matchAt + ITEM_REFILL_MS;
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
    p.body = body;
    p.queue.length = 0;
    const f:Fighter = { hp: HP_MAX, respawnAt: 0, shieldUntil: now + SPAWN_SHIELD_MS, nextAttackAt: 0, nextShotAt: 0, swingUntil: 0, hurtUntil: 0, zoneAt: 0, gear: emptyGear(), spectator: null, specFrom: 0, watch: 0, watchSent: false };
    this.fighters.set(p.id, f);
    if (p.debug) {
      DEBUG_GEAR.forEach(([ k, v ]) => {
        if (k in f.gear) f.gear[k as keyof Gear] = Math.min(7, Number(v));
      });
    }
    this.applyGear(p, f); // 맨몸 (개발용 장비 빼고)
  }

  /** 장비 → 몸 (엔진의 속도 배율·비행) + 알림. 비행은 로켓슈트가 있을 때만 (개발용 접속은 늘, 원래 속도로) */
  private applyGear(p:ModePlayer, f:Fighter) {
    p.body.sm = shoeMul(f.gear.shoes);
    p.body.fly = p.debug || f.gear.rocket ? 1 : 0;
    p.body.fm = p.debug ? 1 : rocketMul(f.gear.rocket) || 1;
    this.send(p, { k: 'gear', gear: { ...f.gear } });
  }

  /** 아이템 하나를 장비에 (같은 칸이면 강화) */
  private equip(p:ModePlayer, f:Fighter, kind:number, lv:number, from:'ground' | 'corpse') {
    const k = ITEM_KINDS[kind];
    // 원거리는 한 종류만: 다른 종류를 주우면 들고 있던 것을 그 자리에 떨어뜨린다 (떨어뜨린 사람은 멀어질 때까지 못 줍는다)
    if (RANGED_KINDS.includes(k)) {
      RANGED_KINDS.filter((o) => o !== k && f.gear[o] > 0).forEach((o) => {
        const { x, y, z, b, l } = p.body;
        const it = this.items.add(ITEM_KINDS.indexOf(o), f.gear[o], x, y, z, b, l);
        this.items.hold(it[0], p.id);
        this.broadcast({ k: 'itemAdd', list: [ it ] });
        f.gear[o] = 0;
      });
    }
    f.gear[k] = afterPickup(f.gear[k], lv);
    this.send(p, { k: 'got', kind, lv: f.gear[k], from });
  }

  /** 가까운 사람에게만 (총 궤적·화살) */
  private sendNear(x:number, z:number, m:BrServerMsg) {
    this.all.forEach((q) => {
      if (Math.abs(q.body.x - x) < SHOT_SEND_R && Math.abs(q.body.z - z) < SHOT_SEND_R) this.send(q, m);
    });
  }

  /** 맞힐 수 있는 것: 살아 있고 무적이 아닌 사람 + 좀비. lagMs만큼 되감은 자리 (총은 쏜 사람 화면 기준으로 판정). 쏜 사람 자신은 hitscan이 건너뛴다 */
  private shotTargets(now:number, lagMs:number):ShotTarget<ModePlayer>[] {
    const pos = (id:number, b:Body) => (lagMs > 0 ? this.host.past(id, lagMs) ?? b : b);
    const out:ShotTarget<ModePlayer>[] = [];
    this.all.forEach((o) => {
      const f = this.fighters.get(o.id);
      if (!f || f.respawnAt || now < f.shieldUntil) return;
      const at = pos(o.id, o.body);
      out.push({
        id: o.id,
        x: at.x,
        y: at.y,
        z: at.z,
        b: o.body.b,
        l: o.body.l,
        hit: (dmg, by) => this.damage(o, Math.max(1, Math.round(dmg * (1 - armorCut(f.gear.armor)))), by, now),
      });
    });
    // 사람은 damage()가 쏜 사람에게 맞힘 알림을 보내고, 좀비·보스는 여기서
    const zeds = this.horde.shotTargets(now, (by, id, dmg) => this.send(by, { k: 'hit', target: id, dmg }), pos);
    const boss = this.boss.shotTarget(() => {}, pos, now);
    if (boss) {
      const { hit } = boss;
      boss.hit = (dmg, by) => {
        hit(dmg, by);
        this.send(by, { k: 'hit', target: boss.id, dmg });
      };
      out.push(boss);
    }
    return out.concat(zeds);
  }

  /** 원거리 발사: 총은 바로 판정(지연 보정), 활은 화살을 날린다 */
  private shoot(p:ModePlayer, me:Fighter, now:number, aim:Aim) {
    const kind = heldRanged(me.gear);
    if (!kind || now < me.nextShotAt) return;
    const st = rangedStats(kind, me.gear[kind]);
    me.nextShotAt = now + st.reloadMs;
    me.swingUntil = now + 200;
    me.shieldUntil = 0;
    this.send(p, { k: 'fired', reloadMs: st.reloadMs });
    const { body } = p;
    const o:[number, number, number] = [ body.x, body.y + MUZZLE_Y, body.z ];
    const dir = aimDir(aim.face, aim.pitch);
    if (st.hitscan) {
      const { end, target } = hitscan(this.host.sim, o, dir, st.range, body.b, body.l, this.shotTargets(now, p.lagMs), p.id);
      if (target) target.hit(st.damage, p);
      this.sendNear(body.x, body.z, { k: 'shot', by: p.id, o: at3(...o), e: at3(...end) });
      return;
    }
    const a:Arrow = { id: this.nextArrowId++, by: p.id, x: o[0], y: o[1], z: o[2], d: dir, v: st.speed, left: st.range, dmg: st.damage, b: body.b, l: body.l };
    this.arrows.push(a);
    this.sendNear(body.x, body.z, { k: 'arrow', id: a.id, by: p.id, o: at3(...o), d: at3(...dir), v: a.v, range: a.left });
  }

  /** 화살 날리기: 한 틱만큼 나아가며 벽·사람·좀비 (지금 자리 기준) */
  private flyArrows(now:number) {
    if (!this.arrows.length) return;
    const dt = 1 / SIM_HZ;
    // 맞힐 대상은 틱마다 한 번만 만들어 8m 칸에 나눠 두고, 화살은 지나는 칸만 본다 (사람이 몰려 활을 쏘면 화살 수 × 대상 수가 커진다)
    const CELL_A = 8;
    const key = (cx:number, cz:number) => (cx + 4096) * 8192 + (cz + 4096);
    const grid = new Map<number, ShotTarget<ModePlayer>[]>();
    this.shotTargets(now, 0).forEach((t) => {
      const k = key(Math.floor(t.x / CELL_A), Math.floor(t.z / CELL_A));
      const list = grid.get(k);
      if (list) list.push(t);
      else grid.set(k, [ t ]);
    });
    this.arrows = this.arrows.filter((a) => {
      const seg = Math.min(a.left, a.v * dt);
      const shooter = this.host.get(a.by) ?? null;
      const near:ShotTarget<ModePlayer>[] = [];
      if (shooter) {
        const ex = a.x + a.d[0] * seg;
        const ez = a.z + a.d[2] * seg;
        const cz0 = Math.floor((Math.min(a.z, ez) - 1) / CELL_A);
        const cz1 = Math.floor((Math.max(a.z, ez) + 1) / CELL_A);
        const cx1 = Math.floor((Math.max(a.x, ex) + 1) / CELL_A);
        for (let cx = Math.floor((Math.min(a.x, ex) - 1) / CELL_A); cx <= cx1; cx++) {
          for (let cz = cz0; cz <= cz1; cz++) grid.get(key(cx, cz))?.forEach((t) => near.push(t));
        }
      }
      const { end, target } = hitscan(this.host.sim, [ a.x, a.y, a.z ], a.d, seg, a.b, a.l, near, a.by);
      const moved = Math.hypot(end[0] - a.x, end[1] - a.y, end[2] - a.z);
      [ a.x, a.y, a.z ] = end;
      a.left -= seg;
      if (target && shooter) target.hit(a.dmg, shooter);
      // 맞았거나, 벽에 막혀 덜 갔거나, 사거리 끝
      if (target || moved < seg - 0.01 || a.left <= 0) {
        this.sendNear(a.x, a.z, { k: 'arrowEnd', id: a.id, at: at3(a.x, a.y, a.z) });
        return false;
      }
      return true;
    });
  }

  /** 근처 땅 아이템 줍기·시체 털기 */
  private pickups(p:ModePlayer, f:Fighter) {
    const { body } = p;
    const got = this.items.near(body.x, body.z, 4).filter((it) => this.items.canPick(it, p.id, body.x, body.z) && Math.hypot(it[3] - body.x, it[5] - body.z) <= PICK_RANGE).filter((it) => sameSpace(body, it[4], it[6], it[7]));
    const gone:number[] = [];
    got.forEach((it) => {
      this.items.remove(it[0]);
      gone.push(it[0]);
      this.equip(p, f, it[1], it[2], 'ground');
    });
    if (gone.length) this.broadcast({ k: 'itemGone', ids: gone });
    let changed = got.length > 0;
    this.corpses.forEach((c) => {
      if (!c.items.length || Math.abs(c.x - body.x) > PICK_RANGE || Math.abs(c.z - body.z) > PICK_RANGE || !sameSpace(body, c.y, c.b, c.l)) return;
      c.items.forEach(([ kind, lv ]) => this.equip(p, f, kind, lv, 'corpse'));
      c.items = [];
      changed = true;
      this.broadcast({ k: 'looted', id: c.id });
    });
    if (changed) this.applyGear(p, f);
  }

  join(p:ModePlayer, requested:Body | null) {
    if (!this.match) this.newMatch();
    const now = Date.now();
    this.revive(p, requested ?? this.spawnBody(), now);
    // 보스전·결과 중에 들어오면 이번 판은 관전, 다음 판에 참여
    if (this.phase !== 'play') this.spectate(p, this.fighters.get(p.id)!, 'late', now);
    this.send(p, this.matchMsg());
    this.send(p, { k: 'corpses', list: this.corpses });
    this.send(p, { k: 'items', list: this.items.list() });
    this.send(p, { k: 'props', list: this.props.list() });
  }

  leave(p:ModePlayer) {
    this.fighters.delete(p.id);
  }

  /** 관전으로: 다시 시작 못 함 (dead면 잠깐 누워 있다가, late면 바로) */
  private spectate(p:ModePlayer, f:Fighter, reason:'dead' | 'late', now:number) {
    f.respawnAt = Infinity;
    f.spectator = reason;
    f.specFrom = reason === 'dead' ? now + SPECTATE_AFTER_MS : now;
    f.watch = 0;
    f.watchSent = false;
    p.queue.length = 0;
  }

  /** 관전 대상: 산 사람(번호 순), 없으면 0 (보스를 본다) */
  private watchable() {
    return this.all.filter((o) => {
      const f = this.fighters.get(o.id);
      return f && !f.respawnAt;
    }).map((o) => o.id).sort((a, b) => a - b);
  }

  /** 관전자: 보는 사람(없으면 보스) 자리로 몸을 옮긴다 — 그 둘레가 스냅숏으로 오고, 화면은 내 몸을 따라가니 그 사람을 따라 보게 된다 */
  private follow(p:ModePlayer, f:Fighter) {
    const list = this.watchable();
    // 보던 사람이 쓰러지면 다음 사람으로 (아무도 없으면 보스) — 바뀔 때만 알린다
    const want = list.includes(f.watch) ? f.watch : list[0] ?? 0;
    if (want !== f.watch || !f.watchSent) {
      f.watch = want;
      f.watchSent = true;
      const name = f.watch ? this.host.get(f.watch)?.name ?? null : null;
      this.send(p, { k: 'spectate', target: name, reason: f.spectator ?? 'late' });
    }
    const t = f.watch ? this.host.get(f.watch)?.body : this.boss.npc?.body;
    if (!t) return;
    const { body } = p;
    body.x = t.x;
    body.y = t.y;
    body.z = t.z;
    body.b = t.b;
    body.l = t.l;
    body.f = t.f;
  }

  message(p:ModePlayer, d:unknown) {
    const m = d as BrClientMsg;
    const f = this.fighters.get(p.id);
    if (!f?.spectator || m?.k !== 'watch' || (m.dir !== 1 && m.dir !== -1)) return;
    const list = this.watchable();
    if (!list.length) return;
    const i = list.indexOf(f.watch);
    f.watch = list[(i + m.dir + list.length) % list.length];
    this.send(p, { k: 'spectate', target: this.host.get(f.watch)?.name ?? null, reason: f.spectator });
  }

  act(p:ModePlayer, act:number, now:number, aim:Aim) {
    const me = this.fighters.get(p.id);
    if (!me || me.respawnAt) return;
    // 근접·원거리는 따로 (동시에 쓸 수 있다)
    if (act & ACT_RANGED) this.shoot(p, me, now, aim); // eslint-disable-line no-bitwise
    if (!(act & ACT_MELEE) || now < me.nextAttackAt) return; // eslint-disable-line no-bitwise
    const w = meleeStats(me.gear.pipe);
    me.nextAttackAt = now + w.cooldownMs;
    me.swingUntil = now + w.swingMs;
    me.shieldUntil = 0; // 먼저 때리면 무적이 풀린다
    // 닿는 사람 중 가장 가까운 한 명
    let best:ModePlayer | null = null;
    let bestD = Infinity;
    // 지난 틱의 명단을 쓴다 (공격마다 배열을 새로 만들지 않게 — 300명이 몰려 주먹질할 때 비용)
    this.all.forEach((o) => {
      if (o === p || Math.abs(o.body.x - p.body.x) > w.range || Math.abs(o.body.z - p.body.z) > w.range) return;
      const f = this.fighters.get(o.id);
      if (!f || f.respawnAt || now < f.shieldUntil || !meleeReaches(p.body, o.body, w.range, w.cosArc)) return;
      const d = Math.hypot(o.body.x - p.body.x, o.body.z - p.body.z);
      if (d < bestD) {
        best = o;
        bestD = d;
      }
    });
    // 보스가 닿으면 보스 먼저 (몸이 커서 사거리에 반지름을 더한다)
    if (this.boss.reaches(p.body, w.range, w.cosArc)) {
      this.boss.hit(w.damage, p, now);
      this.send(p, { k: 'hit', target: this.boss.npc!.id, dmg: w.damage });
      return;
    }
    // 좀비가 더 가까우면 좀비를 친다
    const zed = this.horde.nearest(p.body, (b) => meleeReaches(p.body, b, w.range, w.cosArc));
    if (zed && Math.hypot(zed.npc.body.x - p.body.x, zed.npc.body.z - p.body.z) < bestD) {
      this.horde.hit(zed, w.damage, now, p);
      this.send(p, { k: 'hit', target: zed.npc.id, dmg: w.damage });
      return;
    }
    if (best) {
      const t:ModePlayer = best;
      // 갑옷은 근접 피해만 줄인다
      const cut = armorCut(this.fighters.get(t.id)!.gear.armor);
      this.damage(t, Math.max(1, Math.round(w.damage * (1 - cut))), p, now);
      return;
    }
    // 닿는 사람이 없으면 물건을 친다 (가장 가까운 것)
    let prop:Prop | null = null;
    let propD = Infinity;
    this.props.near(p.body.x, p.body.z, w.range + 0.5).forEach((o) => {
      const reach = w.range + PROP_RADIUS[PROP_KINDS[o.kind]];
      if (!meleeReaches(p.body, o, reach, w.cosArc)) return;
      const d = Math.hypot(o.x - p.body.x, o.z - p.body.z);
      if (d < propD) {
        prop = o;
        propD = d;
      }
    });
    if (prop) this.hitProp(p, me, prop);
  }

  /** 물건 치기: 망치가 있으면 세게. 부서지면 드롭 표대로 아이템을 떨어뜨린다 */
  private hitProp(p:ModePlayer, me:Fighter, o:Prop) {
    const dmg = breakPower(me.gear);
    o.hp = Math.max(0, o.hp - dmg);
    this.send(p, { k: 'hitProp', id: o.id, dmg });
    if (o.hp > 0) {
      const row = propRow(o);
      this.all.forEach((q) => {
        if (Math.abs(q.body.x - o.x) < PROP_HIT_RANGE && Math.abs(q.body.z - o.z) < PROP_HIT_RANGE) this.send(q, { k: 'propHit', id: o.id, hp: row[2] });
      });
      return;
    }
    this.props.remove(o.id);
    this.broadcast({ k: 'propGone', ids: [ o.id ] });
    const drops = rollDrops(PROP_KINDS[o.kind]).map(([ kind, lv ], i, list) => {
      // 여러 개면 둘레에 조금씩 떨어뜨린다
      const a = (i / Math.max(1, list.length)) * Math.PI * 2;
      const d = list.length > 1 ? 0.6 : 0;
      return this.items.add(kind, lv, o.x + Math.cos(a) * d, o.y, o.z + Math.sin(a) * d, o.b, o.l);
    });
    if (drops.length) this.broadcast({ k: 'itemAdd', list: drops });
  }

  /** 사람이 피해를 입음. by = 때린 사람, 아니면 byName(예: 좀비), 둘 다 없으면 전장 밖 */
  private damage(t:ModePlayer, dmg:number, by:ModePlayer | null, now:number, byName:string | null = null) {
    const f = this.fighters.get(t.id);
    if (!f || f.respawnAt || !Number.isFinite(dmg)) return;
    f.hp = Math.max(0, f.hp - dmg);
    f.hurtUntil = now + HURT_MS;
    this.send(t, { k: 'hurt', dmg, from: by?.name ?? byName });
    if (by) this.send(by, { k: 'hit', target: t.id, dmg });
    if (f.hp <= 0) this.die(t, f, by?.name ?? byName, now);
  }

  private die(p:ModePlayer, f:Fighter, by:string | null, now:number) {
    // 보스전이 시작되면 다시 시작 못 함 → 잠깐 누워 있다가 관전
    const noRespawn = this.phase !== 'play';
    const wait = noRespawn ? -1 : respawnDelay(this.zone().stage);
    if (noRespawn) this.spectate(p, f, 'dead', now);
    else f.respawnAt = now + wait;
    const { x, y, z, f: face, b, l } = p.body;
    const r2 = (n:number) => Math.round(n * 100) / 100;
    // 가진 장비는 시체에 남는다
    const items:CorpseItem[] = ITEM_KINDS.map((k, i):CorpseItem => [ i, f.gear[k] ]).filter(([ , lv ]) => lv > 0);
    const c:Corpse = { id: this.nextCorpseId++, name: p.name, x: r2(x), y: r2(y), z: r2(z), f: r2(face), b, l, items };
    this.corpses.push(c);
    this.broadcast({ k: 'corpse', c });
    if (this.corpses.length > MAX_CORPSES) this.broadcast({ k: 'corpseGone', id: this.corpses.shift()!.id });
    this.broadcast({ k: 'kill', killer: by, victim: p.name });
    this.send(p, { k: 'dead', by, wait });
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
    // 20분: 최종 원 가운데에 보스
    if (this.phase === 'play' && this.elapsed >= MATCH_MS) {
      this.phase = 'boss';
      const alive = all.filter((p) => !this.fighters.get(p.id)?.respawnAt).length;
      this.boss.spawn(this.match.circles[this.match.circles.length - 1], alive, DIFF, now);
      this.broadcast({ k: 'kill', killer: null, victim: '최종 보스가 나타났다! 이제 다시 시작할 수 없다' });
      // 다시 시작을 기다리던 사람은 이번 판은 관전
      all.forEach((p) => {
        const f = this.fighters.get(p.id);
        if (f && f.respawnAt && !f.spectator) {
          this.spectate(p, f, 'dead', now);
          f.specFrom = now;
        }
      });
    }
    if (this.phase === 'boss') {
      this.boss.tick(now, all);
      if (now - this.bossSentAt >= BOSS_EVERY_MS && this.boss.npc) {
        this.bossSentAt = now;
        this.broadcast({ k: 'boss', id: this.boss.npc.id, hp: Math.ceil(this.boss.hp), max: this.boss.max, remain: Math.max(0, BOSS_LIMIT_MS - (now - this.boss.spawnedAt)) });
      }
      // 승리 · 시간 초과 · 참가자가 모두 쓰러짐(다시 시작할 수 없으니 바로 패배)
      const standing = all.some((p) => {
        const f = this.fighters.get(p.id);
        return f && !f.respawnAt;
      });
      if (!this.boss.alive) this.finish('win', now);
      else if (!standing) this.finish('lose', now, 'wiped');
      else if (now - this.boss.spawnedAt > BOSS_LIMIT_MS) this.finish('lose', now, 'time');
    }
    // 결과를 보여 준 뒤 새 판: 모두 새 원 안에서 살아난다
    if (this.phase === 'end' && now >= this.endAt) {
      this.newMatch();
      all.forEach((p) => this.revive(p, this.spawnBody(), now));
      this.broadcast(this.matchMsg());
      this.broadcast({ k: 'corpses', list: [] });
      this.broadcast({ k: 'items', list: this.items.list() });
      this.broadcast({ k: 'props', list: this.props.list() });
      this.matchSentAt = now;
    } else if (now - this.matchSentAt >= MATCH_EVERY_MS) {
      this.broadcast(this.matchMsg());
      this.matchSentAt = now;
    }
    const zone = this.zone();
    // 전장 밖으로 밀려난 아이템은 사라진다
    if (now >= this.sweepAt) {
      this.sweepAt = now + ITEM_SWEEP_MS;
      const gone = this.items.removeOutside(zone);
      if (gone.length) this.broadcast({ k: 'itemGone', ids: gone });
      const propsGone = this.props.removeOutside(zone);
      if (propsGone.length) this.broadcast({ k: 'propGone', ids: propsGone });
    }
    // 원이 줄수록 아이템도 원 넓이만큼 유지 (줄어든 원 안에 채운다)
    if (now >= this.refillAt) {
      this.refillAt = now + ITEM_REFILL_MS;
      const want = Math.max(ITEM_MIN, Math.round(ITEM_START * (zone.r / this.match.circles[0].r) ** 2));
      const lack = Math.min(60, want - this.items.countIn(zone));
      if (lack > 0) this.broadcast({ k: 'itemAdd', list: this.items.scatter(this.host.sim, zone, lack) });
      const area = (zone.r / this.match.circles[0].r) ** 2;
      const propLack = Math.min(60, Math.max(PROP_MIN, Math.round(PROP_START * area)) - this.props.countIn(zone));
      if (propLack > 0) this.broadcast({ k: 'propAdd', list: this.props.scatter(this.host.sim, zone, propLack) });
    }
    // 밤이면 좀비 (해 뜨면 불탄다)
    this.horde.tick(now, dayNight(this.elapsed + DAY_OFFSET).night, all);
    const tA = performance.now();
    this.flyArrows(now);
    this.arrowMs = Math.max(this.arrowMs * 0.98, performance.now() - tA);
    const pickNow = this.tickNo++ % PICK_EVERY === 0;
    all.forEach((p) => {
      const f = this.fighters.get(p.id);
      if (!f) return;
      if (f.spectator) {
        if (now >= f.specFrom) this.follow(p, f);
        return;
      }
      if (f.respawnAt && now >= f.respawnAt) {
        this.revive(p, this.spawnBody(), now);
        this.send(p, { k: 'respawn' });
        return;
      }
      if (!f.respawnAt && pickNow) this.pickups(p, f);
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
      // 관전 중이면 세상에 없음(남에게 안 보임), 그 전엔 쓰러진 모습
      if (f.spectator && now >= f.specFrom) {
        p.st = ST_HIDDEN | ST_FROZEN;
        p.gv = 0;
        return;
      }
      p.st = (f.respawnAt ? ST_DEAD | ST_FROZEN : 0)
        | (now < f.shieldUntil ? ST_SHIELD : 0)
        | (now < f.swingUntil ? ST_SWING : 0)
        | (now < f.hurtUntil ? ST_HURT : 0);
      /* eslint-enable no-bitwise */
      p.gv = hpGauge(f.hp);
    });
  }

  /** 판 끝: 결과(마지막 일격·보스 피해 순위)를 알리고 RESULT_MS 뒤 새 판 */
  private finish(result:'win' | 'lose', now:number, why?:'time' | 'wiped') {
    const top = [ ...this.boss.dmgBy.entries() ].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([ n, d ]):[string, number] => [ n, Math.round(d) ]);
    this.broadcast({ k: 'boss', id: this.boss.npc?.id ?? 0, hp: 0, max: this.boss.max, remain: 0 });
    this.broadcast({ k: 'end', result, why, killer: this.boss.killer, top, next: RESULT_MS });
    console.log(`[br] match #${this.match?.id} ${result} (killer ${this.boss.killer})`);
    this.phase = 'end';
    this.endAt = now + RESULT_MS;
    // 쓰러진 보스는 잠깐 누워 있다 사라지게 상태만 두고, 판이 바뀔 때 치운다
    if (result === 'lose') this.boss.clear();
    this.horde.clear();
  }

  info() {
    if (!this.match) return { mode: this.name, match: null };
    const z = this.zone();
    const dead = [ ...this.fighters.values() ].filter((f) => f.respawnAt).length;
    return { mode: this.name, match: { id: this.match.id, stage: z.stage, r: Math.round(z.r), remainS: Math.round(z.remain / 1000) }, alive: this.fighters.size - dead, dead, corpses: this.corpses.length, items: this.items.size, props: this.props.size, night: dayNight(this.elapsed + DAY_OFFSET).night, zombies: this.horde.size, phase: this.phase, boss: this.boss.alive ? { hp: Math.ceil(this.boss.hp), max: this.boss.max } : null, arrows: this.arrows.length, arrowMs: Math.round(this.arrowMs * 100) / 100 };
  }

}