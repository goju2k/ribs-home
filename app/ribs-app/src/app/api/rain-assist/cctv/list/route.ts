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
  response?:{ data?:ItsCctvItem[]; };
}

export interface CctvListItem {
  name:string;
  lat:number;
  lng:number;
  cctvUrl:string;
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

  // cctvType=3: 정지 영상 — ITS가 스트림이 아니라 정지 이미지 URL을 직접 내려주므로 프레임 추출이
  // 필요 없다(https://its.go.kr/opendata/opendataList?service=cctv 요청변수 표 확인).
  const url = `${ITS_CCTV_URL}?apiKey=${apiKey}&type=${type}&cctvType=3&minX=${minX}&maxX=${maxX}&minY=${minY}&maxY=${maxY}&getType=json`;
  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    return [];
  }

  const json = await res.json() as ItsCctvResponse;
  // 응답 감싸는 구조(response.data가 CCTV 배열)는 공식 문서 예제와 커뮤니티 파싱 예제로 확인한
  // 값이며, 실제 키로 최종 검증 전이다 — 형태가 다르면 아래에서 빈 배열로 조용히 걸러진다.
  const items = json.response?.data ?? [];

  return items
    .filter((item):item is ItsCctvItem & { cctvurl:string; coordx:string; coordy:string; } => !!item.cctvurl && !!item.coordx && !!item.coordy)
    .map((item) => ({
      name: item.cctvname ?? '이름 없음',
      lat: Number(item.coordy),
      lng: Number(item.coordx),
      cctvUrl: item.cctvurl,
    }));

}