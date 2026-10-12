export type PlaceIcon =
  | 'airport'
  | 'hotel'
  | 'cafe'
  | 'mall'
  | 'ramen'
  | 'station'
  | 'shrine'
  | 'kaisendon'
  | 'shop'
  | 'udon'
  | 'yatai'
  | 'meeting'
  | 'rest'
  | 'onsen'
  | 'roundhouse'
  | 'village'
  | 'inari'
  | 'sushi';

export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  icon: PlaceIcon;
  /** 한국 장소 — 실제 거리 대신 후쿠오카 근처에 축약 배치 */
  korea?: boolean;
  /** 좌표가 번지 단위로 확인되지 않은 추정값 */
  estimated?: boolean;
}

// 좌표 출처: OpenStreetMap Nominatim 검색 결과 + 사용자가 준 구글맵 링크(류구조, 스시 하카타 하나)
export const PLACES:Place[] = [
  { id: 'icn', name: '인천공항', lat: 37.4635, lng: 126.4417, icon: 'airport', korea: true },
  { id: 'fuk', name: '후쿠오카 공항', lat: 33.584, lng: 130.437, icon: 'airport', estimated: true },
  { id: 'hotel', name: '숙소', lat: 33.5876, lng: 130.412, icon: 'hotel', estimated: true },
  { id: 'kirby', name: '커비카페 하카타', lat: 33.5906, lng: 130.4106, icon: 'cafe' },
  { id: 'canal', name: '캐널시티 하카타', lat: 33.5897, lng: 130.4111, icon: 'mall' },
  { id: 'ramen', name: '라멘스타디움', lat: 33.5892, lng: 130.411, icon: 'ramen' },
  { id: 'hakata', name: '하카타역', lat: 33.59, lng: 130.4199, icon: 'station' },
  { id: 'lawson', name: '치쿠시구치 로손', lat: 33.5906, lng: 130.4222, icon: 'meeting' },
  { id: 'yodobashi', name: '요도바시 카메라', lat: 33.5882, lng: 130.4217, icon: 'shop' },
  { id: 'sushi', name: '스시 하카타 하나', lat: 33.58916, lng: 130.42268, icon: 'sushi' },
  { id: 'jrFutsukaichi', name: '후쓰카이치역', lat: 33.4944, lng: 130.5188, icon: 'station' },
  { id: 'dazaifu', name: '다자이후 텐만구', lat: 33.5215, lng: 130.535, icon: 'shrine' },
  { id: 'ryuguujo', name: '카이센동 류구조', lat: 33.51974, lng: 130.53368, icon: 'kaisendon' },
  { id: 'nishiFutsukaichi', name: '니시테쓰후쓰카이치역', lat: 33.5022, lng: 130.5178, icon: 'station' },
  { id: 'tenjin', name: '니시테쓰후쿠오카역', lat: 33.5893, lng: 130.3994, icon: 'station' },
  { id: 'biccamera', name: '빅카메라 텐진1호점', lat: 33.5876, lng: 130.3986, icon: 'shop' },
  { id: 'west', name: '웨스트 카와바타점', lat: 33.5934, lng: 130.4088, icon: 'udon' },
  { id: 'yatai', name: '나카스 포장마차 거리', lat: 33.5925, lng: 130.406, icon: 'yatai' },
  { id: 'kusu', name: '쿠스휴게소', lat: 33.282, lng: 131.1169, icon: 'rest' },
  { id: 'yufuin', name: '유후인', lat: 33.265, lng: 131.36, icon: 'onsen' },
  { id: 'bungomori', name: '분고모리 기관고', lat: 33.2811, lng: 131.1586, icon: 'roundhouse' },
  { id: 'ukihaTown', name: '우키하 마을', lat: 33.341, lng: 130.7522, icon: 'village' },
  { id: 'ukihaInari', name: '우키하 이나리', lat: 33.323, lng: 130.7917, icon: 'inari' },
];

export const PLACE_BY_ID:Record<string, Place> = Object.fromEntries(PLACES.map((p) => [ p.id, p ]));