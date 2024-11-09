import axios from 'axios';
import { NextResponse } from 'next/server';

// 60초 캐싱
export const revalidate = 60;

export async function GET(_request: Request) {

  const keyResult = {
    src: '',
    time: '',
  };
  const { data } = await axios.get('https://www.weather.go.kr/wgis-nuri/dfs/list/TMP');
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