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
export function uvForLatLng(box: Box, point: LatLng): { u: number; v: number; } {
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
  /** Size of the element drawn for this triangle: the cell plus a bleed margin on every side. */
  boxWidthPx: number;
  boxHeightPx: number;
  /** Source-image pixel at the element's local (0,0). */
  srcX: number;
  srcY: number;
  /** Triangle vertices in the element's local pixel space, for clip-path. */
  clipPoints: readonly [number, number][];
  matrix: AffineMatrix;
  /** Where the element's local (0,0) lands, in screen px relative to the whole grid's NW anchor. */
  originX: number;
  originY: number;
}

// Each triangle is drawn this many screen px bigger on every side so neighbours overlap a little.
// Exactly-abutting triangles still showed their shared edges as faint lines: each element
// anti-aliases its own clip edge, and two half-covered pixels stacked don't add up to an opaque
// one, so the map showed through along every mesh edge. The overlap is the same image content
// (neighbouring affine fits agree to well under a pixel), so it's invisible.
const BLEED_SCREEN_PX = 0.75;

/**
 * Turns one triangle of a cell (vertices in cell-local px; the cell is `cellW` x `cellH`) into the
 * element to draw: grown by BLEED_SCREEN_PX on every edge (a homothety about the incenter moves
 * every edge out by the same distance), on a box with enough margin to hold the grown triangle.
 */
function bleedTriangle(
  key: string,
  cellW: number,
  cellH: number,
  srcX: number,
  srcY: number,
  vertices: [number, number][],
  incenter: [number, number],
  matrix: AffineMatrix,
  originX: number,
  originY: number,
): MeshTriangle {
  const scale = Math.sqrt(Math.abs((matrix.a * matrix.d) - (matrix.b * matrix.c))) || 1;
  const bleed = Math.min(BLEED_SCREEN_PX / scale, Math.min(cellW, cellH) * 0.1);
  // Inradius of a right triangle with legs cellW, cellH.
  const inradius = (cellW + cellH - Math.hypot(cellW, cellH)) / 2;
  const k = (inradius + bleed) / inradius;
  const margin = Math.ceil(bleed * 2) + 1;
  return {
    key,
    boxWidthPx: cellW + (2 * margin),
    boxHeightPx: cellH + (2 * margin),
    srcX: srcX - margin,
    srcY: srcY - margin,
    clipPoints: vertices.map(([ x, y ]) => [
      incenter[0] + ((x - incenter[0]) * k) + margin,
      incenter[1] + ((y - incenter[1]) * k) + margin,
    ] as [number, number]),
    matrix,
    // The element's local origin is the cell's (-margin, -margin).
    originX: originX - ((matrix.a + matrix.c) * margin),
    originY: originY - ((matrix.b + matrix.d) * margin),
  };
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
/** A screen-space rectangle in map-container px. */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * @param visible when given, only cells overlapping this map-container rectangle are emitted —
 *   lets a fine mesh stay cheap at street-level zoom, where only a handful of its cells are on
 *   screen at all.
 */
export function buildMesh(controller: MintMapController, box: Box, size: number, meshN: number, visible?: ScreenRect): MeshTriangle[] {
  // Cell edges on whole source pixels (cells are 90 or 91 px for 1453/16). With size/meshN
  // (90.8125) every cell's background-position was fractional, which the browser snaps to a whole
  // pixel — shifting that cell's content by up to half a source pixel (~350 m), measured at
  // ~200-350 m on screen against Naver's own projection of the same points.
  const edges = Array.from({ length: meshN + 1 }, (_, i) => Math.round((i * size) / meshN));

  const gridOffset: { x: number; y: number; }[][] = [];
  for (let j = 0; j <= meshN; j++) {
    gridOffset[j] = [];
    for (let i = 0; i <= meshN; i++) {
      const ll = forwardUV(box, edges[i] / size, edges[j] / size);
      gridOffset[j][i] = getOffset(controller, new Position(ll.lat, ll.lng));
    }
  }

  const anchor = gridOffset[0][0];
  // Anchor-relative from here on, so matrix translation terms are directly usable as CSS
  // transform e/f (the whole mesh group is itself positioned at the anchor via MapMarkerWrapper).
  const rel = (p: { x: number; y: number; }) => ({ x: p.x - anchor.x, y: p.y - anchor.y });

  const triangles: MeshTriangle[] = [];
  for (let j = 0; j < meshN; j++) {
    for (let i = 0; i < meshN; i++) {
      const corners = [ gridOffset[j][i], gridOffset[j][i + 1], gridOffset[j + 1][i], gridOffset[j + 1][i + 1] ];
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      const offscreen = !!visible && (Math.max(...xs) < visible.left || Math.min(...xs) > visible.right
        || Math.max(...ys) < visible.top || Math.min(...ys) > visible.bottom);
      if (!offscreen) {
        const nw = rel(gridOffset[j][i]);
        const ne = rel(gridOffset[j][i + 1]);
        const sw = rel(gridOffset[j + 1][i]);
        const se = rel(gridOffset[j + 1][i + 1]);
        const srcX = edges[i];
        const srcY = edges[j];
        const w = edges[i + 1] - edges[i];
        const h = edges[j + 1] - edges[j];
        const r = (w + h - Math.hypot(w, h)) / 2;

        triangles.push(bleedTriangle(
          `${meshN}-${i}-${j}-nw`,
          w,
          h,
          srcX,
          srcY,
          [[ 0, 0 ], [ w, 0 ], [ 0, h ]],
          [ r, r ],
          {
            a: (ne.x - nw.x) / w,
            b: (ne.y - nw.y) / w,
            c: (sw.x - nw.x) / h,
            d: (sw.y - nw.y) / h,
          },
          nw.x,
          nw.y,
        ));

        // 3-point affine solved for T(NE_local)=ne, T(SE_local)=se, T(SW_local)=sw, using SW as
        // the pivot: e = sw.x - c*h simplifies to sw.x - (se.x - ne.x), same for f/y.
        triangles.push(bleedTriangle(
          `${meshN}-${i}-${j}-se`,
          w,
          h,
          srcX,
          srcY,
          [[ w, 0 ], [ w, h ], [ 0, h ]],
          [ w - r, h - r ],
          {
            a: (se.x - sw.x) / w,
            b: (se.y - sw.y) / w,
            c: (se.x - ne.x) / h,
            d: (se.y - ne.y) / h,
          },
          sw.x - (se.x - ne.x),
          sw.y - (se.y - ne.y),
        ));
      }
    }
  }
  return triangles;
}