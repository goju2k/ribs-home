import { createContext, PropsWithChildren, useContext, useState } from 'react';

import { NaverMapProps, NaverMapType } from './components/map/naver-map-types';
import { NaverMap2d } from './components/map/NaverMap2d';
import { NaverMap3d } from './components/map/NaverMap3d';
import { useNaverApi } from './hook/load-naver-api-hook';

export const KBLandNaverMapContext = createContext<NaverMapType|undefined>(undefined);

export function useKBLandNaverMap<T>() {
  const map = useContext(KBLandNaverMapContext);
  return map as T;
}

export type KBLandNaverMapOption = Omit<NaverMapProps, 'children'>;
export interface KBLandNaverMapProps extends PropsWithChildren {
  mapKey: string;
  mode?: '3d'|'2d';
  mapOption?: KBLandNaverMapOption;
}

export function KBLandNaverMap({ mapKey, mode = '3d', mapOption = {}, children }:KBLandNaverMapProps) {

  const [ map, setMap ] = useState<NaverMapType>();
  const [ loaded ] = useNaverApi(mapKey);

  const MapComponent = mode === '3d' ? NaverMap3d : NaverMap2d;

  return (
    <KBLandNaverMapContext.Provider value={map}>
      {
        loaded && (
          <MapComponent ref={(ref) => setMap(ref as NaverMapType)} {...mapOption}>
            {children}
          </MapComponent>
        )
      }
    </KBLandNaverMapContext.Provider>
  );

}