import { NextResponse } from 'next/server';

export const revalidate = 0;

// 다운로드 페이지(/raining-now)가 읽는 비올까 최신 버전 정보.
// CloudFront가 Origin 헤더를 캐시 키에 넣지 않아서, Origin 없는 요청(앱의 업데이트 확인 등)이 먼저 캐시를
// 채우면 그 캐시가 살아 있는 동안(60초) CORS 허용 헤더가 빠진 응답이 나가 브라우저가 읽지 못한다.
// 서버에서 대신 받아 같은 출처로 넘겨 CORS를 피한다.
const LATEST_URL = 'https://d8dfs01bak16j.cloudfront.net/rain-assist/app/latest.json';

export async function GET() {
  try {
    const res = await fetch(LATEST_URL, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: `upstream ${res.status}` }, { status: 502 });
    }
    return NextResponse.json(await res.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: 'upstream fetch failed' }, { status: 502 });
  }
}