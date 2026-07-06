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

interface PngHistoryEntry {
  tm:string;
  png:Buffer;
}

function lo(...args) {
  console.log(new Date().toLocaleString(), '[RainRadarBot]', ...args);
}

export class RainRadarBot {

  db:RainRadarDB = null;

  task:ReturnType<typeof cron.schedule>;

  // S3에는 분류된 그리드가 아니라 원본 PNG 시계열을 그대로 발행한다(분류/RLE는 클라이언트가
  // 직접, 매번 원본 픽셀에서 새로 수행 — 서버에서 한 번 분류→압축→전송→복원하는 왕복 과정에서
  // 생기는 몇 픽셀 단위 불일치가 예보 정밀도에 영향을 줬기 때문). Postgres 적재(분류된 그리드)는
  // 이 변경과 무관하게 그대로 유지 — 원본 PNG 시계열은 DB가 아니라 이 프로세스 메모리에만
  // 보관한다(어차피 "현재 스냅샷" 용도라 재시작에 따른 짧은 이력 손실은 문제 없음).
  pngHistory:PngHistoryEntry[] = [];

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

      this.pngHistory = this.pngHistory.filter((f) => f.tm !== tm);
      this.pngHistory.push({ tm, png });
      this.pngHistory.sort((a, b) => (a.tm < b.tm ? -1 : 1));
      if (this.pngHistory.length > PUBLISH_FRAME_COUNT) {
        this.pngHistory = this.pngHistory.slice(this.pngHistory.length - PUBLISH_FRAME_COUNT);
      }

      lo('check ok', 'tm', tm, 'grid', `${gridWidth}x${gridHeight}`, 'raw', grid.length, 'encoded', encodedGrid.length, 'pruned', pruned);

    } catch (e) {
      lo('check error', e);
    }

    try {

      await publishCurrentData({
        corners: RADAR_CORNERS,
        legend: LEGEND,
        noDataIndex: NO_DATA,
        rainThresholdIndex: RAIN_THRESHOLD_INDEX,
        frames: this.pngHistory.map((f) => ({
          tm: f.tm,
          pngBase64: f.png.toString('base64'),
        })),
      });

      lo('publish ok', 'frames', this.pngHistory.length);

    } catch (e) {
      lo('publish error', e);
    }
  }

}