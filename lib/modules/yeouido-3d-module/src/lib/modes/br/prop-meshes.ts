import * as THREE from 'three';
import { PROP_KINDS, PropKind, PropRow } from 'yeouido-br';

import { pixelSnap } from '../../ui/pixel-snap';

/** 이보다 멀면 안 그린다 (m) */
const SHOW_RANGE = 220;
/** 맞으면 흔들리는 시간 (ms) */
const SHAKE_MS = 250;

/** 물건 모양 하나: 크기·색 상자 여럿 (발 기준) */
type Part = [w: number, h: number, d: number, x: number, y: number, z: number, color: string];

const PARTS:Record<PropKind, Part[]> = {
  // 나무 상자 (1.1m): 판자 몸통 + 윗면 테두리(네 변)·가운데 판자 + 아래 띠 + 네 모서리 기둥 + 가운데 가로 판
  // 겹치는 면은 높이를 다르게 (몸통 1.10 < 가운데 판자 1.12 < 테두리 1.13): 같은 높이에 다른 색 면이 겹치면 화면이 움직일 때마다 무늬가 바뀐다
  crate: [
    [ 1.1, 1.1, 1.1, 0, 0.55, 0, '#b07a3e' ],
    [ 1.16, 0.12, 0.12, 0, 1.07, 0.52, '#6b4520' ], [ 1.16, 0.12, 0.12, 0, 1.07, -0.52, '#6b4520' ],
    [ 0.12, 0.12, 1.16, 0.52, 1.07, 0, '#6b4520' ], [ 0.12, 0.12, 1.16, -0.52, 1.07, 0, '#6b4520' ],
    [ 0.14, 0.04, 0.96, 0, 1.1, 0, '#8a5a2b' ],
    [ 1.16, 0.12, 1.16, 0, 0.06, 0, '#6b4520' ],
    [ 0.12, 1.09, 0.12, 0.52, 0.545, 0.52, '#6b4520' ], [ 0.12, 1.09, 0.12, -0.52, 0.545, 0.52, '#6b4520' ],
    [ 0.12, 1.09, 0.12, 0.52, 0.545, -0.52, '#6b4520' ], [ 0.12, 1.09, 0.12, -0.52, 0.545, -0.52, '#6b4520' ],
    [ 1.14, 0.1, 1.14, 0, 0.55, 0, '#8a5a2b' ],
  ],
  // 택배 상자 더미: 크기가 다른 골판지 상자 셋을 비뚤게 쌓고, 상자마다 윗면 테이프·옆면 송장
  // (겹치는 면은 높이·앞뒤를 조금씩 달리 — 같은 자리에 다른 색 면이 겹치면 무늬가 깜빡인다)
  parcel: [
    [ 0.8, 0.55, 0.6, -0.05, 0.275, 0.05, '#c89a5e' ], [ 0.14, 0.01, 0.62, -0.05, 0.555, 0.05, '#e8d9a8' ], [ 0.22, 0.16, 0.01, 0.12, 0.3, 0.355, '#f4f4f8' ],
    [ 0.55, 0.42, 0.45, 0.08, 0.76, -0.02, '#b88a50' ], [ 0.55, 0.01, 0.1, 0.08, 0.975, -0.02, '#e8d9a8' ], [ 0.18, 0.12, 0.01, -0.06, 0.78, 0.205, '#f4f4f8' ],
    [ 0.4, 0.3, 0.38, 0.45, 0.15, -0.28, '#d2a86c' ], [ 0.08, 0.01, 0.39, 0.45, 0.305, -0.28, '#e8d9a8' ],
  ],
  // 금고: 다리 달린 짙은 철제 몸통 + 앞면 금색 테두리·다이얼(겹친 네모)·손잡이 — 털어야 할 금고로 보이게
  safe: [
    [ 0.85, 0.85, 0.75, 0, 0.53, 0, '#3a3f48' ],
    [ 0.89, 0.06, 0.79, 0, 0.98, 0, '#2c3038' ], [ 0.89, 0.06, 0.79, 0, 0.1, 0, '#2c3038' ],
    [ 0.04, 0.78, 0.04, 0.4, 0.53, 0.38, '#d9a83a' ], [ 0.04, 0.78, 0.04, -0.4, 0.53, 0.38, '#d9a83a' ], [ 0.84, 0.03, 0.04, 0, 0.93, 0.38, '#d9a83a' ], [ 0.84, 0.04, 0.04, 0, 0.14, 0.38, '#d9a83a' ],
    [ 0.12, 0.1, 0.12, 0.33, 0.05, 0.28, '#22262c' ], [ 0.12, 0.1, 0.12, -0.33, 0.05, 0.28, '#22262c' ],
    [ 0.12, 0.1, 0.12, 0.33, 0.05, -0.28, '#22262c' ], [ 0.12, 0.1, 0.12, -0.33, 0.05, -0.28, '#22262c' ],
    [ 0.68, 0.66, 0.03, 0, 0.53, 0.385, '#4f5662' ],
    [ 0.24, 0.24, 0.05, -0.12, 0.58, 0.41, '#e0b84a' ], [ 0.17, 0.17, 0.06, -0.12, 0.58, 0.42, '#f2d27a' ], [ 0.04, 0.11, 0.07, -0.12, 0.64, 0.43, '#3a3f48' ],
    [ 0.06, 0.3, 0.07, 0.22, 0.53, 0.42, '#e0b84a' ],
  ],
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

  /** 보이는 물건들 (파밍 안내용) */
  get rows() {
    return [ ...this.shown.values() ].map((s) => s.row);
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
    pixelSnap.add(group);
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