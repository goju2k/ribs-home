import { Metadata } from 'next';
import { headers } from 'next/headers';

const TITLE = '여의도 3D — 줄어드는 여의도에서 끝까지 살아남아라';
const DESCRIPTION = '진짜 여의도 지도 위 픽셀 배틀로얄. 20분 동안 좁아지는 전장에서 무기를 줍고 강화해 최종 보스를 쓰러뜨려라. 설치 없이 휴대폰·PC 브라우저에서 바로 플레이.';
/** 카카오톡 스크랩은 80·443 포트만 허용 → 이미지는 미리보기 서버(:3100)가 아니라 늘 운영 주소에서 */
const IMAGE = 'https://www.ribs.kr/images/yeouido-3d/og.jpg';

/**
 * 공유 미리보기(카카오톡·슬랙·X 등): og:url은 요청이 들어온 호스트 기준 (미리보기 서버에서 공유해도 그 주소로),
 * 이미지는 운영에 올려 둔 한 장.
 */
export async function generateMetadata():Promise<Metadata> {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'www.ribs.kr';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') || host.includes(':') ? 'http' : 'https');
  const base = `${proto}://${host}`;
  const url = `${base}/yeouido-3d`;
  const image = { url: IMAGE, width: 1200, height: 630, alt: '여의도 3D — 픽셀 도시 위로 좁아지는 전장' };
  return {
    title: '여의도 3D',
    description: DESCRIPTION,
    openGraph: {
      type: 'website',
      siteName: 'Ribs Home',
      locale: 'ko_KR',
      title: TITLE,
      description: DESCRIPTION,
      url,
      images: [ image ],
    },
    twitter: {
      card: 'summary_large_image',
      title: TITLE,
      description: DESCRIPTION,
      images: [ image.url ],
    },
  };
}

export default function Yeouido3DLayout({ children }: {
  children: React.ReactNode;
}) {
  return children;
}