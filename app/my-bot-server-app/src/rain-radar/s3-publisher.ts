import { DeleteObjectsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// 자격증명/리전은 SDK 기본 프로바이더 체인(AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_REGION env, 또는 IAM 역할)에 위임.
// 기본 핸들러는 요청 타임아웃이 없어, 응답 없이 걸린 업로드 하나가 봇 사이클을 무한정 붙잡을 수 있다.
const client = new S3Client({ requestHandler: { connectionTimeout: 5 * 1000, requestTimeout: 30 * 1000 } });

const S3_KEY = 'rain-assist/current.json';

// v2: 앱이 프레임 전체 대신 자기 주변 타일만, 그것도 새 프레임분만 받도록 나눠 발행한다.
//  - v2/index.json              : 최근 프레임 목록 + 프레임별 "비 있는 타일" 목록 (짧은 캐시)
//  - v2/tiles/{tm}/{tx}_{ty}.png: 원본 픽셀 그대로 자른 타일 (한 번 쓰면 안 바뀜 → 긴 캐시)
//  - v2/frames/{tm}.png         : 원본 PNG 보관본 (백테스트/재현용, 지우지 않음)
export const V2_PREFIX = 'rain-assist/v2';

// 1분 주기로 갱신을 시도하는 데이터라 CDN(CloudFront)에서 오래 캐싱되면 그만큼 그대로
// 신선도 지연이 된다. 활성 invalidation은 이 빈도로는 비용이 커서(경로당 과금) 대신
// max-age를 짧게 둬 CDN이 원본과 자주 재검증하도록 한다.
const SHORT_CACHE = 'public, max-age=10';
// tm별 키는 내용이 절대 바뀌지 않는다.
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

function bucket():string {
  const name = process.env.S3_BUCKET;
  if (!name) {
    throw new Error('S3_BUCKET env var is not set');
  }
  return name;
}

async function put(key:string, body:Buffer | string, contentType:string, cacheControl:string) {
  await client.send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: cacheControl,
  }));
}

export async function publishCurrentData(payload:unknown) {
  await put(S3_KEY, JSON.stringify(payload), 'application/json', SHORT_CACHE);
}

export async function publishFramePng(tm:string, png:Buffer) {
  await put(`${V2_PREFIX}/frames/${tm}.png`, png, 'image/png', IMMUTABLE_CACHE);
}

export async function publishTilePng(tm:string, tx:number, ty:number, png:Buffer) {
  await put(`${V2_PREFIX}/tiles/${tm}/${tx}_${ty}.png`, png, 'image/png', IMMUTABLE_CACHE);
}

export async function publishIndex(payload:unknown) {
  await put(`${V2_PREFIX}/index.json`, JSON.stringify(payload), 'application/json', SHORT_CACHE);
}

export async function deleteTiles(tm:string, tiles:{ tx:number; ty:number; }[]) {
  if (tiles.length === 0) {
    return;
  }
  await client.send(new DeleteObjectsCommand({
    Bucket: bucket(),
    Delete: {
      Objects: tiles.map(({ tx, ty }) => ({ Key: `${V2_PREFIX}/tiles/${tm}/${tx}_${ty}.png` })),
      Quiet: true,
    },
  }));
}