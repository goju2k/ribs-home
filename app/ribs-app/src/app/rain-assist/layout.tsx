/* eslint-disable @next/next/no-sync-scripts */
import { Metadata, Viewport } from 'next';
import Script from 'next/script';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const SHARE_TITLE = 'Ribs Weather — 실시간 강수 레이더';
const SHARE_DESCRIPTION = '내 위치로 다가오는 비를 미리 확인하세요.';
// 검색 결과 미리보기 문구. 지도 화면의 조작용 글자(범례 숫자, 컨트롤 이름)는 page.tsx에서 data-nosnippet으로
// 빼 두었으니, 구글이 이 문장을 쓰도록 하는 페이지 설명이다.
const SEARCH_DESCRIPTION = '기상청 실시간 강수 레이더로 지금 내 주변 비구름과 다가오는 비를 지도에서 확인하세요. '
  + '내 위치 바로가기, 기온, 도로 CCTV 실시간 영상도 볼 수 있어요.';

// 검색엔진이 읽는 서비스 정보(JSON-LD).
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Ribs Weather 실시간 강수 레이더',
  url: 'https://www.ribs.kr/rain-assist',
  description: SEARCH_DESCRIPTION,
  applicationCategory: 'WeatherApplication',
  operatingSystem: 'Any',
  inLanguage: 'ko',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
};
const SHARE_IMAGE = {
  url: 'https://www.ribs.kr/images/rain/rain-assist-og-1200x630.png',
  width: 1200,
  height: 630,
  alt: 'Ribs Weather — 내 위치 주변 강수 레이더와 도로 CCTV',
};

export const metadata:Metadata = {
  title: 'Ribs Weather Korea - 강수 예보',
  description: SEARCH_DESCRIPTION,
  // /rain-assist가 메인 페이지가 되면서(옛 /rain은 여기로 서버사이드 리다이렉트) ?webview=true 같은
  // 쿼리스트링 변형이 별도로 색인되지 않도록 자기 자신을 canonical로 명시해둔다.
  alternates: { canonical: '/rain-assist' },
  // 루트 레이아웃의 기본값(비노출)을 여기서만 명시적으로 뒤집는다 — 실제로 공개할 라우트.
  robots: { index: true, follow: true },
  // 공유 미리보기(카카오톡·슬랙·X 등). 이미지를 바꿀 땐 파일명도 바꾼다 — 카카오톡 등은 이미지 URL 기준으로
  // 오래 캐시해서 같은 이름으로 덮어쓰면 옛 미리보기가 계속 뜬다.
  openGraph: {
    type: 'website',
    siteName: 'Ribs Weather',
    locale: 'ko_KR',
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    url: 'https://www.ribs.kr/rain-assist',
    images: [ SHARE_IMAGE ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    images: [ SHARE_IMAGE.url ],
  },
};

export default function RainAssistLayout({ children }: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <Script id='naver_map_script' type='text/javascript' src='https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=868psyu6ui' />
      {children}
    </>
  );
}