import axios, { AxiosResponse } from 'axios';

const regex = /18:00~20:00.*?'(\d{4}-\d{2}-\d{2})'\);\s*">예약가능/g;
const regex2 = /20:00~22:00.*?'(\d{4}-\d{2}-\d{2})'\);\s*">예약가능/g;

export async function parseSpcSite(type:'1'|'2', date?:string) {
  const { data } = await axios.get<any, AxiosResponse<string>>(`https://spc${type === '2' ? '2' : ''}.y-sisul.or.kr/page/rent/rent.od.list.asp${date ? `?sch_sym=${date}` : ''}`);

  const split = data.split('<li>');

  const result = new Set(split.map((s) => {
    const matches = [ ...s.matchAll(regex) ].map((match) => match[1]);
    matches.length > 0 && console.log('matches', s, matches);
    return matches;

  }).flat());

  const result2 = new Set(split.map((s) => {
    const matches = [ ...s.matchAll(regex2) ].map((match) => match[1]);
    matches.length > 0 && console.log('matches2', s, matches);
    return matches;

  }).flat());

  return [ ...Array.from(result), ...Array.from(result2) ];
}

export function getNextMonthString() {
  const now = new Date();
  now.setMonth(now.getMonth() + 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getCurrentDate() {
  const now = new Date();
  const date = now.getUTCDate();
  const h = now.getUTCHours() + 9;
  return h >= 24 ? date + 1 : date;
}