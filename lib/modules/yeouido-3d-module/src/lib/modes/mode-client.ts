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
}

export interface ModeFrame {
  now: number;
  dt: number;
  /** 내 화면 위치·상태 */
  me: { x: number; y: number; z: number; f: number; b: number; l: number; st: number; gv: number; };
  /** 지금 시점이 원근(3인칭·1인칭)인지 */
  persp: boolean;
}

export interface ModeHostClient {
  scene: THREE.Scene;
  sim: SimWorld;
  /** 모드 요청 보내기 */
  send: (d:unknown) => void;
}

export interface ModeClient {
  /** 서버 모드 메시지 */
  receive(d:unknown, now:number): void;
  /** 매 프레임: 장면 물체(경계 벽, 시체 등) 갱신 */
  frame(f:ModeFrame): void;
  /** 내가 행동 비트를 보냈다 (누른 순간 바로 동작을 보여 주려고) */
  acted(act:number, now:number): void;
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