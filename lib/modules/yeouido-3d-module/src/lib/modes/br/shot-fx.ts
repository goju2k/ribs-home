import * as THREE from 'three';

/** 총 궤적이 보이는 시간 (ms) */
const TRACER_MS = 140;
/** 박힌 화살이 남아 있는 시간 (ms) */
const STUCK_MS = 2500;

interface Tracer {
  line: THREE.Line; at: number;
}

interface Flying {
  mesh: THREE.Mesh; o: THREE.Vector3; d: THREE.Vector3; v: number; range: number; at: number; stuckAt: number;
}

/**
 * 원거리 효과 (배틀로얄 모드): 총 궤적(잠깐 보이는 선), 날아가는 화살(서버와 같은 출발점·방향·속도로 같이 날림).
 */
export class ShotFx {

  private scene:THREE.Scene;

  private tracers:Tracer[] = [];

  private arrows = new Map<number, Flying>();

  private tracerMat = new THREE.LineBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.9 });

  private arrowGeo = new THREE.BoxGeometry(0.05, 0.05, 0.8);

  private arrowMat = new THREE.MeshLambertMaterial({ color: '#d9c38a', emissive: '#3a2a10' });

  constructor(scene:THREE.Scene) {
    this.scene = scene;
  }

  tracer(o:[number, number, number], e:[number, number, number], now:number) {
    const geo = new THREE.BufferGeometry().setFromPoints([ new THREE.Vector3(...o), new THREE.Vector3(...e) ]);
    const line = new THREE.Line(geo, this.tracerMat.clone());
    line.frustumCulled = false;
    this.scene.add(line);
    this.tracers.push({ line, at: now });
  }

  arrow(id:number, o:[number, number, number], d:[number, number, number], v:number, range:number, now:number) {
    const mesh = new THREE.Mesh(this.arrowGeo, this.arrowMat);
    const dir = new THREE.Vector3(...d);
    mesh.position.set(...o);
    mesh.lookAt(mesh.position.clone().add(dir));
    this.scene.add(mesh);
    this.arrows.set(id, { mesh, o: new THREE.Vector3(...o), d: dir, v, range, at: now, stuckAt: 0 });
  }

  /** 화살이 멈춘 자리 (서버 기준으로 맞춘다) */
  arrowEnd(id:number, at:[number, number, number], now:number) {
    const a = this.arrows.get(id);
    if (!a) return;
    a.mesh.position.set(...at);
    a.stuckAt = now;
  }

  update(now:number) {
    this.tracers = this.tracers.filter((t) => {
      const k = (now - t.at) / TRACER_MS;
      if (k >= 1) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        return false;
      }
      (t.line.material as THREE.LineBasicMaterial).opacity = 0.9 * (1 - k);
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
      const dist = Math.min(a.range, ((now - a.at) / 1000) * a.v);
      a.mesh.position.copy(a.o).addScaledVector(a.d, dist);
      // 서버의 끝 알림을 못 받아도 사거리 끝에서 멈춘다
      if (dist >= a.range) a.stuckAt = now;
    });
  }

  dispose() {
    this.tracers.forEach((t) => this.scene.remove(t.line));
    this.arrows.forEach((a) => this.scene.remove(a.mesh));
    this.tracers = [];
    this.arrows.clear();
    this.arrowGeo.dispose();
    this.arrowMat.dispose();
    this.tracerMat.dispose();
  }

}