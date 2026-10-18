// 1453px 전국 합성 레이더 이미지의 네 꼭짓점 [SW, NW, NE, SE] (lat, lon).
// KMA가 자기 지도에서 이 이미지를 놓는 범위(weather.go.kr kmap.bb.js mapInfo["radar.extent"],
// LCC +lat_1=30 +lat_2=60 +lat_0=0 +lon_0=126 기준 [-440000, 3797382.72, 584000, 4821382.72] m)의
// 꼭짓점을 proj4로 역투영한 값 — 웹 오버레이(rain/util/radarGrid.ts RADAR_MOSAIC_BOX)와 앱
// (QuadMapper.KMA_COMPOSITE)이 쓰는 범위와 같다. 예전 값(RainRadarLayer의 손으로 맞춘 꼭짓점)은
// 가장자리마다 2~5km 안쪽이라 앱이 위치를 5~6km 어긋나게 읽는 원인이었다(2026-10-18 교체).
export const RADAR_CORNERS:[number, number][] = [
  [ 30.8307337014, 121.3822799316 ],
  [ 40.2180210186, 120.6673707651 ],
  [ 40.1145721996, 133.0699038769 ],
  [ 30.7433705101, 132.1238084067 ],
];