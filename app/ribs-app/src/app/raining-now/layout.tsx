import { Metadata } from 'next';

// 개인용으로 만든 앱의 배포 페이지라 검색에 노출하지 않는다 — 루트 기본값(비노출)을 그대로 쓰되,
// 루트가 바뀌어도 이 페이지는 막히도록 여기서도 명시한다. sitemap.ts에도 넣지 않는다.
const SHARE_TITLE = '비올까 — 비가 오기 전에 미리 알려주는 Android 앱';
const SHARE_DESCRIPTION = '기상청 레이더로 내 주변 비구름을 지켜보다가, 비가 다가오면 미리 알려드려요.';
// 공유 미리보기 이미지. 바꿀 땐 파일명도 바꾼다 — 카카오톡 등은 이미지 URL 기준으로 오래 캐시한다.
const SHARE_IMAGE = {
  url: 'https://www.ribs.kr/images/rain/raining-now-og-1200x630.png',
  width: 1200,
  height: 630,
  alt: '비올까 — 다가오는 비를 미리 알려주는 Android 앱',
};

export const metadata:Metadata = {
  title: '비올까 Android 앱',
  description: '내 주변으로 다가오는 비를 미리 알려주는 개인용 Android 앱',
  robots: { index: false, follow: false },
  // 검색 비노출과 별개로, 링크를 직접 공유했을 때(카카오톡·슬랙·X 등) 보이는 미리보기.
  openGraph: {
    type: 'website',
    siteName: 'Ribs Weather',
    locale: 'ko_KR',
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    url: 'https://www.ribs.kr/raining-now',
    images: [ SHARE_IMAGE ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    images: [ SHARE_IMAGE.url ],
  },
};

export default function RainingNowLayout({ children }:{ children:React.ReactNode; }) {
  return children;
}