import { NextResponse } from 'next/server';

export const revalidate = 0;

// 지금 실제로 배포되어 실행 중인 서버 프로세스가 빌드될 때 굽힌 값을 그대로 돌려준다
// (next.config.js의 env는 클라이언트 번들뿐 아니라 이 서버 코드에도 동일하게 정적으로
// 치환되므로, 요청이 오는 시점에 "현재 떠 있는 배포"가 어떤 빌드인지 정확히 반영한다).
export async function GET() {
  return NextResponse.json({ buildId: process.env.NEXT_PUBLIC_RAIN_ASSIST_BUILD_ID ?? null });
}