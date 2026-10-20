'use client';

import { useMemo, useRef, useState } from 'react';
import styled from 'styled-components';

import { decodeGrid } from './data/decode';
import { BAKED } from './data/yeouido-baked';
import { useGalmuriFont } from './hooks/use-galmuri-font';
import { compose } from './render/compose';
import { MapCanvas, MapCanvasHandle } from './ui/MapCanvas';
import { Panel, PIXEL_FONT, PixelButton } from './ui/pixel';

const isNightNow = () => {
  const h = new Date().getHours();
  return h >= 19 || h < 6;
};

export function YeouidoMapPage() {
  useGalmuriFont();
  const grid = useMemo(decodeGrid, []);
  const composite = useMemo(() => compose(grid), [ grid ]);
  const [ night, setNight ] = useState(isNightNow);
  const [ labels, setLabels ] = useState(true);
  const mapRef = useRef<MapCanvasHandle>(null);

  return (
    <Root>
      <MapCanvas ref={mapRef} grid={grid} composite={composite} night={night} showLabels={labels} />
      <TopBar>
        <Title>
          <b>여의도 픽셀맵</b>
          <Sub>PoC · 1도트 = {BAKED.metersPerDot}m · 건물 {grid.buildings.length - 1}동</Sub>
        </Title>
        <Buttons>
          <PixelButton $active={!night} onClick={() => setNight(false)}>낮</PixelButton>
          <PixelButton $active={night} onClick={() => setNight(true)}>밤</PixelButton>
          <PixelButton $active={labels} onClick={() => setLabels((v) => !v)}>이름</PixelButton>
          <PixelButton onClick={() => mapRef.current?.fitAll()}>전체</PixelButton>
        </Buttons>
      </TopBar>
      <Attribution href='https://www.openstreetmap.org/copyright' target='_blank' rel='noreferrer'>
        © OpenStreetMap contributors
      </Attribution>
    </Root>
  );
}

const Root = styled.div({
  position: 'fixed',
  inset: 0,
  overflow: 'hidden',
  background: '#0b0e22',
  userSelect: 'none',
});

const TopBar = styled(Panel)({
  position: 'absolute',
  top: 10,
  left: 10,
  right: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 10px',
  flexWrap: 'wrap',
});

const Title = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  b: { fontFamily: 'Galmuri14, sans-serif', fontSize: 14, fontWeight: 'normal', color: '#ffd84a' },
});

const Sub = styled.span({ color: '#b9bfe0' });

const Buttons = styled.div({ display: 'flex', gap: 6 });

const Attribution = styled.a({
  position: 'absolute',
  right: 6,
  bottom: 6,
  padding: '2px 6px',
  fontFamily: PIXEL_FONT,
  fontSize: 10,
  color: '#e6e6ee',
  background: 'rgba(11,14,34,0.7)',
  textDecoration: 'none',
});