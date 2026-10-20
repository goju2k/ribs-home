import { MutableRefObject, useEffect, useRef } from 'react';
import styled from 'styled-components';
import * as THREE from 'three';

import { WORLD } from '../data/world-data';
import { InputState, readLift, readMove } from '../input';
import { createPerson } from '../player/person';
import { buildCity } from '../world/build-city';
import { Collision } from '../world/collision';
import { SEE } from '../world/see-through';

const WALK = 1.4; // m/s
const RUN = 9.6; // 임시로 두 배 (원래 4.8)
const FLY = 12; // 날 때 수평 속도
const FLY_RUN = 36;
const LIFT = 10; // 오르내리는 속도
const LIFT_RUN = 30;
const MAX_ALT = 500;
const RADIUS = 0.28;
const PITCH = THREE.MathUtils.degToRad(48);
const MIN_VIEW = 8; // 화면 세로가 담는 미터
const MAX_VIEW = 900;
const ALT_ZOOM = 60; // 이만큼(m) 오를 때마다 보이는 범위가 기본만큼 넓어진다
const MAX_SHOWN_VIEW = 1600;
const SKY = '#a8dcf5';

export interface GameStatus {
  ready: boolean;
  buildMs: number;
  pixel: number;
  x: number;
  z: number;
  running: boolean;
  /** 땅에서 잰 높이(m) */
  alt: number;
  flying: boolean;
  /** 지붕 위에 서 있음 (물 위에 떠 있는 1m는 제외) */
  onRoof: boolean;
}

/** 머리 위 ▼ 표식 — 9×9 도트 그림 */
function markerTexture() {
  const rows = [
    '#########',
    '#yyyyyyy#',
    '.#yyyyy#.',
    '.#yyyyy#.',
    '..#yyy#..',
    '..#yyy#..',
    '...#y#...',
    '...#y#...',
    '....#....',
  ];
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = 9;
  const g = c.getContext('2d')!;
  rows.forEach((row, y) => [ ...row ].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = ch === '#' ? '#0b0e22' : '#ffd84a';
    g.fillRect(x, y, 1, 1);
  }));
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 화면 세로 기준 몇 CSS 픽셀을 한 도트로 그릴지 (주소의 ?pix= 로 바꿀 수 있다) */
function pixelSize(w:number, h:number) {
  const q = Number(new URLSearchParams(window.location.search).get('pix'));
  if (q >= 1 && q <= 8) return q;
  return Math.max(2, Math.round(Math.min(w, h) / 260));
}

