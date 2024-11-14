import { NextResponse } from 'next/server';

export const revalidate = 0;

export async function GET(_request: Request) {

  const keyResult = {
    src: '',
    time: '',
  };
  const data = await (await fetch('https://www.weather.go.kr/wgis-nuri/dfs/list/TMP', { next: { revalidate: 0 } })).json();
  if (data && data.dfsList) {
    const [ item ] = data.dfsList;
    if (item.fctDate) {
      const key = item.fctDate as string;
      keyResult.src = `https://www.weather.go.kr/wgis-nuri/dfs/VSRT/TMP/${key}/${item.panIndex}`;
      keyResult.time = item.efcDate;
    }
  }

  return NextResponse.json(keyResult);
}