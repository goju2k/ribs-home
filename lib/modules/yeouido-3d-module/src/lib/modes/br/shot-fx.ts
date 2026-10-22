import * as THREE from 'three';

import { pixelSnap } from '../../ui/pixel-snap';

/**
 * 총알 모습 (화면만 — 판정은 서버가 바로 한다): 짧은 빛줄기가 총구에서 맞은 곳까지 날아간다.
 * 실제 탄알(1cm)은 이 도트 화면에선 안 보여 게임에서 흔한 트레이서로 그린다. 속도는 실제보다 느리게(눈에 보이게).
 * speed m/s·len 길이·width 굵기 (m)·color·flash 총구 불꽃 반지름 (m)
 */
export interface BulletStyle {
  speed: number; len: number; width: number; color: string; flash: number;
}

export const BULLET_STYLES:Record<string, BulletStyle> = {
  pistol: { speed: 260, len: 0.9, width: 0.09, color: '#ffe27a', flash: 0.32 },
  smg: { speed: 300, len: 0.8, width: 0.08, color: '#ffd05a', flash: 0.28 },
  rifle: { speed: 380, len: 1.6, width: 0.1, color: '#ffb84a', flash: 0.42 },
  shotgun: { speed: 220, len: 0.45, width: 0.08, color: '#fff0b0', flash: 0.6 },
  sniper: { speed: 600, len: 3.2, width: 0.15, color: '#fffbe0', flash: 0.7 },
};

const DEFAULT_STYLE = BULLET_STYLES.pistol;
/** 총구 불꽃·맞은 자리 튐이 보이는 시간 (ms) */
const FLASH_MS = 60;
const IMPACT_MS = 160;
/** 독 파이어볼 터짐이 보이는 시간 (ms) */
const BURST_MS = 450;
/** 박힌 화살이 남아 있는 시간 (ms) */
const STUCK_MS = 2500;

interface Bullet {
  mesh: THREE.Mesh; o: THREE.Vector3; d: THREE.Vector3; dist: number; st: BulletStyle; at: number;
}

interface Puff {
  mesh: THREE.Mesh; at: number; ms: number; from: number; to: number;
}

interface Flying {
  mesh: THREE.Mesh; o: THREE.Vector3; d: THREE.Vector3; v: number; range: number; g: number; at: number; stuckAt: number;
}

/**
 * 원거리 효과 (배틀로얄 모드): 날아가는 총알(무기마다 모습)·총구 불꽃·맞은 자리 튐, 날아가는 화살(서버와 같은 출발점·방향·속도로 같이 날림).
 */
export class ShotFx {

  private scene:THREE.Scene;

  private bullets:Bullet[] = [];

  private puffs:Puff[] = [];

  private unitBox = new THREE.BoxGeometry(1, 1, 1);

  private unitBall = new THREE.SphereGeometry(1, 8, 6);

  private bulletMats = new Map<string, THREE.MeshBasicMaterial>();

  private arrows = new Map<number, Flying>();

  /** 내가 먼저 그린 화살 (번호 음수) 중 서버 번호를 아직 못 받은 것, 서버 번호 → 내 번호 */
  private ownWaiting:number[] = [];

  private alias = new Map<number, number>();

  private ownSeq = 0;

  /** 독 파이어볼 (날아가는 것)·터짐 (커지며 사라지는 구) */
  private balls = new Map<number, { mesh: THREE.Mesh; o: THREE.Vector3; v: THREE.Vector3; g: number; at: number; }>();

  private bursts:{ mesh: THREE.Mesh; at: number; r: number; }[] = [];

  private ballGeo = new THREE.IcosahedronGeometry(0.6, 0);

  private ballMat = new THREE.MeshBasicMaterial({ color: '#7dff4a' });

  private burstGeo = new THREE.SphereGeometry(1, 10, 6);

  private arrowGeo = new THREE.BoxGeometry(0.05, 0.05, 0.8);

  private arrowMat = new THREE.MeshLambertMaterial({ color: '#d9c38a', emissive: '#3a2a10' });

  constructor(scene:THREE.Scene) {
    this.scene = scene;
  }

