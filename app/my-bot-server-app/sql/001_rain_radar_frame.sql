-- 이 저장소엔 마이그레이션 도구가 없음. ribs 스키마 Postgres에 수동 1회 실행 필요.
CREATE TABLE IF NOT EXISTS ribs.rain_radar_frame (
  tm            varchar(12)  PRIMARY KEY,      -- yyyyMMddHHmm, 5분 버킷 (클라이언트 tm과 동일 포맷)
  grid_width    smallint     NOT NULL,
  grid_height   smallint     NOT NULL,
  source_width  smallint     NOT NULL,          -- 디코드된 원본 PNG 실제 width (pngjs 기준)
  source_height smallint     NOT NULL,
  stride        smallint     NOT NULL,          -- 다운샘플 stride
  grid_data     bytea        NOT NULL,          -- RLE 압축된 row-major 그리드(rle.ts). 복원 시 1byte/cell: 범례 인덱스 0-23, 255=no-data
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rain_radar_frame_created_at
  ON ribs.rain_radar_frame (created_at);
