import axios, { AxiosResponse } from 'axios';
import { NextResponse } from 'next/server';

export const revalidate = 0;

const regex = /18:00~20:00.*?'(\d{4}-\d{2}-\d{2})'\);\s*">예약가능/g;
export async function GET(_request: Request) {
  
  const { data } = await axios.get<any, AxiosResponse<string>>('https://spc2.y-sisul.or.kr/page/rent/rent.od.list.asp');

  const split = data.split('<li>');

  const result = new Set(split.map((s) => {
    const matches = [ ...s.matchAll(regex) ].map((match) => match[1]);
    matches.length > 0 && console.log('matches', s, matches);
    return matches;

  }).flat());
  
  return NextResponse.json(Array.from(result));
}