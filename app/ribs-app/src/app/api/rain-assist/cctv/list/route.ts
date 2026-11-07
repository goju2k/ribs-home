import { NextResponse } from 'next/server';

export const revalidate = 0;

const ITS_CCTV_URL = 'https://openapi.its.go.kr:9443/cctvInfo';
const MAX_RESULTS = 200;

interface ItsCctvItem {
  cctvname?:string;
  coordx?:string;
  coordy?:string;
  cctvurl?:string;
}

interface ItsCctvResponse {
  // 범위 안 카메라가 하나뿐이면 배열이 아니라 객체 하나로 온다.
  response?:{ data?:ItsCctvItem[] | ItsCctvItem; };
}

export interface CctvListItem {
  name:string;
  lat:number;
  lng:number;
  // HLS 실시간 영상(https). 브라우저가 직접 재생한다 — ITS 영상 서버가 CORS *를 주므로 프록시 불필요.
  streamUrl:string;
}

// its.go.kr에 apiKey 발급 신청 중(승인 대기) — 키가 배포 환경에 없는 동안은 ITS를 호출하지 않고
// 조용히 빈 목록을 반환한다(에러 아님). 나중에 Jenkins가 ITS_API_KEY를 주입하면 재배포만으로,
// 코드 변경 없이 자동으로 라이브된다.
export async function GET(request:Request) {

  const { searchParams } = new URL(request.url);
  const minX = searchParams.get('minX');
  const maxX = searchParams.get('maxX');
  const minY = searchParams.get('minY');
  const maxY = searchParams.get('maxY');

  if (!minX || !maxX || !minY || !maxY) {
    return NextResponse.json({ cctvs: [] }, { status: 400 });
  }

  const apiKey = process.env.ITS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ cctvs: [] });
  }

  try {

    const [ highway, national ] = await Promise.all([
      fetchItsCctv(apiKey, 'ex', minX, maxX, minY, maxY),
      fetchItsCctv(apiKey, 'its', minX, maxX, minY, maxY),
    ]);

    return NextResponse.json({ cctvs: [ ...highway, ...national ].slice(0, MAX_RESULTS) });

  } catch (e) {
    console.error('cctv/list fetch error', e);
    return NextResponse.json({ cctvs: [] }, { status: 502 });
  }

}

async function fetchItsCctv(apiKey:string, type:'ex' | 'its', minX:string, maxX:string, minY:string, maxY:string):Promise<CctvListItem[]> {

  // cctvType=4: 실시간 영상 HLS(https). 2026-11-08 확인: 정지 영상(cctvType=3)의 이미지 URL은 영상 서버가
  // 모든 요청에 403을 돌려주게 됐다(목록은 정상). 같은 카메라의 HLS는 정상이고 https라 웹뷰/브라우저에서
  // 그대로 재생된다(https://its.go.kr/opendata/opendataList?service=cctv 요청변수 표 참고).
  const url = `${ITS_CCTV_URL}?apiKey=${apiKey}&type=${type}&cctvType=4&minX=${minX}&maxX=${maxX}&minY=${minY}&maxY=${maxY}&getType=json`;
  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    return [];
  }

  const json = await res.json() as ItsCctvResponse;
  // 응답 감싸는 구조(response.data가 CCTV 배열)는 공식 문서 예제와 커뮤니티 파싱 예제로 확인한
  // 값이며, 실제 키로 최종 검증 전이다 — 형태가 다르면 아래에서 빈 배열로 조용히 걸러진다.
  const data = json.response?.data ?? [];
  const items = Array.isArray(data) ? data : [ data ];

  return items
    .filter((item):item is ItsCctvItem & { cctvurl:string; coordx:string; coordy:string; } => !!item.cctvurl?.startsWith('https://') && !!item.coordx && !!item.coordy)
    .map((item) => ({
      name: item.cctvname ?? '이름 없음',
      lat: Number(item.coordy),
      lng: Number(item.coordx),
      streamUrl: item.cctvurl,
    }));

}