export type NaverMap3d = maplibregl.Map;
export type NaverMap2d = naver.maps.Map;
export type NaverMapType = NaverMap3d | NaverMap2d;

export type NaverMapOption3d = Partial<maplibregl.MapOptions>;

export interface NaverMapProps extends React.PropsWithChildren {
  onLoad?:(map:NaverMapType)=>void;
  option3d?: NaverMapOption3d;
}