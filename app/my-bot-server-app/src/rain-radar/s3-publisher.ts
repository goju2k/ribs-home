import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// 자격증명/리전은 SDK 기본 프로바이더 체인(AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_REGION env, 또는 IAM 역할)에 위임
const client = new S3Client({});

const S3_KEY = 'rain-assist/current.json';

export async function publishCurrentData(payload:unknown) {

  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error('S3_BUCKET env var is not set');
  }

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: S3_KEY,
    Body: JSON.stringify(payload),
    ContentType: 'application/json',
    // 1분 주기로 갱신을 시도하는 데이터라 CDN(CloudFront)에서 오래 캐싱되면 그만큼 그대로
    // 신선도 지연이 된다. 활성 invalidation은 이 빈도로는 비용이 커서(경로당 과금) 대신
    // max-age를 짧게 둬 CDN이 원본과 자주 재검증하도록 한다.
    CacheControl: 'public, max-age=10',
  }));

}