import cron from 'node-cron';

import { fetchRadarPng } from './radar-fetch';
import { buildGrid } from './radar-grid';
import { RainRadarDB } from './rain-radar-db';

const RETENTION_MS = 6 * 60 * 60 * 1000; // 6시간 보관

function lo(...args) {
  console.log(new Date().toLocaleString(), '[RainRadarBot]', ...args);
}

function toTm(date:Date):string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}`;
}

export class RainRadarBot {

  db:RainRadarDB = null;

  task:ReturnType<typeof cron.schedule>;

  constructor() {
    this.db = new RainRadarDB();
  }

  async start() {

    lo('wait db connect');
    await this.db.waitConnected();
    lo('db connect ok');

    await this.check();

    // KMA는 시계 기준 5분 정각에 이미지를 갱신하므로 setInterval 대신 cron으로 정렬
    this.task = cron.schedule('*/5 * * * *', () => this.check(), { timezone: 'Asia/Seoul' });

  }

  stop() {
    this.task?.stop();
  }

  async check() {
    try {

      const { tm, png } = await fetchRadarPng();
      const { grid, gridWidth, gridHeight, sourceWidth, sourceHeight, stride } = buildGrid(png);

      await this.db.insertFrame({
        tm,
        gridWidth,
        gridHeight,
        sourceWidth,
        sourceHeight,
        stride,
        gridData: grid,
      });

      const cutoff = toTm(new Date(Date.now() - RETENTION_MS));
      const pruned = await this.db.pruneOlderThan(cutoff);

      lo('check ok', 'tm', tm, 'grid', `${gridWidth}x${gridHeight}`, 'pruned', pruned);

    } catch (e) {
      lo('check error', e);
    }
  }

}