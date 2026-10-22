/* eslint-disable no-bitwise -- 상태·행동 비트 */
import * as THREE from 'three';
import {
  ACT_FARM, ACT_FIRE, ACT_RELOAD, BOSS, BrClientMsg, BrServerMsg, dayNight, FARM, ST_BURN, ST_SLAM, Z_BOSS, Z_RUNNER, Z_WALKER, Corpse, emptyGear, gaugeHp, Gear, isBrMsg, ITEM_KINDS, ITEM_NAMES, MatchPlan, meleeReaches, ST_DEAD, ST_HURT, ST_SHIELD, ST_SWING,
  canFire, fire, isConsumable, WEAPON_KINDS, FireState, fullMag, heldWeapon, isWeapon, MOVING_SPEED, PROP_KINDS, PROP_NAMES, PROP_RADIUS, reload, shotDirs, WeaponKind, weaponStats, zoneAt, ZoneNow,
} from 'yeouido-br';
import { castRay, STEP } from 'yeouido-sim';

import { ITEM_COLORS, ItemMeshes } from './item-meshes';
import { PropMeshes } from './prop-meshes';
import { HIT_AIR, HIT_BODY, HIT_HEAD, HIT_SURFACE, ShotFx } from './shot-fx';
import { ViewGun } from './view-gun';

import { createPerson, Person } from '../../player/person';
import { pixelSnap, stepAngle } from '../../ui/pixel-snap';
import { ActAim, Appearance, Look, ModeClient, ModeFrame, ModeHostClient } from '../mode-client';

/** 총구 높이 (발에서, m) — 서버와 같게 */
const MUZZLE_Y = 1.4;
/** 1인칭 내 총구를 그리는 자리: 몸 가운데에서 앞·오른쪽·아래로 (m, 화면만) */
const FP_MUZZLE = { forward: 0.9, right: 0.25, down: 0.08, flash: 0.22 };
/** 경계 벽 높이 (m) */
const WALL_H = 600;
/** 알림(누가 누구를) 보여 주는 시간 (ms) */
const FEED_MS = 6000;
/** 때린 피해 숫자 보여 주는 시간 (ms) */
const HIT_MS = 700;
/** 다른 사람 휘두르는 동작 길이 (ms) — 무기마다 조금 다르지만 화면용이라 하나로 */
const REMOTE_SWING_MS = 320;
/** 맞힘 표시(조준선 X)가 보이는 시간 (ms) */
const HIT_MARK_MS = 180;
/** 주운 것 알림 시간 (ms) */
const GOT_MS = 2500;

/** HUD가 읽는 상태 (BrHud만 뜻을 안다) */
export interface BrHudState {
  zone: { stage: number; shrinking: boolean; untilChange: number; remain: number; outside: number; } | null;
  /** 낮밤: 밤인지, 지금 낮/밤이 끝날 때까지 초 */
  day: { night: boolean; remain: number; } | null;
  hp: number;
  shield: boolean;
  /** 죽었으면: 누구에게(null = 전장), 다시 시작까지 초 */
  dead: { by: string | null; wait: number; } | null;
  feed: { id: number; text: string; }[];
  /** 맞힘 표시 (조준선 X, 0~1 사라지는 정도·머리) */
  hitMark: { age: number; head: boolean; } | null;
  /** 방금 내가 준 피해 (사라지는 숫자, 머리면 크게) */
  hits: { id: number; dmg: number; age: number; head: boolean; }[];
  /** 방금 맞음 (0~1, 화면 가장자리 붉게) */
  hurt: number;
  /** 중독: 남은 초 (0 = 아님, 화면 가장자리 초록) */
  poison: number;
  /** 내 장비 (칸마다 단계, 0 = 없음) */
  gear: Gear;
  /** 방금 주운 것 */
  got: { id: number; text: string; }[];
  /** 든 무기: 이름·단계, 탄창, 재장전 진행 0~1(재장전 중이 아니면 null), 스코프 중인지·스코프가 있는지 */
  /** reloadFrom·reloadTo: 재장전 시작·끝 시각 (performance.now 기준 — 막대를 화면이 직접 애니메이션) */
  weapon: { kind: WeaponKind; name: string; lv: number; ammo: number; mag: number; reload: number | null; reloadFrom: number; reloadTo: number; scoped: boolean; scope: boolean; } | null;
  /** 좌클릭으로 할 수 있는 것 (앞쪽 가까이) */
  prompt: string | null;
  /** 누름을 모드에 먼저 (터치 버튼: 스코프 켜기·끄기) */
  press: (button:'left' | 'right') => boolean;
  /** 보스: 체력 비율 0~1·체력·남은 초 (안 나왔으면 null) */
  boss: { ratio: number; hp: number; remain: number; } | null;
  /** 판 끝 결과 (새 판까지 남은 초) */
  end: { result: 'win' | 'lose'; why?: 'time' | 'wiped' | 'noescape'; killer: string | null; chicken: string | null; mine: boolean; top: [string, number][]; zk: [string, number][]; next: number; } | null;
  /** 휴전·탈출: 보스전 휴전 중, 탈출구까지 거리(m)·열리기까지 초(0 = 열림) */
  escape: { truce: boolean; exitDist: number | null; opensIn: number; } | null;
  /** 관전 중: 보고 있는 사람(null = 보스), 이유(dead 보스전 중 쓰러짐·late 늦게 들어옴) */
  spec: { target: string | null; reason: 'dead' | 'late'; } | null;
  /** 관전 대상 바꾸기 (HUD 버튼) */
  watch: (dir:1 | -1) => void;
}

