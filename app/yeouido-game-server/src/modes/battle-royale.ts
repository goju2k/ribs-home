import {
  ACT_FARM, ACT_FIRE, isMaxed, MAX_LEVEL, ACT_RELOAD, BALL, BOSS_LIMIT_MS, ESCAPE, BrClientMsg, Difficulty, DIFFICULTY, FARM, RESULT_MS, afterPickup, armorCut, BR_MODE, dayNight, breakPower, PROP_KINDS, PROP_RADIUS, rollDrops, rollZombieDrop, BrServerMsg, Corpse, CorpseItem, emptyGear, Gear, HP_MAX, HURT_MS, hpGauge, insideZone,
  ITEM_KINDS, insideZone as inZoneCircle, makeMatchPlan, pickRoofOf, LOBBY_COUNTDOWN_MS, MATCH_MS, MatchPlan, meleeReaches, pickSpawn, respawnDelay, rocketMul, shoeMul,
  canFire, falloff, fire, healAmount, isConsumable, PICK_GAP_MS, PICK_RANGE, PICK_RELEASE, FireState, fullMag, heldWeapon, isWeapon, MOVING_SPEED, reload, shotDirs, WEAPON_KINDS, weaponStats,
  SPAWN_SHIELD_MS, ST_DEAD, ST_FROZEN, ST_HIDDEN, ST_HURT, ST_SHIELD, ST_SWING, zoneAt, zoneDps,
} from 'yeouido-br';
import { SIM_HZ } from 'yeouido-net';
import { Body, newBody, STEP } from 'yeouido-sim';

import { Announcer } from './br-announce';
import { Boss } from './br-boss';
import { CarPark, CarVictim } from './br-cars';
import { ItemField } from './br-items';
import { Prop, PropField, propRow } from './br-props';
import { newStats, PlayerStats, Records } from './br-records';
import { Arrow, at3, hitscan, MUZZLE_Y, ShotTarget } from './br-shots';
import { Horde } from './br-zombies';

import { Aim, GameMode, ModeHost, ModePlayer } from '../mode';

/** 개발용: 낮밤 시계를 당겨 밤을 빨리 본다 (예: BR_DAY_OFFSET_MS=190000 → 10초 뒤 밤) */
const DAY_OFFSET = Number(process.env.BR_DAY_OFFSET_MS) || 0;
/** 개발용: 개발용 접속(?debug)은 이 장비로 시작 (예: BR_DEBUG_GEAR=pistol:3,shoes:2) */
const DEBUG_GEAR = (process.env.BR_DEBUG_GEAR ?? '').split(',').map((s) => s.split(':')).filter(([ k, v ]) => k && Number(v) > 0);
/** 보스전 중에 쓰러지면 이만큼 누워 있다가 관전으로 바뀐다 (ms) */
const SPECTATE_AFTER_MS = 3000;
/**
 * 시작 자리: 기본은 원 안 무작위 (지상·옥상·실내 층).
 * 개발용: BR_SPAWN=kb면 모두 KB 옥상에서 시작 (여럿이 만나 시험할 때, 원 밖이 되면 원 안 무작위)
 */
const SPAWN_KB = process.env.BR_SPAWN === 'kb';
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
const PROP_START = 900;
const PROP_MIN = 100;
/** 물건 내구도 알림은 이 거리 안 사람에게만 (m) */
const PROP_HIT_RANGE = 80;
/** 총 궤적·화살은 이 거리 안 사람에게만 보낸다 (m, 저격 사거리보다 넉넉히) */
const SHOT_SEND_R = 300;
/** 총 판정 후보를 고를 때 사거리에 더하는 여유 (m): 지연 보정으로 되감는 동안 움직인 거리 + 보스 반지름 */
const TARGET_SLACK = 12;

interface Fighter {
  hp: number;
  /** 죽었으면 다시 시작할 시각, 살아 있으면 0 */
  respawnAt: number;
  shieldUntil: number;
  /** 다음 파밍(줍기·치기) 가능 시각 */
  nextFarmAt: number;
  /** 지난 걸음에 파밍 비트가 있었나, 새로 누른 뒤 아직 줍지 않았나 (줍기·털기는 새로 누를 때만 — 누른 채 부수다 떨어진 무기를 바꿔 들지 않게) */
  farmPrev: boolean;
  farmFresh: boolean;
  /** 닿아도 건너뛸 땅 아이템 (바꿔 떨어뜨린 무기·못 줍는 것) — PICK_RELEASE m 넘게 멀어지면 푼다 */
  skip: Set<number>;
  /** 다음 닿아 줍기 가능 시각 */
  nextPickAt: number;
  swingUntil: number;
  hurtUntil: number;
  /** 전장 밖이면 다음 피해 시각 */
  zoneAt: number;
  /** 중독: 끝나는 시각·다음 피해 시각 */
  poisonUntil: number;
  poisonAt: number;
  gear: Gear;
  /** 든 무기의 탄창 (입력 걸음 수로 잰다 — 입력이 몰려 와도 클라이언트와 같은 걸음에서 쏘게), 무기가 없으면 null */
  fire: FireState | null;
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

  /** 진행 방송 (멘트는 br-announce) */
  private announce:Announcer;

  private boss:Boss;

  /** 판 단계: 진행 → 보스 → 끝(결과 보여 주는 중) */
  /** lobby 시작 대기(모두 게임 시작을 누르면 5초 뒤) → play 파밍(PvP) → boss 보스전(휴전) → escape 탈출전(휴전 카운트다운 뒤 PvP, 탈출구 열림) → end */
  private phase:'lobby' | 'play' | 'boss' | 'escape' | 'end' = 'lobby';

  /** 시작 대기: 준비한 사람 번호, 카운트다운이 끝나는 시각(0 = 아직), 알릴 게 바뀌었는지 */
  private ready = new Set<number>();

  private startAt = 0;

  private lobbyDirty = false;

