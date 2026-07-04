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
    // 5분 주기로 갱신되는 데이터이므로 캐시 수명을 짧게 유지
    CacheControl: 'public, max-age=60',
  }));

}