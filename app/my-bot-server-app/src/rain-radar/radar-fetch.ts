import axios from 'axios';

// KMA가 실제 브라우저가 아닌 요청을 거부/차단하는 것을 방지하기 위한 실제 브라우저 User-Agent
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 클라이언트(RainRadarLayer.tsx)의 getTime과 동일한 5분 버킷 로직
export function getTime(minuteBefore?:number):string {
  let now = new Date();
  if (minuteBefore) {
    now = new Date(now.setMinutes(now.getMinutes() - minuteBefore));
  }
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}`;
}

export interface FetchedRadarPng {
  tm:string;
  png:Buffer;
}

// 클라이언트와 동일하게 최신 이미지가 아직 없을 경우 5분씩 최대 30분 전까지 재시도
export async function fetchRadarPng(tmBefore = 4):Promise<FetchedRadarPng> {

  const tm = getTime(tmBefore);
  const url = `https://vapi.kma.go.kr/BUFD/rdr_sfc_pty_img_${tm}_1453.png`;

  try {
    const { data } = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': USER_AGENT },
    });
    return { tm, png: Buffer.from(data) };
  } catch (e) {
    if (tmBefore < 30) {
      return fetchRadarPng(tmBefore + 5);
    }
    throw e;
  }

}