  /** 탈출구 (보스가 쓰러진 자리)·열리는 시각 */
  private exit:{ x: number; y: number; z: number; openAt: number; } | null = null;

  private endAt = 0;

  private bossSentAt = 0;

  /** 판 기록: 이번 판에 들어온 사람마다 (나가도 남는다) */
  private stats = new Map<number, PlayerStats>();

  private records = new Records();

  /** 자동차 (타기·내리기·연료) */
  private cars:CarPark;

  /** 이번 판이 실제로 시작된 시각 (기록용, 개발용 시계 당김과 무관) */
  private startedAt = 0;

  private arrows:Arrow[] = [];

  /** 이번 틱의 맞힐 수 있는 것 (지금 자리) — 한 발마다 새로 만들지 않게 틱마다 한 번. tick()이 비운다 */
  private targetsNow:ShotTarget<ModePlayer>[] | null = null;

  private nextArrowId = 1;

  /** 화살 처리 시간 (ms, 최근 최대) — 한계 점검용 */
  private arrowMs = 0;

  private refillAt = 0;

  private sweepAt = 0;

  constructor(host:ModeHost) {
    this.host = host;
    this.cars = new CarPark(host, (msg) => this.broadcast(msg));
    this.announce = new Announcer((text, kind, to) => this.host.say(text, kind, to));
    this.horde = new Horde(host, {
      // 차에 탄 사람은 노리지 않는다
      alive: (p) => {
        const f = this.fighters.get(p.id);
        return !!f && !f.respawnAt && !this.cars.driving(p.id);
      },
      // 좀비를 쓰러뜨리면 가끔 아이템을 떨군다 (걷는 좀비 10%, 뛰는 좀비 25%)
      killed: (at, k) => {
        const got = rollZombieDrop(k);
        if (!got) return;
        const it = this.items.add(got[0], got[1], at.x, at.y, at.z, at.b, at.l);
        this.broadcast({ k: 'itemAdd', list: [ it ] });
      },
      // 좀비에게 물림: 무적이면 안 들어가고, 갑옷이 줄인다
      bite: (p, dmg, now, from) => {
        const f = this.fighters.get(p.id);
        if (!f || now < f.shieldUntil) return;
        this.damage(p, Math.max(1, Math.round(dmg * (1 - armorCut(f.gear.armor)))), null, now, '좀비', false, from);
      },
    });
    this.boss = new Boss(host, {
      alive: (p) => {
        const f = this.fighters.get(p.id);
        return !!f && !f.respawnAt;
      },
      hurt: (p, dmg, now, from) => {
        const f = this.fighters.get(p.id);
        if (!f || now < f.shieldUntil) return;
        this.damage(p, Math.max(1, Math.round(dmg * DIFFICULTY[DIFF] * (1 - armorCut(f.gear.armor)))), null, now, '최종 보스', false, from);
      },
      summon: (x, z, n, now) => this.horde.summon(x, z, n, now),
      // 독 파이어볼: 무적이면 안 들어가고, 피해는 갑옷이 줄인다. 중독은 시간을 새로 채운다 (초당 피해는 갑옷 무시)
      poison: (p, dmg, now, from) => {
        const f = this.fighters.get(p.id);
        if (!f || f.respawnAt || now < f.shieldUntil) return;
        this.damage(p, Math.max(1, Math.round(dmg * (1 - armorCut(f.gear.armor)))), null, now, '독 파이어볼', false, from);
        if (f.respawnAt) return;
        if (f.poisonUntil <= now) f.poisonAt = now + 1000;
        f.poisonUntil = now + BALL.poisonMs;
        this.send(p, { k: 'poison', ms: BALL.poisonMs, dps: BALL.poisonDps });
      },
      leap: (x, z, ms) => this.broadcast({ k: 'bossLeap', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, ms }),
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
    return { k: 'match', id: m.id, circles: m.circles.map((c) => [ r1(c.cx), r1(c.cz), r1(c.r) ]), elapsed: this.elapsed, dayOffset: DAY_OFFSET, lobby: this.phase === 'lobby' };
  }

  private newMatch() {
    const id = this.nextMatchId++;
    this.match = makeMatchPlan(this.host.sim, id, (Math.random() * 2 ** 32) >>> 0); // eslint-disable-line no-bitwise
    this.matchAt = Date.now() - TIME_OFFSET;
    this.phase = 'lobby';
    this.ready.clear();
    this.startAt = 0;
    this.lobbyDirty = true;
    this.exit = null;
    this.startedAt = Date.now();
    this.stats.clear();
    this.boss.clear();
    this.corpses = [];
    this.horde.clear();
    // 차: 모두 내리고 원래 자리, 연료를 다시 뽑는다
    this.cars.exitAll();
    this.cars.reset();
    this.broadcast(this.cars.listMsg());
    this.items.clear();
    this.items.scatter(this.host.sim, this.match.circles[0], ITEM_START);
    this.props.clear();
    this.props.scatter(this.host.sim, this.match.circles[0], PROP_START);
    this.refillAt = this.matchAt + ITEM_REFILL_MS;
    const last = this.match.circles[this.match.circles.length - 1];
    console.log(`[br] match #${id} lobby (final ${last.cx.toFixed(0)},${last.cz.toFixed(0)} r${last.r})`);
    this.announce.lobby();
  }

  /** 시작 대기 알림 (모두에게) */
  private lobbyMsg(now:number):BrServerMsg {
    return { k: 'lobby', ready: [ ...this.ready ], total: [ ...this.host.players() ].length, startIn: this.startAt ? Math.max(0, this.startAt - now) : null };
  }

  /**
   * 시작 대기 (틱마다): 시계는 멈춰 두고, 접속한 모두가 준비하면 카운트다운 — 그 사이 누가 들어오거나 취소하면 멈춘다
   */
  private lobbyTick(now:number, all:ModePlayer[]) {
    this.matchAt = now - TIME_OFFSET;
    // 나간 사람의 준비는 지운다
    [ ...this.ready ].forEach((id) => {
      if (!this.host.get(id)) {
        this.ready.delete(id);
        this.lobbyDirty = true;
      }
    });
    const allReady = all.length > 0 && all.every((p) => this.ready.has(p.id));
    if (allReady && !this.startAt) {
      this.startAt = now + LOBBY_COUNTDOWN_MS;
      this.lobbyDirty = true;
      this.announce.countdown(all.length);
    } else if (!allReady && this.startAt) {
      this.startAt = 0;
      this.lobbyDirty = true;
      this.announce.countdownStop();
    }
    if (this.lobbyDirty) {
      this.lobbyDirty = false;
      this.broadcast(this.lobbyMsg(now));
    }
    if (this.startAt && now >= this.startAt) this.startMatch(now, all);
  }

  /** 시작 대기 중 틱의 나머지: 판 정보를 가끔 다시 알리고, 상태 비트는 늘 멀쩡한 모습 */
  private lobbyStatus(now:number, all:ModePlayer[]) {
    if (now - this.matchSentAt >= MATCH_EVERY_MS) {
      this.broadcast(this.matchMsg());
      this.matchSentAt = now;
    }
    all.forEach((p) => {
      const f = this.fighters.get(p.id);
      p.st = 0;
      p.gv = hpGauge(f?.hp ?? HP_MAX);
    });
  }

  /** 카운트다운 끝: 시계를 맞추고 모두 새 자리에서 시작 */
  private startMatch(now:number, all:ModePlayer[]) {
    this.phase = 'play';
    this.startAt = 0;
    this.ready.clear();
    this.matchAt = now - TIME_OFFSET;
    this.startedAt = now;
    this.refillAt = this.matchAt + ITEM_REFILL_MS;
    this.stats.clear();
    all.forEach((p) => {
      this.revive(p, this.spawnBody(), now);
      this.stats.set(p.id, newStats(p.name, now, false));
    });
    this.broadcast(this.matchMsg());
    this.broadcast({ k: 'lobby', ready: [], total: all.length, startIn: null });
    this.matchSentAt = now;
    console.log(`[br] match #${this.match?.id} start (${all.length}명)`);
    this.announce.newMatch();
  }

  /** 지금 원 안 무작위 자리 (지상·옥상·실내) */
  private spawnBody():Body {
    const zone = this.zone();
    const kb = this.host.sim.indoors[0];
    const s = (SPAWN_KB && kb && pickRoofOf(this.host.sim, kb, Math.random, (x, z) => inZoneCircle(zone, x, z))) || pickSpawn(this.host.sim, zone);
    const body = newBody(s.x, s.y, s.z);
    body.b = s.b;
    body.l = s.l;
    return body;
  }

  /** 살려서 자리에 놓는다 (처음 입장·다시 시작·새 판) */
  private revive(p:ModePlayer, body:Body, now:number) {
    p.body = body;
    p.queue.length = 0;
    const f:Fighter = { hp: HP_MAX, respawnAt: 0, shieldUntil: now + SPAWN_SHIELD_MS, nextFarmAt: 0, farmPrev: false, farmFresh: false, skip: new Set(), nextPickAt: 0, fire: null, swingUntil: 0, hurtUntil: 0, zoneAt: 0, poisonUntil: 0, poisonAt: 0, gear: emptyGear(), spectator: null, specFrom: 0, watch: 0, watchSent: false };
    this.fighters.set(p.id, f);
    if (p.debug) {
      DEBUG_GEAR.forEach(([ k, v ]) => {
        if (k in f.gear) f.gear[k as keyof Gear] = Math.min(MAX_LEVEL, Number(v));
      });
    }
    const w = heldWeapon(f.gear);
    if (w) f.fire = fullMag(weaponStats(w, f.gear[w]));
    this.applyGear(p, f); // 맨몸 (개발용 장비 빼고)
  }

  /** 장비 → 몸 (엔진의 속도 배율·비행) + 알림. 비행은 로켓슈트가 있을 때만 (개발용 접속은 늘, 원래 속도로) */
  private applyGear(p:ModePlayer, f:Fighter) {
    // 땅 속도: 신발 × 무기 무게
    const w = heldWeapon(f.gear);
    p.body.sm = shoeMul(f.gear.shoes) * (w ? weaponStats(w, f.gear[w]).moveMul : 1);
    p.body.fly = p.debug || f.gear.rocket ? 1 : 0;
    p.body.fm = p.debug ? 1 : rocketMul(f.gear.rocket) || 1;
    this.send(p, { k: 'gear', gear: { ...f.gear } });
  }

  /** 아이템 하나를 장비에 (같은 칸이면 강화) */
  private equip(p:ModePlayer, f:Fighter, kind:number, lv:number, from:'ground' | 'corpse') {
    const k = ITEM_KINDS[kind];
    // 회복약: 장비가 아니라 바로 체력 회복
    if (isConsumable(k)) {
      f.hp = Math.min(HP_MAX, f.hp + healAmount(lv, HP_MAX));
      const hs = this.stats.get(p.id);
      if (hs) hs.picks[k]++;
      this.send(p, { k: 'got', kind, lv, from });
      return;
    }
    // 무기는 한 종류만: 다른 종류를 주우면 들고 있던 것을 그 자리에 떨어뜨린다 (떨어뜨린 사람은 멀어질 때까지 건너뛴다)
    if (isWeapon(k)) {
      WEAPON_KINDS.filter((o) => o !== k && f.gear[o] > 0).forEach((o) => {
        const { x, y, z, b, l } = p.body;
        const it = this.items.add(ITEM_KINDS.indexOf(o), f.gear[o], x, y, z, b, l);
        f.skip.add(it[0]);
        this.broadcast({ k: 'itemAdd', list: [ it ] });
        f.gear[o] = 0;
      });
    }
    f.gear[k] = afterPickup(f.gear[k], lv);
    // 새 무기·강화한 무기는 탄창 가득 (화면도 장비가 바뀌면 같이 채운다)
    if (isWeapon(k)) f.fire = fullMag(weaponStats(k, f.gear[k]));
    const st = this.stats.get(p.id);
    if (st) {
      st.picks[k]++;
      st.maxGear[k] = Math.max(st.maxGear[k], f.gear[k]);
    }
    this.send(p, { k: 'got', kind, lv: f.gear[k], from });
  }

  /** 가까운 사람에게만 (총 궤적·화살) */
  private sendNear(x:number, z:number, m:BrServerMsg) {
    this.all.forEach((q) => {
      if (Math.abs(q.body.x - x) < SHOT_SEND_R && Math.abs(q.body.z - z) < SHOT_SEND_R) this.send(q, m);
    });
  }

  /**
   * 맞힐 수 있는 것: 살아 있고 무적이 아닌 사람 + 좀비 + 보스. lagMs만큼 되감은 자리 (총은 쏜 사람 화면 기준으로 판정). 쏜 사람 자신은 hitscan이 건너뛴다.
   * 목록은 틱마다 한 번만 만들고, from이 있으면 그 둘레 reach m 안(사거리 + 여유)만 골라 되감는다 — 사람이 몰려 쏠 때 한 발마다 전원을 새로 만들지 않게
   */
  private shotTargets(now:number, lagMs:number, from?:[number, number, number], reach = 0):ShotTarget<ModePlayer>[] {
    if (!this.targetsNow) this.targetsNow = this.buildTargets(now);
    if (lagMs <= 0 && !from) return this.targetsNow;
    const out:ShotTarget<ModePlayer>[] = [];
    this.targetsNow.forEach((t) => {
      if (from && (Math.abs(t.x - from[0]) > reach || Math.abs(t.z - from[2]) > reach)) return;
      const at = lagMs > 0 ? this.host.past(t.id, lagMs) : null;
      out.push(at ? { ...t, x: at.x, y: at.y, z: at.z } : t);
    });
    return out;
  }

  /** 이번 틱 맞힐 수 있는 것 (지금 자리) */
  private buildTargets(now:number):ShotTarget<ModePlayer>[] {
    const pos = (_:number, b:Body) => b;
    const out:ShotTarget<ModePlayer>[] = [];
    // 휴전 중엔 사람은 맞힐 대상이 아니다 (총알이 지나간다)
    const truce = this.truce(now);
    this.all.forEach((o) => {
      if (truce) return;
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
        hit: (dmg, by, head) => this.damage(o, Math.max(1, Math.round(dmg * (1 - armorCut(f.gear.armor)))), by, now, null, head),
      });
    });
    // 사람은 damage()가 쏜 사람에게 맞힘 알림을 보내고, 좀비·보스는 여기서
    const zeds = this.horde.shotTargets(now, (by, id, dmg, killed, head) => {
      this.send(by, { k: 'hit', target: id, dmg, head });
      const st = this.stats.get(by.id);
      if (killed && st) st.zombieKills++;
    }, pos);
    const boss = this.boss.shotTarget(() => {}, pos, now);
    if (boss) {
      const { hit } = boss;
      boss.hit = (dmg, by, head) => {
        hit(dmg, by);
        this.send(by, { k: 'hit', target: boss.id, dmg, head });
      };
      out.push(boss);
    }
    return out.concat(zeds);
  }

