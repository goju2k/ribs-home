export type NaverMapType = maplibregl.Map | naver.maps.Map;

export interface NaverMapProps extends React.PropsWithChildren {
  onLoad?:(map:NaverMapType)=>void;
  option3d?: Partial<maplibregl.MapOptions>;
}