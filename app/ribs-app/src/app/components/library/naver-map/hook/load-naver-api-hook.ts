import { useEffect, useState } from 'react';

import { loadNaverMapApi } from '../script/load-naver-map-api';

export function useNaverApi(mapKey:string) {
  
  const [ loaded, setLoaded ] = useState(false);

  useEffect(() => {

    loadNaverMapApi({
      scriptParams: { ncpClientId: mapKey },
      scriptUrl: 'https://oapi.map.naver.com/openapi/v3/maps.js',
    }).then((apiLoaded) => {
      setLoaded(apiLoaded);
    });

  });

  return [ loaded ];

}