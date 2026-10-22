import * as THREE from 'three';

import { pixelSnap } from '../../ui/pixel-snap';

/**
 * 원거리 효과 (배틀로얄 모드, 화면만 — 판정은 서버가 한다).
 * - 총알: 눈에 안 보이는 속도라 날아가는 탄은 그리지 않는다. 대신 총구 불꽃과 맞은 자리의 타격 효과(파편·먼지·번쩍임)
 * - 석궁 화살: 기본 도형으로 만든 화살(몸통·촉·깃)이 서버와 같은 출발점·방향·속도·낙차로 날아간다
 * - 독 파이어볼(보스): 날아가는 공, 터지는 구
 */

/** 맞은 곳 종류 (서버 shot 메시지의 ht와 같은 번호) */
export const HIT_SURFACE = 0;
export const HIT_BODY = 1;
export const HIT_HEAD = 2;
export const HIT_AIR = 3;

/** 무기마다 효과 크기 배율·총구 불꽃 반지름 (m) — 셀수록 크게 */
const WEAPON_FX:Record<string, { impact: number; flash: number; }> = {
  pistol: { impact: 1, flash: 0.32 },
  smg: { impact: 0.8, flash: 0.28 },
  rifle: { impact: 1.1, flash: 0.42 },
  shotgun: { impact: 0.6, flash: 0.6 },
  sniper: { impact: 1.8, flash: 0.7 },
  crossbow: { impact: 1.1, flash: 0 },
};
const DEFAULT_FX = WEAPON_FX.pistol;

/** 맞은 곳마다: 파편 수·색·튀는 속도(m/s)·크기(m), 먼지(피) 색·반지름, 번쩍임 색 */
const IMPACT = {
  [HIT_SURFACE]: { count: 7, color: '#ffd77a', speed: 4, size: 0.06, puff: '#cfc6b0', puffR: 0.45, flash: '#fff4c0' },
  [HIT_BODY]: { count: 9, color: '#b3121b', speed: 3, size: 0.07, puff: '#8a0f16', puffR: 0.4, flash: '#ff6a5a' },
  [HIT_HEAD]: { count: 16, color: '#d01822', speed: 4.5, size: 0.08, puff: '#ffffff', puffR: 0.65, flash: '#ffffff' },
} as const;

/** 총구 불꽃·맞은 자리 먼지·번쩍임이 보이는 시간 (ms), 파편이 날아다니는 시간 (ms) */
const FLASH_MS = 60;
const PUFF_MS = 260;
const SPARK_MS = 280;
/** 독 파이어볼 터짐이 보이는 시간 (ms) */
const BURST_MS = 450;
/** 박힌 화살이 남아 있는 시간 (ms) */
const STUCK_MS = 2500;

interface Puff {
  mesh: THREE.Mesh; at: number; ms: number; from: number; to: number;
}

interface Spark {
  mesh: THREE.Mesh; v: THREE.Vector3; at: number; ms: number; size: number;
}

interface Flying {
  mesh: THREE.Object3D; o: THREE.Vector3; d: THREE.Vector3; v: number; range: number; g: number; at: number; stuckAt: number;
}

/** 석궁 화살 모양 (기본 도형): +z가 앞 — 나무 몸통, 쇠 촉(원뿔), 붉은 깃 3장 */
function arrowParts() {
  const shaft = new THREE.CylinderGeometry(0.018, 0.018, 0.72, 6).rotateX(Math.PI / 2);
  const head = new THREE.ConeGeometry(0.04, 0.13, 6).rotateX(Math.PI / 2).translate(0, 0, 0.42);
  const fletch = new THREE.BoxGeometry(0.006, 0.07, 0.15).translate(0, 0.045, -0.28);
  return {
    shaft,
    head,
    fletch,
    wood: new THREE.MeshLambertMaterial({ color: '#8a6a3e' }),
    metal: new THREE.MeshLambertMaterial({ color: '#c9ced6', emissive: '#30343a' }),
    feather: new THREE.MeshLambertMaterial({ color: '#e2574c', side: THREE.DoubleSide }),
  };
}

export class ShotFx {

  private scene:THREE.Scene;

  private puffs:Puff[] = [];

  private sparks:Spark[] = [];

  private unitBox = new THREE.BoxGeometry(1, 1, 1);

  private unitBall = new THREE.SphereGeometry(1, 8, 6);

  private sparkMats = new Map<string, THREE.MeshBasicMaterial>();

  private arrows = new Map<number, Flying>();

  /** 내가 먼저 그린 화살 (번호 음수) 중 서버 번호를 아직 못 받은 것, 서버 번호 → 내 번호 */
  private ownWaiting:number[] = [];

  private alias = new Map<number, number>();

  private ownSeq = 0;

  private arrowLook = arrowParts();

  /** 독 파이어볼 (날아가는 것)·터짐 (커지며 사라지는 구) */
  private balls = new Map<number, { mesh: THREE.Mesh; o: THREE.Vector3; v: THREE.Vector3; g: number; at: number; }>();

