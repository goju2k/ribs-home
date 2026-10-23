import maplibregl, { CustomLayerInterface, CustomRenderMethodInput } from 'maplibre-gl';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * 지도 위 3D 건물 + 해 그림자 (three.js 커스텀 레이어).
 * 그림자를 바닥 다각형으로 계산하지 않고, 해 위치에서 비추는 빛의 그림자 맵으로 실제 3D 모양에서 만든다
 * — 좁아지는 몸체·옥상 설비·안테나까지 그대로 그림자에 나온다.
 *
 * 장소(site)마다 위경도 원점 하나에 미터 단위 장면을 둔다 (x 동, y 위, z 남).
 * 바닥은 그림자만 받는 투명 판이라 아래 지도가 그대로 보인다.
 */

export interface SiteBuilding {
  /** 바닥 다각형 [lng, lat][] 를 높이(m)만큼 세운다 */
  ring?: number[][];
  height?: number;
  /** 또는 GLB 모델 (원점 = 장소 원점, 미터, y 위) */
  model?: string;
}

export interface Site {
  id: string;
  /** 장면 원점 [lng, lat] */
  origin: [number, number];
  buildings: SiteBuilding[];
}

interface SiteState {
  site: Site;
  origin: maplibregl.MercatorCoordinate;
  /** 메르카토르 1m */
  meter: number;
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** 건물들을 감싸는 상자 (그림자 카메라 맞춤용) */
  bounds: THREE.Box3;
}

/** 해 높이가 이보다 낮으면 그림자를 끈다 (그림자가 수 km로 늘어나 의미가 없다) */
const MIN_SHADOW_ALT = 2;
const SHADOW_SIZE = 4096;

export class SunShadowLayer implements CustomLayerInterface {

  readonly id = 'sun-shadow-3d';

  readonly type = 'custom' as const;

  readonly renderingMode = '3d' as const;

  private map?:maplibregl.Map;

  private renderer?:THREE.WebGLRenderer;

  private env?:THREE.Texture;

  private readonly camera = new THREE.PerspectiveCamera();

  private readonly states:SiteState[] = [];

  /** 해 방향 (장면 좌표, 해 쪽을 향하는 단위 벡터) · 높이(도) */
  private readonly sunDir = new THREE.Vector3(0, 1, 0);

  private sunAlt = 90;

  private readonly sites:Site[];

  constructor(sites:Site[]) {
    this.sites = sites;
  }

