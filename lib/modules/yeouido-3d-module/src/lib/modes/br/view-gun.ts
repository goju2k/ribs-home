import * as THREE from 'three';
import type { WeaponKind } from 'yeouido-br';

/**
 * 1인칭 손에 든 총 (배틀로얄 모드, 화면만): 카메라에 붙어 화면 오른쪽 아래에 보인다.
 * 기본 도형(상자)으로 무기마다 모양을 다르게, 쏘면 뒤로 튀었다 돌아오고(반동) 총구에서 불꽃(산탄은 연기도),
 * 재장전 중엔 총을 아래로 내린다. 스코프 중·위 시점·죽었을 땐 숨긴다.
 */

/** 부품: [가로, 세로, 길이, x, y, z, 색] — 카메라 기준 (앞 = -z) */
type Part = [number, number, number, number, number, number, string];

const METAL = '#2b2e36';
const DARK = '#1b1d22';
const STEEL = '#3a3f48';
const WOOD = '#6b4520';

const GUNS:Record<WeaponKind, Part[]> = {
  pistol: [
    [ 0.05, 0.07, 0.2, 0, 0, -0.05, METAL ], [ 0.046, 0.03, 0.22, 0, 0.045, -0.06, STEEL ], [ 0.045, 0.12, 0.06, 0, -0.08, 0.03, DARK ],
  ],
  smg: [
    [ 0.06, 0.08, 0.3, 0, 0, -0.05, METAL ], [ 0.025, 0.025, 0.12, 0, 0.01, -0.26, STEEL ], [ 0.04, 0.15, 0.05, 0, -0.1, -0.08, DARK ],
    [ 0.045, 0.1, 0.05, 0, -0.08, 0.06, DARK ], [ 0.062, 0.012, 0.2, 0, 0.046, -0.05, '#ff8a3a' ],
  ],
  rifle: [
    [ 0.06, 0.09, 0.42, 0, 0, -0.08, METAL ], [ 0.025, 0.025, 0.25, 0, 0.015, -0.41, STEEL ], [ 0.045, 0.16, 0.07, 0, -0.11, -0.12, DARK ],
    [ 0.05, 0.08, 0.18, 0, -0.02, 0.2, DARK ], [ 0.045, 0.1, 0.05, 0, -0.09, 0.04, DARK ],
  ],
  shotgun: [
    [ 0.04, 0.04, 0.62, 0, 0.025, -0.26, STEEL ], [ 0.065, 0.05, 0.16, 0, -0.025, -0.3, '#5a3a22' ],
    [ 0.06, 0.08, 0.2, 0, 0, 0.02, METAL ], [ 0.05, 0.09, 0.22, 0, -0.03, 0.22, WOOD ],
  ],
  sniper: [
    [ 0.025, 0.025, 0.58, 0, 0.015, -0.52, STEEL ], [ 0.06, 0.08, 0.38, 0, 0, -0.05, METAL ], [ 0.05, 0.05, 0.22, 0, 0.08, -0.05, '#101114' ],
    [ 0.05, 0.09, 0.24, 0, -0.02, 0.25, WOOD ], [ 0.045, 0.1, 0.05, 0, -0.09, 0.05, DARK ],
  ],
  crossbow: [
    [ 0.05, 0.06, 0.46, 0, 0, -0.06, WOOD ], [ 0.3, 0.03, 0.04, 0, 0.01, -0.27, STEEL ], [ 0.3, 0.006, 0.006, 0, 0.02, -0.21, '#d9d2c0' ],
    [ 0.016, 0.016, 0.34, 0, 0.045, -0.16, '#c9ced6' ],
  ],
};

/** 카메라 기준 놓는 자리 (오른쪽 아래 앞, m)·무기마다 반동 세기 */
const HOLD = new THREE.Vector3(0.2, -0.19, -0.42);
const KICK:Record<WeaponKind, number> = { pistol: 1, smg: 0.6, rifle: 0.8, shotgun: 1.8, sniper: 2, crossbow: 0.7 };
/** 반동·불꽃·연기 시간 (ms) */
const RECOIL_MS = 140;
const FLASH_MS = 55;
const SMOKE_MS = 320;

export class ViewGun {

