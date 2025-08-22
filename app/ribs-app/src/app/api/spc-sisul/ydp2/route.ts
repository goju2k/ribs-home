import { NextResponse } from 'next/server';

import { getCurrentDate, getNextMonthString, parseSpcSite } from '../parse-site';

export const revalidate = 0;

export async function GET(_request: Request) {
  
  let result = await parseSpcSite('2');
  
  // 22일 지났으면 다음달 것도 체크
  if (getCurrentDate() >= 22) {
    result = [ ...result, ...(await parseSpcSite('2', getNextMonthString())) ];
  }
    
  return NextResponse.json(result);
}