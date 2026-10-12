'use client';

import dynamic from 'next/dynamic';

// hukuoka-map-module은 독립 클라이언트 앱 — SSR 없이 브라우저에서만 렌더링한다.
const HukuokaMapPage = dynamic(() => import('hukuoka-map-module').then((m) => m.HukuokaMapPage), { ssr: false });

export default function Page() {
  return <HukuokaMapPage />;
}