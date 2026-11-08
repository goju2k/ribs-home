import { Metadata } from 'next';

// 개인용으로 만든 앱의 배포 페이지라 검색에 노출하지 않는다 — 루트 기본값(비노출)을 그대로 쓰되,
// 루트가 바뀌어도 이 페이지는 막히도록 여기서도 명시한다. sitemap.ts에도 넣지 않는다.
export const metadata:Metadata = {
  title: '비올까 Android 앱',
  description: '내 주변으로 다가오는 비를 미리 알려주는 개인용 Android 앱',
  robots: { index: false, follow: false },
};

export default function BiolkkaLayout({ children }:{ children:React.ReactNode; }) {
  return children;
}