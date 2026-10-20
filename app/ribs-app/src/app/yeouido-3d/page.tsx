'use client';

import dynamic from 'next/dynamic';

// yeouido-3d-module은 독립 클라이언트 앱 — SSR 없이 브라우저에서만 렌더링한다.
const Yeouido3DPage = dynamic(() => import('yeouido-3d-module').then((m) => m.Yeouido3DPage), { ssr: false });

export default function Page() {
  return <Yeouido3DPage />;
}