import { MutableRefObject, useEffect, useRef } from 'react';
import styled from 'styled-components';
import * as THREE from 'three';
import { fromBody, InputTuple } from 'yeouido-net';
import { Body, copyBody, createSimWorld, describe, FLY, Input, newBody, STEP, step, WORLD } from 'yeouido-sim';

import { Minimap } from './minimap';

import { createIndoorViews } from '../indoor/indoor-building';
import { InputState, readLift, readMove } from '../input';
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
  /** 게임 서버 접속 상태, 접속자 수(나 포함), 오류, 마지막 서버 보정 크기(m)와 확인 대기 입력 수 */
  net: { state: NetState; count: number; error: string; correction: number; pending: number; transport: Transport; };
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

    scene.add(new THREE.HemisphereLight('#e6f4ff', '#8a8573', 1.6));
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
    const pending:{ seq: number; inp: Input; }[] = [];
    const err = { x: 0, y: 0, z: 0 }; // 서버 보정으로 생긴 화면상 어긋남 (서서히 0으로)
    let correction = 0;
    const pos = { x: body.x, y: body.y, z: body.z }; // 화면에 그리는 위치
    let facing = body.f;
    player.root.position.set(pos.x, pos.y, pos.z);
    scene.add(player.root);
    // 확인용(?debug): 콘솔에서 상태를 들여다볼 수 있게
    if (new URLSearchParams(window.location.search).has('debug')) Object.assign(window, { y3d: { body, player, pos } });

    // 다중접속: 입력을 보내고, 서버가 확정한 내 상태와 다른 사람들을 받는다 (재접속하면 지금 자리에서 이어서)
    const net = new GameClient(serverUrl(), myName(), () => ({ x: body.x, y: body.y, z: body.z, b: body.b, l: body.l }));
    const others = new RemotePlayers(scene, tagRef.current!);

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
      const raw = Math.min(0.25, (now - last) / 1000);
      const dt = Math.min(0.05, raw);
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

      // 입력 → 고정 간격(STEP) 걸음으로 먼저 움직이고(예측), 같은 입력을 서버에 보낸다
      const mv = readMove(input);
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const q = (n:number) => Math.round(n * 1000) / 1000; // 서버와 똑같은 값으로 계산하게 반올림
      const inp:Input = { mx: q(rx * mv.x - fx * mv.y), mz: q(rz * mv.x - fz * mv.y), run: mv.run, lift: readLift(input) };
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
          step(sim, body, c.inp);
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
      while (acc >= STEP) {
        acc -= STEP;
        seq++;
        prev = copyBody(body);
        step(sim, body, inp);
        pending.push({ seq, inp });
        out.push([ seq, inp.mx, inp.mz, inp.run ? 1 : 0, inp.lift ]);
      }
      if (pending.length > 150) pending.splice(0, pending.length - 150);
      if (net.state === 'online') net.sendInputs(out, pending.map((c) => [ c.seq, c.inp.mx, c.inp.mz, c.inp.run ? 1 : 0, c.inp.lift ]));
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

      // 축소할수록 캐릭터를 키워 점으로 사라지지 않게
      const big = THREE.MathUtils.clamp(shown / 60, 1, 5);
      player.root.scale.setScalar(big);
      player.root.position.set(pos.x, pos.y, pos.z);
      player.root.rotation.y = facing;
      player.animate(dt, flying ? 0 : actual, flying ? Math.min(1, body.spd / FLY) : 0);
      // 실외 사람은 늘, 실내 사람은 나와 같은 건물·층일 때만
      const remotes = net.remotes(now);
      const seen = (r:{ b: number; l: number; }) => r.b < 0 || (r.b === body.b && r.l === body.l);
      others.update(remotes, dt, seen, big, (r) => r.b < 0 && r.y - collision.floorAt(r.x, r.z, r.y) > 0.5);
      // 미니맵은 두 프레임에 한 번
      if (miniFrame++ % 2 === 0) mini.draw(pos.x, pos.z, yaw, facing, remotes.filter(seen));
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
      const hidden = collision.hidesFrom(pos.x, pos.y, pos.z, tall, toCamX, toCamZ, Math.tan(PITCH), room ? {
        bid: room.bid,
        cutY: SEE.cutY.value,
        wallAt: (x, y, z) => room.wallAt(level, x, y, z),
      } : undefined);
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

      others.placeTags(camera, w, h);
      renderer.render(scene, camera);

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
        net: { state: net.state, count: net.count, error: net.error, correction, pending: pending.length, transport: net.transport },
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
      net.close();
      miniRef.current?.removeEventListener('pointerdown', onMini);
      others.dispose();
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