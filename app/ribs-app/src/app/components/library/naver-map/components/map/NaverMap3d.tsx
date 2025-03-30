import axios from 'axios';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import styled from 'styled-components';

import { NaverMapProps } from './naver-map-types';

import { NaverMapForLibre } from '../../../map-libre/naver-map-for-libre';

export const NaverMap3d = forwardRef<maplibregl.Map|undefined, NaverMapProps>(({
  onLoad, 
  option3d,
  children, 
}, ref) => {
  const container = useRef(null);

  const [ map, setMap ] = useState<maplibregl.Map>();
  const mapRef = useRef<maplibregl.Map>();

  useEffect(() => {

    (async () => {

      if (container.current) {
        
        const { data } = await axios.get('https://nrbe.pstatic.net/styles/basic.json?fmt=png');
          
        const mapInstance = new NaverMapForLibre(
          {
            container: container.current, // container id
            center: [ 127.15744426154328, 37.62122112865127 ], // starting position [lng, lat]
            zoom: 16, // starting zoom,
            pixelRatio: window.devicePixelRatio,
            ...option3d,
          },
          { tiles: data.tiles },
        );

        mapRef.current = mapInstance;
        setMap(mapInstance);
          
        onLoad && onLoad(mapInstance);
          
      }

    })();

    return () => {
      mapRef.current && mapRef.current.remove();
    };

  }, []);

  useImperativeHandle(ref, () => mapRef.current, [ map ]);

  return (
    <>
      {/* Map */}
      <MapLibreContainer
        ref={container}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
      {children}
      <NaverLogo />
    </>
  );
});

NaverMap3d.displayName = 'NaverMap3d';

const MapLibreContainer = styled.div`
  .maplibregl-ctrl {
      display: none !important;
  }
`;

const NaverLogoContainer = styled.div`
position: absolute; z-index: 100; margin: 0px; padding: 0px; pointer-events: none; bottom: 0px; right: 0px;
`;
const NaverLogoBox = styled.div`
border: 0px none; margin: 0px; padding: 0px; pointer-events: none; float: right; height: 17px;
`;
const NaverLogoLink = styled.a`
display: block; width: 45px; height: 10px; overflow: hidden; margin: 0px 5px 7px 12px; pointer-events: auto;
`;
const NaverLogoImage = styled.img`
display:block;width:45px;height:10px;overflow:hidden;border:0 none;margin:0;padding:0;max-width:none !important;max-height:none !important;min-width:0 !important;min-height:0 !important;
`;
function NaverLogo() {
  return (
    <NaverLogoContainer>
      <NaverLogoBox>
        <NaverLogoLink href='https://ssl.pstatic.net/static/maps/mantle/notice/legal.html' target='_blank'>
          <NaverLogoImage src='https://ssl.pstatic.net/static/maps/mantle/1x/naver-logo-normal-new.png' width='45' height='10' alt='NAVER' />
        </NaverLogoLink>
      </NaverLogoBox>
    </NaverLogoContainer>
  );
}