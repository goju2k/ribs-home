import { Pool } from 'pg';

export interface KyoboStockRow {
  bookKey:string;
  gb:'1'|'2';
  strName:string;
  quantity:number;
}

export interface KyoboStockLatestRow extends KyoboStockRow {
  checkedAt:Date;
}

export class KyoboBotDB {

  pool:Pool = null;

  connected = false;

  constructor() {

    const pool = new Pool({
      user: process.env.DBUSER,
      password: process.env.DBPASS,
      host: process.env.DBHOST,
      port: Number(process.env.DBPORT),
      database: process.env.DB,
    });
    this.pool = pool;

    console.log('kyobo bot db pool created');

    this.test().then(() => {
      this.connected = true;
    });

  }

  async test() {
    console.log('kyobo bot db connected');
    await this.pool.query('select 1');
    this.connected = true;
  }

  // 지정한 책의 (gb, 지점)별 가장 최근 재고 값 — 프로세스 재시작 시 KyoboBot.prev를 채우는 용도.
  async getLatestByBookKey(bookKey:string):Promise<KyoboStockLatestRow[]> {
    const result = await this.pool.query(
      `select distinct on (book_key, gb, str_name)
         book_key, gb, str_name, quantity, checked_at
       from ribs.kyobo_bot_stock
       where book_key = $1
       order by book_key, gb, str_name, checked_at desc`,
      [ bookKey ],
    );
    return result.rows.map((row) => ({
      bookKey: row.book_key,
      gb: row.gb,
      strName: row.str_name,
      quantity: row.quantity,
      checkedAt: row.checked_at,
    }));
  }

  async insertStock(rows:KyoboStockRow[]) {
    if (rows.length === 0) {
      return;
    }
    const values:unknown[] = [];
    const placeholders = rows.map((row, idx) => {
      const base = idx * 4;
      values.push(row.bookKey, row.gb, row.strName, row.quantity);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });
    await this.pool.query(
      `insert into ribs.kyobo_bot_stock (book_key, gb, str_name, quantity) values ${placeholders.join(', ')}`,
      values,
    );
  }

  waitConnected() {
    const self = this;
    return new Promise<Boolean>((resolve) => {
      if (self.connected === true) {
        resolve(true);
        return;
      }
      const interval = setInterval(() => {
        if (self.connected === true) {
          clearInterval(interval);
          resolve(true);
        }
      }, 100);
    });
  }

}