  private bulletMat(color:string) {
    let m = this.bulletMats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color });
      this.bulletMats.set(color, m);
    }
    return m;
  }

  /** 잠깐 보이는 구 (총구 불꽃·맞은 자리 튐): 반지름 from → to, 점점 투명하게 */
  private puff(at:THREE.Vector3, color:string, from:number, to:number, ms:number, now:number) {
    const mesh = new THREE.Mesh(this.unitBall, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    mesh.position.copy(at);
    mesh.scale.setScalar(from);
    this.scene.add(mesh);
    this.puffs.push({ mesh, at: now, ms, from, to });
  }

  /** 총구 불꽃 (한 번 쏠 때 한 번 — 산탄도 하나). scale: 1인칭 내 총구는 눈앞이라 작게 */
  flash(o:[number, number, number], kind:string, now:number, scale = 1) {
    const st = BULLET_STYLES[kind] ?? DEFAULT_STYLE;
    this.puff(new THREE.Vector3(...o), '#fff4c0', st.flash * 0.5 * scale, st.flash * scale, FLASH_MS, now);
  }

  /** 총알 한 알: 총구 o에서 끝 e까지 무기 모습대로 날아가고, 닿으면 튄다 */
  tracer(o:[number, number, number], e:[number, number, number], now:number, kind = 'pistol') {
    const st = BULLET_STYLES[kind] ?? DEFAULT_STYLE;
    const from = new THREE.Vector3(...o);
    const to = new THREE.Vector3(...e);
    const dist = from.distanceTo(to);
    if (dist < 0.05) return;
    const d = to.sub(from).divideScalar(dist);
    const mesh = new THREE.Mesh(this.unitBox, this.bulletMat(st.color));
    mesh.scale.set(st.width, st.width, Math.min(st.len, dist));
    mesh.position.copy(from);
    mesh.lookAt(from.clone().add(d));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.bullets.push({ mesh, o: from, d, dist, st, at: now });
  }

  arrow(id:number, o:[number, number, number], d:[number, number, number], v:number, range:number, now:number, g = 0) {
    const mesh = new THREE.Mesh(this.arrowGeo, this.arrowMat);
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

  /** 화살이 멈춘 자리 (서버 기준으로 맞춘다) */
  arrowEnd(id:number, at:[number, number, number], now:number) {
    const a = this.arrows.get(this.alias.get(id) ?? id);
    this.alias.delete(id);
    if (!a) return;
    a.mesh.position.set(...at);
    a.stuckAt = now;
  }

  update(now:number) {
    // 총알: 머리가 speed·t 만큼, 꼬리는 길이만큼 뒤 (총구보다 뒤로는 안 간다). 끝에 닿으면 튀고 사라진다
    this.bullets = this.bullets.filter((b) => {
      const head = ((now - b.at) / 1000) * b.st.speed;
      if (head >= b.dist) {
        this.scene.remove(b.mesh);
        this.puff(b.o.clone().addScaledVector(b.d, b.dist), '#d8d0b8', 0.08, 0.35, IMPACT_MS, now);
        return false;
      }
      const len = Math.min(b.st.len, head, b.dist);
      b.mesh.scale.z = Math.max(0.05, len);
      b.mesh.position.copy(b.o).addScaledVector(b.d, Math.max(0, head - len / 2));
      return true;
    });
    this.puffs = this.puffs.filter((p) => {
      const k = (now - p.at) / p.ms;
      if (k >= 1) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        return false;
      }
      p.mesh.scale.setScalar(p.from + (p.to - p.from) * k);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
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
    this.bullets.forEach((x) => this.scene.remove(x.mesh));
    this.puffs.forEach((x) => this.scene.remove(x.mesh));
    this.bullets = [];
    this.puffs = [];
    this.unitBox.dispose();
    this.unitBall.dispose();
    this.bulletMats.forEach((m) => m.dispose());
    this.arrows.forEach((a) => this.scene.remove(a.mesh));
    this.balls.forEach((b) => this.scene.remove(b.mesh));
    this.bursts.forEach((x) => this.scene.remove(x.mesh));
    this.balls.clear();
    this.bursts = [];
    this.ballGeo.dispose();
    this.ballMat.dispose();
    this.burstGeo.dispose();
    this.arrows.clear();
    this.arrowGeo.dispose();
    this.arrowMat.dispose();
  }

}