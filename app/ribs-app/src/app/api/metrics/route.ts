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

const labelList = [
  // complex: main
  {
    method: 'get',
    route: 'https://api.kbland.kr/land-complex/complex/main',
    test: 'https://api.kbland.kr/land-complex/complex/main?%EB%8B%A8%EC%A7%80%EA%B8%B0%EB%B3%B8%EC%9D%BC%EB%A0%A8%EB%B2%88%ED%98%B8=13859',
  },
  // extra: menuList
  {
    method: 'get',
    route: 'https://api.kbland.kr/land-extra/menu/menuList',
    test: 'https://api.kbland.kr/land-extra/menu/menuList',
  },
  // auth: profile
  {
    method: 'get',
    route: 'https://api.kbland.kr/land-auth/intgra/profile',
    test: 'https://api.kbland.kr/land-auth/intgra/profile',
  },
  // next.js: link
  {
    method: 'get',
    route: 'https://kbland.kr/se/l/c/14992',
    test: 'https://kbland.kr/se/l/c/14992',
  },
];

export async function GET(_request: Request) {

  try {
    
    for (let i = 0; i < labelList.length; i++) {

      const label = labelList[i];
      await (async () => {
  
        const end = httpRequestDuration.startTimer({ method: label.method, route: label.route });
    
        await axios.get(label.test);
    
        end();
    
      })();

    }
    
  } catch (e) {
    console.log('e', e);
  }

  const res = new NextResponse(await register.metrics());
  res.headers.set('Content-Type', register.contentType);
  
  return res;
}