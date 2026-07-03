import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// 원본: app/ribs-app/src/app/rain/components/map-layer/RainRadarLayer.tsx 의 4개 꼭짓점 좌표
// KEEP IN SYNC WITH app/ribs-app/src/app/rain-assist/util/radar-geo.ts
const RADAR_CORNERS:[number, number][] = [
  [ 30.8101038494, 121.3322516155 ],
  [ 40.1670385352, 120.609116658 ],
  [ 40.0701181652, 133.0225827684 ],
  [ 30.7283967663, 132.0821758282 ],
];

export const revalidate = 0;

// my-bot-server-app의 SisulBotDB와 동일한 env 변수를 사용하는 ribs-app 최초의 Postgres 접근
const pool = new Pool({
  user: process.env.DBUSER,
  password: process.env.DBPASS,
  host: process.env.DBHOST,
  port: Number(process.env.DBPORT),
  database: process.env.DB,
});

interface RadarFrameRow {
  tm:string;
  grid_width:number;
  grid_height:number;
  grid_data:Buffer;
}

export async function GET(request:NextRequest) {

  const countParam = Number(request.nextUrl.searchParams.get('count'));
  const count = Number.isFinite(countParam) ? Math.min(Math.max(countParam, 2), 12) : 4;

  const result = await pool.query<RadarFrameRow>(
    'select tm, grid_width, grid_height, grid_data from ribs.rain_radar_frame order by tm desc limit $1',
    [ count ],
  );

  const frames = result.rows
    .slice()
    .reverse()
    .map((row) => ({
      tm: row.tm,
      gridWidth: row.grid_width,
      gridHeight: row.grid_height,
      gridDataBase64: row.grid_data.toString('base64'),
    }));

  return NextResponse.json({
    corners: RADAR_CORNERS,
    frames,
  });

}