  /** 해 위치: azimuth 북에서 시계방향(도), altitude 지평선에서(도) */
  setSun(azimuth:number, altitude:number) {
    const az = (azimuth * Math.PI) / 180;
    const alt = (altitude * Math.PI) / 180;
    // 북 = -z, 동 = +x
    this.sunDir.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)).normalize();
    this.sunAlt = altitude;
    this.states.forEach((s) => this.applySun(s));
    this.map?.triggerRepaint();
  }

  onAdd(map:maplibregl.Map, gl:WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    const renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    renderer.autoClear = false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    this.env = skyEnvironment(renderer);
    this.sites.forEach((site) => this.states.push(this.buildSite(site)));
  }

  onRemove() {
    this.states.forEach((s) => s.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [ m.material ]).forEach((mat) => mat.dispose());
      }
    }));
    this.env?.dispose();
    this.renderer?.dispose();
  }

  render(gl:WebGLRenderingContext | WebGL2RenderingContext, args:CustomRenderMethodInput) {
    const { map, renderer } = this;
    if (!map || !renderer) return;
    const mainMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]);
    const cam = maplibregl.MercatorCoordinate.fromLngLat(map.transform.getCameraLngLat(), map.transform.getCameraAltitude());
    renderer.resetState();
    renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.states.forEach((s) => {
      // 원점에서 장면 미터 좌표로: x 동, y 위, z 남 (메르카토르 y는 남쪽으로 커진다)
      const toScene = new THREE.Matrix4()
        .makeTranslation(s.origin.x, s.origin.y, 0)
        .scale(new THREE.Vector3(s.meter, s.meter, s.meter))
        .multiply(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
      // 카메라를 실제 자리에 둬야 반사·하이라이트(시선 방향)가 맞다
      const camPos = new THREE.Vector3((cam.x - s.origin.x) / s.meter, cam.z / s.meter, (cam.y - s.origin.y) / s.meter);
      // 너무 먼 장소는 건너뜀 (화면에 안 나온다)
      if (Math.hypot(camPos.x, camPos.z) > 40000) return;
      this.camera.position.copy(camPos);
      this.camera.updateMatrixWorld(true);
      this.camera.projectionMatrix.copy(mainMatrix).multiply(toScene).multiply(this.camera.matrixWorld);
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
      renderer.render(s.scene, this.camera);
    });
  }

  private buildSite(site:Site):SiteState {
    const origin = maplibregl.MercatorCoordinate.fromLngLat(site.origin, 0);
    const meter = origin.meterInMercatorCoordinateUnits();
    const scene = new THREE.Scene();
    scene.environment = this.env ?? null;
    const hemi = new THREE.HemisphereLight('#dfeaff', '#8d8a7e', 0.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff6e8', 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target);

    // 그림자 받는 바닥 (투명, 그림자만)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(16000, 16000).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ color: '#0b1530', opacity: 0.38, depthWrite: false }),
    );
    ground.position.y = 0.05;
    ground.receiveShadow = true;
    ground.frustumCulled = false;
    scene.add(ground);

    const state:SiteState = { site, origin, meter, scene, sun, hemi, bounds: new THREE.Box3() };
    const toLocal = ([ lng, lat ]:number[]) => {
      const p = maplibregl.MercatorCoordinate.fromLngLat([ lng, lat ], 0);
      return new THREE.Vector2((p.x - origin.x) / meter, (p.y - origin.y) / meter);
    };

    site.buildings.forEach((b) => {
      if (b.ring && b.height) {
        // 바닥 다각형 세우기: 모양 평면 (x, -z) → 위로 뽑은 뒤 눕힌다
        const pts = b.ring.map(toLocal);
        const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y)));
        const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false }).rotateX(-Math.PI / 2);
        // 하늘 반사가 세면 벽이 하얗게 날아간다
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#cfccc4', roughness: 0.85, envMapIntensity: 0.35 }));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        scene.add(mesh);
        state.bounds.expandByObject(mesh);
      }
      if (b.model) {
        new GLTFLoader().load(b.model, (gltf) => {
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            m.castShadow = true;
            m.receiveShadow = true;
            m.frustumCulled = false;
            const mat = m.material as THREE.MeshStandardMaterial;
            // 거울 같은 유리(금속 0.9·거칠기 0.07)는 해 하이라이트가 바늘 끝만 해서 햇빛 받는 면이 밝아지지 않고,
            // 위에서 보면 환경의 땅 쪽을 비춰 어둡다 → 조금 덜 금속·조금 더 거칠게 해서 해를 받은 면이 넓게 빛나게
            if (mat.metalness > 0.5) {
              mat.metalness = 0.5;
              mat.roughness = 0.32;
              mat.envMapIntensity = 0.55;
            }
            // 밤 불빛은 쓰지 않는다 (지도가 밤에 화면 전체를 어둡게 깐다)
            mat.emissiveMap = null;
            mat.emissive.set('#000000');
          });
          scene.add(gltf.scene);
          state.bounds.expandByObject(gltf.scene);
          this.applySun(state);
          this.map?.triggerRepaint();
        });
      }
    });
    this.applySun(state);
    return state;
  }

  /** 해 빛·그림자 카메라를 건물들에 맞춘다 */
  private applySun(s:SiteState) {
    const { sun, hemi, bounds } = s;
    const alt = this.sunAlt;
    const day = THREE.MathUtils.clamp((alt + 4) / 14, 0, 1);
    sun.visible = alt > 0;
    sun.intensity = 3.2 * THREE.MathUtils.clamp(alt / 12, 0, 1);
    // 해가 낮을수록 노을빛
    sun.color.set('#ffb070').lerp(new THREE.Color('#fff6e8'), THREE.MathUtils.clamp(alt / 25, 0, 1));
    hemi.intensity = 0.15 + 0.25 * day;
    sun.castShadow = alt > MIN_SHADOW_ALT && !bounds.isEmpty();
    if (bounds.isEmpty() || !sun.castShadow) return;

    const center = bounds.getCenter(new THREE.Vector3());
    center.y = 0;
    const radius = bounds.getSize(new THREE.Vector3()).length();
    sun.target.position.copy(center);
    sun.position.copy(center).addScaledVector(this.sunDir, radius * 2 + 500);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();

    // 그림자 카메라 범위: 건물 상자 꼭짓점과 그 꼭짓점이 바닥에 떨어지는 점을 모두 담는다
    const cam = sun.shadow.camera;
    cam.position.copy(sun.position);
    cam.lookAt(center);
    cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse;
    const box = new THREE.Box3();
    const { min, max } = bounds;
    const corners = [ min.x, max.x ].flatMap((x) => [ min.y, max.y ].flatMap((y) => [ min.z, max.z ].map((z) => new THREE.Vector3(x, y, z))));
    corners.forEach((p) => {
      box.expandByPoint(p.clone().applyMatrix4(inv));
      // 바닥에 떨어지는 점: 해 반대 방향으로 높이 / tan(고도)
      const ground = p.clone().addScaledVector(this.sunDir, -p.y / this.sunDir.y);
      ground.y = 0;
      box.expandByPoint(ground.applyMatrix4(inv));
    });
    const pad = 4;
    cam.left = box.min.x - pad;
    cam.right = box.max.x + pad;
    cam.bottom = box.min.y - pad;
    cam.top = box.max.y + pad;
    cam.near = Math.max(0.1, -box.max.z - pad);
    cam.far = -box.min.z + pad;
    cam.updateProjectionMatrix();
  }

}

/** 하늘 빛 환경 (금속 유리가 하늘을 비추게) */
function skyEnvironment(renderer:THREE.WebGLRenderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const sky = new THREE.Scene();
  const geo = new THREE.SphereGeometry(100, 32, 16);
  const pos = geo.attributes.position;
  const cols:number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 100;
    if (y > 0) c.set('#ffffff').lerp(new THREE.Color('#5b8fd6'), Math.min(1, y * 1.6));
    else c.set('#d8dccf').lerp(new THREE.Color('#9a9d8f'), Math.min(1, -y * 3));
    cols.push(c.r * 1.6, c.g * 1.6, c.b * 1.6);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  sky.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const env = pmrem.fromScene(sky, 0.02).texture;
  geo.dispose();
  pmrem.dispose();
  return env;
}