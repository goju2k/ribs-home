import * as THREE from 'three';
import { GroundItem, ITEM_KINDS, ItemKind } from 'yeouido-br';

/** 아이템 색 (미니맵 점·HUD 칸도 같은 색) */
export const ITEM_COLORS:Record<ItemKind, string> = { pipe: '#c9ced6', armor: '#4a8fe0', shoes: '#c98a4a', rocket: '#e2574c' };

/** 이보다 멀면 안 그린다 (m) */
const SHOW_RANGE = 220;

/** 종류마다 모양: 쇠파이프 긴 막대, 갑옷 넓은 판, 신발 납작한 상자, 로켓슈트 키 큰 통 */
function shapes() {
  const g:Record<ItemKind, THREE.BufferGeometry> = {
    pipe: new THREE.BoxGeometry(0.12, 0.12, 0.9),
    armor: new THREE.BoxGeometry(0.5, 0.55, 0.18),
    shoes: new THREE.BoxGeometry(0.42, 0.16, 0.3),
    rocket: new THREE.BoxGeometry(0.3, 0.6, 0.3),
  };
  return g;
}

interface Shown {
  it: GroundItem; mesh: THREE.Mesh; beam: THREE.Mesh; base: number; phase: number;
}

/** 멀리서도 보이게 세우는 빛기둥 높이 (m) */
const BEAM_H = 6;

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

  constructor(scene:THREE.Scene) {
    this.scene = scene;
  }

  get list() {
    return this.shown;
  }

  add(it:GroundItem) {
    if (this.shown.has(it[0])) return;
    const kind = ITEM_KINDS[it[1]] ?? 'pipe';
    const mesh = new THREE.Mesh(this.geo[kind], this.mats[kind]);
    mesh.castShadow = true;
    mesh.position.set(it[3], it[4] + 0.5, it[5]);
    mesh.scale.setScalar(1.4);
    const beam = new THREE.Mesh(this.beamGeo, this.beamMats[kind]);
    beam.position.set(it[3], it[4], it[5]);
    this.scene.add(mesh, beam);
    this.shown.set(it[0], { it, mesh, beam, base: it[4] + 0.5, phase: Math.random() * 6 });
  }

  remove(id:number) {
    const s = this.shown.get(id);
    if (!s) return;
    this.scene.remove(s.mesh, s.beam);
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
      if (!on) return;
      s.mesh.position.y = s.base + Math.sin(t * 2 + s.phase) * 0.12;
      s.mesh.rotation.y = t * 1.5 + s.phase;
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