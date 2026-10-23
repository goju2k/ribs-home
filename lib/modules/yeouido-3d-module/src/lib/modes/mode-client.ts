import * as THREE from 'three';
import { SimWorld } from 'yeouido-sim';

import type { PersonLook, PersonPose } from '../player/person';

/**
 * 클라이언트 쪽 게임 모드 = 엔진 화면(GameCanvas: 월드·이동·카메라·다른 사람) 위에 얹는 게임 화면.
 * 서버의 GameMode와 짝: 서버가 welcome에서 모드 이름을 알려 주면 MODE_CLIENTS에서 골라 만든다.
 * 엔진은 모드가 뭘 하는지 모른다 — 상태 비트·게이지를 모습(look)으로 바꾸고, 장면·미니맵·HUD에 그리는 건 모드 몫.
 */

/** 사람 하나를 어떻게 그릴지 (엔진이 적용) */
export interface Look extends PersonPose {
  /** 안 그림 (예: 죽어서 시체로 대신) */
  hidden: boolean;
  /** 깜빡임 (예: 무적) */
  blink: boolean;
  /** 이름표 아래 막대 0~1 (없으면 null) */
  bar: number | null;
}

export const PLAIN_LOOK:Look = { hidden: false, blink: false, bar: null, swing: 0, down: false, glow: null };

/** NPC 모습 (모습 종류 k마다): 옷·피부색과 이름표를 달지 */
export interface Appearance {
  look: PersonLook; tag: boolean;
  /** 이름표에 쓸 이름 (NPC는 이름이 없다), 몸 크기 배율 */
  name?: string;
  scale?: number;
}

export interface ModeFrame {
  now: number;
  dt: number;
  /** 내 화면 위치·상태 */
  /** car: 타고 있는 차(decor 번호, 안 탔으면 -1)·fuel 남은 연료(m)·spd 속도(m/s) */
  me: { x: number; y: number; z: number; f: number; b: number; l: number; st: number; gv: number; car: number; fuel: number; spd: number; };
  /** 지금 보이는 다른 사람·NPC (보간된 자리·방향, 상태 비트, 모습 종류) */
  others: { id: number; x: number; y: number; z: number; f: number; s: number; k: number; }[];
  /** 지금 시점이 원근(3인칭·1인칭)인지 */
  persp: boolean;
  /** 카메라가 보는 수평 방향 (앞 = (-sin yaw, -cos yaw), 화면 위쪽) */
  yaw: number;
}

export interface ModeHostClient {
  scene: THREE.Scene;
  sim: SimWorld;
  /** 모드 요청 보내기 */
  send: (d:unknown) => void;
  /** 내 번호 (서버 알림 중 내 것을 가려낼 때) */
  myId: () => number;
  /** 내 이름 */
  myName: () => string;
  /** 원근(1인칭) 카메라 — 장면에 들어 있어 자식으로 붙이면 화면에 붙어 보인다 (손에 든 총 등) */
  camera: THREE.PerspectiveCamera;
  /** 화면 위에 바로 그리는 층 (HTML, 매 장면 갱신하는 효과용 — HUD보다 아래) */
  overlay: HTMLElement;
}

/** 행동을 보낸 그 걸음의 내 자리·조준 (예측한 값 — 서버도 같은 걸음에서 같은 자리) */
export interface ActAim {
  x: number; y: number; z: number; f: number; pitch: number; b: number; l: number;
  /** 입력 걸음 번호 (서버도 같은 번호로 재장전을 잰다) */
  seq: number;
  /** 이 걸음의 실제 이동 속도 (m/s) — 움직이며 쏘면 퍼지는 무기 */
  a: number;
}

export interface ModeClient {
  /** 서버 모드 메시지 */
  receive(d:unknown, now:number): void;
  /** 매 프레임: 장면 물체(경계 벽, 시체 등) 갱신 */
  frame(f:ModeFrame): void;
  /** 내가 행동 비트를 보낸다 (누른 순간 바로 동작을 보여 주려고) — 돌려준 비트를 실제로 보낸다 (없으면 그대로) */
  acted(act:number, now:number, aim:ActAim): number | void;
  /**
   * 짧게 누른 행동을 얼마나 붙잡아 둘지 (ms): 아직 대기(재장전 등) 중이면 그만큼 기다렸다 그때 겨눈 곳으로 나가게.
   * 없으면 한 걸음만
   */
  pendingMs?(bit:number, now:number): number;
  /**
   * 마우스·버튼을 누른 순간 모드가 먼저 받는다 (예: 스코프 켜기·끄기). true면 그 누름은 행동 비트로 보내지 않는다
   */
  press?(button:'left' | 'right', now:number): boolean;
  /** 원근 시야 배율 (스코프 ×4면 4, 없으면 1) — 시야각과 마우스 감도를 이만큼 줄인다 */
  fovMul?(): number;
  /** 1인칭 시점 밀림 (라디안, 화면만 — 조준은 그대로): 맞았을 때 등 */
  viewKick?(now:number): { yaw: number; pitch: number; } | null;
  /**
   * 조준선이 겨누는 거리 (m): 든 무기 사거리 — 조준선 광선 위 이 거리의 점을 향해 쏘게 해야 사거리 끝에서도 조준선과 맞는다.
   * 없으면 기본 거리
   */
  aimRange?(): number;
  /** 상태 비트·게이지 → 모습 (mine: 나 자신, key: 사람 번호 — 동작 진행을 사람마다 잰다) */
  look(st:number, gv:number, now:number, mine:boolean, key?:number): Look;
  /** 모습 종류(k, 0 = 사람) → NPC 모습. null이면 사람 모습 */
  appearance(k:number): Appearance | null;
  /** 밝기 1 = 낮, 0 = 밤 (없으면 늘 낮) — 엔진이 하늘·빛에 반영한다 */
  daylight?(now:number): number;
  /** 미니맵 위에 그리기 (월드 좌표계로 변환된 상태, k = 캔버스 px/m) */
  minimap(g:CanvasRenderingContext2D, k:number, dpr:number): void;
  /** React HUD가 읽어 갈 상태 (모드 HUD 컴포넌트만 뜻을 안다) */
  hud(now:number): unknown;
  dispose(): void;
}

export type ModeClientFactory = (host:ModeHostClient) => ModeClient;