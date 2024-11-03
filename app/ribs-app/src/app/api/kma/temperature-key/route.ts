import axios from 'axios';
import { NextResponse } from 'next/server';

export async function GET() {

  let keyResult = null;
  const { data } = await axios.get('https://www.weather.go.kr/wgis-nuri/dfs/list/TMP');
  if (data && data.dfsList) {
    const [ item ] = data.dfsList;
    if (item.fctDate) {
      const key = item.fctDate as string;
      keyResult = `https://www.weather.go.kr/wgis-nuri/dfs/VSRT/TMP/${key}/0`;
    }
  }

  return NextResponse.json(keyResult);
}