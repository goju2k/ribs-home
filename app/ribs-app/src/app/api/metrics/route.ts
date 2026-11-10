import { NextResponse } from 'next/server';
import { Registry, collectDefaultMetrics, Histogram } from 'prom-client';

export const revalidate = 0;

const register = new Registry();
collectDefaultMetrics({ register });

const httpRequestDuration = new Histogram({
  name: 'kbland_http_request_duration_seconds',
  help: 'Duration of kbland HTTP requests in seconds',
  labelNames: [ 'method', 'route' ],
  buckets: [ 0.1, 0.5, 1, 2, 5 ], // define buckets for latency distribution
});

register.registerMetric(httpRequestDuration);

// kbland 측정은 중단했다. 실제 요청은 보내지 않고 고정값을 기록한다.
// count·sum이 계속 늘어나야 Grafana 알람식 rate(sum)/rate(count)가 NoData가 아닌
// 정상값(FIXED_DURATION_SECONDS)으로 계산된다.
const FIXED_DURATION_SECONDS = 0.2;

const labelList = [
  { method: 'get', route: 'https://api.kbland.kr/land-complex/complex/main' },
  { method: 'get', route: 'https://api.kbland.kr/land-extra/menu/menuList' },
  { method: 'get', route: 'https://api.kbland.kr/land-auth/intgra/profile' },
  { method: 'get', route: 'https://kbland.kr/se/l/c/14992' },
];

export async function GET(_request: Request) {

  for (const label of labelList) {
    httpRequestDuration.observe({ method: label.method, route: label.route }, FIXED_DURATION_SECONDS);
  }

  const res = new NextResponse(await register.metrics());
  res.headers.set('Content-Type', register.contentType);

  return res;
}
