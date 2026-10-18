import cron from 'node-cron';

import { formatKstTm, kstTmToEpochMs, shiftTm } from './kst-time';
import { fetchRadarPng, fetchRadarPngAt, getTime } from './radar-fetch';
import { RADAR_CORNERS } from './radar-geo';
import { buildGrid } from './radar-grid';
import { NO_DATA, RAIN_THRESHOLD_INDEX, RadarLegend } from './radar-legend';
import { buildTiles, TILE_SIZE } from './radar-tiles';
import { RainRadarDB } from './rain-radar-db';
import { rleEncode } from './rle';
import { deleteTiles, publishCurrentData, publishFramePng, publishIndex, publishTilePng } from './s3-publisher';

const RETENTION_MS = 6 * 60 * 60 * 1000; // 6시간 보관
const PUBLISH_FRAME_COUNT = 4;
// 앱이 직전 index(최대 10초 캐시)를 보고 타일을 받는 도중에 지워지지 않도록, 발행 목록에서 빠진
// 프레임의 타일도 이만큼은 남겨 뒀다가 지운다.
const TILE_RETAIN_FRAME_COUNT = 8;
// 마지막으로 받은 프레임 이후 이 이상 공백이면(서버 장기 중단, KMA 장기 장애) 이어 받기 대신
// 처음 시작할 때처럼 최신 프레임부터 다시 찾는다.
const RESYNC_GAP_MS = 45 * 60 * 1000;
const MAX_PROBES_PER_CHECK = 10;

// ribs-app이 예전에 /api/rain-assist/radar-frames로 내려주던 것과 동일한 셰이프
const LEGEND = RadarLegend.map(([ , mmh ], index) => ({ index, mmh }));

interface FetchedFrame {
  tm:string;
  png:Buffer;
}

interface FrameEntry extends FetchedFrame {
  rainTiles:{ tx:number; ty:number; }[];
}

function lo(...args) {
  console.log(new Date().toLocaleString(), '[RainRadarBot]', ...args);
}

export class RainRadarBot {

  db:RainRadarDB = null;

  task:ReturnType<typeof cron.schedule>;

  // S3에는 분류된 그리드가 아니라 원본 PNG 시계열을 그대로 발행한다(분류는 클라이언트가
  // 직접, 매번 원본 픽셀에서 새로 수행 — 서버에서 한 번 분류→압축→전송→복원하는 왕복 과정에서
  // 생기는 몇 픽셀 단위 불일치가 예보 정밀도에 영향을 줬기 때문). Postgres 적재(분류된 그리드)는
  // 이 변경과 무관하게 그대로 유지 — 원본 PNG 시계열은 DB가 아니라 이 프로세스 메모리에만
  // 보관한다(재시작해도 KMA가 하루치 과거 이미지를 보관하므로 시작 시 직전 프레임을 다시 받아 채운다).
  history:FrameEntry[] = [];

  // 발행 목록에서 빠졌지만 아직 지우지 않은 프레임의 타일 (오래된 것부터)
  retiredTiles:FrameEntry[] = [];

  imageSize = { width: 0, height: 0 };

