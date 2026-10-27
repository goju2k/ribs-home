import * as THREE from 'three';
import { GroundItem, isConsumable, ITEM_KINDS, ITEM_NAMES, ItemKind } from 'yeouido-br';

import { itemIcon } from './item-icons';

import { PIXEL_FONT } from '../../ui/pixel';
import { pixelSnap, stepAngle } from '../../ui/pixel-snap';

/** 아이템 색 (미니맵 점·HUD 칸도 같은 색) */
export const ITEM_COLORS:Record<ItemKind, string> = {
  armor: '#4a8fe0',
  shoes: '#c98a4a',
  rocket: '#e2574c',
  hammer: '#e0b84a',
  pistol: '#c04ad9',
  smg: '#ff8a3a',
  rifle: '#7ad94a',
  shotgun: '#d94a6a',
  sniper: '#4ad9d9',
  crossbow: '#4ad9a0',
  heal: '#ff5a8a',
};

/** 이보다 멀면 안 그린다 (m) */
const SHOW_RANGE = 220;

/** 종류마다 모양: 갑옷 넓은 판, 신발 납작한 상자, 로켓슈트 키 큰 통, 총은 길이로 구분 */
function shapes() {
  const g:Record<ItemKind, THREE.BufferGeometry> = {
    armor: new THREE.BoxGeometry(0.5, 0.55, 0.18),
    shoes: new THREE.BoxGeometry(0.42, 0.16, 0.3),
    rocket: new THREE.BoxGeometry(0.3, 0.6, 0.3),
    hammer: new THREE.BoxGeometry(0.45, 0.18, 0.18),
    pistol: new THREE.BoxGeometry(0.32, 0.2, 0.08),
    smg: new THREE.BoxGeometry(0.5, 0.22, 0.09),
    rifle: new THREE.BoxGeometry(0.85, 0.18, 0.09),
    shotgun: new THREE.BoxGeometry(0.8, 0.14, 0.12),
    sniper: new THREE.BoxGeometry(1.1, 0.14, 0.09),
    crossbow: new THREE.BoxGeometry(0.6, 0.12, 0.6),
    heal: new THREE.BoxGeometry(0.3, 0.38, 0.3),
  };
  return g;
}

interface Shown {
  /** tag: 빛기둥 꼭대기 표식 (아이콘 + 이름), name: 그 안의 이름 글자 */
  it: GroundItem; mesh: THREE.Mesh; beam: THREE.Mesh; base: number; phase: number; tag: HTMLDivElement; name: HTMLSpanElement; on: boolean; near: boolean;
}

/** 이보다 가까우면 표식에 이름도 (멀면 아이콘만 — 화면이 글자로 덮이지 않게) */
const NAME_RANGE = 60;

/** 빛기둥 꼭대기 표식: 아이템 색 테두리 + 도트 아이콘 + 이름 (저해상도 3D 화면에 그리면 뭉개져서 화면 위 HTML로) */
function itemTag(it:GroundItem) {
  const kind = ITEM_KINDS[it[1]] ?? 'armor';
  const color = ITEM_COLORS[kind];
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    display: 'none',
    alignItems: 'center',
    gap: '3px',
    padding: '1px 4px 1px 1px',
    background: 'rgba(11,14,34,0.72)',
    border: `1px solid ${color}`,
    pointerEvents: 'none',
    willChange: 'transform',
    whiteSpace: 'nowrap',
  });
  const img = document.createElement('img');
  img.src = itemIcon(kind, color);
  Object.assign(img.style, { width: '24px', height: '24px', imageRendering: 'pixelated', display: 'block' });
  const name = document.createElement('span');
  name.textContent = isConsumable(kind) ? `${ITEM_NAMES[kind]} ${it[2]}%` : `${ITEM_NAMES[kind]} +${it[2]}`;
  Object.assign(name.style, { font: `11px ${PIXEL_FONT}`, lineHeight: '14px', color: '#f4f4f8' });
  el.append(img, name);
  return { el, name };
}

/** 멀리서도 보이게 세우는 빛기둥 높이 (m) */
const BEAM_H = 6;
/** 실내 빛기둥 높이 (m): 6m면 표식이 천장 위로 올라가 안 보였다 — 가장 낮은 층고(3.6m)의 천장 아래 */
const INDOOR_BEAM_H = 2;
const beamH = (it:GroundItem) => (it[6] >= 0 ? INDOOR_BEAM_H : BEAM_H);

