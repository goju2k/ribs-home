/* eslint-disable @next/next/no-sync-scripts */
import { GoogleTagManager } from '@next/third-parties/google';
import { Metadata, Viewport } from 'next';

import { StyledComponentsRegistry } from './registry';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata:Metadata = {
  metadataBase: new URL('https://www.ribs.kr'),
  title: 'Ribs Home',
  description: 'Welcome to Ribs Home',
  // 기본값은 비노출 — /rain, /rain-assist 등 실제로 공개할 라우트만 각자의 layout.tsx에서
  // robots: { index: true, follow: true }로 명시적으로 덮어쓴다. 그 외(budget/card/map3d/places 등
  // 내부 실험용 라우트)는 이 기본값을 그대로 물려받아 자동으로 비노출 상태를 유지한다.
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    title: 'Ribs Home',
    url: 'https://www.ribs.kr',
  },
};

export default function RootLayout({ children }: {
  children: React.ReactNode;
}) {
  return (
    <html lang='ko'>
      <head>
        <link rel='stylesheet' as='style' crossOrigin='' href='https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css' />
        <link rel='shortcut icon' href='./favicon.ico' type='image/x-icon' />
      </head>
      <body>
        <StyledComponentsRegistry>{children}</StyledComponentsRegistry>
        {
          <GoogleTagManager
            gtmId={process.env.NEXT_PUBLIC_GA_ID}
          />
        // <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        }
      </body>
    </html>
  );
}