  private cam:THREE.Camera;

  private root = new THREE.Group();

  private guns = new Map<WeaponKind, { group: THREE.Group; tip: number; }>();

  private flash:THREE.Mesh;

  private smoke:THREE.Mesh;

  private kind:WeaponKind | null = null;

  private kickAt = -1e9;

  private smokeAt = -1e9;

  /** 재장전으로 내린 정도 (0~1, 부드럽게 따라간다) */
  private lower = 0;

  private box = new THREE.BoxGeometry(1, 1, 1);

  private mats = new Map<string, THREE.Material>();

  constructor(cam:THREE.Camera) {
    this.cam = cam;
    (Object.keys(GUNS) as WeaponKind[]).forEach((k) => {
      const group = new THREE.Group();
      let tip = 0;
      GUNS[k].forEach(([ w, h, d, x, y, z, color ]) => {
        const m = new THREE.Mesh(this.box, this.mat(color));
        m.scale.set(w, h, d);
        m.position.set(x, y, z);
        group.add(m);
        tip = Math.min(tip, z - d / 2);
      });
      group.visible = false;
      this.root.add(group);
      this.guns.set(k, { group, tip });
    });
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.95, depthWrite: false }));
    this.smoke = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#cfcfcf', transparent: true, opacity: 0.5, depthWrite: false }));
    this.flash.visible = false;
    this.smoke.visible = false;
    this.root.add(this.flash, this.smoke);
    this.root.position.copy(HOLD);
    this.root.visible = false;
    cam.add(this.root);
  }

  private mat(color:string) {
    let m = this.mats.get(color);
    if (!m) {
      // 밤에도 너무 어둡지 않게 스스로 조금 빛난다
      m = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 });
      this.mats.set(color, m);
    }
    return m;
  }

  /** 내가 쐈다 */
  fire(kind:WeaponKind, now:number) {
    this.kind = kind;
    this.kickAt = now;
    if (kind === 'shotgun' || kind === 'sniper') this.smokeAt = now;
  }

  /** 매 장면: 든 무기·보일지·재장전 중인지 */
  update(now:number, kind:WeaponKind | null, show:boolean, reloading:boolean) {
    this.root.visible = show && !!kind;
    if (kind !== this.kind) this.kind = kind;
    this.guns.forEach((g, k) => {
      g.group.visible = k === kind;
    });
    if (!this.root.visible || !kind) return;
    const g = this.guns.get(kind)!;
    // 재장전: 아래로 내리고 비스듬히 (부드럽게)
    this.lower += ((reloading ? 1 : 0) - this.lower) * 0.2;
    // 반동: 쏜 순간 뒤로·위로 튀었다 돌아온다
    const k = Math.min(1, (now - this.kickAt) / RECOIL_MS);
    const kick = (1 - k) * (1 - k) * KICK[kind];
    this.root.position.set(HOLD.x, HOLD.y - this.lower * 0.12, HOLD.z + kick * 0.05);
    this.root.rotation.set(kick * 0.09 - this.lower * 0.5, this.lower * 0.25, this.lower * 0.15);
    // 총구 불꽃·연기 (총구 = 가장 앞 부품 끝)
    const fk = (now - this.kickAt) / FLASH_MS;
    this.flash.visible = fk < 1;
    if (this.flash.visible) {
      this.flash.position.set(0, 0.015, g.tip - 0.02);
      this.flash.scale.setScalar((0.035 + 0.03 * KICK[kind]) * (1 - fk * 0.5));
    }
    const sk = (now - this.smokeAt) / SMOKE_MS;
    this.smoke.visible = sk < 1;
    if (this.smoke.visible) {
      this.smoke.position.set(0, 0.03 + sk * 0.05, g.tip - 0.05 - sk * 0.25);
      this.smoke.scale.setScalar(0.04 + sk * 0.12);
      (this.smoke.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - sk);
    }
  }

  dispose() {
    this.cam.remove(this.root);
    this.box.dispose();
    this.mats.forEach((m) => m.dispose());
    this.flash.geometry.dispose();
    (this.flash.material as THREE.Material).dispose();
    this.smoke.geometry.dispose();
    (this.smoke.material as THREE.Material).dispose();
  }

}