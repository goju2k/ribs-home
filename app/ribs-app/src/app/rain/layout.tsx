/* eslint-disable @next/next/no-sync-scripts */
import { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata:Metadata = {
  title: 'Ribs Weather Korea',
  description: '한국의 강수 레이더를 한눈에 확인하세요.',
  openGraph: {
    type: 'website',
    title: 'Ribs Weather',
    url: 'http://www.ribs.kr/rain',
    images: [ 'http://www.ribs.kr/images/rain/rain_og_image.png' ],
  },
};

export default function RainLayout({ children }: {
  children: React.ReactNode;
}) {
  return (
    <>{children}</>
  );
}