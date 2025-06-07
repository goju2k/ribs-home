import { NextResponse } from 'next/server';
import { Registry, collectDefaultMetrics } from 'prom-client';

export const revalidate = 0;

const register = new Registry();
collectDefaultMetrics({ register });

export async function GET(_request: Request) {

  const res = new NextResponse(await register.metrics());
  res.headers.set('Content-Type', register.contentType);
  return res;
}