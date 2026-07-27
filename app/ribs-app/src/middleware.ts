import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// app/components/CommonRegistry.tsx(사이트 전체 공유 SSR 스타일 레지스트리)가 hydration 전까지
// children을 null로 렌더링하는 구조라, 페이지 컴포넌트 안에서 부르는 next/navigation의
// redirect()는 실제 HTTP 3xx를 만들지 못하고 클라이언트 사이드 이동으로만 동작한다(직접 확인
// 됨 — curl/Playwright 둘 다 200으로 원래 URL에 그대로 머묾). 진짜 서버사이드 리다이렉트가
// 필요한 경로(/, /rain → /rain-assist)는 렌더링 이전 단계인 미들웨어에서 처리한다. 각 page.tsx에
// 남아있는 redirect() 호출은 미들웨어가 먼저 가로채 어차피 실행되지 않으므로 무해하게 둔다.
export function middleware(request:NextRequest) {
  return NextResponse.redirect(new URL('/rain-assist', request.url), 307);
}

export const config = { matcher: [ '/', '/rain' ] };