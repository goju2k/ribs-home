import cron from 'node-cron';

import { formatKstTm } from './kst-time';
import { fetchRadarPng } from './radar-fetch';
import { RADAR_CORNERS } from './radar-geo';
import { buildGrid } from './radar-grid';
import { NO_DATA, RAIN_THRESHOLD_INDEX, RadarLegend } from './radar-legend';
import { RainRadarDB } from './rain-radar-db';
import { rleEncode } from './rle';
import { publishCurrentData } from './s3-publisher';

const RETENTION_MS = 6 * 60 * 60 * 1000; // 6시간 보관
const PUBLISH_FRAME_COUNT = 4;

// ribs-app이 예전에 /api/rain-assist/radar-frames로 내려주던 것과 동일한 셰이프
const LEGEND = RadarLegend.map(([ , mmh ], index) => ({ index, mmh }));

function lo(...args) {
  console.log(new Date().toLocaleString(), '[RainRadarBot]', ...args);
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
      const encodedGrid = rleEncode(grid);

      await this.db.insertFrame({
        tm,
        gridWidth,
        gridHeight,
        sourceWidth,
        sourceHeight,
        stride,
        gridData: encodedGrid,
      });

      const cutoff = formatKstTm(new Date(Date.now() - RETENTION_MS));
      const pruned = await this.db.pruneOlderThan(cutoff);

      lo('check ok', 'tm', tm, 'grid', `${gridWidth}x${gridHeight}`, 'raw', grid.length, 'encoded', encodedGrid.length, 'pruned', pruned);

    } catch (e) {
      lo('check error', e);
    }

    try {

      const frames = await this.db.getLatestFrames(PUBLISH_FRAME_COUNT);

      await publishCurrentData({
        corners: RADAR_CORNERS,
        legend: LEGEND,
        noDataIndex: NO_DATA,
        rainThresholdIndex: RAIN_THRESHOLD_INDEX,
        frames: frames.map((f) => ({
          tm: f.tm,
          gridWidth: f.gridWidth,
          gridHeight: f.gridHeight,
          gridDataBase64: f.gridData.toString('base64'),
        })),
      });

      lo('publish ok', 'frames', frames.length);

    } catch (e) {
      lo('publish error', e);
    }
  }

}