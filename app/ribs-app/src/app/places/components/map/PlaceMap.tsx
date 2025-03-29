import { createContext, useContext, useState } from 'react';

import { KBLandNaverMap, KBLandNaverMapOption } from '../../../components/library/naver-map/KBLandNaverMap';
import { Building3dLayer } from '../map-layer/Building3dLayer';

export const LibreMapContext = createContext<maplibregl.Map|undefined>(undefined);

export function useLibreMap() {
  const map = useContext(LibreMapContext);
  return map;
}

export function PlaceMap() {
  
  const [ mapOption3d ] = useState<KBLandNaverMapOption['option3d']>({
    center: [ 127.15744426154328, 37.62122112865127 ], // starting position [lng, lat]
    zoom: 16, // starting zoom,
  });
  
  return (
    <KBLandNaverMap
      mapKey='yc2mrw1mz8'
      mode='3d'
      mapOption={{ option3d: mapOption3d }}
    >
      <Building3dLayer />
    </KBLandNaverMap>
  );
}