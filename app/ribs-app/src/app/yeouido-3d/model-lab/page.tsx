'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * 모델 실험실 (게임에는 아직 안 씀): 블렌더로 만든 랜드마크 모델(.glb)을 휴대폰에서 돌려 보고, 블렌더 렌더 이미지와 비교한다.
 * 파일: public/models/lab/ (블렌더 스크립트가 내보낸 것)
 */
/** cam: 처음 카메라 자리, look: 바라보는 높이 */
const MODELS = [
  { id: '63-building', name: '63빌딩', renders: [ 'render_45', 'render_front' ], cam: [ -380, 160, 380 ], look: 120 },
  { id: 'kbs-main', name: 'KBS 본관', renders: [ 'render_45', 'render_front' ], cam: [ -170, 70, 170 ], look: 15 },
];
const BASE = '/models/lab';

export default function Page() {
  const mount = useRef<HTMLDivElement>(null);
  const [ tab, setTab ] = useState<'3d' | 'render'>('3d');
  const [ status, setStatus ] = useState('불러오는 중…');
  const [ mi, setMi ] = useState(0);
  const model = MODELS[mi];

  useEffect(() => {
    if (tab !== '3d' || !mount.current) return undefined;
    const host = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#9cc3e6');
    // 반사 유리가 비칠 주변: 하늘(위 파랑 → 지평선 밝게) + 땅 — 금색 유리가 하늘빛을 받아 반짝이게
    const pmrem = new THREE.PMREMGenerator(renderer);
    const skyScene = new THREE.Scene();
    const skyGeo = new THREE.SphereGeometry(100, 32, 16);
    const cols:number[] = [];
    const pos = skyGeo.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 100;
      if (y > 0) c.set('#ffffff').lerp(new THREE.Color('#5b8fd6'), Math.min(1, y * 1.6));
      // 아래(땅)도 너무 어둡지 않게 — 돌리다 유리가 아래를 비추는 각도가 되면 갑자기 어두워 그림자처럼 보이던 것
      else c.set('#d8dccf').lerp(new THREE.Color('#9a9d8f'), Math.min(1, -y * 3));
      cols.push(c.r * 1.6, c.g * 1.6, c.b * 1.6);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    skyScene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    scene.environment = pmrem.fromScene(skyScene, 0.02).texture;
    // 해: 게임과 같은 방향 (SUN_DIR = 서·남쪽 위, 높이 약 55°) — 블렌더 렌더도 같은 방향. 건물이 땅에 그림자를 드리운다
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
    sun.position.copy(new THREE.Vector3(-0.55, 1, 0.45).normalize().multiplyScalar(700));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -320, right: 320, top: 320, bottom: -320, near: 100, far: 1500 });
    sun.shadow.bias = -0.0004;
    scene.add(sun, sun.target, new THREE.HemisphereLight('#dfefff', '#6b6a5c', 0.8));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(600, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#8a9a7e' }));
    ground.receiveShadow = true;
    scene.add(ground);
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
    camera.position.set(model.cam[0], model.cam[1], model.cam[2]);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, model.look, 0);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 40;
    controls.maxDistance = 1500;
    new GLTFLoader().load(`${BASE}/${model.id}.glb`, (gltf) => {
      scene.add(gltf.scene);
      let tris = 0;
      const aniso = renderer.capabilities.getMaxAnisotropy();
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
        // 블렌더에서 도트(Closest)로 나온 무늬: 가까이는 또렷하게, 멀면 밉맵으로 부드럽게 (지글거림 방지)
        const { map } = m.material as THREE.MeshStandardMaterial;
        if (map) {
          map.magFilter = THREE.NearestFilter;
          map.minFilter = THREE.LinearMipmapLinearFilter;
          map.generateMipmaps = true;
          map.anisotropy = aniso;
          map.needsUpdate = true;
        }
      });
      setStatus(`${model.name} · 삼각형 ${Math.round(tris).toLocaleString()}개 · 한 손가락 돌리기 / 두 손가락 확대·이동`);
    }, undefined, () => setStatus('모델 파일을 못 불러왔습니다'));
    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);
    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      controls.dispose();
      pmrem.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [ tab, model ]);

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#0b0e22', color: '#f4f4f8', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', alignItems: 'center' }}>
        <b style={{ marginRight: 'auto' }}>모델 실험실</b>
        <select value={mi} onChange={(e) => setMi(Number(e.target.value))} style={{ padding: '6px 8px', borderRadius: 6, background: '#3a4272', color: '#fff', border: 0 }}>
          {MODELS.map((m, i) => <option key={m.id} value={i}>{m.name}</option>)}
        </select>
        {([[ '3d', '3D 보기' ], [ 'render', '블렌더 렌더' ]] as const).map(([ k, label ]) => (
          <button key={k} type='button' onClick={() => setTab(k)} style={{ padding: '6px 12px', border: 0, borderRadius: 6, background: tab === k ? '#3d6fd8' : '#3a4272', color: '#fff' }}>{label}</button>
        ))}
      </div>
      {tab === '3d' ? (
        <>
          <div ref={mount} style={{ flex: 1, minHeight: 0, touchAction: 'none' }} />
          <div style={{ padding: '6px 12px', fontSize: 12, color: '#c9ced6' }}>{status}</div>
        </>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {model.renders.map((r) => (
            // eslint-disable-next-line @next/next/no-img-element -- 실험용 렌더 이미지 그대로
            <img key={r} src={`${BASE}/${model.id}_${r}.png`} alt={`${model.name} ${r}`} style={{ width: '100%', maxWidth: 720, alignSelf: 'center', borderRadius: 8 }} />
          ))}
        </div>
      )}
    </div>
  );
}