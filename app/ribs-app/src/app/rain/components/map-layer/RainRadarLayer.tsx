/* eslint-disable @next/next/no-img-element */

import { MapControlWrapper, MapMarkerWrapper, Position, useMintMapController } from '@mint-ui/map';
import { useEffect, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import styled from 'styled-components';
import { Flex } from 'ui-base-pack';

import { MapControlState, useUpdateMapControl } from '../../state/map-controls';
import { getScreenOffset } from '../../util/map-util';
import { buildMesh, forwardUV, MeshTriangle, RADAR_MOSAIC_BOX, uvForLatLng } from '../../util/radarGrid';

// Raw KMA radar mosaic is a 1453x1453 square (see the fetch URL below).
const RADAR_IMAGE_SIZE = 1453;

// A single global affine fit (one matrix for the whole 1453x1453 image) was tried first — exact
// in LCC meters, but this grid spans ~120.6-133 lon / ~30.7-40.2 lat, over which the
// LCC -> lat/lon -> Mercator chain is measurably non-linear. Verified against Naver's own
// projection at real points: a global fit was off by 400-900px near the grid's edges (e.g. Jeju,
// Ulleungdo). Splitting into a mesh and fitting each patch's own local affine keeps every patch
// small enough that the curvature inside it is negligible — checked empirically at ~2-20px of
// residual across the grid at MESH_N=16 (see buildMesh in radarGrid.ts for the triangle split
// that makes adjacent patches agree exactly along their shared edge, not just approximately).
const MESH_N = 16;

// NW corner of RADAR_MOSAIC_BOX, in real lat/lng — used as the geographic anchor Naver positions
// the whole mesh group at. Computed once at module load (RADAR_MOSAIC_BOX is a fixed constant).
const RADAR_NW = forwardUV(RADAR_MOSAIC_BOX, 0, 0);

export function RainRadarLayer() {

  const controller = useMintMapController();

  const [ meshCells, setMeshCells ] = useState<MeshTriangle[] | null>(null);
  const [ imageShow, setImageShow ] = useState(false);

  const handleZoomStart = () => {
    setImageShow(false);
  };

  const handleZoomChanged = () => {

    setMeshCells(buildMesh(controller, RADAR_MOSAIC_BOX, RADAR_IMAGE_SIZE, MESH_N));
    setImageShow(true);

    // 현재위치 대기상태
    updateControl('askPosition', false);

  };

  useEffect(() => {

    handleZoomChanged();
    controller.addEventListener('ZOOMSTART', handleZoomStart);
    controller.addEventListener('ZOOM_CHANGED', handleZoomChanged);

    return () => {
      controller.removeEventListener('ZOOMSTART', handleZoomStart);
      controller.removeEventListener('ZOOM_CHANGED', handleZoomChanged);
    };

  }, []);

  const [ radarStartPosition ] = useState(new Position(RADAR_NW.lat, RADAR_NW.lng));

  const [ tmBefore, setTmBefore ] = useState(4);
  const [ tm, setTm ] = useState(getTime(tmBefore));

  const { opacity, currPosition, temperatureFlag } = useRecoilValue(MapControlState);
  const updateControl = useUpdateMapControl();
  useEffect(() => {
    updateControl('tmText', `${tm.substring(4, 6)}월 ${tm.substring(6, 8)}일 ${tm.substring(8, 10)}시 ${tm.substring(10, 12)}분`);
  }, [ tm ]);

  const imageRef = useRef<HTMLImageElement>(null);
  const [ imgLoaded, setImgLoaded ] = useState(false);
  const { color } = useRainValue({
    imgElement: imageRef.current,
    imgLoaded,
  });

  return (
    <>

      {!temperatureFlag && imgLoaded && (
        <>
          <MapControlWrapper positionHorizontal='left' positionVertical='bottom'>
            {(!!LegendsMap.get(color) && (
              <MapLegendContainer style={{ margin: '0 0 20px 10px' }}>
                <Flex flexfit>
                  <Flex flexfit>
                    <LegendItem style={{ width: '10px', background: color, opacity }} />
                    <LegendItem>{LegendsMap.get(color)} mm/h</LegendItem>
                  </Flex>
                </Flex>
              </MapLegendContainer>
            )
            )}
          </MapControlWrapper>
          <MapControlWrapper width='100%' height='100%' disablePointerEvent>
            <Flex flexalign='center'>
              <Point style={{ borderWidth: '1px', width: '8px', height: '8px', background: '#65ff78', borderColor: '#109500' }} />
            </Flex>
          </MapControlWrapper>
        </>
      )}

      {!temperatureFlag && (
        <MapControlWrapper positionHorizontal='right' positionVertical='bottom'>
          <MapLegendContainer>
            <Flex flexrow flexgap='4px'>
              <Flex>
                {Legends.map(([ color ], idx) => <LegendItem key={`legend-item-${idx}`} style={{ width: '10px', background: color, opacity }} />)}
              </Flex>
              <Flex flexfit>
                {Legends.map(([ , value ], idx) => <LegendItem key={`legend-item-value-${idx}`}>{value}</LegendItem>)}
              </Flex>
            </Flex>
            <Flex flexfit style={{ fontSize: '12px' }}>mm/h</Flex>
          </MapLegendContainer>
        </MapControlWrapper>
      )}

      {imageShow && meshCells && (
        <MapMarkerWrapper position={radarStartPosition} disablePointerEvent>
          <div style={{ position: 'relative', width: 0, height: 0 }}>
            {/*
              Each *triangle* (2 per mesh cell — see buildMesh in radarGrid.ts for why cells are
              split this way) is a cellSize x cellSize div using the radar PNG as a CSS background
              (same URL as the hidden loader <img> below — the browser shares the one decoded
              bitmap, no re-download/re-decode per triangle). background-position shifts that
              background so the div's own local (0,0) lines up with this cell's source pixel
              (srcX,srcY) — that's what makes local (0,0)..(cellSize,cellSize) the right input
              space for matrix(a,b,c,d,e,f). clip-path polygon(...) then masks the div down to just
              this triangle's half of the cell, in that same local space, before the transform runs.

              A `clip-path: inset(...)` crop on the *full* 1453x1453 image (one element per cell,
              no triangle split) was tried first — but clip-path doesn't rebase the element's own
              coordinate origin, so the transform was still being fed each cell's *absolute*
              image-space position instead of a cell-local one, and every cell landed off by a
              growing amount the farther it sat from the image's own top-left corner.

              A single <canvas> covering the whole image was tried even before that — sized to the
              parallelogram's bounding box, which at anything past city-level zoom exceeds the
              browser's canvas pixel-buffer limit and silently drops the draw. CSS transforms on
              DOM elements have no such cap (the compositor only rasterizes what's visible), so
              this stays correct — and, unlike canvas, still cheap — at any zoom.
            */}
            {meshCells.map((tri) => (
              <div
                key={tri.key}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: `${tri.cellSizePx}px`,
                  height: `${tri.cellSizePx}px`,
                  backgroundImage: `url(https://vapi.kma.go.kr/BUFD/rdr_sfc_pty_img_${tm}_1453.png)`,
                  backgroundSize: `${RADAR_IMAGE_SIZE}px ${RADAR_IMAGE_SIZE}px`,
                  backgroundPosition: `${-tri.srcX}px ${-tri.srcY}px`,
                  backgroundRepeat: 'no-repeat',
                  clipPath: `polygon(${tri.clipPoints.map(([x, y]) => `${x}px ${y}px`).join(', ')})`,
                  transformOrigin: '0 0',
                  transform: `matrix(${tri.matrix.a}, ${tri.matrix.b}, ${tri.matrix.c}, ${tri.matrix.d}, ${tri.originX}, ${tri.originY})`,
                  opacity,
                }}
              />
            ))}
          </div>
          {/* Not displayed — only decoded here so onLoad/onError and useRainValue's pixel sampler have a source. */}
          <img
            crossOrigin='anonymous'
            ref={imageRef}
            src={`https://vapi.kma.go.kr/BUFD/rdr_sfc_pty_img_${tm}_1453.png`}
            alt=''
            style={{ display: 'none' }}
            onLoad={() => setImgLoaded(true)}
            onError={() => {
              if (tmBefore < 30) {

                const nextBefore = tmBefore + 5;
                setTmBefore(nextBefore);

                const time = getTime(nextBefore);
                setTm(time);

              }
            }}
          />
        </MapMarkerWrapper>
      )}

      {currPosition && (
        <MapMarkerWrapper position={currPosition}>
          <>
            <ArrowImgMarker
              src='/images/rain/marker_arrow.png'
              alt='The position of the marker'
              style={{ position: 'absolute', transform: 'translate(-50%, -150%)', opacity: 0.8 }}
            />
            <Point />
          </>
        </MapMarkerWrapper>
      )}

      {/* 기준점 가이드라인 */}
      {/* {pos.current.map((p, idx) => (
        <MapMarkerWrapper position={p} key={idx}>
          <div style={{
            width: '24px',
            height: '24px', 
            background: 'lightgray',
            fontSize: 12,
            textAlign: 'center',
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)', 
          }}
          >
            {`p${idx}`}
          </div>
        </MapMarkerWrapper>
      ))} */}

      {/* <PolygonMarker
        position={pos.current} 
        mode='POLYLINE'
      /> */}
        
    </>
  );
}

