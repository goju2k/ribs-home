/**
 * 배틀로얄 모드 메시지 (엔진의 { t: 'mode', d } 통로 안에 담긴다).
 */

/** 시체: 죽은 자리 (3단계부터 가진 아이템도 담긴다) */
export interface Corpse {
  id: number; name: string; x: number; y: number; z: number; f: number; b: number; l: number;
}

/** 서버 → 클라이언트 */
export type BrServerMsg =
  /** 판 정보: 원 11개([cx, cz, r]: 0번 처음 원, k번 k단계 끝 원)와 판이 시작된 뒤 흐른 시간(ms). 새 판이면 id가 바뀐다 */
  | { k: 'match'; id: number; circles: [number, number, number][]; elapsed: number; }
  /** 시체 전부 (입장·새 판) */
  | { k: 'corpses'; list: Corpse[]; }
  | { k: 'corpse'; c: Corpse; }
  | { k: 'corpseGone'; id: number; }
  /** 누가 누구를 (killer 없음 = 전장 밖에서) */
  | { k: 'kill'; killer: string | null; victim: string; }
  /** 내가 때림 (target: 맞은 사람 id) */
  | { k: 'hit'; target: number; dmg: number; }
  /** 내가 맞음 (from: 때린 사람 이름, 없으면 전장 피해) */
  | { k: 'hurt'; dmg: number; from: string | null; }
  /** 내가 죽음: 누구에게, 다시 시작까지 남은 시간(ms) */
  | { k: 'dead'; by: string | null; wait: number; }
  | { k: 'respawn'; };

export const isBrMsg = (d:unknown):d is BrServerMsg => typeof d === 'object' && d !== null && typeof (d as { k?: unknown; }).k === 'string';