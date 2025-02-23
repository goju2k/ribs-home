/* eslint-disable no-restricted-properties */
/* eslint-disable prefer-exponentiation-operator */
/* eslint-disable no-mixed-operators */
import { NextRequest } from 'next/server';
import proj4 from 'proj4';

export const revalidate = 6000;
export const dynamic = 'force-static';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ center: string; level: string; }>; }) {

  const { center, level: levelString } = (await params);

  // zoom level 네이버 보정
  const level = Number(levelString);
  const naverLevel = level - 1;
  
  const [ x, y ] = center.split(',');
  const centerLngLat = tileToLngLatProj4(Number(x), Number(y), level);
  // console.log('centerLngLat', `${x},${y},${level}`, 'to', centerLngLat);

  const res = await fetch(
    `https://naveropenapi.apigw.ntruss.com/map-static/v2/raster?w=256&h=256&center=${centerLngLat}&level=${naverLevel}`,
    {
      headers: {
        'x-ncp-apigw-api-key-id': 'yc2mrw1mz8',
        'x-ncp-apigw-api-key': 'xJRq1JmZeANCqDtQBcQpVQs0lmWXLDgmswlGwxF6',
      },
    },
  );

  return new Response(await res.arrayBuffer(), { headers: { 'cache-control': 'max-age=600000' } });
}

// Define the coordinate systems
const EPSG4326 = 'EPSG:4326'; // WGS84 (Geographic - lat/lng)
const EPSG3857 = 'EPSG:3857'; // Web Mercator (Used by MapLibre, Google, OSM)

function tileToLngLatProj4(x:number, y:number, zoom:number) {

  // Convert tile coordinates to the CENTER of the tile
  const tileX = x + 0.5; // Move to center
  const tileY = y + 0.5;
  // console.log(x, ' => ', tileX);
  // console.log(y, ' => ', tileY);

  // World tile size in meters at zoom level 0
  const TILE_SIZE = 256;
  const INITIAL_RESOLUTION = 2 * Math.PI * 6378137 / TILE_SIZE;

  // Resolution at zoom level
  const resolution = INITIAL_RESOLUTION / Math.pow(2, zoom);

  // Convert tile coordinates to Web Mercator meters
  const mercX = tileX * resolution * TILE_SIZE - Math.PI * 6378137;
  const mercY = Math.PI * 6378137 - tileY * resolution * TILE_SIZE;

  // Convert Web Mercator to lat/lng
  const [ lng, lat ] = proj4(EPSG3857, EPSG4326, [ mercX, mercY ]);
  return `${lng},${lat}`;
}