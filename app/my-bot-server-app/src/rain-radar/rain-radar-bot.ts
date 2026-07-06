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

    // KMA의 실제 이미지 발행 시각은 5분 정각과 정확히 일치하지 않는다(처리 지연으로 몇 분씩
    // 밀릴 수 있음). 5분 주기로만 확인하면 이 밀림과 크론 틱이 어긋나 최대 5분(+CDN 캐시)까지
    // 오래된 프레임을 발행하게 될 수 있어, 1분마다 재시도해 새 이미지가 나온 지 최대 1분 내로
    // 잡는다. fetchRadarPng이 이미 "가장 최근 버킷부터 시도, 없으면 과거로" 하는 재시도 로직을
    // 갖고 있어 별도 로직 변경 없이 이 주기 단축만으로 최신성이 개선된다.
    this.task = cron.schedule('* * * * *', () => this.check(), { timezone: 'Asia/Seoul' });

  }

  stop() {
    this.task?.stop();
  }

  async check() {

    // 1분마다 확인하지만 KMA가 5분 간격(또는 그 이상 지연)으로만 발행하므로, 대부분의 사이클은
    // "아직 같은 tm"이다. 이럴 때는 분류/RLE(DB용)도, DB insert도, S3 재발행도 전부 스킵한다
    // (같은 내용을 매번 다시 올려봐야 얻는 게 없고, KMA 조회 자체만 매분 하면 충분하다).
    let newFrame = false;

    try {

      const { tm, png } = await fetchRadarPng();

      if (this.pngHistory.some((f) => f.tm === tm)) {
        lo('check skip (no new frame)', 'tm', tm);
      } else {

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

        this.pngHistory.push({ tm, png });
        this.pngHistory.sort((a, b) => (a.tm < b.tm ? -1 : 1));
        if (this.pngHistory.length > PUBLISH_FRAME_COUNT) {
          this.pngHistory = this.pngHistory.slice(this.pngHistory.length - PUBLISH_FRAME_COUNT);
        }

        newFrame = true;
        lo('check ok', 'tm', tm, 'grid', `${gridWidth}x${gridHeight}`, 'raw', grid.length, 'encoded', encodedGrid.length, 'pruned', pruned);

      }

    } catch (e) {
      lo('check error', e);
    }

    if (!newFrame) {
      return;
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