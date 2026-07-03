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
  openGraph: {
    type: 'website',
    title: 'Ribs Weather - 강수 예보',
    url: 'http://www.ribs.kr/rain-assist',
    images: [ 'http://www.ribs.kr/images/rain/rain_og_image.png' ],
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