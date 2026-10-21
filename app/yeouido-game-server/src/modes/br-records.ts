import { Pool } from 'pg';
import { emptyGear, Gear, ITEM_KINDS, ItemKind } from 'yeouido-br';

import { appendFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * 배틀로얄 판 기록 (게임성 측정·밸런스용): 판마다 한 줄, 사람마다 한 줄.
 * DB 환경 변수(DBUSER·DBPASS·DBHOST·DBPORT·DB, 다른 서버들과 같음)가 있으면 PostgreSQL ribs 스키마에,
 * 없으면 임시 폴더의 JSONL 파일에 쌓는다 (기록이 비지 않게).
 */

/** 사람 하나의 이번 판 기록 (다시 시작해도 이어진다) */
export interface PlayerStats {
  name: string;
  joinedAt: number;
  leftAt: number | null;
  /** 보스전·결과 중에 들어와 관전만 했는지 */
  late: boolean;
  kills: number;
  zombieKills: number;
  deaths: number;
  /** 사람에게 준 피해, 보스에게 준 피해 */
  damage: number;
  bossDamage: number;
  /** 종류별로 주운 수 */
  picks: Record<ItemKind, number>;
  /** 이번 판 최고 강화 단계 */
  maxGear: Gear;
  /** 보스가 나온 순간의 장비 (살아 있었으면) — 보스 체력을 맞추는 기준 */
  gearAtBoss: Gear | null;
  /** 판이 끝날 때 살아 있었는지 */
  aliveAtEnd: boolean;
}

export interface MatchRecord {
  matchId: number;
  startedAt: number;
  endedAt: number;
  /** win·lose(보스전 결과), abandoned(사람이 없어 닫힘) */
  result: 'win' | 'lose' | 'abandoned';
  why: string | null;
  difficulty: string;
  bossHp: number | null;
  bossKiller: string | null;
  players: PlayerStats[];
}

export const newStats = (name:string, now:number, late:boolean):PlayerStats => ({
  name,
  joinedAt: now,
  leftAt: null,
  late,
  kills: 0,
  zombieKills: 0,
  deaths: 0,
  damage: 0,
  bossDamage: 0,
  picks: Object.fromEntries(ITEM_KINDS.map((k) => [ k, 0 ])) as Record<ItemKind, number>,
  maxGear: emptyGear(),
  gearAtBoss: null,
  aliveAtEnd: false,
});

const DDL = [
  'create schema if not exists ribs',
  `create table if not exists ribs.yeouido_br_match (
    id bigserial primary key,
    match_no int not null,
    started_at timestamptz not null,
    ended_at timestamptz not null,
    result text not null,
    why text,
    difficulty text not null,
    boss_hp int,
    boss_killer text,
    player_count int not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists ribs.yeouido_br_player (
    id bigserial primary key,
    match_id bigint not null references ribs.yeouido_br_match(id) on delete cascade,
    name text not null,
    joined_at timestamptz not null,
    left_at timestamptz,
    late boolean not null,
    kills int not null,
    zombie_kills int not null,
    deaths int not null,
    damage int not null,
    boss_damage int not null,
    picks jsonb not null,
    max_gear jsonb not null,
    gear_at_boss jsonb,
    alive_at_end boolean not null
  )`,
];

export class Records {

  private pool:Pool | null = null;

  private ready:Promise<boolean>;

  private file = join(tmpdir(), 'yeouido-br-records.jsonl');

  constructor() {
    const { DBUSER, DBPASS, DBHOST, DBPORT, DB } = process.env;
    if (!DBUSER || !DBHOST || !DB) {
      console.log(`[br] records → ${this.file} (DB 환경 변수 없음)`);
      this.ready = Promise.resolve(false);
      return;
    }
    this.pool = new Pool({ user: DBUSER, password: DBPASS, host: DBHOST, port: Number(DBPORT) || 5432, database: DB, max: 2 });
    this.ready = (async () => {
      try {
        // eslint-disable-next-line no-restricted-syntax, no-await-in-loop -- 표 만들기는 순서대로
        for (const q of DDL) await this.pool!.query(q);
        console.log('[br] records → PostgreSQL ribs.yeouido_br_*');
        return true;
      } catch (e) {
        console.log(`[br] records DB 준비 실패, 파일로: ${(e as Error).message}`);
        return false;
      }
    })();
  }

  /** 판 하나 저장 (실패해도 게임은 계속) */
  async save(r:MatchRecord) {
    try {
      if (this.pool && await this.ready) {
        const m = await this.pool.query(
          `insert into ribs.yeouido_br_match (match_no, started_at, ended_at, result, why, difficulty, boss_hp, boss_killer, player_count)
           values ($1, to_timestamp($2 / 1000.0), to_timestamp($3 / 1000.0), $4, $5, $6, $7, $8, $9) returning id`,
          [ r.matchId, r.startedAt, r.endedAt, r.result, r.why, r.difficulty, r.bossHp, r.bossKiller, r.players.length ],
        );
        const { id } = m.rows[0];
        await Promise.all(r.players.map((p) => this.pool!.query(
          `insert into ribs.yeouido_br_player (match_id, name, joined_at, left_at, late, kills, zombie_kills, deaths, damage, boss_damage, picks, max_gear, gear_at_boss, alive_at_end)
           values ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [ id, p.name, p.joinedAt, p.leftAt, p.late, p.kills, p.zombieKills, p.deaths, Math.round(p.damage), Math.round(p.bossDamage),
            JSON.stringify(p.picks), JSON.stringify(p.maxGear), p.gearAtBoss && JSON.stringify(p.gearAtBoss), p.aliveAtEnd ],
        )));
        console.log(`[br] record saved: match #${r.matchId} ${r.result} (${r.players.length}명) → db id ${id}`);
        return;
      }
      await appendFile(this.file, `${JSON.stringify(r)}\n`);
      console.log(`[br] record saved: match #${r.matchId} ${r.result} (${r.players.length}명) → file`);
    } catch (e) {
      console.log(`[br] record save failed: ${(e as Error).message}`);
    }
  }

}