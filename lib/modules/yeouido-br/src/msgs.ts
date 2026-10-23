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
  /** lobby: 시작 대기 중 (시계가 멈춰 있다 — elapsed 그대로) */
  | { k: 'match'; id: number; circles: [number, number, number][]; elapsed: number; dayOffset: number; lobby?: boolean; }
  /** 시작 대기: 준비한 사람 번호들·접속 인원, 시작까지 남은 ms (모두 준비해 카운트다운 중일 때만) */
  | { k: 'lobby'; ready: number[]; total: number; startIn: number | null; }
  /** 시체 전부 (입장·새 판) */
  | { k: 'corpses'; list: Corpse[]; }
  | { k: 'corpse'; c: Corpse; }
  | { k: 'corpseGone'; id: number; }
  /** 알림 한 줄 (보스 등장·나감 등) */
  | { k: 'notice'; text: string; }
  /** 누가 누구를 (killer 없음 = 전장 밖에서) */
  | { k: 'kill'; killer: string | null; victim: string; }
  /** 내가 맞힘 (target: 맞은 사람·좀비 id, head: 머리) */
  | { k: 'hit'; target: number; dmg: number; head?: boolean; }
  /** 내가 맞음 (from: 때린 사람 이름, 없으면 전장 피해) */
  /** at: 때린 쪽 자리 [x, z] (화면이 맞은 방향을 그린다 — 전장 밖·중독처럼 방향이 없으면 없음) */
  | { k: 'hurt'; dmg: number; from: string | null; at?: [number, number]; }
  /** 내가 죽음: 누구에게, 다시 시작까지 남은 시간(ms, -1 = 이번 판은 다시 시작 못 함 — 보스전) */
  | { k: 'dead'; by: string | null; wait: number; }
  | { k: 'respawn'; }
  /** 땅 아이템 전부 (입장·새 판) */
  | { k: 'items'; list: GroundItem[]; }
  | { k: 'itemAdd'; list: GroundItem[]; }
  | { k: 'itemGone'; ids: number[]; }
  /**
   * 차 전부: fuel은 탈 수 있는 차(decor 순서대로 승용차·SUV·택시) 연료 %, moved는 원래 자리에서 옮겨진 차 [decor 번호, x, z, dx, dz],
   * drivers는 운전 중 [사람 번호, decor 번호] (들어올 때·새 판)
   */
  | { k: 'cars'; fuel: number[]; moved: [number, number, number, number, number][]; drivers: [number, number][]; }
  /** 누가 차에 탔다 */
  | { k: 'carIn'; pid: number; idx: number; }
  /** 누가 차에서 내렸다: 차가 선 자리 [x, z, dx, dz]·남은 연료 % */
  | { k: 'carOut'; pid: number; idx: number; pose: [number, number, number, number]; fuel: number; }
  /** 시체가 털림 (아이템 없음) */
  /** 시체를 털었음: left = 남은 것 (턴 사람이 이미 최대라 못 가져간 것, 없으면 빈 시체) */
  | { k: 'looted'; id: number; left?: CorpseItem[]; }
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
  /** 총: 쏜 자리 → 알마다 끝(맞은 곳·벽·사거리 끝) 궤적 (근처 사람에게), by = 쏜 사람, w = 무기 번호(WEAPON_KINDS) */
  /** ht: 알마다 맞은 곳 (0 벽·땅, 1 몸, 2 머리, 3 허공 — 사거리 끝) */
  | { k: 'shot'; by: number; w: number; o: [number, number, number]; es: [number, number, number][]; ht: number[]; }
  /** 화살: 쏜 자리·방향(길이 1)·속도·사거리 — 클라이언트가 같이 날린다 */
  | { k: 'arrow'; id: number; by: number; o: [number, number, number]; d: [number, number, number]; v: number; range: number; g: number; }
  /** 화살이 멈춤 (맞음·벽) */
  | { k: 'arrowEnd'; id: number; at: [number, number, number]; }
  /** 보스 상태 (나타나 있는 동안 0.5초마다): 체력·최대, 남은 시간(ms) */
  | { k: 'boss'; id: number; hp: number; max: number; remain: number; }
  /** 보스가 독 파이어볼을 모은다 (ms 뒤 난사 — 화면은 보스를 초록으로) */
  | { k: 'bossCast'; ms: number; }
  /** 독 파이어볼: 출발·속도(m/s)·낙차 — 클라이언트가 같이 날린다 */
  | { k: 'ball'; id: number; o: [number, number, number]; v: [number, number, number]; g: number; }
  /** 독 파이어볼이 터짐 (반경 splash) */
  | { k: 'ballEnd'; id: number; at: [number, number, number]; splash: number; }
  /** 내가 중독됨: 남은 시간(ms)·초당 피해 */
  | { k: 'poison'; ms: number; dps: number; }
  /** 보스가 날아오름: 착지 자리(x, z)와 걸리는 시간(ms) — 그 자리에 경고 원, 착지하며 땅 울리기 */
  | { k: 'bossLeap'; x: number; z: number; ms: number; }
  /** 판 끝: 승리(보스 쓰러짐)·패배(시간 초과), 마지막 일격, 보스에게 준 피해 순위, 새 판까지(ms) */
  /** why: 패배 이유 — time 시간 초과, wiped 참가자가 모두 쓰러짐 */
  /** zk: 좀비 처치 순위 [이름, 마리] */
  /** chicken: 탈출해 치킨을 먹은 사람 (없으면 null) */
  | { k: 'end'; result: 'win' | 'lose'; why?: 'time' | 'wiped' | 'noescape'; killer: string | null; chicken: string | null; top: [string, number][]; zk: [string, number][]; next: number; }
  /** 탈출구: 보스가 쓰러진 자리, opensIn ms 뒤 열림(그때까지 휴전), 반경 r — 먼저 닿는 사람이 치킨 */
  | { k: 'exit'; x: number; y: number; z: number; r: number; opensIn: number; }
  /**
   * 관전: 이번 판은 더 못 뛰고 남을 따라 본다 (target: 보고 있는 사람 이름, 없으면 보스).
   * reason: dead = 보스전 중에 쓰러짐, late = 보스전·결과 중에 들어옴 (다음 판에 참여)
   */
  | { k: 'spectate'; target: string | null; reason: 'dead' | 'late'; };

/** 클라이언트 → 서버 (엔진의 { t: 'mode', d }) */
export type BrClientMsg =
  /** 관전 대상 바꾸기 (다음 +1, 이전 -1) */
  | { k: 'watch'; dir: 1 | -1; }
  /** 시작 대기에서 준비(게임 시작 버튼) 켜기·끄기 */
  | { k: 'ready'; on: boolean; }
  /** 차 타기·내리기 (F·화면 버튼) — 타고 있으면 내리고, 아니면 가까운 차에 탄다 */
  | { k: 'drive'; };

export const isBrMsg = (d:unknown):d is BrServerMsg => typeof d === 'object' && d !== null && typeof (d as { k?: unknown; }).k === 'string';