interface ShownCorpse {
  c: Corpse; person: Person;
  /** 아이템이 남아 있으면 위에 반짝이는 표시 */
  loot: THREE.Mesh;
}

/**
 * 배틀로얄 모드 화면 (게임성 측정용 PoC): 전장 원(3D 벽·미니맵), 시체, 체력·사망·알림 HUD 상태.
 */
export class BrClient implements ModeClient {

  private host:ModeHostClient;

  private match:{ plan:MatchPlan; startAt:number; dayOffset:number; } | null = null;

  private wall:THREE.Mesh;

  private corpses = new Map<number, ShownCorpse>();

  private feed:{ id: number; text: string; at: number; }[] = [];

  private hits:{ id: number; dmg: number; at: number; head: boolean; }[] = [];

  private seq = 0;

  private hurtAt = -1e9;

  private deadInfo:{ by: string | null; until: number; } | null = null;

  /** 휘두르기 시작 시각 (사람 키마다: 0 = 나) — 비트가 켜진 순간을 잡아 동작 진행을 맞춘다 */
  private swingAt = new Map<number, number>();

  private localSwingAt = -1e9;

  /** 이 화면에서 잰 다음 파밍 가능 시각 */
  private localFarmAt = 0;

  /** 내 탄창 (서버와 같은 걸음 셈 — 쏠 수 없는 걸음엔 사격 비트를 빼고 보낸다), 장비가 바뀌면 새로 */
  private fs:FireState | null = null;

  private fsKey = '';

  /** 다음 발 가능 시각·재장전이 시작·끝나는 시각 (화면 표시·예약용) */
  private readyAt = 0;

  private reloadFrom = 0;

  private reloadTo = 0;

  /** 스코프 중 (화면만의 상태: 시야만 당긴다) */
  private scoped = false;

  /** 지난 장면이 원근(1인칭)이었나 — 위 시점에선 스코프 없이 바로 쏜다 */
  private persp = false;

  /** 이번 장면에 그릴 내 발사 (화면의 내 자리에서): 알마다 끝, 화살이면 방향·속도·낙차 */
  private ownShot:{ kind: WeaponKind; o: [number, number, number]; es: [number, number, number][]; dirs: [number, number, number][]; hitscan: boolean; speed: number; g: number; range: number; } | null = null;

  /** 맞힘 표시 (조준선 X): 서버가 맞혔다고 알린 시각·머리인지 */
  private hitMarkAt = -1e9;

  private hitMarkHead = false;

  private prompt:string | null = null;

  private me:ModeFrame['me'] | null = null;

  private zoneNow:ZoneNow | null = null;

  private items:ItemMeshes;

  private props:PropMeshes;

  private shots:ShotFx;

  /** 1인칭 손에 든 총 */
  private viewGun:ViewGun;

  private bossInfo:{ hp: number; max: number; remain: number; at: number; } | null = null;

  private specInfo:{ target: string | null; reason: 'dead' | 'late'; } | null = null;

  private endInfo:{ result: 'win' | 'lose'; why?: 'time' | 'wiped' | 'noescape'; killer: string | null; chicken: string | null; top: [string, number][]; zk: [string, number][]; until: number; } | null = null;

  /** 탈출구 (보스가 쓰러진 자리)·열리는 시각, 화면 표시(바닥 고리·빛기둥) */
  private exitInfo:{ x: number; y: number; z: number; r: number; openAt: number; } | null = null;

  private exitRing:THREE.Mesh;

  private exitBeam:THREE.Mesh;

  /** 땅 울리기 경고 원 */
  private slamRing:THREE.Mesh;

  /** 보스 도약 착지 자리 경고 (자리·끝나는 시각) */
  private landRing:THREE.Mesh;

  private landUntil = 0;

  /** 보스 번호, 독 파이어볼을 모으는 동안 (초록으로 빛남) */
  private bossId = 0;

  private castUntil = 0;

  private poisonUntil = 0;

  private gear:Gear = emptyGear();

  private got:{ id: number; text: string; at: number; }[] = [];

  private lootGeo = new THREE.OctahedronGeometry(0.22);

  private lootMat = new THREE.MeshBasicMaterial({ color: '#ffd84a' });