export function GameCanvas({ inputRef, statusRef, onReady }:{
  inputRef: MutableRefObject<InputState>;
  statusRef: MutableRefObject<GameStatus>;
  onReady: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap; // 각진 도트 그림자

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);

    const t0 = performance.now();
    scene.add(buildCity(WORLD));
    const collision = new Collision(WORLD);
    const buildMs = Math.round(performance.now() - t0);

    scene.add(new THREE.HemisphereLight('#e6f4ff', '#8a8573', 1.6));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    const SUN_DIR = new THREE.Vector3(-0.55, 1, 0.45).normalize(); // 남서쪽 높이 뜬 해

    const player = createPerson({ shirt: '#e2574c', pants: '#2f4a7a', skin: '#f1c7a0', hair: '#2a1d14' });
    const pos = { x: WORLD.spawn.x, y: 0, z: WORLD.spawn.z };
    // 확인용: 주소에 ?at=x,z,높이 를 주면 그 자리에서 시작
    const at = new URLSearchParams(window.location.search).get('at')?.split(',').map(Number);
    if (at && at.length >= 2 && at.every(Number.isFinite)) {
      [ pos.x, pos.z ] = at;
      pos.y = at[2] ?? 0;
    }
    let facing = 0;
    let speedNow = 0; // 걷기↔달리기가 툭 끊기지 않게 부드럽게 따라간다
    player.root.position.set(pos.x, 0, pos.z);
    scene.add(player.root);

    // 멀리서도 보이게: 머리 위 ▼ 표식(항상 맨 위에 그림) + 발밑 땅까지 내린 선
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(), depthTest: false, depthWrite: false }));
    marker.renderOrder = 20;
    scene.add(marker);
    const dropGeo = new THREE.BufferGeometry().setFromPoints([ new THREE.Vector3(), new THREE.Vector3() ]);
    const drop = new THREE.Line(dropGeo, new THREE.LineBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.7 }));
    drop.frustumCulled = false;
    scene.add(drop);
    let autoZoom = 1;
    const bufSize = new THREE.Vector2();
    let seeFade = 0;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
    let view = 34; // 화면 세로에 담기는 미터
    let yaw = 0;
    let yawTarget = 0;
    let pix = 2;
    let pinch:{ d: number; } | null = null;
    const pointers = new Map<number, { x: number; y: number; }>();

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      pix = pixelSize(w, h);
      // 낮은 해상도로 그리고 CSS로 늘려서(image-rendering: pixelated) 도트 느낌을 낸다
      renderer.setPixelRatio(1 / pix);
      renderer.setSize(w, h, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // 휠·두 손가락 확대
    const onWheel = (e:WheelEvent) => {
      e.preventDefault();
      inputRef.current.zoom *= Math.exp(e.deltaY * 0.0012);
    };
    const onDown = (e:PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [ a, b ] = [ ...pointers.values() ];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      }
    };
    const onMove = (e:PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const [ a, b ] = [ ...pointers.values() ];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        inputRef.current.zoom *= pinch.d / Math.max(d, 1);
        pinch = { d };
      }
    };
    const onUp = (e:PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    const onKey = (e:KeyboardEvent) => {
      if (e.type === 'keydown') {
        if (e.code === 'Space') e.preventDefault();
        inputRef.current.keys.add(e.code);
        if (e.code === 'KeyT' && !e.repeat) inputRef.current.runToggle = !inputRef.current.runToggle;
        if (e.code === 'KeyQ') inputRef.current.rotate -= 1;
        if (e.code === 'KeyE') inputRef.current.rotate += 1;
        if (e.code === 'Equal' || e.code === 'NumpadAdd') inputRef.current.zoom *= 0.8;
        if (e.code === 'Minus' || e.code === 'NumpadSubtract') inputRef.current.zoom *= 1.25;
      } else inputRef.current.keys.delete(e.code);
    };
    const clearKeys = () => inputRef.current.keys.clear();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', clearKeys);

    let raf = 0;
    let last = performance.now();
    let readySent = false;
    const frame = (now:number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const input = inputRef.current;

      // 회전·확대 요청 반영
      if (input.rotate) {
        yawTarget += input.rotate * (Math.PI / 2);
        input.rotate = 0;
      }
      yaw += (yawTarget - yaw) * (1 - Math.exp(-dt * 10));
      if (input.zoom !== 1) {
        view = Math.min(MAX_VIEW, Math.max(MIN_VIEW, view * input.zoom));
        input.zoom = 1;
      }

      // 높이: 누르는 동안 오르내리고, 놓으면 그 높이에 떠 있는다
      const mv = readMove(input);
      const lift = readLift(input);
      const prevY = pos.y;
      if (lift) pos.y = Math.min(MAX_ALT, pos.y + lift * (mv.run ? LIFT_RUN : LIFT) * dt);
      // 빨리 내려오면 한 프레임에 지붕을 지나칠 수 있어 움직이기 전 높이로 바닥을 찾는다
      const floor = collision.floorAt(pos.x, pos.z, Math.max(prevY, pos.y));
      if (pos.y < floor) pos.y = floor;
      const grounded = floor === 0 && pos.y < 0.05;
      const flying = pos.y - floor > 0.5;

      // 이동: 화면 기준 입력을 카메라 방향으로 돌린다
      const speeds = flying ? [ FLY, FLY_RUN ] : [ WALK, RUN ];
      const topSpeed = speeds[mv.run ? 1 : 0];
      const want = mv.amount > 0.05 ? mv.amount * topSpeed : 0;
      speedNow += (want - speedNow) * (1 - Math.exp(-dt * 6));
      const speed = speedNow;
      let actual = 0;
      if (mv.amount > 0.05) {
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        const rx = Math.cos(yaw);
        const rz = -Math.sin(yaw);
        const wx = rx * mv.x - fx * mv.y;
        const wz = rz * mv.x - fz * mv.y;
        const len = Math.hypot(wx, wz) || 1;
        const next = collision.move(pos.x, pos.z, (wx / len) * speed * dt, (wz / len) * speed * dt, RADIUS, grounded ? 0 : pos.y);
        actual = Math.hypot(next.x - pos.x, next.z - pos.z) / dt;
        pos.x = next.x;
        pos.z = next.z;
        const turn = Math.atan2(wx, wz);
        let diff = turn - facing;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        facing += diff * (1 - Math.exp(-dt * 14));
      } else speedNow = 0;
      // 높이 오를수록 자동으로 멀리 본다 (손으로 맞춘 배율에 곱한다)
      autoZoom += (1 + pos.y / ALT_ZOOM - autoZoom) * (1 - Math.exp(-dt * 4));
      const shown = Math.min(MAX_SHOWN_VIEW, view * autoZoom);

      // 축소할수록 캐릭터를 키워 점으로 사라지지 않게
      const big = THREE.MathUtils.clamp(shown / 60, 1, 5);
      player.root.scale.setScalar(big);
      player.root.position.set(pos.x, pos.y, pos.z);
      player.root.rotation.y = facing;
      player.animate(dt, flying ? 0 : actual);
      const tall = 1.72 * big;
      const onScreen = tall * Math.cos(PITCH); // 내려다보니 화면에선 키가 줄어 보인다
      const mk = onScreen * 1.2; // 화면에서 사람보다 살짝 크게
      marker.visible = shown > 45;
      marker.scale.set(mk, mk, 1);
      // 화면에서 머리 위로 사람 키만큼 띄운다 (세로 거리도 cos 만큼 줄어 보여서 나눠 준다)
      marker.position.set(pos.x, pos.y + tall + (onScreen + mk / 2) / Math.cos(PITCH), pos.z);
      const below = pos.y - floor > 1;
      drop.visible = below;
      if (below) {
        dropGeo.attributes.position.setXYZ(0, pos.x, pos.y, pos.z);
        dropGeo.attributes.position.setXYZ(1, pos.x, floor, pos.z);
        dropGeo.attributes.position.needsUpdate = true;
      }

      // 카메라: 플레이어를 바라보는 고정 각도 정사영
      const { clientWidth: w, clientHeight: h } = canvas;
      const aspect = w / Math.max(h, 1);
      camera.top = shown / 2;
      camera.bottom = -shown / 2;
      camera.left = (-shown / 2) * aspect;
      camera.right = (shown / 2) * aspect;
      camera.updateProjectionMatrix();
      const target = new THREE.Vector3(pos.x, pos.y + 1, pos.z);
      const dist = 2500;
      camera.position.set(
        target.x + Math.sin(yaw) * Math.cos(PITCH) * dist,
        target.y + Math.sin(PITCH) * dist,
        target.z + Math.cos(yaw) * Math.cos(PITCH) * dist,
      );
      camera.lookAt(target);

      // 그림자는 화면에 보이는 범위만 (확대할수록 선명)
      const s = Math.min(500, shown * aspect * 0.75 + 20);
      const cam = sun.shadow.camera;
      cam.left = -s;
      cam.right = s;
      cam.top = s;
      cam.bottom = -s;
      cam.near = 1;
      cam.far = 2000;
      cam.updateProjectionMatrix();
      // 높이 날면 화면 가운데 보이는 땅이 플레이어 발밑과 달라진다 → 그 땅을 기준으로 그림자를 잡는다
      const back = target.y / Math.tan(PITCH);
      const ground = new THREE.Vector3(target.x - Math.sin(yaw) * back, 0, target.z - Math.cos(yaw) * back);
      sun.position.copy(ground).addScaledVector(SUN_DIR, 900);
      sun.target.position.copy(ground);

      // 플레이어를 가리는 건물·나무에 구멍: 실제로 시선이 막혔을 때만 서서히 켠다
      const toCamX = Math.sin(yaw);
      const toCamZ = Math.cos(yaw);
      const hidden = collision.hidesFrom(pos.x, pos.y, pos.z, tall, toCamX, toCamZ, Math.tan(PITCH));
      seeFade += ((hidden ? 1 : 0) - seeFade) * (1 - Math.exp(-dt * 8));
      camera.updateMatrixWorld();
      const ndc = new THREE.Vector3(pos.x, pos.y + tall * 0.5, pos.z).project(camera);
      renderer.getDrawingBufferSize(bufSize);
      const personPx = (onScreen / shown) * bufSize.y;
      SEE.strength.value = seeFade;
      SEE.center.value.set((ndc.x * 0.5 + 0.5) * bufSize.x, (ndc.y * 0.5 + 0.5) * bufSize.y);
      SEE.radius.value = THREE.MathUtils.clamp(personPx * 3.2, 16, bufSize.y * 0.25) * (0.6 + 0.4 * seeFade);
      SEE.foot.value.set(pos.x, pos.y, pos.z);
      SEE.toCam.value.set(toCamX, toCamZ);

      renderer.render(scene, camera);

      statusRef.current = { ready: true, buildMs, pixel: pix, x: pos.x, z: pos.z, running: mv.run, alt: pos.y, flying, onRoof: !flying && floor > 1 };
      if (!readySent) {
        readySent = true;
        onReady();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', clearKeys);
      renderer.dispose();
    };
  }, []);

  return <Canvas ref={canvasRef} />;
}

const Canvas = styled.canvas({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
  touchAction: 'none',
  imageRendering: 'pixelated',
});