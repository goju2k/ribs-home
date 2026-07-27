import { MetadataRoute } from 'next';

// 실제 노출 대상 제어는 페이지별 metadata.robots(index/follow)로 하고, 여기서는 요청대로
// 구글/네이버 두 크롤러에 대해서만 명시적으로 크롤링을 허용한다. 크롤링 허용과 색인 허용은
// 별개라 여기서 disallow를 걸면 오히려 크롤러가 noindex 태그를 못 보고 URL만 색인할 수 있어
// (전형적인 robots.txt vs meta noindex 혼동), 비노출 라우트는 robots.txt가 아니라 각 layout.tsx의
// robots: { index: false }로 막는다.
export default function robots():MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: 'Googlebot', allow: '/' },
      { userAgent: 'Yeti', allow: '/' },
    ],
    sitemap: 'https://www.ribs.kr/sitemap.xml',
  };
}