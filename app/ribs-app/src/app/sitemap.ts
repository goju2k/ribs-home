import { MetadataRoute } from 'next';

// 실제로 색인 대상인 라우트만 담는다(/, /rain은 항상 /rain-assist로 리다이렉트되어 그 자체로는
// 콘텐츠가 없으므로 사이트맵에 넣지 않음 — 사이트맵은 리다이렉트가 아니라 최종 canonical URL을
// 안내하는 용도).
export default function sitemap():MetadataRoute.Sitemap {
  return [
    {
      url: 'https://www.ribs.kr/rain-assist',
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1,
    },
  ];
}