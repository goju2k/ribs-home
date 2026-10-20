import { MutableRefObject, useEffect, useRef } from 'react';
import styled from 'styled-components';
import * as THREE from 'three';

import { WORLD } from '../data/world-data';
import { InputState, readMove } from '../input';
import { createPerson } from '../player/person';
import { buildCity } from '../world/build-city';
import { Collision } from '../world/collision';

const WALK = 1.4; // m/s
const RUN = 4.8;
const RADIUS = 0.28;
const PITCH = THREE.MathUtils.degToRad(48);
const MIN_VIEW = 8; // 화면 세로가 담는 미터
const MAX_VIEW = 900;
const SKY = '#a8dcf5';

export interface GameStatus {
  ready: boolean;
  buildMs: number;
  pixel: number;
  x: number;
  z: number;
  running: boolean;
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

    const player = createPerson({ shirt: '#e2574c', pants: '#2f4a7a', skin: '#f1c7a0', hair: '#2a1d14' }, true);
    const pos = { x: WORLD.spawn.x, z: WORLD.spawn.z };
    let facing = 0;
    player.root.position.set(pos.x, 0, pos.z);
    scene.add(player.root);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
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
        inputRef.current.keys.add(e.code);
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

      // 이동: 화면 기준 입력을 카메라 방향으로 돌린다
      const mv = readMove(input);
      const speed = mv.amount * (mv.run ? RUN : WALK);
      let actual = 0;
      if (mv.amount > 0.05) {
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        const rx = Math.cos(yaw);
        const rz = -Math.sin(yaw);
        const wx = rx * mv.x - fx * mv.y;
        const wz = rz * mv.x - fz * mv.y;
        const len = Math.hypot(wx, wz) || 1;
        const next = collision.move(pos.x, pos.z, (wx / len) * speed * dt, (wz / len) * speed * dt, RADIUS);
        actual = Math.hypot(next.x - pos.x, next.z - pos.z) / dt;
        pos.x = next.x;
        pos.z = next.z;
        const want = Math.atan2(wx, wz);
        let diff = want - facing;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        facing += diff * (1 - Math.exp(-dt * 14));
      }
      player.root.position.set(pos.x, 0, pos.z);
      player.root.rotation.y = facing;
      player.animate(dt, actual);

      // 카메라: 플레이어를 바라보는 고정 각도 정사영
      const { clientWidth: w, clientHeight: h } = canvas;
      const aspect = w / Math.max(h, 1);
      camera.top = view / 2;
      camera.bottom = -view / 2;
      camera.left = (-view / 2) * aspect;
      camera.right = (view / 2) * aspect;
      camera.updateProjectionMatrix();
      const target = new THREE.Vector3(pos.x, 1, pos.z);
      const dist = 1500;
      camera.position.set(
        target.x + Math.sin(yaw) * Math.cos(PITCH) * dist,
        target.y + Math.sin(PITCH) * dist,
        target.z + Math.cos(yaw) * Math.cos(PITCH) * dist,
      );
      camera.lookAt(target);

      // 그림자는 화면에 보이는 범위만 (확대할수록 선명)
      const s = Math.min(320, view * aspect * 0.75 + 20);
      const cam = sun.shadow.camera;
      cam.left = -s;
      cam.right = s;
      cam.top = s;
      cam.bottom = -s;
      cam.near = 1;
      cam.far = 1600;
      cam.updateProjectionMatrix();
      sun.position.copy(target).addScaledVector(SUN_DIR, 700);
      sun.target.position.copy(target);

      renderer.render(scene, camera);

      statusRef.current = { ready: true, buildMs, pixel: pix, x: pos.x, z: pos.z, running: mv.run && mv.amount > 0.05 };
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