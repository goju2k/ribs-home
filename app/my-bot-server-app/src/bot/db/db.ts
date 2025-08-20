import { Pool } from 'pg';

export class SisulBotDB {

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

    console.log('db pool created');

    this.test().then(() => {
      this.connected = true;
    });
    
  }

  async test() {
    console.log('db connected');
    const result = await this.pool.query('select * from ribs.sisul_bot_checked');
    console.log('db test result', result.rows);
    this.connected = true;
  }

  async isCheckedDate(type:'ydp'|'ydp2', date:string) {
    console.log('isCheckedDate', 'type', type, 'date', date);
    const result = await this.pool.query(
      'select * from ribs.sisul_bot_checked where sisul_type=$1 and checked_date=$2',
      [
        type,
        date,
      ],
    );
    console.log('isCheckedDate result', result.rows);
    return result.rowCount > 0;
  }

  async addDate(type:'ydp'|'ydp2', date:string) {
    await this.pool.query(
      'insert into ribs.sisul_bot_checked (sisul_type, checked_date) values ($1, $2)',
      [
        type,
        date,
      ],
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
        console.log('check');
        if (self.connected === true) {
          clearInterval(interval);
          resolve(true);
        }
      }, 100);
    });
  }

}