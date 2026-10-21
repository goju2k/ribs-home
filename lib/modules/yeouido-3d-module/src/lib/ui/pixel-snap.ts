import * as THREE from 'three';

/**
 * 픽셀 퍼펙트(위 시점): 화면에 찍히는 모든 것이 같은 도트 격자 위에 놓여야 장면마다 같은 도트로 찍힌다.
 * - 가만히 있는 것: 카메라를 도트 단위로만 옮기니 저절로 맞는다
 * - 움직이는 것: 여기 등록해 두면 그릴 때만 가장 가까운 격자 자리로 옮겨 그리고, 그린 뒤 제자리로 돌린다
 *   (장면 바로 아래 물체만 — 부모가 옮겨지거나 돌아가 있으면 안 맞는다. 장면에서 빼면 등록도 저절로 풀린다)
 */
const targets = new Set<THREE.Object3D>();

export const pixelSnap = {
  add: (...os:THREE.Object3D[]) => os.forEach((o) => targets.add(o)),
  remove: (...os:THREE.Object3D[]) => os.forEach((o) => targets.delete(o)),
};

/** 도는 애니메이션은 이 단계로만 (도트 그림의 프레임처럼 — 매끄럽게 돌면 도는 내내 도트가 흘러내린다) */
export const SPIN_STEPS = 8;
export const stepAngle = (a:number, steps = SPIN_STEPS) => Math.round(a / ((Math.PI * 2) / steps)) * ((Math.PI * 2) / steps);

const saved:{ o: THREE.Object3D; x: number; y: number; z: number; }[] = [];

/**
 * 등록된 물체(+ extra)를 카메라 오른쪽·위쪽 축의 도트 격자에 맞춘다. 돌려준 함수를 그린 뒤 부르면 제자리로.
 * e: 카메라 matrixWorld.elements, texel: 도트 하나의 크기(m)
 */
export function snapToGrid(e:ArrayLike<number>, texel:number, extra:Iterable<THREE.Object3D>) {
  const one = (o:THREE.Object3D) => {
    // 장면에서 빠진 것은 등록도 지운다 (따로 빼지 않아도 되게)
    if (!o.parent) {
      targets.delete(o);
      return;
    }
    if (!o.visible) return;
    const q = o.position;
    saved.push({ o, x: q.x, y: q.y, z: q.z });
    const qr = q.x * e[0] + q.y * e[1] + q.z * e[2];
    const qu = q.x * e[4] + q.y * e[5] + q.z * e[6];
    const sr = Math.round(qr / texel) * texel - qr;
    const su = Math.round(qu / texel) * texel - qu;
    q.set(q.x + e[0] * sr + e[4] * su, q.y + e[1] * sr + e[5] * su, q.z + e[2] * sr + e[6] * su);
  };
  targets.forEach(one);
  [ ...extra ].forEach(one);
  return () => {
    saved.forEach(({ o, x, y, z }) => o.position.set(x, y, z));
    saved.length = 0;
  };
}