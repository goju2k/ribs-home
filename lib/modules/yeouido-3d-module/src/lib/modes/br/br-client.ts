/* eslint-disable no-bitwise -- 상태·행동 비트 */
import * as THREE from 'three';
import {
  ACT_MELEE, BrServerMsg, dayNight, ST_BURN, Z_RUNNER, Z_WALKER, Corpse, emptyGear, gaugeHp, Gear, isBrMsg, ITEM_KINDS, ITEM_NAMES, MatchPlan, meleeStats, ST_DEAD, ST_HURT, ST_SHIELD, ST_SWING,
  zoneAt, ZoneNow,
} from 'yeouido-br';

import { ITEM_COLORS, ItemMeshes } from './item-meshes';
import { PropMeshes } from './prop-meshes';
import { ShotFx } from './shot-fx';

import { createPerson, Person } from '../../player/person';
import { Appearance, Look, ModeClient, ModeFrame, ModeHostClient } from '../mode-client';

/** 경계 벽 높이 (m) */
const WALL_H = 600;
/** 알림(누가 누구를) 보여 주는 시간 (ms) */
const FEED_MS = 6000;
/** 때린 피해 숫자 보여 주는 시간 (ms) */
const HIT_MS = 700;
/** 다른 사람 휘두르는 동작 길이 (ms) — 무기마다 조금 다르지만 화면용이라 하나로 */
const REMOTE_SWING_MS = 320;
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
  /** 방금 내가 준 피해 (사라지는 숫자) */
  hits: { id: number; dmg: number; age: number; }[];
  /** 방금 맞음 (0~1, 화면 가장자리 붉게) */
  hurt: number;
  /** 내 장비 (칸마다 단계, 0 = 없음) */
  gear: Gear;
  /** 방금 주운 것 */
  got: { id: number; text: string; }[];
  /** 원거리 재장전 진행 0~1 (1 = 쏠 수 있음), 원거리 무기가 없으면 null */
  reload: number | null;
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

  private hits:{ id: number; dmg: number; at: number; }[] = [];

  private seq = 0;

  private hurtAt = -1e9;

  private deadInfo:{ by: string | null; until: number; } | null = null;

  /** 휘두르기 시작 시각 (사람 키마다: 0 = 나) — 비트가 켜진 순간을 잡아 동작 진행을 맞춘다 */
  private swingAt = new Map<number, number>();

  private localSwingAt = -1e9;

  private localNextAt = 0;

  private me:ModeFrame['me'] | null = null;

  private zoneNow:ZoneNow | null = null;

  private items:ItemMeshes;

  private props:PropMeshes;

  private shots:ShotFx;

  /** 원거리 재장전: 쏜 시각과 걸리는 시간 */
  private reloadAt = 0;

  private reloadMs = 0;

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
  }

  receive(d:unknown, now:number) {
    if (!isBrMsg(d)) return;
    const m = d as BrServerMsg;
    if (m.k === 'match') {
      const startAt = now - m.elapsed;
      // 같은 판이면 시계는 큰 차이만 맞춘다 (받는 지연만큼 흔들리지 않게)
      if (this.match?.plan.id === m.id && Math.abs(this.match.startAt - startAt) < 300) return;
      this.match = { plan: { id: m.id, circles: m.circles.map(([ cx, cz, r ]) => ({ cx, cz, r })) }, startAt, dayOffset: m.dayOffset ?? 0 };
    } else if (m.k === 'corpses') {
      [ ...this.corpses.keys() ].forEach((id) => this.removeCorpse(id));
      m.list.forEach((c) => this.addCorpse(c));
    } else if (m.k === 'corpse') this.addCorpse(m.c);
    else if (m.k === 'corpseGone') this.removeCorpse(m.id);
    else if (m.k === 'kill') this.pushFeed(m.killer ? `${m.killer} ▶ ${m.victim}` : `${m.victim} 전장 밖에서 쓰러짐`, now);
    else if (m.k === 'hit') {
      this.hits.push({ id: ++this.seq, dmg: m.dmg, at: now });
      if (this.hits.length > 6) this.hits.shift();
    } else if (m.k === 'hurt') this.hurtAt = now;
    else if (m.k === 'dead') this.deadInfo = { by: m.by, until: now + m.wait };
    else if (m.k === 'respawn') this.deadInfo = null;
    else if (m.k === 'items') {
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
      this.hits.push({ id: ++this.seq, dmg: m.dmg, at: now });
      if (this.hits.length > 6) this.hits.shift();
    } else if (m.k === 'shot') this.shots.tracer(m.o, m.e, now);
    else if (m.k === 'arrow') this.shots.arrow(m.id, m.o, m.d, m.v, m.range, now);
    else if (m.k === 'arrowEnd') this.shots.arrowEnd(m.id, m.at, now);
    else if (m.k === 'fired') {
      this.reloadAt = now;
      this.reloadMs = m.reloadMs;
    } else if (m.k === 'gear') this.gear = m.gear;
    else if (m.k === 'got') {
      const k = ITEM_KINDS[m.kind];
      this.got.push({ id: ++this.seq, text: `${ITEM_NAMES[k]} +${m.lv}${m.from === 'corpse' ? ' (시체)' : ''}`, at: now });
      if (this.got.length > 4) this.got.shift();
    }
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
    const zone = this.match ? zoneAt(this.match.plan, f.now - this.match.startAt) : null;
    this.zoneNow = zone;
    this.wall.visible = !!zone;
    if (zone) {
      this.wall.position.set(zone.cx, WALL_H / 2 - 5, zone.cz);
      this.wall.scale.set(zone.r, WALL_H, zone.r);
    }
    // 시체: 실외 것은 늘, 실내 것은 같은 건물·층일 때만
    const spin = f.now / 400;
    this.corpses.forEach(({ c, person, loot }) => {
      person.root.visible = c.b < 0 || (c.b === f.me.b && c.l === f.me.l);
      loot.visible = person.root.visible && c.items.length > 0;
      loot.rotation.y = spin;
    });
    this.items.update(f.now, f.me);
    this.props.update(f.now, f.me);
    this.shots.update(f.now);
  }

  acted(act:number, now:number) {
    // 누른 순간 바로 휘두른다 (서버 확인을 기다리면 늦어 보인다) — 대기 시간은 서버와 같게
    if (act & ACT_MELEE && now >= this.localNextAt && !this.deadInfo) {
      this.localSwingAt = now;
      this.localNextAt = now + meleeStats(this.gear.pipe).cooldownMs;
    }
  }

  look(st:number, gv:number, now:number, mine:boolean, key = 0):Look {
    let swing = 0;
    if (mine) {
      if (now - this.localSwingAt < meleeStats(this.gear.pipe).swingMs) swing = (now - this.localSwingAt) / meleeStats(this.gear.pipe).swingMs;
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
      glow: (st & ST_BURN) ? '#ff7a1a' : (st & ST_HURT) ? '#a01010' : null, // eslint-disable-line no-nested-ternary
    };
  }

  /** 좀비 모습: 푸르스름한 피부, 해진 옷 (뛰는 좀비는 붉은 옷) — 이름표 없이 체력 막대만 */
  appearance(k:number):Appearance | null {
    if (k === Z_WALKER) return { look: { shirt: '#5b6b4f', pants: '#3b3b30', skin: '#8fae7a', hair: '#2a2a20', glow: '#1c3312' }, tag: false };
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
    // 땅 아이템: 종류 색 점
    const dot = (1.5 * dpr) / k;
    this.items.list.forEach(({ it }) => {
      g.fillStyle = ITEM_COLORS[ITEM_KINDS[it[1]] ?? 'pipe'];
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
      dead: this.deadInfo ? { by: this.deadInfo.by, wait: Math.max(0, Math.ceil((this.deadInfo.until - now) / 1000)) } : null,
      feed: this.feed.map(({ id, text }) => ({ id, text })),
      hits: this.hits.map(({ id, dmg, at }) => ({ id, dmg, age: (now - at) / HIT_MS })),
      hurt: Math.max(0, 1 - (now - this.hurtAt) / 400),
      gear: this.gear,
      got: this.got.map(({ id, text }) => ({ id, text })),
      reload: this.gear.pistol || this.gear.bow ? Math.min(1, this.reloadMs ? (now - this.reloadAt) / this.reloadMs : 1) : null,
    };
  }

  dispose() {
    this.host.scene.remove(this.wall);
    this.wall.geometry.dispose();
    [ ...this.corpses.keys() ].forEach((id) => this.removeCorpse(id));
    this.items.dispose();
    this.props.dispose();
    this.shots.dispose();
    this.lootGeo.dispose();
    this.lootMat.dispose();
  }

}