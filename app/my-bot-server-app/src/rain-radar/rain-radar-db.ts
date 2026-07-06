import { Pool } from 'pg';

export interface RainRadarFrame {
  tm:string;
  gridWidth:number;
  gridHeight:number;
  sourceWidth:number;
  sourceHeight:number;
  stride:number;
  gridData:Buffer;
}

export class RainRadarDB {

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

    console.log('rain radar db pool created');

    this.test().then(() => {
      this.connected = true;
    });

  }

  async test() {
    console.log('rain radar db connected');
    await this.pool.query('select 1');
    this.connected = true;
  }

  async insertFrame(f:RainRadarFrame) {
    await this.pool.query(
      `insert into ribs.rain_radar_frame
        (tm, grid_width, grid_height, source_width, source_height, stride, grid_data)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (tm) do nothing`,
      [
        f.tm,
        f.gridWidth,
        f.gridHeight,
        f.sourceWidth,
        f.sourceHeight,
        f.stride,
        f.gridData,
      ],
    );
  }

  async pruneOlderThan(cutoffTm:string) {
    const result = await this.pool.query(
      'delete from ribs.rain_radar_frame where tm < $1',
      [ cutoffTm ],
    );
    return result.rowCount;
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