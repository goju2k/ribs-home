/* eslint-disable @next/next/no-sync-scripts */
import { GoogleAnalytics, GoogleTagManager } from '@next/third-parties/google';
import { Metadata, Viewport } from 'next';

import { StyledComponentsRegistry } from './registry';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata:Metadata = {
  metadataBase: new URL('http://www.ribs.kr'),
  title: 'ribs home',
  description: 'welcome to ribs home',
  openGraph: {
    type: 'website',
    title: 'ribs home',
    url: 'http://www.ribs.kr',
  },
};

export default function RootLayout({ children }: {
  children: React.ReactNode;
}) {
  return (
    <html lang='en'>
      <head>
        <link rel='stylesheet' as='style' crossOrigin='' href='https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css' />
        <meta name='robots' content='noindex, nofollow' />
      </head>
      <body>
        <StyledComponentsRegistry>{children}</StyledComponentsRegistry>
        <GoogleTagManager gtmId={process.env.NEXT_PUBLIC_GA_ID} />
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
      </body>
    </html>
  );
}