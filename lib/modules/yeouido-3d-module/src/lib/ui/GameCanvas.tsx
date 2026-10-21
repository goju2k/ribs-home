import { MutableRefObject, useEffect, useRef } from 'react';
import styled from 'styled-components';
import * as THREE from 'three';
import { fromBody, InputTuple, NO_FACE, ST_FROZEN, ST_HIDDEN } from 'yeouido-net';
import { Body, copyBody, createSimWorld, describe, FLY, Input, newBody, STEP, step, WORLD } from 'yeouido-sim';

import { Minimap } from './minimap';

import { createIndoorViews } from '../indoor/indoor-building';
import { CamMode, InputState, nextMode, readLift, readMove } from '../input';
import { MODE_CLIENTS, ModeClient, PLAIN_LOOK } from '../modes';
import { GameClient, myName, NetState, serverUrl, Transport } from '../net/client';
import { createPerson } from '../player/person';
import { RemotePlayers } from '../player/remote-players';
import { buildCity } from '../world/build-city';
import { SEE } from '../world/see-through';

const PITCH = THREE.MathUtils.degToRad(48);
const MIN_VIEW = 8; // 화면 세로가 담는 미터
const MAX_VIEW = 900;
const ALT_ZOOM = 60; // 이만큼(m) 오를 때마다 보이는 범위가 기본만큼 넓어진다
const MAX_SHOWN_VIEW = 1600;
const SKY = '#a8dcf5';
// 3인칭·1인칭: 가시거리(안개 끝)와 안개 시작, 드래그 감도(라디안/px), 3인칭 카메라 거리 범위
const FAR = 450;
const FOG_NEAR = 140;
const LOOK_SPEED = 0.005;
const CHASE_MIN = 2.5;
const CHASE_MAX = 60;

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
  /** 실내에 있을 때 건물 이름·층·엘리베이터 안인지 */
  indoor: { name: string; level: number; elevator: boolean; } | null;
  /** 지금 시점 */
  mode: CamMode;
  /** 게임 서버 접속 상태, 접속자 수(나 포함), 오류, 마지막 서버 보정 크기(m)와 확인 대기 입력 수 */
  net: { state: NetState; count: number; error: string; correction: number; pending: number; transport: Transport; rtt: number; jitter: number; };
  /** 게임 모드 이름과 그 모드 HUD 상태 (뜻은 모드 HUD만 안다) */
  gameMode: string | null;
  game: unknown;
}

