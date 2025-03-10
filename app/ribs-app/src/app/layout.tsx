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
    <html lang='en'>
      <head>
        <link rel='stylesheet' as='style' crossOrigin='' href='https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css' />
        <link rel='shortcut icon' href='./favicon.ico' type='image/x-icon' />
        <meta name='robots' content='noindex, nofollow' />
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