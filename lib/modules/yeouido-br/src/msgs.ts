import type { CorpseItem, Gear, GroundItem } from './items';
import type { PropRow } from './props';

/**
 * 배틀로얄 모드 메시지 (엔진의 { t: 'mode', d } 통로 안에 담긴다).
 */

/** 시체: 죽은 자리와 남은 아이템 (다른 사람이 지나가면 털린다) */
export interface Corpse {
  id: number; name: string; x: number; y: number; z: number; f: number; b: number; l: number; items: CorpseItem[];
}

/** 서버 → 클라이언트 */
export type BrServerMsg =
  /** 판 정보: 원 11개([cx, cz, r]: 0번 처음 원, k번 k단계 끝 원)와 판이 시작된 뒤 흐른 시간(ms). 새 판이면 id가 바뀐다 */
  /** dayOffset: 낮밤 시계를 이만큼 당김 (개발용 시험, 보통 0) */
  | { k: 'match'; id: number; circles: [number, number, number][]; elapsed: number; dayOffset: number; }
  /** 시체 전부 (입장·새 판) */
  | { k: 'corpses'; list: Corpse[]; }
  | { k: 'corpse'; c: Corpse; }
  | { k: 'corpseGone'; id: number; }
  /** 알림 한 줄 (보스 등장·나감 등) */
  | { k: 'notice'; text: string; }
  /** 누가 누구를 (killer 없음 = 전장 밖에서) */
  | { k: 'kill'; killer: string | null; victim: string; }
  /** 내가 때림 (target: 맞은 사람 id) */
  | { k: 'hit'; target: number; dmg: number; }
  /** 내가 맞음 (from: 때린 사람 이름, 없으면 전장 피해) */
  | { k: 'hurt'; dmg: number; from: string | null; }
  /** 내가 죽음: 누구에게, 다시 시작까지 남은 시간(ms, -1 = 이번 판은 다시 시작 못 함 — 보스전) */
  | { k: 'dead'; by: string | null; wait: number; }
  | { k: 'respawn'; }
  /** 땅 아이템 전부 (입장·새 판) */
  | { k: 'items'; list: GroundItem[]; }
  | { k: 'itemAdd'; list: GroundItem[]; }
  | { k: 'itemGone'; ids: number[]; }
  /** 시체가 털림 (아이템 없음) */
  | { k: 'looted'; id: number; }
  /** 내 장비 (바뀔 때) */
  | { k: 'gear'; gear: Gear; }
  /** 내가 주움: 종류 번호, 바뀐 단계, 어디서 */
  | { k: 'got'; kind: number; lv: number; from: 'ground' | 'corpse'; }
  /** 부술 수 있는 물건 전부 (입장·새 판) */
  | { k: 'props'; list: PropRow[]; }
  | { k: 'propAdd'; list: PropRow[]; }
  /** 물건이 맞음: 남은 내구도 0~255 (근처 사람에게만) */
  | { k: 'propHit'; id: number; hp: number; }
  | { k: 'propGone'; ids: number[]; }
  /** 내가 물건을 침 */
  | { k: 'hitProp'; id: number; dmg: number; }
  /** 총: 쏜 자리 → 끝(맞은 곳·벽·사거리 끝) 궤적 (근처 사람에게), by = 쏜 사람 */
  | { k: 'shot'; by: number; o: [number, number, number]; e: [number, number, number]; }
  /** 화살: 쏜 자리·방향(길이 1)·속도·사거리 — 클라이언트가 같이 날린다 */
  | { k: 'arrow'; id: number; by: number; o: [number, number, number]; d: [number, number, number]; v: number; range: number; }
  /** 화살이 멈춤 (맞음·벽) */
  | { k: 'arrowEnd'; id: number; at: [number, number, number]; }
  /** 내가 쐈다 (재장전 표시용) */
  | { k: 'fired'; reloadMs: number; }
  /** 보스 상태 (나타나 있는 동안 0.5초마다): 체력·최대, 남은 시간(ms) */
  | { k: 'boss'; id: number; hp: number; max: number; remain: number; }
  /** 보스가 날아오름: 착지 자리(x, z)와 걸리는 시간(ms) — 그 자리에 경고 원, 착지하며 땅 울리기 */
  | { k: 'bossLeap'; x: number; z: number; ms: number; }
  /** 판 끝: 승리(보스 쓰러짐)·패배(시간 초과), 마지막 일격, 보스에게 준 피해 순위, 새 판까지(ms) */
  /** why: 패배 이유 — time 시간 초과, wiped 참가자가 모두 쓰러짐 */
  | { k: 'end'; result: 'win' | 'lose'; why?: 'time' | 'wiped'; killer: string | null; top: [string, number][]; next: number; }
  /**
   * 관전: 이번 판은 더 못 뛰고 남을 따라 본다 (target: 보고 있는 사람 이름, 없으면 보스).
   * reason: dead = 보스전 중에 쓰러짐, late = 보스전·결과 중에 들어옴 (다음 판에 참여)
   */
  | { k: 'spectate'; target: string | null; reason: 'dead' | 'late'; };

/** 클라이언트 → 서버 (엔진의 { t: 'mode', d }) */
export type BrClientMsg =
  /** 관전 대상 바꾸기 (다음 +1, 이전 -1) */
  | { k: 'watch'; dir: 1 | -1; };

export const isBrMsg = (d:unknown):d is BrServerMsg => typeof d === 'object' && d !== null && typeof (d as { k?: unknown; }).k === 'string';