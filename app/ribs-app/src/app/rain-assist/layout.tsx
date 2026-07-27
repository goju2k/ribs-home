/* eslint-disable @next/next/no-sync-scripts */
import { Metadata, Viewport } from 'next';
import Script from 'next/script';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata:Metadata = {
  title: 'Ribs Weather Korea - 강수 예보',
  description: '내 위치로 다가오는 비를 미리 확인하세요.',
  // /rain-assist가 메인 페이지가 되면서(옛 /rain은 여기로 서버사이드 리다이렉트) ?webview=true 같은
  // 쿼리스트링 변형이 별도로 색인되지 않도록 자기 자신을 canonical로 명시해둔다.
  alternates: { canonical: '/rain-assist' },
  // 루트 레이아웃의 기본값(비노출)을 여기서만 명시적으로 뒤집는다 — 실제로 공개할 라우트.
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    title: 'Ribs Weather - 강수 예보',
    url: 'https://www.ribs.kr/rain-assist',
    images: [ 'https://www.ribs.kr/images/rain/rain_og_image.png' ],
  },
};

export default function RainAssistLayout({ children }: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Script id='naver_map_script' type='text/javascript' src='https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=868psyu6ui' />
      {children}
    </>
  );
}