  /**
   * 쏘기: 탄창·연사는 입력 걸음 수로 (화면과 같은 셈). 총은 바로 판정(지연 보정)하고 알마다 퍼짐·거리 감소·머리 배율,
   * 석궁은 낙차 있는 화살을 날린다. 소리가 닿는 좀비는 쏜 사람에게 몰려온다
   */
  private shoot(p:ModePlayer, me:Fighter, now:number, aim:Aim) {
    const kind = heldWeapon(me.gear);
    if (!kind || !me.fire || !canFire(me.fire, aim.seq)) return;
    const st = weaponStats(kind, me.gear[kind]);
    fire(me.fire, st, aim.seq, STEP);
    me.swingUntil = now + 120;
    me.shieldUntil = 0;
    const { body } = p;
    const o:[number, number, number] = [ body.x, body.y + MUZZLE_Y, body.z ];
    const dirs = shotDirs(st, aim.face, aim.pitch, aim.seq, body.a > MOVING_SPEED);
    if (st.noise) this.horde.alert(body, st.noise, p, now);
    if (st.hitscan) {
      // 되감는 동안 움직였을 거리·보스 몸집만큼 여유
      const targets = this.shotTargets(now, p.lagMs, o, st.range + TARGET_SLACK);
      // 맞은 곳 종류 (화면의 타격 효과용): 0 벽·땅, 1 몸, 2 머리, 3 허공
      const ht:number[] = [];
      const es = dirs.map((dir) => {
        const { end, target, head, dist } = hitscan(this.host.sim, o, dir, st.range, body.b, body.l, targets, p.id);
        if (target) target.hit(Math.max(1, Math.round(st.damage * falloff(st, dist) * (head ? st.headMul : 1))), p, head);
        ht.push(target ? (head ? 2 : 1) : dist < st.range - 0.05 ? 0 : 3); // eslint-disable-line no-nested-ternary
        return at3(...end);
      });
      this.sendNear(body.x, body.z, { k: 'shot', by: p.id, w: WEAPON_KINDS.indexOf(kind), o: at3(...o), es, ht });
      return;
    }
    dirs.forEach((d) => {
      const a:Arrow = { id: this.nextArrowId++, by: p.id, x: o[0], y: o[1], z: o[2], vel: [ d[0] * st.speed, d[1] * st.speed, d[2] * st.speed ], g: st.gravity, left: st.range, dmg: st.damage, headMul: st.headMul, b: body.b, l: body.l };
      this.arrows.push(a);
      this.sendNear(body.x, body.z, { k: 'arrow', id: a.id, by: p.id, o: at3(...o), d: at3(...d), v: st.speed, range: a.left, g: a.g });
    });
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
      // 낙차: 한 틱마다 아래로 g·dt 만큼 빨라진다 → 이번 틱에 갈 방향·길이
      a.vel[1] -= a.g * dt;
      const sp = Math.hypot(a.vel[0], a.vel[1], a.vel[2]) || 1;
      const dir:[number, number, number] = [ a.vel[0] / sp, a.vel[1] / sp, a.vel[2] / sp ];
      const seg = Math.min(a.left, sp * dt);
      const shooter = this.host.get(a.by) ?? null;
      const near:ShotTarget<ModePlayer>[] = [];
      if (shooter) {
        const ex = a.x + dir[0] * seg;
        const ez = a.z + dir[2] * seg;
        const cz0 = Math.floor((Math.min(a.z, ez) - 1) / CELL_A);
        const cz1 = Math.floor((Math.max(a.z, ez) + 1) / CELL_A);
        const cx1 = Math.floor((Math.max(a.x, ex) + 1) / CELL_A);
        for (let cx = Math.floor((Math.min(a.x, ex) - 1) / CELL_A); cx <= cx1; cx++) {
          for (let cz = cz0; cz <= cz1; cz++) grid.get(key(cx, cz))?.forEach((t) => near.push(t));
        }
      }
      const { end, target, head } = hitscan(this.host.sim, [ a.x, a.y, a.z ], dir, seg, a.b, a.l, near, a.by);
      const moved = Math.hypot(end[0] - a.x, end[1] - a.y, end[2] - a.z);
      [ a.x, a.y, a.z ] = end;
      a.left -= seg;
      if (target && shooter) target.hit(Math.round(a.dmg * (head ? a.headMul : 1)), shooter, head);
      // 맞았거나, 벽에 막혀 덜 갔거나, 사거리 끝
      if (target || moved < seg - 0.01 || a.left <= 0) {
        this.sendNear(a.x, a.z, { k: 'arrowEnd', id: a.id, at: at3(a.x, a.y, a.z) });
        return false;
      }
      return true;
    });
  }

  /**
   * 닿으면 줍기 (걸음마다): 발 가까이(PICK_RANGE) 같은 공간의 땅 아이템 하나 — 가장 가까운 것.
   * 못 줍는 것(최대 단계·체력 가득)과 바꿔 떨어뜨린 무기는 건너뛸 목록에 넣고, PICK_RELEASE m 넘게 멀어지면 푼다 (시간으로는 안 푼다 —
   * 제자리에 서 있는 동안 무기가 계속 바뀌거나 같은 것을 계속 시도하지 않게). 무기를 바꾼 순간 발밑의 다른 무기도 건너뛴다 (둘을 밟고 연달아 바꾸지 않게)
   */
  private touchPick(p:ModePlayer, me:Fighter, now:number) {
    const { body } = p;
    me.skip.forEach((id) => {
      const it = this.items.get(id);
      if (!it || it[6] !== body.b || Math.hypot(it[3] - body.x, it[5] - body.z) > PICK_RELEASE) me.skip.delete(id);
    });
    if (now < me.nextPickAt) return;
    const touching = this.items.near(body.x, body.z, PICK_RANGE).filter((it) => sameSpace(body, it[4], it[6], it[7]) && !me.skip.has(it[0]));
    touching.sort((a, b) => Math.hypot(a[3] - body.x, a[5] - body.z) - Math.hypot(b[3] - body.x, b[5] - body.z));
    const it = touching.find((t) => {
      const k = ITEM_KINDS[t[1]];
      // 체력이 가득하면 회복약은, 이미 최대 단계면 같은 아이템은 못 줍는다 — 멀어질 때까지 다시 보지 않는다
      if ((isConsumable(k) && me.hp >= HP_MAX) || isMaxed(me.gear, k)) {
        me.skip.add(t[0]);
        return false;
      }
      return true;
    });
    if (!it) return;
    const k = ITEM_KINDS[it[1]];
    const swaps = isWeapon(k) && WEAPON_KINDS.some((o) => o !== k && me.gear[o] > 0);
    this.items.remove(it[0]);
    this.broadcast({ k: 'itemGone', ids: [ it[0] ] });
    this.equip(p, me, it[1], it[2], 'ground');
    this.applyGear(p, me);
    if (swaps) {
      touching.forEach((t) => {
        if (t !== it && isWeapon(ITEM_KINDS[t[1]])) me.skip.add(t[0]); 
      });
    }
    me.nextPickAt = now + PICK_GAP_MS;
  }

  /**
   * 파밍(좌클릭): 앞쪽 가까이 있는 것 하나 — 시체 털기, 물건 치기(망치가 있으면 세게). 땅 아이템은 닿으면 줍는다(touchPick).
   * 둘 중 가장 가까운 것. 털기는 새로 누른 때만(누른 채 부수기만 이어진다), 털기는 짧게, 치기는 조금 길게 쉰다
   */
  private farm(p:ModePlayer, me:Fighter, now:number) {
    const { body } = p;
    const reach = (x:number, y:number, z:number, b:number, l:number, extra = 0) => sameSpace(body, y, b, l) && meleeReaches(body, { x, y, z, f: 0, b, l }, FARM.range + extra, FARM.cosArc);
    let best:{ d: number; run: () => number; } | null = null;
    const offer = (x:number, z:number, run:() => number) => {
      const d = Math.hypot(x - body.x, z - body.z);
      if (!best || d < best.d) best = { d, run };
    };
    // 털기는 새로 누른 때만 (한 번 털면 다시 누를 때까지 안 턴다)
    const pick = (run:() => number) => () => {
      me.farmFresh = false;
      return run();
    };
    this.corpses.forEach((c) => {
      // 이미 최대인 칸의 아이템은 시체에 남긴다 (다른 사람이 털 수 있게)
      const takes = c.items.filter(([ kind ]) => !isMaxed(me.gear, ITEM_KINDS[kind]));
      if (!me.farmFresh || !takes.length || !reach(c.x, c.y, c.z, c.b, c.l)) return;
      offer(c.x, c.z, pick(() => {
        takes.forEach(([ kind, lv ]) => this.equip(p, me, kind, lv, 'corpse'));
        c.items = c.items.filter((it) => !takes.includes(it));
        this.broadcast({ k: 'looted', id: c.id, left: c.items });
        this.applyGear(p, me);
        return FARM.pickMs;
      }));
    });
    this.props.near(body.x, body.z, FARM.range + 1).forEach((o) => {
      if (!reach(o.x, o.y, o.z, o.b, o.l, PROP_RADIUS[PROP_KINDS[o.kind]])) return;
      offer(o.x, o.z, () => {
        this.hitProp(p, me, o);
        // 친 뒤에는 이번 누름으로 털지 않는다
        me.farmFresh = false;
        me.swingUntil = now + FARM.swingMs;
        return FARM.hitMs;
      });
    });
    const chosen = best as { run: () => number; } | null;
    if (chosen) me.nextFarmAt = now + chosen.run();
  }

  join(p:ModePlayer, requested:Body | null) {
    if (!this.match) this.newMatch();
    const now = Date.now();
    const late = this.phase === 'boss' || this.phase === 'escape' || this.phase === 'end';
    this.stats.set(p.id, newStats(p.name, now, late));
    this.revive(p, requested ?? this.spawnBody(), now);
    // 보스전·결과 중에 들어오면 이번 판은 관전, 다음 판에 참여
    if (late) this.spectate(p, this.fighters.get(p.id)!, 'late', now);
    // 시작 대기 중이면 새로 온 사람은 아직 준비 전 (카운트다운 중이었다면 멈춘다)
    if (this.phase === 'lobby') this.lobbyDirty = true;
    this.announce.welcome(p, this.phase, this.elapsed);
    this.send(p, this.matchMsg());
    this.send(p, { k: 'corpses', list: this.corpses });
    this.send(p, { k: 'items', list: this.items.list() });
    this.send(p, { k: 'props', list: this.props.list() });
    this.send(p, this.cars.listMsg());
    if (this.phase === 'lobby') this.send(p, this.lobbyMsg(now));
  }

  /** 나감: 살아 있었으면 그 자리에 시체(장비)를 남긴다 — 죽기 직전에 나가 장비를 없애는 꼼수 방지 */
  leave(p:ModePlayer) {
    const f = this.fighters.get(p.id);
    const now = Date.now();
    this.cars.exit(p);
    if (f && !f.respawnAt && this.match && this.phase !== 'end' && this.phase !== 'lobby') {
      this.dropCorpse(p, f);
    }
    const st = this.stats.get(p.id);
    if (st) st.leftAt = now;
    this.fighters.delete(p.id);
  }

  /** 그 자리에 시체 (가진 장비 전부) */
  private dropCorpse(p:ModePlayer, f:Fighter) {
    const { x, y, z, f: face, b, l } = p.body;
    const r2 = (n:number) => Math.round(n * 100) / 100;
    const items:CorpseItem[] = ITEM_KINDS.map((k, i):CorpseItem => [ i, f.gear[k] ]).filter(([ , lv ]) => lv > 0);
    const c:Corpse = { id: this.nextCorpseId++, name: p.name, x: r2(x), y: r2(y), z: r2(z), f: r2(face), b, l, items };
    this.corpses.push(c);
    this.broadcast({ k: 'corpse', c });
    if (this.corpses.length > MAX_CORPSES) this.broadcast({ k: 'corpseGone', id: this.corpses.shift()!.id });
  }

  /** 판 기록 저장 (보스전 결과 또는 사람이 없어 닫힘) */
  private saveRecord(result:'win' | 'lose' | 'abandoned', why:string | null) {
    if (!this.match || !this.stats.size) return;
    // 보스가 나왔던 판만 보스 기록 (지난 판 값이 남아 있지 않게)
    const bossed = this.phase !== 'play';
    const players = [ ...this.stats.entries() ].map(([ id, st ]) => {
      const f = this.fighters.get(id);
      return { ...st, bossDamage: bossed ? this.boss.dmgBy.get(st.name) ?? 0 : 0, aliveAtEnd: !!f && !f.respawnAt && st.leftAt === null };
    });
    this.records.save({
      matchId: this.match.id,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      result,
      why,
      difficulty: DIFF,
      bossHp: bossed ? this.boss.max : null,
      bossKiller: bossed ? this.boss.killer : null,
      players,
    });
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
    if (m?.k === 'ready') {
      if (this.phase !== 'lobby' || typeof m.on !== 'boolean' || this.ready.has(p.id) === m.on) return;
      if (m.on) this.ready.add(p.id);
      else this.ready.delete(p.id);
      this.lobbyDirty = true;
      return;
    }
    if (m?.k === 'drive') {
      this.drive(p);
      return;
    }
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
    // 시작 대기 중엔 걷기만 (쏘기·파밍 없음), 차 안에서는 무기·파밍·줍기 없음
    if (!me || me.respawnAt || this.phase === 'lobby' || this.cars.driving(p.id)) return;
    /* eslint-disable no-bitwise -- 행동 비트 */
    if (act & ACT_RELOAD && me.fire) {
      const w = heldWeapon(me.gear);
      if (w) reload(me.fire, weaponStats(w, me.gear[w]), aim.seq, STEP);
    }
    if (act & ACT_FIRE) this.shoot(p, me, now, aim);
    this.touchPick(p, me, now);
    const farmBit = (act & ACT_FARM) !== 0;
    if (!farmBit) me.farmFresh = false;
    else if (!me.farmPrev) me.farmFresh = true;
    me.farmPrev = farmBit;
    if (farmBit && now >= me.nextFarmAt) this.farm(p, me, now);
    /* eslint-enable no-bitwise */
  }

  /** 차 타기·내리기 (F·화면 버튼): 타고 있으면 내리고, 아니면 가까운 차에. 시작 대기·보스전 뒤로는 못 탄다 */
  private drive(p:ModePlayer) {
    const f = this.fighters.get(p.id);
    if (!f || f.respawnAt || f.spectator) return;
    if (this.cars.driving(p.id)) {
      this.cars.exit(p);
      return;
    }
    if (this.phase !== 'play') {
      this.host.say(this.phase === 'lobby' ? '게임이 시작되면 차를 탈 수 있습니다' : '보스전에는 차를 탈 수 없습니다', 'warn', p);
      return;
    }
    const why = this.cars.enter(p);
    if (why === null) this.host.say('가까이 탈 수 있는 차가 없습니다', 'warn', p);
    else if (why) this.host.say(why, 'warn', p);
  }

  /** 차가 칠 수 있는 것: 살아 있고 차에 안 탄 사람(무적 시간이면 피해 없이 차만 선다)·좀비 */
  private carVictims(now:number):CarVictim[] {
    const out:CarVictim[] = [];
    this.all.forEach((o) => {
      const f = this.fighters.get(o.id);
      if (!f || f.respawnAt || f.spectator || this.cars.driving(o.id)) return;
      out.push({
        id: o.id,
        x: o.body.x,
        z: o.body.z,
        b: o.body.b,
        hit: (dmg, by) => {
          if (now < f.shieldUntil) return;
          this.damage(o, Math.max(1, Math.round(dmg * (1 - armorCut(f.gear.armor)))), by, now, null, false, by.body);
        },
      });
    });
    this.horde.shotTargets(now, (by, id, dmg, killed) => {
      this.send(by, { k: 'hit', target: id, dmg, head: false });
      const st = this.stats.get(by.id);
      if (killed && st) st.zombieKills++;
    }).forEach((t) => out.push({ id: t.id, x: t.x, z: t.z, b: t.b, hit: (dmg, by) => t.hit(dmg, by) }));
    return out;
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
  /** src: 때린 쪽 자리 (화면의 맞은 방향 표시용, 없으면 by의 자리) */
  private damage(t:ModePlayer, dmg:number, by:ModePlayer | null, now:number, byName:string | null = null, head = false, src:{ x: number; z: number; } | null = null) {
    const f = this.fighters.get(t.id);
    if (!f || f.respawnAt || !Number.isFinite(dmg)) return;
    // 차 안에서는 전장 밖 피해(때린 쪽이 없는 것)만 받는다
    if (this.cars.driving(t.id) && (by || byName)) return;
    f.hp = Math.max(0, f.hp - dmg);
    f.hurtUntil = now + HURT_MS;
    const at = src ?? by?.body;
    this.send(t, { k: 'hurt', dmg, from: by?.name ?? byName, ...(at ? { at: [ Math.round(at.x * 10) / 10, Math.round(at.z * 10) / 10 ] as [number, number] } : {}) });
    if (by) this.send(by, { k: 'hit', target: t.id, dmg, head });
    // 기록: 준 피해·처치·사망
    const bySt = by ? this.stats.get(by.id) : undefined;
    if (bySt) bySt.damage += dmg;
    if (f.hp <= 0) {
      if (bySt) bySt.kills++;
      if (by) this.announce.kill(by, t, now);
      const st = this.stats.get(t.id);
      if (st) st.deaths++;
      this.die(t, f, by?.name ?? byName, now);
    }
  }

  private die(p:ModePlayer, f:Fighter, by:string | null, now:number) {
    // 차 안에서 죽으면(전장 밖) 내린 자리에 쓰러진다
    this.cars.exit(p);
    this.announce.died(p);
    // 보스전이 시작되면 다시 시작 못 함 → 잠깐 누워 있다가 관전
    const noRespawn = this.phase !== 'play';
    const wait = noRespawn ? -1 : respawnDelay(this.zone().stage);
    if (noRespawn) this.spectate(p, f, 'dead', now);
    else f.respawnAt = now + wait;
    // 가진 장비는 시체에 남는다
    this.dropCorpse(p, f);
    this.broadcast({ k: 'kill', killer: by, victim: p.name });
    this.send(p, { k: 'dead', by, wait });
  }

  tick(now:number) {
    // 맞힐 대상 목록은 틱마다 새로 (입력 처리 중 만든 것은 이번 틱 화살까지만 쓰고 버린다)
    this.targetsNow = null;
    if (!this.match) return;
    const all = [ ...this.host.players() ];
    this.all = all;
    if (!all.length) {
      if (!this.emptyAt) this.emptyAt = now;
      else if (now - this.emptyAt > EMPTY_CLOSE_MS) {
        console.log(`[br] match #${this.match.id} closed (empty)`);
        // 시작도 안 한 판(시작 대기)은 기록하지 않는다
        if (this.phase !== 'end' && this.phase !== 'lobby') this.saveRecord('abandoned', null);
        this.match = null;
        this.emptyAt = 0;
      }
      return;
    }
    this.emptyAt = 0;
    // 시작 대기: 시계를 멈추고 준비만 본다 (좀비·전장 피해·보스 없음)
    if (this.phase === 'lobby') {
      this.lobbyTick(now, all);
      if (this.phase === 'lobby') {
        this.lobbyStatus(now, all);
        return;
      }
    }
    if (this.phase === 'play') this.announce.play(this.elapsed, DAY_OFFSET, this.zone());
    // 20분: 최종 원 가운데에 보스
    if (this.phase === 'play' && this.elapsed >= MATCH_MS) {
      this.phase = 'boss';
      // 보스전: 모두 차에서 내린다 (이제 못 탄다)
      this.cars.exitAll();
      const alive = all.filter((p) => !this.fighters.get(p.id)?.respawnAt).length;
      this.boss.spawn(this.match.circles[this.match.circles.length - 1], alive, DIFF, now);
      // 땅의 좀비는 모두 불타 사라지고, 이제부터는 보스가 부르는 좀비만
      this.horde.burnAll(now);
      this.announce.bossAppear();
      // 기록: 보스가 나온 순간의 장비 (보스 체력을 맞추는 기준)
      all.forEach((p) => {
        const f = this.fighters.get(p.id);
        const st = this.stats.get(p.id);
        if (f && st && !f.respawnAt) st.gearAtBoss = { ...f.gear };
      });
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
      if (this.boss.alive) this.announce.boss(this.boss.hp / this.boss.max, BOSS_LIMIT_MS - (now - this.boss.spawnedAt));
      if (!this.boss.alive) this.openExit(now);
      else if (!standing) this.finish('lose', now, 'wiped');
      else if (now - this.boss.spawnedAt > BOSS_LIMIT_MS) this.finish('lose', now, 'time');
    } else if (this.phase === 'escape' && this.exit) {
      // 탈출전: 쓰러진 보스는 누워 있고, 열린 탈출구에 먼저 닿는 사람이 치킨
      this.boss.tick(now, all);
      const ex = this.exit;
      const standing = all.filter((p) => {
        const f = this.fighters.get(p.id);
        return f && !f.respawnAt;
      });
      this.announce.escape(now - ex.openAt);
      const winner = now >= ex.openAt ? standing.find((p) => p.body.b < 0 && Math.abs(p.body.y - ex.y) < 3 && Math.hypot(p.body.x - ex.x, p.body.z - ex.z) <= ESCAPE.radius) : undefined;
      if (winner) {
        this.finish('win', now, undefined, winner.name);
      } else if (!standing.length) this.finish('lose', now, 'wiped');
      else if (now - ex.openAt > ESCAPE.limitMs) this.finish('lose', now, 'noescape');
    }
    // 결과를 보여 준 뒤 새 판: 모두 새 원 안에서 살아난다
    if (this.phase === 'end' && now >= this.endAt) {
      this.newMatch();
      all.forEach((p) => {
        this.revive(p, this.spawnBody(), now);
        this.stats.set(p.id, newStats(p.name, now, false));
      });
      this.broadcast(this.matchMsg());
      this.broadcast({ k: 'corpses', list: [] });
      this.broadcast({ k: 'items', list: this.items.list() });
      this.broadcast({ k: 'props', list: this.props.list() });
      this.matchSentAt = now;
      // 다음 틱부터 시작 대기
      return;
    }
    if (now - this.matchSentAt >= MATCH_EVERY_MS) {
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
    // 보스전·탈출전에는 낮에도 좀비가 생긴다 (끝나면 해가 떠 있으면 불탄다)
    // 보스전·탈출전: 보스가 부른 좀비는 낮이어도 남고, 저절로 생기는 좀비는 없다
    this.cars.tick(() => this.carVictims(now));
    this.horde.tick(now, dayNight(this.elapsed + DAY_OFFSET).night || this.phase === 'boss' || this.phase === 'escape', all, this.phase === 'play');
    const tA = performance.now();
    this.flyArrows(now);
    this.arrowMs = Math.max(this.arrowMs * 0.98, performance.now() - tA);
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
        this.announce.respawn(p);
        return;
      }
      // 중독: 1초마다 피해
      if (!f.respawnAt && f.poisonUntil > now && now >= f.poisonAt) {
        f.poisonAt += 1000;
        this.damage(p, BALL.poisonDps, null, now, '독');
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

  /** 보스가 쓰러짐: 그 자리에 탈출구, 휴전 카운트다운 */
  private openExit(now:number) {
    const b = this.boss.npc?.body;
    this.phase = 'escape';
    this.exit = { x: b?.x ?? 0, y: 0, z: b?.z ?? 0, openAt: now + ESCAPE.truceMs };
    const r1 = (n:number) => Math.round(n * 10) / 10;
    this.broadcast({ k: 'exit', x: r1(this.exit.x), y: 0, z: r1(this.exit.z), r: ESCAPE.radius, opensIn: ESCAPE.truceMs });
    this.announce.bossDown(this.boss.killer);
    console.log(`[br] boss down by ${this.boss.killer} → exit at ${Math.round(this.exit.x)},${Math.round(this.exit.z)}`);
  }

  /** 휴전 중인지: 보스전, 그리고 보스가 쓰러진 뒤 탈출구가 열리기 전까지 (사람끼리 피해 없음 — 총알이 그냥 지나간다) */
  private truce(now:number) {
    return this.phase === 'boss' || (this.phase === 'escape' && !!this.exit && now < this.exit.openAt);
  }

  /** 판 끝: 결과(치킨·마지막 일격·보스 피해 순위)를 알리고 RESULT_MS 뒤 새 판 */
  private finish(result:'win' | 'lose', now:number, why?:'time' | 'wiped' | 'noescape', chicken:string | null = null) {
    this.saveRecord(result, why ?? null);
    const top = [ ...this.boss.dmgBy.entries() ].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([ n, d ]):[string, number] => [ n, Math.round(d) ]);
    this.broadcast({ k: 'boss', id: this.boss.npc?.id ?? 0, hp: 0, max: this.boss.max, remain: 0 });
    // 좀비 처치 순위 (한 마리 이상)
    const zk = [ ...this.stats.values() ].filter((s) => s.zombieKills > 0).sort((a, b) => b.zombieKills - a.zombieKills).slice(0, 5).map((s):[string, number] => [ s.name, s.zombieKills ]);
    this.broadcast({ k: 'end', result, why, killer: this.boss.killer, chicken, top, zk, next: RESULT_MS });
    this.announce.end(result, why, chicken);
    console.log(`[br] match #${this.match?.id} ${result} (killer ${this.boss.killer}, chicken ${chicken})`);
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