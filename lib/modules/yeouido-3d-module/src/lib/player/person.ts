import * as THREE from 'three';

export interface PersonLook {
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
}

export interface Person {
  root: THREE.Group;
  /** 이동 속도(m/s)에 맞춰 팔다리를 흔든다 */
  animate: (dt:number, speed:number) => void;
}

// 실제 비율: 키 1.72m, 어깨 폭 0.42m
const LEG = 0.82;
const TORSO = 0.58;
const HEAD = 0.24;

function box(w:number, h:number, d:number, color:string, pivotTop = false) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (pivotTop) g.translate(0, -h / 2, 0);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
  m.castShadow = true;
  return m;
}

/** 건물 뒤에 가려져도 위치를 알 수 있게, 가려진 부분만 단색으로 그리는 복제본 */
function addSilhouette(root:THREE.Group) {
  const mat = new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.75, depthWrite: false, depthFunc: THREE.GreaterDepth });
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.silhouette) return;
    const s = new THREE.Mesh(o.geometry, mat);
    s.userData.silhouette = true;
    s.renderOrder = 10;
    o.add(s);
  });
}

export function createPerson(look:PersonLook, silhouette = false):Person {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const hipY = LEG;
  const legL = box(0.15, LEG, 0.17, look.pants, true);
  const legR = box(0.15, LEG, 0.17, look.pants, true);
  legL.position.set(-0.09, hipY, 0);
  legR.position.set(0.09, hipY, 0);

  const torso = box(0.42, TORSO, 0.22, look.shirt);
  torso.position.set(0, hipY + TORSO / 2, 0);

  const shoulderY = hipY + TORSO - 0.04;
  const armL = box(0.1, 0.6, 0.12, look.shirt, true);
  const armR = box(0.1, 0.6, 0.12, look.shirt, true);
  armL.position.set(-0.27, shoulderY, 0);
  armR.position.set(0.27, shoulderY, 0);
  const handL = box(0.09, 0.09, 0.1, look.skin);
  const handR = box(0.09, 0.09, 0.1, look.skin);
  handL.position.set(0, -0.62, 0);
  handR.position.set(0, -0.62, 0);
  armL.add(handL);
  armR.add(handR);

  const head = box(HEAD, HEAD, HEAD, look.skin);
  head.position.set(0, hipY + TORSO + 0.03 + HEAD / 2, 0);
  const hair = box(HEAD + 0.02, 0.07, HEAD + 0.02, look.hair);
  hair.position.set(0, HEAD / 2, -0.01);
  head.add(hair);
  // 얼굴 방향 표시(눈)
  const eyes = box(0.14, 0.03, 0.01, '#222222');
  eyes.position.set(0, 0.02, HEAD / 2 + 0.005);
  head.add(eyes);

  body.add(legL, legR, torso, armL, armR, head);
  if (silhouette) addSilhouette(root);

  let phase = 0;
  const animate = (dt:number, speed:number) => {
    const moving = speed > 0.05;
    phase += moving ? dt * (3 + speed * 2.2) : 0;
    const swing = moving ? Math.min(0.9, 0.35 + speed * 0.12) : 0;
    const s = Math.sin(phase) * swing;
    legL.rotation.x = s;
    legR.rotation.x = -s;
    armL.rotation.x = -s * 0.9;
    armR.rotation.x = s * 0.9;
    // 걸을 때 위아래로 살짝
    body.position.y = moving ? Math.abs(Math.cos(phase)) * 0.03 * Math.min(2, speed) : 0;
    if (!moving) {
      [ legL, legR, armL, armR ].forEach((m) => {
        m.rotation.x *= 0.8; 
      });
    }
  };

  return { root, animate };
}