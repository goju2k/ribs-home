import { createContext, useContext, useState } from 'react';

import { MapLibre, MapLibreOptions } from '../../../components/library/map-libre/MapLibre';
import { Building3dLayer } from '../map-layer/Building3dLayer';

export const LibreMapContext = createContext<maplibregl.Map|undefined>(undefined);

export function useLibreMap() {
  const map = useContext(LibreMapContext);
  return map;
}

export function PlaceMap() {
  
  const mode = new URLSearchParams(window.location.search).get('mode') as 'demo'|'naver';
  
  const [ map, setMap ] = useState<maplibregl.Map>();
  const [ mapOption ] = useState<MapLibreOptions>({
    center: [ 127.15744426154328, 37.62122112865127 ], // starting position [lng, lat]
    zoom: 16, // starting zoom,
  });
  
  const handleMapLoad = (mapInstance:maplibregl.Map) => {

    setMap(mapInstance);

  };

  return (
    <LibreMapContext.Provider value={map}>
      <MapLibre 
        type={mode || 'naver'}
        onLoad={handleMapLoad}
        options={mapOption}
      >

        <Building3dLayer />
        
      </MapLibre>
    </LibreMapContext.Provider>
  );
}