  private bursts:{ mesh: THREE.Mesh; at: number; r: number; }[] = [];

  private ballGeo = new THREE.IcosahedronGeometry(0.6, 0);

  private ballMat = new THREE.MeshBasicMaterial({ color: '#7dff4a' });

  private burstGeo = new THREE.SphereGeometry(1, 10, 6);

  constructor(scene:THREE.Scene) {
    this.scene = scene;
  }

  private sparkMat(color:string) {
    let m = this.sparkMats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color });
      this.sparkMats.set(color, m);
    }
    return m;
  }

  /** 잠깐 보이는 구 (총구 불꽃·먼지·번쩍임): 반지름 from → to, 점점 투명하게 */
  private puff(at:THREE.Vector3, color:string, from:number, to:number, ms:number, now:number) {
    const mesh = new THREE.Mesh(this.unitBall, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    mesh.position.copy(at);
    mesh.scale.setScalar(from);
    this.scene.add(mesh);
    this.puffs.push({ mesh, at: now, ms, from, to });
  }

  /** 총구 불꽃 (한 번 쏠 때 한 번 — 산탄도 하나). scale: 1인칭 내 총구는 눈앞이라 작게 */
  flash(o:[number, number, number], kind:string, now:number, scale = 1) {
    const r = (WEAPON_FX[kind] ?? DEFAULT_FX).flash * scale;
    if (r > 0) this.puff(new THREE.Vector3(...o), '#fff4c0', r * 0.5, r, FLASH_MS, now);
  }

  /**
   * 맞은 자리 타격 효과: 번쩍임 + 파편(쏜 쪽으로 튀며 떨어짐) + 먼지(사람이면 피). 머리는 크게.
   * from: 쏜 자리 (파편이 그쪽으로 튄다), type: HIT_* (허공이면 아무것도 안 한다)
   */
  impact(at:[number, number, number], from:[number, number, number], kind:string, type:number, now:number) {
    if (type === HIT_AIR) return;
    const fx = IMPACT[type as 0 | 1 | 2] ?? IMPACT[HIT_SURFACE];
    const k = (WEAPON_FX[kind] ?? DEFAULT_FX).impact;
    const p = new THREE.Vector3(...at);
    const back = new THREE.Vector3(...from).sub(p).normalize();
    this.puff(p, fx.flash, 0.06 * k, 0.22 * k, FLASH_MS, now);
    this.puff(p, fx.puff, 0.1 * k, fx.puffR * k, PUFF_MS, now);
    const n = Math.max(3, Math.round(fx.count * Math.min(1.5, k)));
    for (let i = 0; i < n; i++) {
      // 쏜 쪽 반구로 무작위 (조금 위로)
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().addScaledVector(back, 0.9).normalize()
        .multiplyScalar(fx.speed * k * (0.5 + Math.random() * 0.7));
      const mesh = new THREE.Mesh(this.unitBox, this.sparkMat(fx.color));
      const size = fx.size * k * (0.7 + Math.random() * 0.6);
      mesh.scale.setScalar(size);
      mesh.position.copy(p);
      this.scene.add(mesh);
      this.sparks.push({ mesh, v, at: now, ms: SPARK_MS * (0.7 + Math.random() * 0.6), size });
    }
  }

  arrow(id:number, o:[number, number, number], d:[number, number, number], v:number, range:number, now:number, g = 0) {
    const L = this.arrowLook;
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(L.shaft, L.wood), new THREE.Mesh(L.head, L.metal));
    [ 0, 1, 2 ].forEach((i) => {
      const f = new THREE.Mesh(L.fletch, L.feather);
      f.rotation.z = (i * Math.PI * 2) / 3;
      mesh.add(f);
    });
    const dir = new THREE.Vector3(...d);
    mesh.position.set(...o);
    mesh.lookAt(mesh.position.clone().add(dir));
    this.scene.add(mesh);
    pixelSnap.add(mesh);
    this.arrows.set(id, { mesh, o: new THREE.Vector3(...o), d: dir, v, range, g, at: now, stuckAt: 0 });
  }

  ball(id:number, o:[number, number, number], v:[number, number, number], g:number, now:number) {
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
    mesh.position.set(...o);
    this.scene.add(mesh);
    pixelSnap.add(mesh);
    this.balls.set(id, { mesh, o: new THREE.Vector3(...o), v: new THREE.Vector3(...v), g, at: now });
  }

  ballEnd(id:number, at:[number, number, number], r:number, now:number) {
    const b = this.balls.get(id);
    if (b) {
      this.scene.remove(b.mesh);
      this.balls.delete(id);
    }
    const mesh = new THREE.Mesh(this.burstGeo, new THREE.MeshBasicMaterial({ color: '#7dff4a', transparent: true, opacity: 0.55, depthWrite: false }));
    mesh.position.set(...at);
    mesh.scale.setScalar(0.3);
    this.scene.add(mesh);
    this.bursts.push({ mesh, at: now, r });
  }

  /** 내 화살을 먼저 그린다 (지금 내 자리에서). 서버 알림이 오면 bindOwn으로 번호를 잇는다 */
  ownArrow(o:[number, number, number], d:[number, number, number], v:number, range:number, now:number, g = 0) {
    const id = -(++this.ownSeq);
    this.arrow(id, o, d, v, range, now, g);
    this.ownWaiting.push(id);
    if (this.ownWaiting.length > 20) this.ownWaiting.shift();
  }

  /** 서버가 알려 준 내 화살 번호를 먼저 그린 화살에 (쏜 순서대로) */
  bindOwn(serverId:number) {
    const local = this.ownWaiting.shift();
    if (local !== undefined) this.alias.set(serverId, local);
  }

  /** 화살이 멈춘 자리 (서버 기준으로 맞춘다) — 박히며 작게 튄다 */
  arrowEnd(id:number, at:[number, number, number], now:number) {
    const a = this.arrows.get(this.alias.get(id) ?? id);
    this.alias.delete(id);
    if (!a) return;
    a.mesh.position.set(...at);
    a.stuckAt = now;
    const from = a.o.clone();
    this.impact(at, [ from.x, from.y, from.z ], 'crossbow', HIT_SURFACE, now);
  }

  update(now:number) {
    this.puffs = this.puffs.filter((p) => {
      const k = (now - p.at) / p.ms;
      if (k >= 1) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        return false;
      }
      p.mesh.scale.setScalar(p.from + (p.to - p.from) * Math.sqrt(k));
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      return true;
    });
    // 파편: 튀어 나가며 떨어지고 작아진다
    this.sparks = this.sparks.filter((s) => {
      const age = (now - s.at) / 1000;
      const k = (now - s.at) / s.ms;
      if (k >= 1) {
        this.scene.remove(s.mesh);
        return false;
      }
      s.mesh.position.addScaledVector(s.v, 1 / 60);
      s.v.y -= 9.8 / 60;
      s.mesh.scale.setScalar(s.size * (1 - k * 0.8));
      s.mesh.rotation.set(age * 9, age * 7, 0);
      return true;
    });
    this.balls.forEach((b, id) => {
      const t = (now - b.at) / 1000;
      b.mesh.position.set(b.o.x + b.v.x * t, b.o.y + b.v.y * t - 0.5 * b.g * t * t, b.o.z + b.v.z * t);
      // 서버의 터짐 알림을 못 받으면 오래 날다 사라진다
      if (t > 8) {
        this.scene.remove(b.mesh);
        this.balls.delete(id);
      }
    });
    this.bursts = this.bursts.filter((x) => {
      const k = (now - x.at) / BURST_MS;
      if (k >= 1) {
        this.scene.remove(x.mesh);
        (x.mesh.material as THREE.Material).dispose();
        return false;
      }
      x.mesh.scale.setScalar(0.3 + (x.r - 0.3) * Math.sqrt(k));
      (x.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
      return true;
    });
    this.arrows.forEach((a, id) => {
      if (a.stuckAt) {
        if (now - a.stuckAt > STUCK_MS) {
          this.scene.remove(a.mesh);
          this.arrows.delete(id);
        }
        return;
      }
      // 곧게 v·t 만큼 + 낙차 ½·g·t² (서버와 같은 셈), 화살은 날아가는 쪽을 본다
      const t = Math.min(a.range / a.v, (now - a.at) / 1000);
      const dist = t * a.v;
      a.mesh.position.copy(a.o).addScaledVector(a.d, dist);
      a.mesh.position.y -= 0.5 * a.g * t * t;
      if (a.g) a.mesh.lookAt(a.mesh.position.clone().add(new THREE.Vector3(a.d.x * a.v, a.d.y * a.v - a.g * t, a.d.z * a.v)));
      // 서버의 끝 알림을 못 받아도 사거리 끝에서 멈춘다
      if (dist >= a.range) a.stuckAt = now;
    });
  }

  dispose() {
    this.puffs.forEach((x) => this.scene.remove(x.mesh));
    this.sparks.forEach((x) => this.scene.remove(x.mesh));
    this.arrows.forEach((a) => this.scene.remove(a.mesh));
    this.balls.forEach((b) => this.scene.remove(b.mesh));
    this.bursts.forEach((x) => this.scene.remove(x.mesh));
    this.puffs = [];
    this.sparks = [];
    this.arrows.clear();
    this.balls.clear();
    this.bursts = [];
    this.unitBox.dispose();
    this.unitBall.dispose();
    this.sparkMats.forEach((m) => m.dispose());
    this.ballGeo.dispose();
    this.ballMat.dispose();
    this.burstGeo.dispose();
    const L = this.arrowLook;
    [ L.shaft, L.head, L.fletch, L.wood, L.metal, L.feather ].forEach((x) => x.dispose());
  }

}