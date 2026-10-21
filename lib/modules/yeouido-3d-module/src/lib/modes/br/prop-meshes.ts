import * as THREE from 'three';
import { PROP_KINDS, PropKind, PropRow } from 'yeouido-br';

/** 이보다 멀면 안 그린다 (m) */
const SHOW_RANGE = 220;
/** 맞으면 흔들리는 시간 (ms) */
const SHAKE_MS = 250;

/** 물건 모양 하나: 크기·색 상자 여럿 (발 기준) */
type Part = [w: number, h: number, d: number, x: number, y: number, z: number, color: string];

const PARTS:Record<PropKind, Part[]> = {
  // 나무 상자: 상자 + 테두리 띠
  crate: [[ 0.8, 0.8, 0.8, 0, 0.4, 0, '#9a6a35' ], [ 0.84, 0.1, 0.84, 0, 0.75, 0, '#6b4520' ], [ 0.84, 0.1, 0.84, 0, 0.05, 0, '#6b4520' ]],
  // 자판기: 빨간 몸통 + 앞면 진열창 + 버튼
  vending: [[ 0.9, 1.8, 0.7, 0, 0.9, 0, '#d94a4a' ], [ 0.6, 0.9, 0.04, -0.08, 1.2, 0.36, '#9fe0ff' ], [ 0.12, 0.5, 0.04, 0.32, 1.1, 0.36, '#f4f4f8' ]],
  // 금고: 짙은 회색 + 손잡이
  safe: [[ 0.7, 0.75, 0.65, 0, 0.375, 0, '#4a4f58' ], [ 0.18, 0.18, 0.05, 0.1, 0.42, 0.34, '#ffd84a' ]],
};

interface Shown {
  row: PropRow; group: THREE.Group; hitAt: number;
}

/**
 * 부술 수 있는 물건 그리기 (배틀로얄 모드): 종류별 상자 모양. 맞으면 흔들린다. 실내 것은 같은 건물·층일 때만.
 */
export class PropMeshes {

  private scene:THREE.Scene;

  private shown = new Map<number, Shown>();

  private geo = new THREE.BoxGeometry(1, 1, 1);

  private mats = new Map<string, THREE.MeshLambertMaterial>();

  constructor(scene:THREE.Scene) {
    this.scene = scene;
  }

  private mat(color:string) {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color });
      this.mats.set(color, m);
    }
    return m;
  }

  add(row:PropRow) {
    if (this.shown.has(row[0])) return;
    const kind = PROP_KINDS[row[1]] ?? 'crate';
    const group = new THREE.Group();
    PARTS[kind].forEach(([ w, h, d, x, y, z, color ]) => {
      const m = new THREE.Mesh(this.geo, this.mat(color));
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    });
    group.position.set(row[3], row[4], row[5]);
    [ , , , , , , , , group.rotation.y ] = row;
    this.scene.add(group);
    this.shown.set(row[0], { row, group, hitAt: -1e9 });
  }

  /** 맞음: 흔들기 + 내구도 갱신 (hp < 0이면 내구도는 그대로 — 내가 친 알림은 내구도가 따로 온다) */
  hit(id:number, hp:number, now:number) {
    const s = this.shown.get(id);
    if (!s) return;
    if (hp >= 0) s.row[2] = hp;
    s.hitAt = now;
  }

  remove(id:number) {
    const s = this.shown.get(id);
    if (!s) return;
    this.scene.remove(s.group);
    this.shown.delete(id);
  }

  clear() {
    [ ...this.shown.keys() ].forEach((id) => this.remove(id));
  }

  update(now:number, me:{ x: number; z: number; b: number; l: number; }) {
    this.shown.forEach((s) => {
      const [ , , , x, , z, b, l ] = s.row;
      const on = (b < 0 || (b === me.b && l === me.l)) && Math.abs(x - me.x) < SHOW_RANGE && Math.abs(z - me.z) < SHOW_RANGE;
      s.group.visible = on;
      if (!on) return;
      const k = Math.max(0, 1 - (now - s.hitAt) / SHAKE_MS);
      s.group.position.x = x + Math.sin(now / 18) * 0.06 * k;
      s.group.position.z = z + Math.cos(now / 23) * 0.06 * k;
    });
  }

  dispose() {
    this.clear();
    this.geo.dispose();
    this.mats.forEach((m) => m.dispose());
  }

}