const Point = styled.div({
  position: 'absolute', 
  width: '12px',
  height: '12px', 
  background: '#ff6565',
  border: '2px solid red',
  borderRadius: '50%',
  transform: 'translate(-50%, -50%)', 
});

const ArrowImgMarker = styled.img`
  @keyframes arrow-bounce {
    0% {
      transform: translate(-50%, -150%);
    }
    50% {
      transform: translate(-50%, -200%);
    }
    100% {
      transform: translate(-50%, -150%);
    }
  }
  animation: arrow-bounce 1s infinite;
`;

function getTime(minuteBefore?:number) {
  let now = new Date();
  if (minuteBefore) {
    now = new Date(now.setMinutes(now.getMinutes() - minuteBefore));
  }
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}`;
}

const MapLegendContainer = styled.div({
  background: 'white',
  border: '1px solid gray',
  borderRadius: '8px', 
  padding: '5px', 
  marginBottom: '20px',
  marginRight: '10px',
  fontSize: '14px',
});
const LegendItem = styled.div({ height: '14px', fontSize: '12px' });

const Legends:[string, number][] = [
  [ 'rgb(51, 51, 51)', 110 ],
  [ 'rgb(0, 3, 144)', 90 ],
  [ 'rgb(76, 78, 177)', 80 ],
  [ 'rgb(179, 180, 222)', 70 ],
  [ 'rgb(147, 0, 228)', 60 ],
  [ 'rgb(179, 41, 255)', 50 ],
  [ 'rgb(201, 105, 255)', 40 ],
  [ 'rgb(224, 169, 255)', 30 ],
  [ 'rgb(180, 0, 0)', 25 ],
  [ 'rgb(210, 0, 0)', 20 ],
  [ 'rgb(255, 50, 0)', 15 ],
  [ 'rgb(255, 102, 0)', 10 ],
  [ 'rgb(204, 170, 0)', 9 ],
  [ 'rgb(224, 185, 0)', 8 ],
  [ 'rgb(249, 205, 0)', 7 ],
  [ 'rgb(255, 220, 31)', 6 ],
  [ 'rgb(255, 225, 0)', 5 ],
  [ 'rgb(0, 90, 0)', 4 ],
  [ 'rgb(0, 140, 0)', 3 ],
  [ 'rgb(0, 190, 0)', 2 ],
  [ 'rgb(0, 255, 0)', 1 ],
  [ 'rgb(0, 51, 245)', 0.5 ],
  [ 'rgb(0, 155, 245)', 0.1 ],
  [ 'rgb(0, 200, 255)', 0 ],
];

const LegendsMap = new Map<string, number>(Legends);

interface RainValueHookProps {
  imgElement: HTMLImageElement|null;
  imgLoaded: boolean;
}
function useRainValue({ imgElement, imgLoaded }:RainValueHookProps) {

  const controller = useMintMapController();

  const [ center, setCenter ] = useState(controller.getCenter());
  const [ centerPx, setCenterPx ] = useState(getScreenOffset(controller, controller.getCenter()));
  const [ color, setColor ] = useState('');

  const canvas = useRef(document.createElement('canvas'));
  const ctx = useRef(canvas.current.getContext('2d'));

  if (imgElement && imgLoaded) {
    // Natural size, not the element's on-screen (CSS-transformed) box — draws it undistorted so
    // pixel (x,y) here means the same thing as (u,v) in the affine fit below.
    canvas.current.width = imgElement.naturalWidth;
    canvas.current.height = imgElement.naturalHeight;
    ctx.current && (ctx.current.imageSmoothingEnabled = false);
    ctx.current?.drawImage(imgElement, 0, 0);
  }

  function getPixelColor(x:number, y:number) {

    if (!ctx.current) {
      return '';
    }

    // Get image data for the specified pixel
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= canvas.current.width || y >= canvas.current.height) {
      return '';
    }

    const pixelData = ctx.current.getImageData(x, y, 1, 1).data;

    // Extract the RGBA values
    const red = pixelData[0];
    const green = pixelData[1];
    const blue = pixelData[2];
    // const alpha = pixelData[3]; // 0 (transparent) to 255 (opaque)

    return `rgb(${red}, ${green}, ${blue})`;
  }

  const centerChanged:Parameters<typeof controller.addEventListener>[1] = ({ param }) => {

    // 센터 계산
    const c = param.center;
    const offset = getScreenOffset(controller, c);
    setCenter(c);
    setCenterPx(offset);

    if (!imgElement || !imgLoaded) {
      return;
    }

    // 센터의 이미지내에서의 좌표 계산 — exact, via the map center's real lat/lng projected
    // straight into the grid's own LCC box (see radarGrid.ts). No screen-space affine or its
    // approximation error involved here at all: uvForLatLng is a closed-form inverse, not a fit.
    const { u, v } = uvForLatLng(RADAR_MOSAIC_BOX, { lat: c.lat, lng: c.lng });

    // 컬러 결정
    const color = getPixelColor(u * imgElement.naturalWidth, v * imgElement.naturalHeight);
    setColor(color);

  };

  useEffect(() => {
    controller.addEventListener('IDLE', centerChanged);
    return () => {
      controller.removeEventListener('IDLE', centerChanged);
    };

  }, [ imgLoaded ]);

  return {
    center,
    centerPx,
    color,
  };

}