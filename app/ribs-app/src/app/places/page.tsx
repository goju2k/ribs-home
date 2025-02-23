'use client';

import { MapLibre } from '../components/library/map-libre/MapLibre';

export default function PlacePage() {
  return (
    <>
      <Place />
    </>
  );
}

function Place() {

  const mode = new URLSearchParams(window.location.search).get('mode') as 'demo'|'naver';

  return (
    <>
      <MapLibre type={mode || 'naver'} />
    </>
  );
}