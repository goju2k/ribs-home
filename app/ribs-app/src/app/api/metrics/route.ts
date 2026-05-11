import axios from 'axios';
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

const label = {
  method: 'get',
  route: 'https://api.kbland.kr/land-complex/complex/main',
};

export async function GET(_request: Request) {

  const res = new NextResponse(await register.metrics());
  res.headers.set('Content-Type', register.contentType);

  const end = httpRequestDuration.startTimer(label);

  await axios.get('https://api.kbland.kr/land-complex/complex/main?%EB%8B%A8%EC%A7%80%EA%B8%B0%EB%B3%B8%EC%9D%BC%EB%A0%A8%EB%B2%88%ED%98%B8=13859');

  end(label);

  return res;
}