'use client';

import dynamic from 'next/dynamic';

// yeouido-map-module은 독립 클라이언트 앱 — SSR 없이 브라우저에서만 렌더링한다.
const YeouidoMapPage = dynamic(() => import('yeouido-map-module').then((m) => m.YeouidoMapPage), { ssr: false });

export default function Page() {
  return <YeouidoMapPage />;
}