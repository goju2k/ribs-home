'use client';

import { useEffect, useRef } from 'react';

import { NaverMapGl, NaverMapGlRef } from './components/naver-map/NaverMapGl';

export default function Index() {
  return <div style={{ width: '100vw', height: '100vh' }}><Map3d /></div>;
}

function Map3d() {

  const ref = useRef<NaverMapGlRef>(null);
  useEffect(() => {
    console.log('ref', ref.current);
  }, [ ref.current ]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <NaverMapGl ref={ref} ncpKeyId='868psyu6ui' />
    </div>
  );
}