  constructor(host:ModeHostClient) {
    this.host = host;
    // 전장 경계: 반경 1짜리 열린 원통을 원 크기로 늘린다 (안팎 모두 보이게, 안개 없이)
    this.wall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 256, 1, true),
      new THREE.MeshBasicMaterial({ color: '#4aa8ff', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    this.wall.renderOrder = 10;
    this.wall.visible = false;
    host.scene.add(this.wall);
    this.items = new ItemMeshes(host.scene);
    this.props = new PropMeshes(host.scene);
    this.shots = new ShotFx(host.scene);
    this.viewGun = new ViewGun(host.camera);
    this.slamRing = new THREE.Mesh(
      new THREE.CircleGeometry(BOSS.slamRange, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.slamRing.visible = false;
    host.scene.add(this.slamRing);
    pixelSnap.add(this.slamRing);
    this.landRing = new THREE.Mesh(
      new THREE.RingGeometry(BOSS.slamRange - 1.2, BOSS.slamRange, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.landRing.visible = false;
    host.scene.add(this.landRing);
    // 탈출구: 바닥 고리 + 하늘까지 빛기둥 (열리기 전 흰색, 열리면 금색)
    this.exitRing = new THREE.Mesh(new THREE.RingGeometry(1.4, 2, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd84a', side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    this.exitBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 120, 24, 1, true).translate(0, 60, 0), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    this.exitRing.visible = false;
    this.exitBeam.visible = false;
    host.scene.add(this.exitRing, this.exitBeam);
  }

  /** 관전 대상 바꾸기 요청 */
  private watch = (dir:1 | -1) => this.host.send({ k: 'watch', dir } satisfies BrClientMsg);

  receive(d:unknown, now:number) {
    if (!isBrMsg(d)) return;
    const m = d as BrServerMsg;
    if (m.k === 'match') {
      const startAt = now - m.elapsed;
      // 같은 판이면 시계는 큰 차이만 맞춘다 (받는 지연만큼 흔들리지 않게)
      if (this.match?.plan.id === m.id && Math.abs(this.match.startAt - startAt) < 300) return;
      // 새 판이면 지난 판 결과·보스 표시를 지운다
      if (this.match?.plan.id !== m.id) {
        this.endInfo = null;
        this.exitInfo = null;
        this.specInfo = null;
        this.deadInfo = null;
        this.bossInfo = null;
      }
      this.match = { plan: { id: m.id, circles: m.circles.map(([ cx, cz, r ]) => ({ cx, cz, r })) }, startAt, dayOffset: m.dayOffset ?? 0 };
    } else if (m.k === 'corpses') {
      [ ...this.corpses.keys() ].forEach((id) => this.removeCorpse(id));
      m.list.forEach((c) => this.addCorpse(c));
    } else if (m.k === 'corpse') this.addCorpse(m.c);
    else if (m.k === 'corpseGone') this.removeCorpse(m.id);
    else if (m.k === 'notice') this.pushFeed(m.text, now);
    else if (m.k === 'kill') this.pushFeed(m.killer ? `${m.killer} ▶ ${m.victim}` : `${m.victim} 전장 밖에서 쓰러짐`, now);
    else if (m.k === 'hit') {
      this.hitMarkAt = now;
      this.hitMarkHead = !!m.head;
      this.hits.push({ id: ++this.seq, dmg: m.dmg, at: now, head: !!m.head });
      if (this.hits.length > 6) this.hits.shift();
    } else if (m.k === 'hurt') this.hurtAt = now;
    // wait < 0: 이번 판은 다시 시작 못 함 (보스전) — 곧 관전으로 바뀐다
    else if (m.k === 'dead') this.deadInfo = { by: m.by, until: m.wait < 0 ? -1 : now + m.wait };
    else if (m.k === 'respawn') {
      this.deadInfo = null;
      this.poisonUntil = 0;
    } else if (m.k === 'spectate') {
      this.specInfo = { target: m.target, reason: m.reason };
      this.deadInfo = null;
    } else if (m.k === 'items') {
      this.items.clear();
      m.list.forEach((it) => this.items.add(it));
    } else if (m.k === 'itemAdd') m.list.forEach((it) => this.items.add(it));
    else if (m.k === 'itemGone') m.ids.forEach((id) => this.items.remove(id));
    else if (m.k === 'looted') {
      const sc = this.corpses.get(m.id);
      if (sc) {
        sc.c.items = [];
        sc.loot.visible = false;
      }
    } else if (m.k === 'props') {
      this.props.clear();
      m.list.forEach((r) => this.props.add(r));
    } else if (m.k === 'propAdd') m.list.forEach((r) => this.props.add(r));
    else if (m.k === 'propHit') this.props.hit(m.id, m.hp, now);
    else if (m.k === 'propGone') m.ids.forEach((id) => this.props.remove(id));
    else if (m.k === 'hitProp') {
      this.props.hit(m.id, -1, now);
      this.hits.push({ id: ++this.seq, dmg: m.dmg, at: now, head: false });
      if (this.hits.length > 6) this.hits.shift();
    } else if (m.k === 'boss') {
      this.bossId = m.id;
      this.bossInfo = m.hp > 0 ? { hp: m.hp, max: m.max, remain: m.remain, at: now } : null;
    } else if (m.k === 'exit') {
      // 보스가 쓰러졌다: 보스 막대는 내리고 탈출구를 띄운다
      this.exitInfo = { x: m.x, y: m.y, z: m.z, r: m.r, openAt: now + m.opensIn };
      this.bossInfo = null;
    } else if (m.k === 'bossCast') this.castUntil = now + m.ms;
    else if (m.k === 'ball') this.shots.ball(m.id, m.o, m.v, m.g, now);
    else if (m.k === 'ballEnd') this.shots.ballEnd(m.id, m.at, m.splash, now);
    else if (m.k === 'poison') this.poisonUntil = now + m.ms;
    else if (m.k === 'bossLeap') {
      this.landRing.position.set(m.x, 0.08, m.z);
      this.landUntil = now + m.ms;
    } else if (m.k === 'end') {
      this.endInfo = { result: m.result, why: m.why, killer: m.killer, chicken: m.chicken ?? null, top: m.top, zk: m.zk ?? [], until: now + m.next };
      this.exitInfo = null;
      this.bossInfo = null;
    // 내 총·화살은 쏠 때 이미 그렸다 (서버 알림은 늦게 와서 그사이 지나온 자리에서 나가 보인다) — 화살은 번호만 잇는다
    } else if (m.k === 'shot') {
      if (m.by !== this.host.myId()) {
        const kind = WEAPON_KINDS[m.w] ?? 'pistol';
        this.shots.flash(m.o, kind, now);
        m.es.forEach((e, i) => this.shots.impact(e, m.o, kind, m.ht?.[i] ?? HIT_SURFACE, now));
      }
    } else if (m.k === 'arrow') {
      if (m.by === this.host.myId()) this.shots.bindOwn(m.id);
      else this.shots.arrow(m.id, m.o, m.d, m.v, m.range, now, m.g);
    } else if (m.k === 'arrowEnd') this.shots.arrowEnd(m.id, m.at, now);
    else if (m.k === 'gear') this.setGear(m.gear);
    else if (m.k === 'got') {
      const k = ITEM_KINDS[m.kind];
      const what = isConsumable(k) ? `${ITEM_NAMES[k]} · 체력 +${m.lv}%` : `${ITEM_NAMES[k]} +${m.lv}`;
      this.got.push({ id: ++this.seq, text: `${what}${m.from === 'corpse' ? ' (시체)' : ''}`, at: now });
      if (this.got.length > 4) this.got.shift();
    }
  }

  /** 장비가 바뀜: 무기가 바뀌거나 강화되면 탄창 가득 (서버도 같은 때 채운다), 스코프 끄기 */
  private setGear(g:Gear) {
    this.gear = g;
    const w = heldWeapon(g);
    const key = w ? `${w}:${g[w]}` : '';
    if (key === this.fsKey) return;
    this.fsKey = key;
    this.fs = w ? fullMag(weaponStats(w, g[w])) : null;
    this.readyAt = 0;
    this.reloadFrom = 0;
    this.reloadTo = 0;
    this.scoped = false;
  }

  /** 내 화면에 보이는 사람·NPC 중 광선이 먼저 닿는 것 (세운 원기둥, 서버 판정과 같은 모양) — 맞은 자리·머리인지 */
  private rayOthers(o:[number, number, number], d:[number, number, number], maxT:number, others:ModeFrame['others']) {
    let best:{ t: number; at: [number, number, number]; head: boolean; } | null = null;
    const hl2 = d[0] * d[0] + d[2] * d[2];
    if (hl2 < 1e-6) return null;
    others.forEach((p) => {
      if (p.s & ST_DEAD) return;
      const boss = p.k === Z_BOSS;
      const r = boss ? BOSS.radius : 0.4;
      const h = boss ? BOSS.height : 1.8;
      const t = ((p.x - o[0]) * d[0] + (p.z - o[2]) * d[2]) / hl2;
      const dd = Math.hypot(o[0] + d[0] * t - p.x, o[2] + d[2] * t - p.z);
      if (dd > r) return;
      const enter = t - Math.sqrt(r * r - dd * dd) / Math.sqrt(hl2);
      if (enter < 0 || enter > maxT || (best && enter >= best.t)) return;
      const y = o[1] + d[1] * enter;
      if (y < p.y || y > p.y + h) return;
      best = { t: enter, at: [ o[0] + d[0] * enter, y, o[2] + d[2] * enter ], head: y >= p.y + h * 0.82 };
    });
    return best as { t: number; at: [number, number, number]; head: boolean; } | null;
  }

  private myName() {
    return this.host.myName();
  }

  private weaponNow() {
    const w = heldWeapon(this.gear);
    return w ? { w, st: weaponStats(w, this.gear[w]) } : null;
  }

  /** 좌클릭으로 할 수 있는 것: 앞쪽 가까이 있는 땅 아이템·털 시체·부술 물건 중 가장 가까운 것 (서버 파밍과 같은 규칙) */
  private farmPrompt(me:ModeFrame['me']) {
    const space = (y:number, b:number, l:number) => b === me.b && (b >= 0 ? l === me.l : Math.abs(y - me.y) <= 1.6);
    const reach = (x:number, y:number, z:number, b:number, l:number, extra = 0) => space(y, b, l) && meleeReaches(me, { x, y, z, f: 0, b, l }, FARM.range + extra, FARM.cosArc);
    let best:{ d: number; text: string; } | null = null;
    const offer = (x:number, z:number, text:string) => {
      const d = Math.hypot(x - me.x, z - me.z);
      if (!best || d < best.d) best = { d, text };
    };
    const held = heldWeapon(this.gear);
    this.items.list.forEach(({ it }) => {
      if (Math.abs(it[3] - me.x) > 4 || Math.abs(it[5] - me.z) > 4 || !reach(it[3], it[4], it[5], it[6], it[7])) return;
      const k = ITEM_KINDS[it[1]];
      if (isConsumable(k)) {
        offer(it[3], it[5], gaugeHp(me.gv) >= 100 ? `${ITEM_NAMES[k]} ${it[2]}% (체력 가득)` : `좌클릭: ${ITEM_NAMES[k]} ${it[2]}% 먹기`);
        return;
      }
      const swap = held && isWeapon(k) && k !== held ? ` (${ITEM_NAMES[held]} 버림)` : '';
      offer(it[3], it[5], `좌클릭: ${ITEM_NAMES[k]} +${it[2]} 줍기${swap}`);
    });
    this.corpses.forEach(({ c }) => {
      if (c.items.length && reach(c.x, c.y, c.z, c.b, c.l)) offer(c.x, c.z, '좌클릭: 시체 털기');
    });
    this.props.rows.forEach((r) => {
      const k = PROP_KINDS[r[1]];
      if (Math.abs(r[3] - me.x) > 4 || Math.abs(r[5] - me.z) > 4 || !reach(r[3], r[4], r[5], r[6], r[7], PROP_RADIUS[k])) return;
      offer(r[3], r[5], `좌클릭: ${PROP_NAMES[k]} 부수기${this.gear.hammer ? ' (망치)' : ''}`);
    });
    return (best as { text: string; } | null)?.text ?? null;
  }

  private pushFeed(text:string, now:number) {
    this.feed.push({ id: ++this.seq, text, at: now });
    if (this.feed.length > 5) this.feed.shift();
  }

  private addCorpse(c:Corpse) {
    if (this.corpses.has(c.id)) return;
    const person = createPerson({ shirt: '#6b6b74', pants: '#3b3b44', skin: '#b9a48f', hair: '#2a1d14' });
    person.root.position.set(c.x, c.y, c.z);
    person.root.rotation.y = c.f;
    person.animate(0, 0);
    person.pose({ swing: 0, down: true, glow: null });
    this.host.scene.add(person.root);
    const loot = new THREE.Mesh(this.lootGeo, this.lootMat);
    loot.position.set(c.x, c.y + 0.9, c.z);
    loot.visible = c.items.length > 0;
    this.host.scene.add(loot);
    this.corpses.set(c.id, { c, person, loot });
  }

  private removeCorpse(id:number) {
    const s = this.corpses.get(id);
    if (!s) return;
    this.host.scene.remove(s.person.root);
    this.host.scene.remove(s.loot);
    s.person.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.corpses.delete(id);
  }

  frame(f:ModeFrame) {
    this.me = f.me;
    this.persp = f.persp;
    if (!f.persp || this.deadInfo || this.specInfo) this.scoped = false;
    this.prompt = this.deadInfo || this.specInfo ? null : this.farmPrompt(f.me);
    const zone = this.match ? zoneAt(this.match.plan, f.now - this.match.startAt) : null;
    this.zoneNow = zone;
    this.wall.visible = !!zone;
    if (zone) {
      this.wall.position.set(zone.cx, WALL_H / 2 - 5, zone.cz);
      this.wall.scale.set(zone.r, WALL_H, zone.r);
    }
    // 시체: 실외 것은 늘, 실내 것은 같은 건물·층일 때만
    const spin = stepAngle(f.now / 400);
    this.corpses.forEach(({ c, person, loot }) => {
      person.root.visible = c.b < 0 || (c.b === f.me.b && c.l === f.me.l);
      loot.visible = person.root.visible && c.items.length > 0;
      loot.rotation.y = spin;
    });
    this.items.update(f.now, f.me);
    this.props.update(f.now, f.me);
    // 내 발사: 화면에 그린 내 자리(총구 높이)에서, 서버와 같은 방향, 벽에서 멈춤
    if (this.ownShot) {
      const { kind, o: so, es, dirs, hitscan, speed, g, range } = this.ownShot;
      this.ownShot = null;
      const o:[number, number, number] = [ f.me.x, f.me.y + MUZZLE_Y, f.me.z ];
      // 1인칭: 총구를 눈앞 가운데가 아니라 오른쪽 아래·조금 앞에 (불꽃·총알이 조준선을 가리지 않게) — 끝점은 그대로라 조준선으로 모인다
      if (f.persp) {
        const sf = Math.sin(f.me.f);
        const cf = Math.cos(f.me.f);
        o[0] += sf * FP_MUZZLE.forward - cf * FP_MUZZLE.right;
        o[2] += cf * FP_MUZZLE.forward + sf * FP_MUZZLE.right;
        o[1] -= FP_MUZZLE.down;
      }
      // 1인칭: 손에 든 총이 튀고 총구에서 불꽃 (화면 오른쪽 아래), 위 시점: 몸 앞 총구 불꽃
      if (f.persp) this.viewGun.fire(kind, f.now);
      if (hitscan) {
        if (!f.persp) this.shots.flash(o, kind, f.now);
        // 맞은 자리: 내 화면에 보이는 사람·좀비·보스에 먼저 닿으면 그 자리(피), 아니면 벽·땅(파편), 사거리 끝이면 없음 — 서버 확인을 기다리지 않고 바로
        dirs.forEach((d, i) => {
          const wall = Math.hypot(es[i][0] - so[0], es[i][1] - so[1], es[i][2] - so[2]);
          const hit = this.rayOthers(so, d, wall, f.others);
          if (hit) this.shots.impact(hit.at, so, kind, hit.head ? HIT_HEAD : HIT_BODY, f.now);
          else this.shots.impact(es[i], so, kind, wall < range - 0.05 ? HIT_SURFACE : HIT_AIR, f.now);
        });
      } else dirs.forEach((d) => this.shots.ownArrow(o, d, speed, range, f.now, g));
    }
    this.shots.update(f.now);
    // 손에 든 총: 1인칭에서 무기가 있고 스코프·죽음·관전이 아닐 때
    const wn = this.weaponNow();
    this.viewGun.update(f.now, wn?.w ?? null, f.persp && !this.scoped && !this.deadInfo && !this.specInfo, f.now < this.reloadTo);
    // 보스가 땅을 울리려 하면 바닥에 붉은 경고 원 (깜빡임)
    const boss = f.others.find((o) => o.k === Z_BOSS && (o.s & ST_SLAM));
    this.slamRing.visible = !!boss && Math.floor(f.now / 120) % 2 === 0;
    // 보스가 날아오는 동안 착지 자리에 붉은 고리 (안쪽 원도 같이 깜빡여 피할 곳을 알린다)
    const landing = f.now < this.landUntil;
    this.landRing.visible = landing;
    if (landing && !boss) {
      this.slamRing.position.copy(this.landRing.position);
      this.slamRing.visible = Math.floor(f.now / 120) % 2 === 0;
    }
    if (boss) this.slamRing.position.set(boss.x, boss.y + 0.05, boss.z);
    // 탈출구
    const ex = this.exitInfo;
    this.exitRing.visible = !!ex;
    this.exitBeam.visible = !!ex;
    if (ex) {
      const open = f.now >= ex.openAt;
      this.exitRing.position.set(ex.x, ex.y + 0.07, ex.z);
      this.exitBeam.position.set(ex.x, ex.y, ex.z);
      const c = open ? '#ffd84a' : '#f4f4f8';
      (this.exitRing.material as THREE.MeshBasicMaterial).color.set(c);
      (this.exitBeam.material as THREE.MeshBasicMaterial).color.set(c);
      (this.exitBeam.material as THREE.MeshBasicMaterial).opacity = open ? 0.25 + 0.1 * Math.sin(f.now / 150) : 0.15;
    }
  }

  acted(act:number, now:number, aim:ActAim) {
    const dead = !!this.deadInfo || !!this.specInfo;
    let out = act;
    // 파밍: 누른 순간 손을 쓴다 (치기·줍기 결과는 서버가 알려 준다)
    if (act & ACT_FARM && now >= this.localFarmAt && !dead) {
      if (this.prompt?.includes('부수기')) this.localSwingAt = now;
      this.localFarmAt = now + (this.prompt?.includes('부수기') ? FARM.hitMs : FARM.pickMs);
    }
    const wn = this.weaponNow();
    const { fs } = this;
    if (act & ACT_RELOAD && wn && fs && !dead && reload(fs, wn.st, aim.seq, STEP)) {
      this.reloadFrom = now;
      this.reloadTo = now + (fs.nextSeq - aim.seq) * STEP * 1000;
      this.readyAt = this.reloadTo;
      this.scoped = false;
    }
    if (!(act & ACT_FIRE)) return out;
    // 쏠 수 없는 걸음(탄창 대기·재장전 중)에는 사격 비트를 빼고 보낸다 — 서버는 내가 쏜(그린) 그 걸음의 조준으로만 쏜다
    if (!wn || !fs || dead || !canFire(fs, aim.seq)) return out & ~ACT_FIRE;
    const { st } = wn;
    fire(fs, st, aim.seq, STEP);
    this.readyAt = now + (fs.nextSeq - aim.seq) * STEP * 1000;
    if (fs.reloading) {
      // 탄창이 비었다: 바로 재장전 (스코프는 내린다)
      this.reloadFrom = now;
      this.reloadTo = this.readyAt;
      this.scoped = false;
    }
    // 알마다 서버와 같은 퍼짐 (걸음 번호로 정해짐), 끝(벽·땅·사거리)은 서버와 같은 걸음 자리에서
    const dirs = shotDirs(st, aim.f, aim.pitch, aim.seq, aim.a > MOVING_SPEED);
    const o = [ aim.x, aim.y + MUZZLE_Y, aim.z ];
    const es = dirs.map((d):[number, number, number] => {
      const wall = castRay(this.host.sim, o[0], o[1], o[2], d[0], d[1], d[2], st.range, aim.b, aim.l);
      return [ o[0] + d[0] * wall, o[1] + d[1] * wall, o[2] + d[2] * wall ];
    });
    this.ownShot = { kind: wn.w, o: [ o[0], o[1], o[2] ], es, dirs, hitscan: st.hitscan, speed: st.speed, g: st.gravity, range: st.range };
    out = act;
    return out;
  }

  /** 든 무기 사거리 (조준선이 겨누는 거리) */
  aimRange() {
    const wn = this.weaponNow();
    return wn ? wn.st.range * 0.98 : 0;
  }

  /** 짧게 누른 행동을 붙잡아 둘 시간: 사격은 다음 발까지, 파밍은 다음 파밍까지 */
  pendingMs(bit:number, now:number) {
    if (bit & ACT_FIRE) return Math.min(4000, Math.max(0, this.readyAt - now));
    if (bit & ACT_FARM) return Math.min(1000, Math.max(0, this.localFarmAt - now));
    return 0;
  }

  /** 스코프 무기(1인칭): 우클릭 한 번 = 스코프, 스코프 중 우클릭 = 발사, 좌클릭 = 스코프 끄기 */
  press(button:'left' | 'right') {
    const wn = this.weaponNow();
    if (!wn?.st.scope || !this.persp || this.deadInfo || this.specInfo) return false;
    if (button === 'right' && !this.scoped) {
      // 재장전 중엔 스코프를 못 댄다
      if (this.fs?.reloading && performance.now() < this.reloadTo) return true;
      this.scoped = true;
      return true;
    }
    if (button === 'left' && this.scoped) {
      this.scoped = false;
      return true;
    }
    return false;
  }

  fovMul() {
    const wn = this.weaponNow();
    return this.scoped && wn?.st.scope ? wn.st.scope : 1;
  }

  look(st:number, gv:number, now:number, mine:boolean, key = 0):Look {
    let swing = 0;
    if (mine) {
      if (now - this.localSwingAt < FARM.swingMs) swing = (now - this.localSwingAt) / FARM.swingMs;
    } else if (st & ST_SWING) {
      if (!this.swingAt.has(key)) this.swingAt.set(key, now);
      swing = Math.min(1, (now - this.swingAt.get(key)!) / REMOTE_SWING_MS);
    } else this.swingAt.delete(key);
    const hp = gaugeHp(gv);
    return {
      hidden: (st & ST_DEAD) !== 0, // 죽으면 시체가 대신 누워 있다
      blink: (st & ST_SHIELD) !== 0,
      bar: mine || hp >= 100 ? null : hp / 100,
      swing,
      down: false,
      // 불탐(새벽 좀비) 주황, 맞음 빨강
      // 불탐(새벽 좀비) 주황, 땅 울리기 준비(보스) 빨강, 맞음 빨강
      // 보스가 독 파이어볼을 모으면 초록
      glow: !mine && key === this.bossId && now < this.castUntil ? '#5aff3a' : (st & (ST_BURN | ST_SLAM)) ? (st & ST_BURN ? '#ff7a1a' : '#ff2010') : (st & ST_HURT) ? '#a01010' : null, // eslint-disable-line no-nested-ternary
    };
  }

  /** 좀비 모습: 푸르스름한 피부, 해진 옷 (뛰는 좀비는 붉은 옷) — 이름표 없이 체력 막대만 */
  appearance(k:number):Appearance | null {
    if (k === Z_WALKER) return { look: { shirt: '#5b6b4f', pants: '#3b3b30', skin: '#8fae7a', hair: '#2a2a20', glow: '#1c3312' }, tag: false };
    if (k === Z_BOSS) return { look: { shirt: '#3b1d4a', pants: '#1a1020', skin: '#7a5a8a', hair: '#0b0610', glow: '#2a0820' }, tag: true, name: '최종 보스', scale: BOSS.scale };
    if (k === Z_RUNNER) return { look: { shirt: '#8a3434', pants: '#33302a', skin: '#9fbf7f', hair: '#1a1a14', glow: '#3a1410' }, tag: false };
    return null;
  }

  daylight(now:number) {
    return this.match ? dayNight(now - this.match.startAt + this.match.dayOffset).light : 1;
  }

  minimap(g:CanvasRenderingContext2D, k:number, dpr:number) {
    const zone = this.zoneNow;
    if (!zone) return;
    // 원 밖은 어둡게, 지금 원은 흰 선, 다음 원은 노란 점선
    g.beginPath();
    g.rect(-1e4, -1e4, 2e4, 2e4);
    g.arc(zone.cx, zone.cz, zone.r, 0, Math.PI * 2, true);
    g.fillStyle = 'rgba(40,20,90,0.45)';
    g.fill('evenodd');
    g.lineWidth = (2 * dpr) / k;
    g.strokeStyle = '#f4f4f8';
    g.beginPath();
    g.arc(zone.cx, zone.cz, zone.r, 0, Math.PI * 2);
    g.stroke();
    if (zone.next.r < zone.r - 1) {
      g.setLineDash([ (6 * dpr) / k, (4 * dpr) / k ]);
      g.strokeStyle = '#ffd84a';
      g.beginPath();
      g.arc(zone.next.cx, zone.next.cz, zone.next.r, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    // 탈출구: 금색 큰 점
    if (this.exitInfo) {
      g.fillStyle = '#ffd84a';
      const r = (5 * dpr) / k;
      g.fillRect(this.exitInfo.x - r, this.exitInfo.z - r, r * 2, r * 2);
    }
    // 땅 아이템: 종류 색 점
    const dot = (1.5 * dpr) / k;
    this.items.list.forEach(({ it }) => {
      g.fillStyle = ITEM_COLORS[ITEM_KINDS[it[1]] ?? 'armor'];
      g.fillRect(it[3] - dot, it[5] - dot, dot * 2, dot * 2);
    });
    // 시체: 작은 회색 ×
    g.strokeStyle = '#d0d0d8';
    g.lineWidth = (1.5 * dpr) / k;
    const a = (3 * dpr) / k;
    this.corpses.forEach(({ c }) => {
      g.beginPath();
      g.moveTo(c.x - a, c.z - a);
      g.lineTo(c.x + a, c.z + a);
      g.moveTo(c.x + a, c.z - a);
      g.lineTo(c.x - a, c.z + a);
      g.stroke();
    });
  }

  hud(now:number):BrHudState {
    const z = this.zoneNow;
    const { me } = this;
    const outside = z && me ? Math.max(0, Math.hypot(me.x - z.cx, me.z - z.cz) - z.r) : 0;
    this.feed = this.feed.filter((x) => now - x.at < FEED_MS);
    this.hits = this.hits.filter((x) => now - x.at < HIT_MS);
    this.got = this.got.filter((x) => now - x.at < GOT_MS);
    return {
      day: this.match ? (() => {
        const d = dayNight(now - this.match!.startAt + this.match!.dayOffset);
        return { night: d.night, remain: Math.ceil(d.remain / 1000) };
      })() : null,
      zone: z ? { stage: z.stage, shrinking: z.shrinking, untilChange: Math.ceil(z.untilChange / 1000), remain: Math.ceil(z.remain / 1000), outside } : null,
      hp: me ? gaugeHp(me.gv) : 100,
      shield: !!me && (me.st & ST_SHIELD) !== 0,
      dead: this.deadInfo ? { by: this.deadInfo.by, wait: this.deadInfo.until < 0 ? -1 : Math.max(0, Math.ceil((this.deadInfo.until - now) / 1000)) } : null,
      spec: this.specInfo,
      watch: this.watch,
      feed: this.feed.map(({ id, text }) => ({ id, text })),
      hits: this.hits.map(({ id, dmg, at, head }) => ({ id, dmg, age: (now - at) / HIT_MS, head })),
      hitMark: now - this.hitMarkAt < HIT_MARK_MS ? { age: (now - this.hitMarkAt) / HIT_MARK_MS, head: this.hitMarkHead } : null,
      hurt: Math.max(0, 1 - (now - this.hurtAt) / 400),
      poison: this.deadInfo ? 0 : Math.max(0, Math.ceil((this.poisonUntil - now) / 1000)),
      gear: this.gear,
      got: this.got.map(({ id, text }) => ({ id, text })),
      boss: this.bossInfo ? { ratio: this.bossInfo.hp / this.bossInfo.max, hp: this.bossInfo.hp, remain: Math.ceil(Math.max(0, this.bossInfo.remain - (now - this.bossInfo.at)) / 1000) } : null,
      escape: this.escapeHud(now),
      end: this.endInfo ? { result: this.endInfo.result, why: this.endInfo.why, killer: this.endInfo.killer, chicken: this.endInfo.chicken, mine: !!this.endInfo.chicken && this.endInfo.chicken === this.myName(), top: this.endInfo.top, zk: this.endInfo.zk, next: Math.max(0, Math.ceil((this.endInfo.until - now) / 1000)) } : null,
      weapon: this.weaponHud(now),
      prompt: this.prompt,
      press: (b) => this.press(b),
    };
  }

  /** 휴전·탈출 안내 */
  private escapeHud(now:number):BrHudState['escape'] {
    const ex = this.exitInfo;
    const { me } = this;
    if (ex) return { truce: now < ex.openAt, exitDist: me ? Math.hypot(me.x - ex.x, me.z - ex.z) : null, opensIn: Math.max(0, Math.ceil((ex.openAt - now) / 1000)) };
    if (this.bossInfo && !this.endInfo) return { truce: true, exitDist: null, opensIn: 0 };
    return null;
  }

  private weaponHud(now:number):BrHudState['weapon'] {
    const wn = this.weaponNow();
    if (!wn || !this.fs) return null;
    const reloading = now < this.reloadTo;
    // 재장전이 끝났으면 화면에서도 가득 (서버는 다음 발을 쏠 때 채운다 — 같은 셈)
    const ammo = this.fs.reloading && !reloading ? wn.st.mag : this.fs.ammo;
    return {
      kind: wn.w,
      name: ITEM_NAMES[wn.w],
      lv: this.gear[wn.w],
      ammo: reloading ? this.fs.ammo : ammo,
      mag: wn.st.mag,
      reload: reloading ? Math.min(1, (now - this.reloadFrom) / Math.max(1, this.reloadTo - this.reloadFrom)) : null,
      reloadFrom: this.reloadFrom,
      reloadTo: this.reloadTo,
      scoped: this.scoped,
      scope: wn.st.scope > 0,
    };
  }

  dispose() {
    this.host.scene.remove(this.wall);
    this.wall.geometry.dispose();
    [ ...this.corpses.keys() ].forEach((id) => this.removeCorpse(id));
    this.items.dispose();
    this.props.dispose();
    this.shots.dispose();
    this.viewGun.dispose();
    this.host.scene.remove(this.slamRing, this.landRing, this.exitRing, this.exitBeam);
    this.exitRing.geometry.dispose();
    this.exitBeam.geometry.dispose();
    this.landRing.geometry.dispose();
    this.slamRing.geometry.dispose();
    this.lootGeo.dispose();
    this.lootMat.dispose();
  }

}