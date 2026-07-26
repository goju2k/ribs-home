import { NextResponse } from 'next/server';

export const revalidate = 0;

// ITS가 cctvType=3(정지 영상)로 실제로 어느 호스트의 URL을 내려주는지는 apiKey 발급 전이라
// 확정하지 못했다 — 지금까지 조사로 확인된 ITS CCTV 영상 호스트를 우선 등록해두고, 키 발급 후
// 정지 영상 응답을 실제로 받아보면서 필요한 호스트를 추가한다. 목록에 없는 호스트는 프록시를
// 거부해 임의 URL을 릴레이하는 오픈 프록시가 되지 않게 한다.
const ALLOWED_CCTV_HOSTS = [ 'cctvsec.ktict.co.kr' ];

// cctvUrl은 /api/rain-assist/cctv/list가 그대로 돌려준 값을 클라이언트가 되돌려주는 것이라
// 별도 ID→URL 매핑 저장소가 필요 없다. 여기서 서버가 대신 fetch해서 릴레이하는 이유는 (1) 허용
// 호스트 화이트리스트를 강제하기 위함, (2) 응답 헤더(캐시 등)를 우리가 통일해서 제어하기 위함 —
// <img> 태그로 단순 표시만 하므로 CORS 자체는 애초에 문제가 되지 않는다.
export async function GET(request:Request) {

  const { searchParams } = new URL(request.url);
  const cctvUrl = searchParams.get('cctvUrl');

  if (!cctvUrl) {
    return NextResponse.json({ error: 'cctvUrl is required' }, { status: 400 });
  }

  let target:URL;
  try {
    target = new URL(cctvUrl);
  } catch {
    return NextResponse.json({ error: 'invalid cctvUrl' }, { status: 400 });
  }

  if (target.protocol !== 'https:' || !ALLOWED_CCTV_HOSTS.includes(target.hostname)) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 403 });
  }

  try {

    const upstream = await fetch(target.toString(), { cache: 'no-store' });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'upstream fetch failed' }, { status: 502 });
    }

    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'no-store',
      },
    });

  } catch (e) {
    console.error('cctv/frame fetch error', e);
    return NextResponse.json({ error: 'fetch error' }, { status: 502 });
  }

}