  running = false;

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
    // 오래된 프레임을 발행하게 될 수 있어, 1분마다 확인해 새 이미지가 나온 지 최대 1분 내로 잡는다.
    this.task = cron.schedule('* * * * *', () => this.check(), { timezone: 'Asia/Seoul' });

  }

  stop() {
    this.task?.stop();
  }

  async check() {

    // 시작 시 백필이나 타일 업로드가 1분을 넘기면 다음 크론 틱과 겹칠 수 있다.
    if (this.running) {
      return;
    }
    this.running = true;

    try {

      const fetched = await this.collectNewFrames();
      if (fetched.length === 0) {
        lo('check skip (no new frame)', 'latest', this.history.at(-1)?.tm);
        return;
      }

      await fetched.reduce((prev, frame) => prev.then(() => this.ingest(frame)), Promise.resolve());

      const dropped = this.history.slice(0, Math.max(0, this.history.length - PUBLISH_FRAME_COUNT));
      this.history = this.history.slice(-PUBLISH_FRAME_COUNT);
      this.retiredTiles.push(...dropped);
      while (this.retiredTiles.length > TILE_RETAIN_FRAME_COUNT - PUBLISH_FRAME_COUNT) {
        const old = this.retiredTiles.shift();
        await deleteTiles(old.tm, old.rainTiles).catch((e) => lo('tile delete error', old.tm, e));
      }

      await this.publish();

    } catch (e) {
      lo('check error', e);
    } finally {
      this.running = false;
    }

  }

  // 새로 받을 프레임들(오래된 것부터).
  //  - 처음(또는 긴 공백 후): 최신 tm을 뒤로 걸어가며 찾고, 그 앞 프레임들을 KMA 과거 이미지로 채운다
  //    — 재시작 직후에도 앱이 곧바로 이동 추정에 필요한 여러 장을 받게 한다.
  //  - 평소: 마지막으로 받은 tm 이후의 5분 버킷만 오름차순으로 확인한다(대개 1~2회 요청).
  //    KMA가 아예 건너뛴 버킷은 404로 지나가고 그다음 버킷을 받는다.
  async collectNewFrames():Promise<FetchedFrame[]> {

    const latestKnown = this.history.at(-1)?.tm;
    const nowTm = getTime(0);

    if (!latestKnown || kstTmToEpochMs(nowTm) - kstTmToEpochMs(latestKnown) > RESYNC_GAP_MS) {
      if (latestKnown) {
        lo('resync after gap', 'latest', latestKnown, 'now', nowTm);
        this.retiredTiles.push(...this.history);
        this.history = [];
      }
      const newest = await fetchRadarPng();
      const frames:FetchedFrame[] = [ newest ];
      for (let k = 1; k < PUBLISH_FRAME_COUNT; k += 1) {
        const tm = shiftTm(newest.tm, -5 * k);
        const png = await fetchRadarPngAt(tm);
        if (png) {
          frames.unshift({ tm, png });
        }
      }
      lo('backfill', frames.map((f) => f.tm).join(','));
      return frames;
    }

    const frames:FetchedFrame[] = [];
    let tm = shiftTm(latestKnown, 5);
    for (let n = 0; tm <= nowTm && n < MAX_PROBES_PER_CHECK; n += 1) {
      const png = await fetchRadarPngAt(tm);
      if (png) {
        frames.push({ tm, png });
      }
      tm = shiftTm(tm, 5);
    }
    return frames;

  }

  async ingest({ tm, png }:FetchedFrame) {

    // 분류 그리드 DB 적재 — S3 발행과 독립적으로, 실패해도 발행은 계속한다.
    try {
      const { grid, gridWidth, gridHeight, sourceWidth, sourceHeight, stride } = buildGrid(png);
      await this.db.insertFrame({
        tm,
        gridWidth,
        gridHeight,
        sourceWidth,
        sourceHeight,
        stride,
        gridData: rleEncode(grid),
      });
      await this.db.pruneOlderThan(formatKstTm(new Date(Date.now() - RETENTION_MS)));
    } catch (e) {
      lo('db error', tm, e);
    }

    await publishFramePng(tm, png);

    const { width, height, tiles } = buildTiles(png);
    this.imageSize = { width, height };
    // index가 가리키기 전에 타일이 먼저 올라가 있어야 한다(publish()는 이 다음에 호출된다).
    await Promise.all(tiles.map((t) => publishTilePng(tm, t.tx, t.ty, t.png)));

    this.history.push({ tm, png, rainTiles: tiles.map(({ tx, ty }) => ({ tx, ty })) });
    this.history.sort((a, b) => (a.tm < b.tm ? -1 : 1));
    lo('ingest ok', 'tm', tm, 'rainTiles', tiles.length, 'tileBytes', tiles.reduce((s, t) => s + t.png.length, 0));

  }

  async publish() {

    await publishIndex({
      version: 2,
      corners: RADAR_CORNERS,
      imageWidth: this.imageSize.width,
      imageHeight: this.imageSize.height,
      tileSize: TILE_SIZE,
      // 경로는 index.json 기준 상대경로
      tilePath: 'tiles/{tm}/{tx}_{ty}.png',
      framePath: 'frames/{tm}.png',
      frames: this.history.map((f) => ({
        tm: f.tm,
        rainTiles: f.rainTiles.map(({ tx, ty }) => [ tx, ty ]),
      })),
    });

    // 구버전 앱용 (전체 프레임 4장을 한 파일로)
    await publishCurrentData({
      corners: RADAR_CORNERS,
      legend: LEGEND,
      noDataIndex: NO_DATA,
      rainThresholdIndex: RAIN_THRESHOLD_INDEX,
      frames: this.history.map((f) => ({
        tm: f.tm,
        pngBase64: f.png.toString('base64'),
      })),
    });

    lo('publish ok', 'frames', this.history.map((f) => f.tm).join(','));

  }

}