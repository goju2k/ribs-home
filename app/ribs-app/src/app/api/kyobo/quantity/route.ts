import axios, { AxiosResponse } from 'axios';
import { NextResponse } from 'next/server';

export const revalidate = 0;

export async function GET(_request: Request) {
  
  const { data } = await axios.get<unknown, AxiosResponse<{data:[];}>>('https://product.kyobobook.co.kr/api/gw/pdt/product/S000218735457/location-inventory', { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36' } });
  console.log('data', `${data}`);
  return NextResponse.json(data.data);
}