'use client';

import { useEffect, useState } from 'react';
import styled from 'styled-components';

import { NaverMapGl, NaverMapGlRef } from './components/naver-map/NaverMapGl';
import { NaverMarker } from './components/naver-map/overlay/NaverMarker';

export default function Index() {
  return <div style={{ width: '100vw', height: '100vh' }}><Map3d /></div>;
}

function Map3d() {

  const [ map, setMap ] = useState<NaverMapGlRef['map']>();
  useEffect(() => {
    console.log('map', map);
  }, [ map ]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <NaverMapGl
        ref={(r) => {
          setMap(r?.map);
        }}
        ncpKeyId='868psyu6ui'
      >
        <MarkerLayer />
      </NaverMapGl>
    </div>
  );
}

const Pin = styled.div({
  width: '50px',
  height: '50px',
  background: 'red',
});

const PinPoint = styled.div({
  width: '5px',
  height: '5px',
  background: 'lightgreen',
});

function MarkerLayer() {
  return (
    <>
      <NaverMarker option={{ position: new naver.maps.LatLng(37.3595704, 127.105399) }}>
        <Pin />
      </NaverMarker>
      <NaverMarker option={{ position: new naver.maps.LatLng(37.3595704, 127.105399) }}>
        <PinPoint />
      </NaverMarker>
    </>
  );
}