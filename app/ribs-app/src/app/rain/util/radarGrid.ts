import { MintMapController, Position } from '@mint-ui/map';

import { LatLng, projectLcc, unprojectLcc } from './lcc';
import { getOffset } from './map-util';

export interface Box {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/**
 * KMA's own declared extent for this radar mosaic, in LCC meters — read directly from
 * `window.mapInfo['radar.extent']` on weather.go.kr (their kmap client exposes it verbatim).
 * Ground truth, not a derived approximation: fitting the same box from this file's 4 hardcoded
 * corners (via fitBox below) lands a few thousand meters short on each edge — small next to the
 * whole ~1,024km grid, but enough to shift a rendered rain cell by 2-3km, which is what the mesh
 * was doing before this was wired in directly. Use this over fitBox(hardcoded corners) wherever
 * possible.
 */
export const RADAR_MOSAIC_BOX: Box = {
  xMin: -440000.00000000227,
  yMin: 3797382.7212162036,
  xMax: 584000.0000000008,
  yMax: 4821382.721216239,
};

/**
 * Fits the radar grid's axis-aligned box in LCC meters from its 4 corners — same approach as the
 * Android app's QuadMapper. The corners look like a tilted quad in raw lat/lon (NW and NE don't
 * even share a latitude), but that's a projection artifact: reprojected into LCC meters they line
 * up into a rectangle to within ~0.03% of its size. Kept for reference/testing — prefer
 * RADAR_MOSAIC_BOX (exact) over this (a fit from approximate hardcoded corners) when both are available.
 */
export function fitBox(sw: LatLng, nw: LatLng, ne: LatLng, se: LatLng): Box {
  const pSW = projectLcc(sw.lat, sw.lng);
  const pNW = projectLcc(nw.lat, nw.lng);
  const pNE = projectLcc(ne.lat, ne.lng);
  const pSE = projectLcc(se.lat, se.lng);
  return {
    xMin: (pSW.x + pNW.x) / 2,
    xMax: (pNE.x + pSE.x) / 2,
    yMin: (pSW.y + pSE.y) / 2,
    yMax: (pNW.y + pNE.y) / 2,
  };
}

/** u: 0 (west edge) -> 1 (east edge). v: 0 (north edge) -> 1 (south edge). */
export function forwardUV(box: Box, u: number, v: number): LatLng {
  const x = box.xMin + u * (box.xMax - box.xMin);
  const y = box.yMax - v * (box.yMax - box.yMin);
  return unprojectLcc(x, y);
}

/** Exact — no reprojection error — the inverse of forwardUV, for locating a real point in the grid. */
export function uvForLatLng(box: Box, point: LatLng): { u: number; v: number } {
  const p = projectLcc(point.lat, point.lng);
  return {
    u: (p.x - box.xMin) / (box.xMax - box.xMin),
    v: (box.yMax - p.y) / (box.yMax - box.yMin),
  };
}

export interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface MeshTriangle {
  key: string;
  cellSizePx: number;
  srcX: number;
  srcY: number;
  /** Triangle vertices in this cell's own local pixel space (0,0 = cell's NW), for clip-path. */
  clipPoints: readonly [number, number][];
  matrix: AffineMatrix;
  /** This triangle's cell's NW corner, in screen px relative to the whole grid's NW anchor. */
  originX: number;
  originY: number;
}

/**
 * A single global affine (a,b,c,d from just 3 corners) is exact in LCC meters but this grid spans
 * ~120.6-133 lon, ~30.7-40.2 lat — over that range the LCC->lat/lon->Mercator chain is measurably
 * non-linear (verified: a global fit was off by ~400-900px at real screen points near the grid's
 * edges). Splitting into an NxN mesh and fitting each cell's own local affine from its own corners
 * keeps each patch small enough that the curvature within it is negligible.
 *
 * Each quad cell is further split into 2 triangles (NW,NE,SW and NE,SE,SW, sharing the NE-SW
 * diagonal) rather than fit as one quad from just 3 of its 4 corners. A quad's 4th corner (the one
 * left out of a 3-point fit) is only ever *approximately* where that fit predicts — verified
 * directly against Naver's own projection, this leaves adjacent cells disagreeing along their
 * shared edge by ~2-20px (worse away from the grid's anchor corner), which shows up as visible
 * overlap/gaps ("찢어짐") between cells on a smooth rain cell. Two triangles per cell fixes this
 * exactly, not just smaller: an affine map sends straight lines to straight lines and preserves
 * linear interpolation along them, so if two triangles both correctly place their 2 *shared*
 * corners, the entire shared edge between them — cell-to-cell, and the two halves of one cell —
 * coincides exactly, not just at the corners.
 */
export function buildMesh(controller: MintMapController, box: Box, size: number, meshN: number): MeshTriangle[] {
  const cellSize = size / meshN;

  const gridOffset: { x: number; y: number }[][] = [];
  for (let j = 0; j <= meshN; j++) {
    gridOffset[j] = [];
    for (let i = 0; i <= meshN; i++) {
      const ll = forwardUV(box, i / meshN, j / meshN);
      gridOffset[j][i] = getOffset(controller, new Position(ll.lat, ll.lng));
    }
  }

  const anchor = gridOffset[0][0];
  // Anchor-relative from here on, so matrix translation terms are directly usable as CSS
  // transform e/f (the whole mesh group is itself positioned at the anchor via MapMarkerWrapper).
  const rel = (p: { x: number; y: number }) => ({ x: p.x - anchor.x, y: p.y - anchor.y });

  const triangles: MeshTriangle[] = [];
  for (let j = 0; j < meshN; j++) {
    for (let i = 0; i < meshN; i++) {
      const nw = rel(gridOffset[j][i]);
      const ne = rel(gridOffset[j][i + 1]);
      const sw = rel(gridOffset[j + 1][i]);
      const se = rel(gridOffset[j + 1][i + 1]);
      const srcX = i * cellSize;
      const srcY = j * cellSize;

      triangles.push({
        key: `${i}-${j}-nw`,
        cellSizePx: cellSize,
        srcX,
        srcY,
        clipPoints: [[0, 0], [cellSize, 0], [0, cellSize]],
        matrix: {
          a: (ne.x - nw.x) / cellSize,
          b: (ne.y - nw.y) / cellSize,
          c: (sw.x - nw.x) / cellSize,
          d: (sw.y - nw.y) / cellSize,
        },
        originX: nw.x,
        originY: nw.y,
      });

      triangles.push({
        key: `${i}-${j}-se`,
        cellSizePx: cellSize,
        srcX,
        srcY,
        clipPoints: [[cellSize, 0], [cellSize, cellSize], [0, cellSize]],
        matrix: {
          a: (se.x - sw.x) / cellSize,
          b: (se.y - sw.y) / cellSize,
          c: (se.x - ne.x) / cellSize,
          d: (se.y - ne.y) / cellSize,
        },
        // 3-point affine solved for T(NE_local)=ne, T(SE_local)=se, T(SW_local)=sw, using SW as
        // the pivot: e = sw.x - c*cellSize simplifies to sw.x - (se.x - ne.x), same for f/y.
        originX: sw.x - (se.x - ne.x),
        originY: sw.y - (se.y - ne.y),
      });
    }
  }
  return triangles;
}
