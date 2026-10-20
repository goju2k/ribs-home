import * as THREE from 'three';

/**
 * 플레이어를 가리는 물체(건물·나무)에 화면상 구멍을 뚫어 사람이 보이게 한다.
 * 건물이 하나의 메시로 합쳐져 있어 물체별로 투명하게 할 수 없으니, 셰이더에서
 * "플레이어보다 카메라에 가깝고 발보다 높은" 조각만 플레이어 주변 타원 안에서 디더링으로 지운다.
 */
export const SEE = {
  on: { value: 0 },
  /** 그리기 버퍼 픽셀 좌표 (왼쪽 아래 원점) */
  center: { value: new THREE.Vector2() },
  radius: { value: 0 },
  /** 플레이어의 카메라 공간 깊이 */
  depth: { value: 0 },
  footY: { value: 0 },
};

const VERT_HEAD = 'varying float vSeeY;\n';
const VERT_BODY = `
vec4 seeW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
seeW = instanceMatrix * seeW;
#endif
vSeeY = (modelMatrix * seeW).y;
`;

const FRAG_HEAD = `
varying float vSeeY;
uniform float uSeeOn;
uniform vec2 uSeeCenter;
uniform float uSeeRadius;
uniform float uSeeDepth;
uniform float uSeeFootY;
float seeBayer(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  const float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return (m[i.x + i.y * 4] + 0.5) / 16.0;
}
`;

const FRAG_BODY = `
if (uSeeOn > 0.5 && vSeeY > uSeeFootY + 0.2 && vViewPosition.z < uSeeDepth - 0.3) {
  vec2 seeD = gl_FragCoord.xy - uSeeCenter;
  float seeR = length(vec2(seeD.x, seeD.y * 0.75)); // 사람 모양에 맞춰 세로로 긴 타원
  float seeKeep = mix(0.2, 1.0, smoothstep(uSeeRadius * 0.6, uSeeRadius, seeR));
  if (seeBayer(gl_FragCoord.xy) > seeKeep) discard;
}
`;

/** Lambert 계열 재질에 구멍 뚫기를 덧붙인다 (vViewPosition을 쓰므로 Lambert/Phong/Standard만) */
export function seeThrough<T extends THREE.Material>(material:T):T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uSeeOn: SEE.on, uSeeCenter: SEE.center, uSeeRadius: SEE.radius, uSeeDepth: SEE.depth, uSeeFootY: SEE.footY });
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAG_BODY}`);
  };
  material.customProgramCacheKey = () => 'see-through';
  return material;
}