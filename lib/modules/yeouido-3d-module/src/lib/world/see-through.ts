import * as THREE from 'three';

/**
 * 플레이어를 가리는 물체(건물·나무)에 화면상 구멍을 뚫어 사람이 보이게 한다.
 * 건물이 하나의 메시로 합쳐져 있어 물체별로 투명하게 할 수 없으니, 셰이더에서
 * "플레이어와 카메라 사이(수평 기준)에 있고 발보다 높은" 조각만 플레이어 주변에서 거칠게 지운다.
 * 실제로 가렸는지는 CPU에서 시선을 검사해 strength로 서서히 켜고 끈다.
 */
export const SEE = {
  /** 0~1, 가려졌을 때 1로 서서히 */
  strength: { value: 0 },
  /** 그리기 버퍼 픽셀 좌표 (왼쪽 아래 원점) */
  center: { value: new THREE.Vector2() },
  radius: { value: 0 },
  /** 플레이어 발 위치 (월드) */
  foot: { value: new THREE.Vector3() },
  /** 수평면에서 플레이어 → 카메라 방향 */
  toCam: { value: new THREE.Vector2() },
};

const VERT_HEAD = 'varying vec3 vSeeW;\n';
const VERT_BODY = `
vec4 seeW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
seeW = instanceMatrix * seeW;
#endif
vSeeW = (modelMatrix * seeW).xyz;
`;

const FRAG_HEAD = `
varying vec3 vSeeW;
uniform float uSeeStrength;
uniform vec2 uSeeCenter;
uniform float uSeeRadius;
uniform vec3 uSeeFoot;
uniform vec2 uSeeToCam;
float seeHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
`;

const FRAG_BODY = `
if (uSeeStrength > 0.01 && vSeeW.y > uSeeFoot.y + 0.2 && dot(vSeeW.xz - uSeeFoot.xz, uSeeToCam) > 0.4) {
  vec2 seeD = gl_FragCoord.xy - uSeeCenter;
  float seeR = length(vec2(seeD.x, seeD.y * 0.8)) / uSeeRadius;
  // 2×2 픽셀 덩어리로 흩어지는 거친 노이즈 + 가장자리를 들쭉날쭉하게
  vec2 seeCell = floor(gl_FragCoord.xy / 2.0);
  float seeEdge = seeR + (seeHash(seeCell * 0.37 + 5.1) - 0.5) * 0.35;
  float seeCut = (1.0 - smoothstep(0.2, 1.0, seeEdge)) * 0.88 * uSeeStrength;
  if (seeHash(seeCell) < seeCut) discard;
}
`;

/** Lambert 계열 재질에 구멍 뚫기를 덧붙인다 */
export function seeThrough<T extends THREE.Material>(material:T):T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uSeeStrength: SEE.strength, uSeeCenter: SEE.center, uSeeRadius: SEE.radius, uSeeFoot: SEE.foot, uSeeToCam: SEE.toCam });
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAG_BODY}`);
  };
  material.customProgramCacheKey = () => 'see-through-2';
  return material;
}