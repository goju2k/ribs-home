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
  title: 'Ribs Weather Korea',
  description: '한국의 강수 레이더를 한눈에 확인하세요.',
  // 이 라우트는 항상 /rain-assist로 서버사이드 리다이렉트되어 콘텐츠가 렌더되지 않지만(middleware.ts),
  // 루트 레이아웃의 기본값(비노출)을 여기서도 명시적으로 뒤집어 크롤러가 리다이렉트를 정상적으로
  // 따라가도록 한다.
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    title: 'Ribs Weather',
    url: 'https://www.ribs.kr/rain',
    images: [ 'https://www.ribs.kr/images/rain/rain_og_image.png' ],
  },
};

export default function RainLayout({ children }: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Script id='naver_map_script' type='text/javascript' src='https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=868psyu6ui' />
      {children}
    </>
  );
}