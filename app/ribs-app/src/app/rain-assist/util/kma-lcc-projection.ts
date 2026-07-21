import proj4 from 'proj4';

// weather.go.kr(기상청 날씨누리) 자체 페이지가 레이더 이미지를 그리는 데 실제로 쓰는 값 그대로 —
// /w/weather/radar/rain.do가 로드하는 kmap.bb.js를 직접 받아 확인함:
//   var PROJ = 'EPSG:980201';
//   mapInfo["EPSG:980201"] = "+proj=lcc +lat_1=30 +lat_2=60 +lat_0=0 +lon_0=126 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs";
//   mapInfo["radar.extent"] = [-440000.00000000227, 3797382.7212162036, 584000.0000000008, 4821382.721216239];
//   kmap.prototype.setRadar = function (RADAR) {
//     this.addStaticLayer(this._RADAR, this._mapInfo["radar.extent"], RADAR); // RADAR.urls[i] = rdr_sfc_pty_img_*_1453.png와 동일 소스
//   };
//   kmap.prototype.addStaticLayer = function (_THIS, extent, option) {
//     sources[i] = new ol.source.ImageStatic({ url: option.urls[i], projection: PROJ, imageExtent: extent });
//     ...
//   };
// 즉 기상청은 원본 PNG를 "LCC(EPSG:980201) 좌표계에서 이 extent를 정확히 채우는 직사각형"으로
// 취급해 OpenLayers의 ol.source.ImageStatic에 등록하고, 화면 투영으로의 변환은 OpenLayers가
// 픽셀 단위로 정확히 수행한다. 우리는 네이버지도를 쓰므로 OpenLayers 자체는 재사용할 수 없지만,
// 동일한 투영 공식(proj4)과 동일한 extent를 그대로 써서 "픽셀 -> 위경도"를 근사 없이 정확히
// 계산할 수 있다 — RADAR_CORNERS 4점을 bilinear로 보간하던 이전 방식(약 5~7km 오차)보다 정확함.
const KMA_LCC_DEF = '+proj=lcc +lat_1=30 +lat_2=60 +lat_0=0 +lon_0=126 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs';
const KMA_LCC_CODE = 'KMA:LCC980201';

proj4.defs(KMA_LCC_CODE, KMA_LCC_DEF);

// mapInfo["radar.extent"] — [minX, minY, maxX, maxY], 미터, KMA LCC(EPSG:980201) 좌표계.
// 국가 합성 레이더(rdr_sfc_pty_img 계열)가 쓰는 정확한 값.
export const RADAR_EXTENT_METERS:[number, number, number, number] = [
  -440000.00000000227, 3797382.7212162036, 584000.0000000008, 4821382.721216239,
];

export interface LatLng {
  lat:number;
  lng:number;
}

// 이미지 픽셀 (px,py) — (0,0)이 좌상단(=extent의 (minX,maxY))인 표준 이미지 좌표계 — 을 위경도로.
// 래스터 자체가 LCC 좌표계에서 정확한 직사각형으로 만들어지므로 픽셀->LCC(x,y)는 단순 선형
// 변환이고, LCC(x,y)->위경도만 proj4의 실제 투영 공식(근사 없음)을 쓴다.
export function lccPixelToLatLng(px:number, py:number, width:number, height:number):LatLng {
  const [ minX, minY, maxX, maxY ] = RADAR_EXTENT_METERS;
  const x = minX + ((px / width) * (maxX - minX));
  const y = maxY - ((py / height) * (maxY - minY));
  const [ lng, lat ] = proj4(KMA_LCC_CODE, 'WGS84', [ x, y ]);
  return { lat, lng };
}

// 위경도 -> 이미지 픽셀 (px,py) 역변환. warpToLatLngRectangle이 출력 캔버스의 각 픽셀(위경도
// 선형 격자)마다 "원본의 어느 픽셀을 샘플링해야 하는지" 구하는 데 쓰인다.
export function latLngToLccPixel(point:LatLng, width:number, height:number):{ px:number; py:number; } {
  const [ minX, minY, maxX, maxY ] = RADAR_EXTENT_METERS;
  const [ x, y ] = proj4('WGS84', KMA_LCC_CODE, [ point.lng, point.lat ]);
  return {
    px: ((x - minX) / (maxX - minX)) * width,
    py: ((maxY - y) / (maxY - minY)) * height,
  };
}