/** 터치: 짧은 탭 = 행동(공격), 이보다 길거나 끌면 카메라 조작 (마우스는 누르는 순간 행동) */
const TAP_MS = 250;
const TAP_MOVE = 8;

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
  const tagRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap; // 각진 도트 그림자

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);

    const t0 = performance.now();
    scene.add(buildCity(WORLD));
    // 이동·충돌·실내 판정은 서버와 같은 공용 시뮬레이션 (문에 닿으면 들어가고, 엘리베이터 칸에서 ▲▼로 층 이동)
    const sim = createSimWorld(WORLD);
    const { collision } = sim;
    const views = createIndoorViews(sim.indoors);
    views.forEach((v) => scene.add(v.group));
    const buildMs = Math.round(performance.now() - t0);

    const hemi = new THREE.HemisphereLight('#e6f4ff', '#8a8573', 1.6);
    scene.add(hemi);
    // 밤 등불 (내 머리 위, 밤에만 켜짐)
    const lamp = new THREE.PointLight('#ffd9a0', 0, 22, 1.2);
    scene.add(lamp);
    const DAY_SKY = new THREE.Color(SKY);
    const NIGHT_SKY = new THREE.Color('#141a33');
    const skyNow = new THREE.Color();
    let lastDay = 1;
    const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    const SUN_DIR = new THREE.Vector3(-0.55, 1, 0.45).normalize(); // 남서쪽 높이 뜬 해

    const player = createPerson({ shirt: '#e2574c', pants: '#2f4a7a', skin: '#f1c7a0', hair: '#2a1d14' });
    // 시작 위치: 시험하기 좋게 샘플 건물 옥상 가운데 ±3m (서버에 붙으면 서버가 정한 자리를 따른다)
    const roof = sim.indoors[0];
    const body:Body = roof
      ? newBody(roof.plan.frame.ox + (Math.random() - 0.5) * 6, roof.height, roof.plan.frame.oz + (Math.random() - 0.5) * 6)
      : newBody(WORLD.spawn.x, 0, WORLD.spawn.z);
    // 개발용(?debug)만 자유 비행 (서버도 같은 값을 준다)
    if (new URLSearchParams(window.location.search).has('debug')) body.fly = 1;
    // 확인용: 주소에 ?at=x,z,높이 를 주면 그 자리에서 시작 (건물 안이면 높이로 층을 골라 실내에서)
    const at = new URLSearchParams(window.location.search).get('at')?.split(',').map(Number);
    if (at && at.length >= 2 && at.every(Number.isFinite)) {
      [ body.x, body.z ] = at;
      body.y = at[2] ?? 0;
      const startIn = sim.indoors.find((b) => b.contains(body.x, body.z) && body.y < b.height - 0.5);
      if (startIn) {
        body.b = startIn.bid;
        body.l = THREE.MathUtils.clamp(Math.round(body.y / startIn.floorH) + 1, 1, startIn.levels);
        body.y = startIn.baseY(body.l);
      }
    }
    // 예측: 입력 한 걸음(STEP)마다 먼저 움직이고, 서버가 확인해 줄 때까지 입력을 들고 있는다
    let prev = copyBody(body); // 직전 걸음 — 화면은 prev → body 사이를 보간해 그린다
    let acc = 0;
    let seq = 0;
    // frozen: 보낼 때 움직일 수 없는 상태였음 (서버도 이동 없이 순번만 넘긴다 — 다시 돌릴 때도 건너뛴다)
    const pending:{ seq: number; inp: Input; act: number; pitch: number; frozen: boolean; }[] = [];
    const err = { x: 0, y: 0, z: 0 }; // 서버 보정으로 생긴 화면상 어긋남 (서서히 0으로)
    let correction = 0;
    const pos = { x: body.x, y: body.y, z: body.z }; // 화면에 그리는 위치
    let facing = body.f;
    player.root.position.set(pos.x, pos.y, pos.z);
    scene.add(player.root);
    // 확인용(?debug): 콘솔에서 상태를 들여다볼 수 있게
    if (new URLSearchParams(window.location.search).has('debug')) Object.assign(window, { y3d: { body, player, pos, input: inputRef.current } });

    // 다중접속: 입력을 보내고, 서버가 확정한 내 상태와 다른 사람들을 받는다 (재접속하면 지금 자리에서 이어서)
    const net = new GameClient(serverUrl(), myName(), () => ({ x: body.x, y: body.y, z: body.z, b: body.b, l: body.l }));
    const others = new RemotePlayers(scene, tagRef.current!);
    // 게임 모드 화면: 서버가 알려 준 모드 이름으로 고른다 (엔진은 뜻을 모른다)
    let modeClient:ModeClient | null = null;
    let modeName:string | null = null;

    // 미니맵: 누를 때마다 배율 변경
    const mini = new Minimap(miniRef.current!, WORLD, sim.indoors.map((g) => g.bid));
    const onMini = (e:PointerEvent) => {
      e.stopPropagation();
      mini.cycle();
    };
    miniRef.current!.addEventListener('pointerdown', onMini);
    let miniFrame = 0;

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
    // 3인칭·1인칭용 원근 카메라 (멀리는 안개로 덮고 가시거리에서 자른다)
    const persp = new THREE.PerspectiveCamera(60, 1, 0.1, FAR);
    const fog = new THREE.Fog(SKY, FOG_NEAR, FAR);
    let { mode } = inputRef.current;
    let camDist = 16; // 3인칭: 머리에서 카메라까지 (m) — 배경이 넉넉히 보이게
    let chasePitch = 0.45; // 3인칭: 내려다보는 각
    let fpPitch = 0.1; // 1인칭: 아래를 보는 각 (음수면 위)
    let view = 34; // 화면 세로에 담기는 미터
    let yaw = 0;
    let yawTarget = 0;
    let pix = 2;
    let pinch:{ d: number; } | null = null;
    const pointers = new Map<number, { x: number; y: number; }>();
    // 터치 탭 판별: 누른 시각·자리·끈 거리
    const taps = new Map<number, { t: number; x: number; y: number; moved: number; }>();
    /**
     * 시점별 조작:
     * - 위(쿼터뷰): 카메라 조작 없음. 마우스 왼쪽을 누르는 동안 행동 1, 캐릭터는 마우스가 가리키는 땅 쪽을 본다 (터치는 탭한 쪽)
     * - 뒤·1인칭(FPS·WoW처럼): 마우스 움직임 = 바로 시점 (누를 필요 없음, 커서는 숨김). 누르면 카메라 앞쪽으로 행동.
     *   화면 가장자리에서 커서가 멈춰 더 못 도는 걸 막으려고, 누를 때 조용히 포인터 잠금을 건다 (안내·별도 상태 없음, Esc로 풀려도 그대로 동작)
     * - 터치(휴대폰): 뒤·1인칭은 끌어서 둘러보기, 짧은 탭 = 행동
     */
    let mouseAct = 0;
    let aimPt:{ x: number; y: number; } | null = null;
    let aimTap:{ x: number; y: number; } | null = null;
    let usedMouse = false;
    const locked = () => document.pointerLockElement === canvas;
    const lock = () => {
      if (locked()) return;
      try {
        // 지원하지 않거나 거절돼도 마우스 움직임으로 도는 건 그대로
        (canvas.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {});
      } catch {
        // 무시
      }
    };
    /** 마우스 움직임 → 시점 (잠기지 않았으면 직전 위치와의 차이) */
    let lastMouse:{ x: number; y: number; } | null = null;
    const raycaster = new THREE.Raycaster();
    const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const aimHit = new THREE.Vector3();
    const aimNdc = new THREE.Vector2();

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
      if (e.pointerType === 'mouse') {
        usedMouse = true;
        const top = inputRef.current.mode === 'top';
        if (!top) lock();
        mouseAct |= e.button === 2 ? 2 : e.button === 0 ? 1 : 0; // eslint-disable-line no-bitwise, no-nested-ternary
        if (top && (e.button === 0 || e.button === 2)) aimPt = { x: e.clientX, y: e.clientY };
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      taps.set(e.pointerId, { t: performance.now(), x: e.clientX, y: e.clientY, moved: 0 });
      if (pointers.size === 2) {
        const [ a, b ] = [ ...pointers.values() ];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      }
    };
    const onMove = (e:PointerEvent) => {
      if (e.pointerType === 'mouse') {
        usedMouse = true;
        if (inputRef.current.mode !== 'top') {
          // 잠겨 있으면 움직임 값, 아니면 직전 위치와의 차이 (일부 브라우저는 movementX가 부정확)
          const dx = locked() || !lastMouse ? e.movementX : e.clientX - lastMouse.x;
          const dy = locked() || !lastMouse ? e.movementY : e.clientY - lastMouse.y;
          inputRef.current.look.dx += dx;
          inputRef.current.look.dy += dy;
        } else if (aimPt) aimPt = { x: e.clientX, y: e.clientY };
        lastMouse = { x: e.clientX, y: e.clientY };
        return;
      }
      const prevPt = pointers.get(e.pointerId);
      if (!prevPt) return;
      const tap = taps.get(e.pointerId);
      if (tap) tap.moved = Math.max(tap.moved, Math.hypot(e.clientX - tap.x, e.clientY - tap.y));
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // 한 손가락(마우스) 드래그 = 3인칭·1인칭에서 둘러보기
      if (pointers.size === 1 && inputRef.current.mode !== 'top') {
        inputRef.current.look.dx += e.clientX - prevPt.x;
        inputRef.current.look.dy += e.clientY - prevPt.y;
      }
      if (pointers.size === 2 && pinch) {
        const [ a, b ] = [ ...pointers.values() ];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        inputRef.current.zoom *= pinch.d / Math.max(d, 1);
        pinch = { d };
      }
    };
    const onUp = (e:PointerEvent) => {
      if (e.pointerType === 'mouse') {
        mouseAct &= ~(e.button === 2 ? 2 : e.button === 0 ? 1 : 0); // eslint-disable-line no-bitwise, no-nested-ternary
        if (!(mouseAct & 3)) aimPt = null; // eslint-disable-line no-bitwise
        return;
      }
      // 손가락 짧게 = 행동 1 (두 손가락 확대 중엔 아님). 위 시점이면 탭한 쪽을 본다
      const tap = taps.get(e.pointerId);
      taps.delete(e.pointerId);
      if (e.type === 'pointerup' && tap && !pinch && performance.now() - tap.t < TAP_MS && tap.moved < TAP_MOVE) {
        inputRef.current.actTap |= 1; // eslint-disable-line no-bitwise
        if (inputRef.current.mode === 'top') aimTap = { x: e.clientX, y: e.clientY };
      }
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
    };
    // 오른쪽 버튼은 행동 2(원거리)에 쓰므로 메뉴를 막는다
    const noMenu = (e:Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', noMenu);
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
        if (e.code === 'KeyV' && !e.repeat) {
          inputRef.current.mode = nextMode(inputRef.current.mode);
          // 키 누름은 사용자 동작이라 여기서 바로 조용히 잠글 수 있다 (가장자리에서 안 멈추게)
          if (inputRef.current.mode !== 'top' && usedMouse) lock();
        }
        if (e.code === 'KeyQ') inputRef.current.rotate -= 1;
        if (e.code === 'KeyE') inputRef.current.rotate += 1;
        if (e.code === 'Equal' || e.code === 'NumpadAdd') inputRef.current.zoom *= 0.8;
        if (e.code === 'Minus' || e.code === 'NumpadSubtract') inputRef.current.zoom *= 1.25;
      } else inputRef.current.keys.delete(e.code);
    };
    const clearKeys = () => {
      inputRef.current.keys.clear();
      mouseAct = 0;
      aimPt = null;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', clearKeys);

    let raf = 0;
    let last = performance.now();
    let readySent = false;
    const frame = (now:number) => {
      const raw = Math.min(0.25, (now - last) / 1000);
      const dt = Math.min(0.05, raw);
      last = now;
      const input = inputRef.current;

      // 회전·확대 요청 반영
      // 시점 바뀜: 내려다보기로 돌아가면 방향을 90° 단위로 맞춘다
      if (input.mode !== mode) {
        mode = input.mode;
        if (mode === 'top') yawTarget = Math.round(yawTarget / (Math.PI / 2)) * (Math.PI / 2);
        if (mode === 'top' && locked()) document.exitPointerLock();
        // 위 시점은 조준 커서, 뒤·1인칭은 커서 숨김 (마우스 = 시점)
        canvas.style.cursor = mode === 'top' ? 'crosshair' : 'none';
        lastMouse = null;
        mouseAct = 0;
        aimPt = null;
        scene.fog = mode === 'top' ? null : fog;
      }
      const persp3 = mode !== 'top';
      if (input.rotate) {
        yawTarget += input.rotate * (persp3 ? Math.PI / 12 : Math.PI / 2);
        input.rotate = 0;
      }
      // 드래그·마우스로 둘러보기: 오른쪽으로 끌면 오른쪽을 보고, 아래로 끌면 아래를 본다
      if (input.look.dx || input.look.dy) {
        if (persp3) {
          yawTarget -= input.look.dx * LOOK_SPEED;
          if (mode === 'chase') chasePitch = THREE.MathUtils.clamp(chasePitch + input.look.dy * LOOK_SPEED, 0.05, 1.35);
          else fpPitch = THREE.MathUtils.clamp(fpPitch + input.look.dy * LOOK_SPEED, -1.35, 1.35);
        }
        input.look.dx = 0;
        input.look.dy = 0;
      }
      yaw += (yawTarget - yaw) * (1 - Math.exp(-dt * (persp3 ? 30 : 10)));
      if (input.zoom !== 1) {
        if (mode === 'chase') camDist = THREE.MathUtils.clamp(camDist * input.zoom, CHASE_MIN, CHASE_MAX);
        else if (mode === 'top') view = Math.min(MAX_VIEW, Math.max(MIN_VIEW, view * input.zoom));
        input.zoom = 1;
      }

      // 입력 → 고정 간격(STEP) 걸음으로 먼저 움직이고(예측), 같은 입력을 서버에 보낸다
      const mv = readMove(input);
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const q = (n:number) => Math.round(n * 1000) / 1000; // 서버와 똑같은 값으로 계산하게 반올림
      // 행동 비트: 모드 버튼(누르는 동안) + 마우스(누르는 동안) + 탭(한 번)
      const held = input.act | mouseAct; // eslint-disable-line no-bitwise
      // 몸이 보는 쪽:
      // - 1인칭, 마우스로 잠근 3인칭, 3인칭에서 행동 중 → 카메라가 보는 쪽 (카메라 앞 (-sin yaw, -cos yaw) = 몸 앞 (sin f, cos f) → f = yaw + π)
      // - 위 시점에서 행동 중 → 마우스·탭이 가리키는 땅 쪽
      let face:number | undefined;
      if (mode === 'fp' || (mode === 'chase' && (usedMouse || held || input.actTap))) face = Math.atan2(Math.sin(yaw + Math.PI), Math.cos(yaw + Math.PI));
      const aimAt = mode === 'top' ? (aimTap ?? (held ? aimPt : null)) : null;
      if (aimAt) {
        const rect = canvas.getBoundingClientRect();
        aimNdc.set(((aimAt.x - rect.left) / rect.width) * 2 - 1, -((aimAt.y - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(aimNdc, camera);
        aimPlane.constant = -pos.y;
        if (raycaster.ray.intersectPlane(aimPlane, aimHit) && Math.hypot(aimHit.x - pos.x, aimHit.z - pos.z) > 0.2) face = Math.atan2(aimHit.x - pos.x, aimHit.z - pos.z);
      }
      const inp:Input = { mx: q(rx * mv.x - fx * mv.y), mz: q(rz * mv.x - fz * mv.y), run: mv.run, lift: readLift(input), face: face === undefined ? undefined : Math.round(face * 10000) / 10000 };
      // 게임 모드 화면: 서버가 알려 준 모드가 바뀌면 새로 만들고, 받은 모드 메시지를 넘긴다
      if (net.modeName !== modeName) {
        modeClient?.dispose();
        modeName = net.modeName;
        modeClient = modeName && MODE_CLIENTS[modeName] ? MODE_CLIENTS[modeName]({ scene, sim, send: (d) => net.sendMode(d) }) : null;
      }
      net.takeModeMessages().forEach((d) => modeClient?.receive(d, now));
      // 서버 확정 상태가 오면 (이번 걸음들보다 먼저 — 입장 직후 보낸 입력을 버리지 않게): 그 상태에서 서버가 아직 안 본 입력만 다시 돌려 지금 자리를 맞춘다
      const auth = net.takeAuthority();
      if (auth) {
        const before = copyBody(body);
        Object.assign(body, fromBody(auth.me));
        if (auth.reset) pending.length = 0;
        else pending.splice(0, pending.length, ...pending.filter((c) => c.seq > auth.ack));
        prev = copyBody(body);
        pending.forEach((c) => {
          prev = copyBody(body);
          if (!c.frozen) step(sim, body, c.inp);
        });
        correction = Math.hypot(before.x - body.x, before.y - body.y, before.z - body.z);
        if (!auth.reset && correction < 5 && before.b === body.b && before.l === body.l) {
          err.x += before.x - body.x;
          err.y += before.y - body.y;
          err.z += before.z - body.z;
        } else {
          err.x = 0;
          err.y = 0;
          err.z = 0;
        }
      }

      acc += raw;
      const out:InputTuple[] = [];
      // 움직일 수 없는 상태(모드가 정함)면 예측도 멈춘다
      const frozen = (net.meStatus.s & ST_FROZEN) !== 0; // eslint-disable-line no-bitwise
      const tuple = (c:{ seq: number; inp: Input; act: number; pitch: number; }):InputTuple => [ c.seq, c.inp.mx, c.inp.mz, c.inp.run ? 1 : 0, c.inp.lift, c.inp.face ?? NO_FACE, c.act, c.pitch ];
      // 조준 높이각: 1인칭은 보는 높이 그대로, 그 밖은 수평
      const pitch = mode === 'fp' ? Math.round(fpPitch * 10000) / 10000 : 0;
      while (acc >= STEP) {
        acc -= STEP;
        seq++;
        prev = copyBody(body);
        if (!frozen) step(sim, body, inp);
        // 행동: 누르고 있는 것 + 짧게 누른 것(한 걸음에만 싣는다)
        const act = held | input.actTap; // eslint-disable-line no-bitwise
        input.actTap = 0;
        aimTap = null;
        if (act) modeClient?.acted(act, now);
        const c = { seq, inp, act, pitch, frozen };
        pending.push(c);
        out.push(tuple(c));
      }
      if (pending.length > 150) pending.splice(0, pending.length - 150);
      if (net.state === 'online') net.sendInputs(out, pending.map(tuple));
      else pending.length = 0; // 서버 없이 혼자 움직이는 중

      // 화면 위치: 직전 걸음과 지금 사이를 보간 + 보정 어긋남을 서서히 지운다
      const k = acc / STEP;
      const smooth = prev.b === body.b && prev.l === body.l;
      const decay = Math.exp(-dt * 12);
      err.x *= decay;
      err.y *= decay;
      err.z *= decay;
      pos.x = (smooth ? prev.x + (body.x - prev.x) * k : body.x) + err.x;
      pos.y = (smooth ? prev.y + (body.y - prev.y) * k : body.y) + err.y;
      pos.z = (smooth ? prev.z + (body.z - prev.z) * k : body.z) + err.z;
      facing = prev.f + Math.atan2(Math.sin(body.f - prev.f), Math.cos(body.f - prev.f)) * k;
      const { room, floor, flying, cab } = describe(sim, body);
      const level = body.l;
      const inside = room ? views.find((v) => v.bid === room.bid) ?? null : null;
      const actual = body.a;

      // 높이 오를수록 자동으로 멀리 본다 (손으로 맞춘 배율에 곱한다)
      autoZoom += ((inside ? 0.8 : 1 + pos.y / ALT_ZOOM) - autoZoom) * (1 - Math.exp(-dt * 4));
      // 들어간 건물은 현재 층, 가까운 건물은 1층 로비만 (문 너머로 보이게)
      views.forEach((v) => {
        if (v === inside) v.show(level);
        else v.show(v.grid.distanceTo(pos.x, pos.z) < 120 ? 1 : 0);
        v.update(dt, pos.x, pos.z);
      });
      SEE.cutBid.value = room ? room.bid + 1 : 0;
      SEE.cutY.value = room ? room.baseY(level) + room.floorH - 0.02 : 0;
      const shown = Math.min(MAX_SHOWN_VIEW, view * autoZoom);

      // 내려다보기에서 축소할수록 캐릭터를 키워 점으로 사라지지 않게 (3인칭·1인칭은 실제 크기)
      const big = persp3 ? 1 : THREE.MathUtils.clamp(shown / 60, 1, 5);
      // 내 모습: 게임 모드가 상태 비트로 정한다 (죽음 = 숨김, 무적 = 깜빡임, 휘두르기, 맞음)
      const blinkOff = Math.floor(now / 120) % 2 === 0;
      const myLook = modeClient?.look(net.meStatus.s, net.meStatus.v, now, true, 0) ?? PLAIN_LOOK;
      // 세상에 없으면(관전 등) 내 몸·표식을 안 그린다
      const away = (net.meStatus.s & ST_HIDDEN) !== 0; // eslint-disable-line no-bitwise
      player.root.visible = mode !== 'fp' && !away && !myLook.hidden && !(myLook.blink && blinkOff);
      player.root.scale.setScalar(big);
      player.root.position.set(pos.x, pos.y, pos.z);
      player.root.rotation.y = facing;
      player.animate(dt, flying ? 0 : actual, flying ? Math.min(1, body.spd / FLY) : 0);
      player.pose(myLook);
      // 실외 사람은 늘, 실내 사람은 나와 같은 건물·층일 때만
      const remotes = net.remotes(now);
      const seen = (r:{ b: number; l: number; }) => r.b < 0 || (r.b === body.b && r.l === body.l);
      const looks = new Map(remotes.map((r) => [ r.id, modeClient?.look(r.s, r.v, now, false, r.id) ?? PLAIN_LOOK ]));
      others.update(remotes, dt, seen, big, (r) => r.b < 0 && r.y - collision.floorAt(r.x, r.z, r.y) > 0.5, (r) => {
        const lk = looks.get(r.id) ?? PLAIN_LOOK;
        return lk.blink && blinkOff ? { ...lk, hidden: true } : lk;
      }, (k) => modeClient?.appearance(k) ?? null);
      // 낮밤 (모드가 정한 밝기): 하늘·안개·빛을 섞고, 어두우면 내 주변을 등불처럼 밝힌다
      const day = modeClient?.daylight?.(now) ?? 1;
      if (Math.abs(day - lastDay) > 0.002) {
        lastDay = day;
        skyNow.copy(NIGHT_SKY).lerp(DAY_SKY, day);
        (scene.background as THREE.Color).copy(skyNow);
        fog.color.copy(skyNow);
        hemi.intensity = 0.35 + (1.6 - 0.35) * day;
        sun.intensity = 0.15 + (2.4 - 0.15) * day;
      }
      lamp.intensity = (1 - day) * 3;
      lamp.position.set(pos.x, pos.y + 3, pos.z);
      modeClient?.frame({ now, dt, persp: persp3, me: { x: pos.x, y: pos.y, z: pos.z, f: facing, b: body.b, l: body.l, st: net.meStatus.s, gv: net.meStatus.v }, others: remotes });
      // 미니맵은 두 프레임에 한 번 (모드가 위에 그린다: 전장 원 등)
      const mc = modeClient;
      if (miniFrame++ % 2 === 0) mini.draw(pos.x, pos.z, yaw, facing, remotes.filter((r) => seen(r) && !looks.get(r.id)?.hidden), mc ? (g, k, dpr) => mc.minimap(g, k, dpr) : undefined);
      const tall = 1.72 * big;
      const onScreen = tall * Math.cos(PITCH); // 내려다보니 화면에선 키가 줄어 보인다
      const mk = onScreen * 1.2; // 화면에서 사람보다 살짝 크게
      marker.visible = !persp3 && shown > 45 && !away;
      marker.scale.set(mk, mk, 1);
      // 화면에서 머리 위로 사람 키만큼 띄운다 (세로 거리도 cos 만큼 줄어 보여서 나눠 준다)
      marker.position.set(pos.x, pos.y + tall + (onScreen + mk / 2) / Math.cos(PITCH), pos.z);
      const below = mode !== 'fp' && pos.y - floor > 1 && !away;
      drop.visible = below;
      if (below) {
        dropGeo.attributes.position.setXYZ(0, pos.x, pos.y, pos.z);
        dropGeo.attributes.position.setXYZ(1, pos.x, floor, pos.z);
        dropGeo.attributes.position.needsUpdate = true;
      }

      const { clientWidth: w, clientHeight: h } = canvas;
      const aspect = w / Math.max(h, 1);
      let cam:THREE.Camera;
      let shadowAt:THREE.Vector3;
      let shadowSize:number;
      if (mode === 'top') {
        // 내려다보기: 플레이어를 바라보는 고정 각도 정사영
        camera.top = shown / 2;
        camera.bottom = -shown / 2;
        camera.left = (-shown / 2) * aspect;
        camera.right = (shown / 2) * aspect;
        camera.updateProjectionMatrix();
        // 서버에 보이는 범위를 알린다: 화면이 담는 땅의 반 대각선(+여유)과 미니맵 반경 중 큰 쪽
        net.setView(Math.max(0.5 * Math.hypot(shown * aspect, shown / Math.sin(PITCH)) + 30, mini.radius));
        const target = new THREE.Vector3(pos.x, pos.y + 1, pos.z);
        const dist = 2500;
        camera.position.set(
          target.x + Math.sin(yaw) * Math.cos(PITCH) * dist,
          target.y + Math.sin(PITCH) * dist,
          target.z + Math.cos(yaw) * Math.cos(PITCH) * dist,
        );
        camera.lookAt(target);
        cam = camera;
        // 그림자는 화면에 보이는 범위만. 높이 날면 화면 가운데 보이는 땅이 발밑과 달라져 그 땅을 기준으로
        shadowSize = Math.min(500, shown * aspect * 0.75 + 20);
        const back = target.y / Math.tan(PITCH);
        shadowAt = new THREE.Vector3(target.x - Math.sin(yaw) * back, 0, target.z - Math.cos(yaw) * back);
      } else {
        persp.aspect = aspect;
        persp.updateProjectionMatrix();
        if (mode === 'chase') {
          // 3인칭: 머리 뒤 위에서 따라간다. 땅·지붕·실내 바닥 밑으로는 안 내려간다
          const head = new THREE.Vector3(pos.x, pos.y + 1.5, pos.z);
          const cp = Math.cos(chasePitch);
          persp.position.set(head.x + Math.sin(yaw) * cp * camDist, head.y + Math.sin(chasePitch) * camDist, head.z + Math.cos(yaw) * cp * camDist);
          const under = room ? room.baseY(level) : collision.floorAt(persp.position.x, persp.position.z, persp.position.y);
          persp.position.y = Math.max(persp.position.y, under + 0.4);
          // 실내에선 천장 아래에서만 (천장 위로 가면 천장에 가려 안 보인다)
          if (room) persp.position.y = Math.min(persp.position.y, room.baseY(level) + room.floorH - 0.35);
          persp.lookAt(head);
        } else {
          // 1인칭: 눈높이에서 보는 방향으로
          const eye = new THREE.Vector3(pos.x, pos.y + 1.62, pos.z);
          const cp = Math.cos(fpPitch);
          persp.position.copy(eye);
          persp.lookAt(eye.x - Math.sin(yaw) * cp, eye.y - Math.sin(fpPitch), eye.z - Math.cos(yaw) * cp);
        }
        net.setView(Math.max(FAR, mini.radius));
        cam = persp;
        shadowSize = mode === 'fp' ? 70 : Math.min(160, 40 + camDist * 3);
        shadowAt = new THREE.Vector3(pos.x, room ? room.baseY(level) : 0, pos.z);
      }
      const sc = sun.shadow.camera;
      sc.left = -shadowSize;
      sc.right = shadowSize;
      sc.top = shadowSize;
      sc.bottom = -shadowSize;
      sc.near = 1;
      sc.far = 2000;
      sc.updateProjectionMatrix();
      sun.position.copy(shadowAt).addScaledVector(SUN_DIR, 900);
      sun.target.position.copy(shadowAt);

      // 플레이어를 가리는 건물·나무에 구멍: 실제로 시선이 막혔을 때만 서서히 켠다 (1인칭은 내가 안 보이니 없음)
      const sight = room ? { bid: room.bid, cutY: SEE.cutY.value, wallAt: (x:number, y:number, z:number) => room.wallAt(level, x, y, z) } : undefined;
      let toCamX = Math.sin(yaw);
      let toCamZ = Math.cos(yaw);
      let hidden = false;
      if (mode === 'top') hidden = collision.hidesFrom(pos.x, pos.y, pos.z, tall, toCamX, toCamZ, Math.tan(PITCH), sight);
      else if (mode === 'chase') {
        const hx = persp.position.x - pos.x;
        const hz = persp.position.z - pos.z;
        const hd = Math.max(0.01, Math.hypot(hx, hz));
        toCamX = hx / hd;
        toCamZ = hz / hd;
        hidden = collision.hidesFrom(pos.x, pos.y, pos.z, tall, toCamX, toCamZ, (persp.position.y - (pos.y + tall * 0.6)) / hd, sight, hd);
      }
      seeFade += ((hidden ? 1 : 0) - seeFade) * (1 - Math.exp(-dt * 8));
      cam.updateMatrixWorld();
      const ndc = new THREE.Vector3(pos.x, pos.y + tall * 0.5, pos.z).project(cam);
      renderer.getDrawingBufferSize(bufSize);
      // 화면에서 사람 키(px): 정사영은 계산, 원근은 머리·발을 화면에 찍어 잰다
      const personPx = persp3
        ? (Math.abs(new THREE.Vector3(pos.x, pos.y + tall, pos.z).project(cam).y - new THREE.Vector3(pos.x, pos.y, pos.z).project(cam).y) / 2) * bufSize.y
        : (onScreen / shown) * bufSize.y;
      SEE.strength.value = mode === 'fp' ? 0 : seeFade;
      SEE.center.value.set((ndc.x * 0.5 + 0.5) * bufSize.x, (ndc.y * 0.5 + 0.5) * bufSize.y);
      SEE.radius.value = THREE.MathUtils.clamp(personPx * 3.2, 16, bufSize.y * 0.25) * (0.6 + 0.4 * seeFade);
      SEE.foot.value.set(pos.x, pos.y, pos.z);
      SEE.toCam.value.set(toCamX, toCamZ);

      others.placeTags(cam, w, h);
      renderer.render(scene, cam);

      statusRef.current = {
        ready: true,
        buildMs,
        pixel: pix,
        x: pos.x,
        z: pos.z,
        running: mv.run,
        alt: pos.y,
        flying,
        onRoof: !room && !flying && floor > 1,
        indoor: room ? { name: room.name, level, elevator: cab >= 0 } : null,
        net: { state: net.state, count: net.count, error: net.error, correction, pending: pending.length, transport: net.transport, rtt: net.rtt, jitter: net.jitter },
        mode,
        gameMode: modeName,
        game: modeClient?.hud(now) ?? null,
      };
      if (!readySent) {
        readySent = true;
        onReady();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      modeClient?.dispose();
      net.close();
      miniRef.current?.removeEventListener('pointerdown', onMini);
      others.dispose();
      observer.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', noMenu);
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

  return (
    <>
      <Canvas ref={canvasRef} />
      <TagLayer ref={tagRef} />
      <MiniCanvas ref={miniRef} aria-label='미니맵 (누르면 배율 변경)' />
    </>
  );
}

/** 미니맵: 상단 바 아래 오른쪽 */
const MiniCanvas = styled.canvas({
  position: 'absolute',
  top: 74,
  right: 10,
  width: 'min(34vw, 150px)',
  aspectRatio: '1 / 1',
  imageRendering: 'pixelated',
  touchAction: 'none',
  cursor: 'pointer',
  boxShadow: 'inset -2px -2px 0 rgba(0,0,0,0.45), inset 2px 2px 0 rgba(255,255,255,0.22), 0 0 0 2px #0b0e22',
  // 좁은 화면에선 상단 바가 두 줄이 된다
  '@media (max-width: 560px)': { top: 126 },
});

/** 다른 사람 이름표 (HTML 글자) */
const TagLayer = styled.div({
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
});

const Canvas = styled.canvas({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
  touchAction: 'none',
  imageRendering: 'pixelated',
});