/**
 * 땅에 떨어진 아이템 그리기 (배틀로얄 모드): 바닥 위에 떠서 천천히 돈다. 실내 것은 같은 건물·층일 때만, 멀면 숨김.
 */
export class ItemMeshes {

  private scene:THREE.Scene;

  private shown = new Map<number, Shown>();

  private geo = shapes();

  private beamGeo = new THREE.BoxGeometry(0.12, BEAM_H, 0.12).translate(0, BEAM_H / 2, 0);

  private beamMats = Object.fromEntries(ITEM_KINDS.map((k) => [ k, new THREE.MeshBasicMaterial({ color: ITEM_COLORS[k], transparent: true, opacity: 0.45, depthWrite: false }) ])) as unknown as Record<ItemKind, THREE.Material>;

  private mats = Object.fromEntries(ITEM_KINDS.map((k) => [ k, new THREE.MeshLambertMaterial({ color: ITEM_COLORS[k], emissive: ITEM_COLORS[k], emissiveIntensity: 0.35 }) ])) as unknown as Record<ItemKind, THREE.Material>;

  private overlay:HTMLElement;

  private v = new THREE.Vector3();

  constructor(scene:THREE.Scene, overlay:HTMLElement) {
    this.scene = scene;
    this.overlay = overlay;
  }

  get list() {
    return this.shown;
  }

  add(it:GroundItem) {
    if (this.shown.has(it[0])) return;
    const kind = ITEM_KINDS[it[1]] ?? 'armor';
    const mesh = new THREE.Mesh(this.geo[kind], this.mats[kind]);
    mesh.castShadow = true;
    mesh.position.set(it[3], it[4] + 0.5, it[5]);
    mesh.scale.setScalar(1.4);
    const beam = new THREE.Mesh(this.beamGeo, this.beamMats[kind]);
    beam.position.set(it[3], it[4], it[5]);
    beam.scale.y = beamH(it) / BEAM_H;
    this.scene.add(mesh, beam);
    pixelSnap.add(mesh);
    const { el: tag, name } = itemTag(it);
    this.overlay.appendChild(tag);
    this.shown.set(it[0], { it, mesh, beam, base: it[4] + 0.5, phase: Math.random() * 6, tag, name, on: false, near: false });
  }

  remove(id:number) {
    const s = this.shown.get(id);
    if (!s) return;
    this.scene.remove(s.mesh, s.beam);
    s.tag.remove();
    this.shown.delete(id);
  }

  clear() {
    [ ...this.shown.keys() ].forEach((id) => this.remove(id));
  }

  update(now:number, me:{ x: number; z: number; b: number; l: number; }) {
    const t = now / 1000;
    this.shown.forEach((s) => {
      const [ , , , x, , z, b, l ] = s.it;
      const on = (b < 0 || (b === me.b && l === me.l)) && Math.abs(x - me.x) < SHOW_RANGE && Math.abs(z - me.z) < SHOW_RANGE;
      s.mesh.visible = on;
      s.beam.visible = on;
      s.on = on;
      s.near = Math.hypot(x - me.x, z - me.z) < NAME_RANGE;
      if (!on) return;
      s.mesh.position.y = s.base + Math.sin(t * 2 + s.phase) * 0.12;
      s.mesh.rotation.y = stepAngle(t * 1.5 + s.phase);
    });
  }

  /** 카메라를 맞춘 뒤: 표식을 빛기둥 꼭대기 화면 위치로 (w, h = 캔버스 CSS 크기) */
  placeTags(camera:THREE.Camera, w:number, h:number) {
    this.shown.forEach((s) => {
      const p = this.v.set(s.it[3], s.it[4] + beamH(s.it) + 0.3, s.it[5]).project(camera);
      const off = !s.on || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1 || p.z > 1 || p.z < -1;
      s.tag.style.display = off ? 'none' : 'flex';
      if (off) return;
      s.name.style.display = s.near ? 'inline' : 'none';
      s.tag.style.padding = s.near ? '1px 4px 1px 1px' : '1px';
      s.tag.style.transform = `translate(${Math.round(((p.x + 1) / 2) * w)}px, ${Math.round(((1 - p.y) / 2) * h)}px) translate(-50%, -100%)`;
    });
  }

  dispose() {
    this.clear();
    Object.values(this.geo).forEach((g) => g.dispose());
    Object.values(this.mats).forEach((m) => m.dispose());
    Object.values(this.beamMats).forEach((m) => m.dispose());
    this.beamGeo.dispose();
  }

}