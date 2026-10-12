/* eslint-disable no-continue, no-restricted-syntax, no-nested-ternary -- 프레임 그리기 루프 — 화면 밖 요소 건너뛰기에 continue 사용 */
import { Camera, OVERVIEW_SCALE, toScreen, Viewport } from './camera';
import { daylight, skyColor } from './daylight';
import { BADGE_H, BADGE_W, FAMILY, getBadge, getFamilyFrame, getVehicle } from './sprites';

import { PLACES } from '../data/places';
import { SCHEDULE } from '../data/schedule';
import { tripTimeToParts } from '../data/time';
import { Point } from '../geo/projection';
import { Path, pointAlong, World } from '../geo/world';
import { TravelerState } from '../timeline/position';
import { ClusterImage } from '../world/terrain';

export interface CloudSprite {
  x: number;
  y: number;
  speed: number;
  canvas: HTMLCanvasElement;
}

export interface FrameInput {
  ctx: CanvasRenderingContext2D;
  vp: Viewport;
  cam: Camera;
  world: World;
  images: ClusterImage[];
  clouds: CloudSprite[];
  state: TravelerState;
  t: number;
  realMs: number;
}

const FONT = '11px Galmuri11, sans-serif';
const FONT_BIG = '14px Galmuri14, sans-serif';
const TRAIL_COLOR = '#ff5a4e';

// 구역 대표 이름 (축소 화면용) — 구역에 포함된 장소 id로 찾는다
const CLUSTER_NAMES:[string, string][] = [
  [ 'icn', '인천' ],
  [ 'hakata', '후쿠오카 시내' ],
  [ 'dazaifu', '다자이후' ],
  [ 'kusu', '쿠스' ],
  [ 'yufuin', '유후인' ],
  [ 'bungomori', '분고모리' ],
  [ 'ukihaTown', '우키하' ],
  [ 'ukihaInari', '우키하 이나리' ],
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a:Rect, b:Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function outlinedText(ctx:CanvasRenderingContext2D, text:string, x:number, y:number, font = FONT, fill = '#ffffff', stroke = '#1d1d33') {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, Math.round(x), Math.round(y));
  ctx.fillStyle = fill;
  ctx.fillText(text, Math.round(x), Math.round(y));
}

/** 경로를 화면 위 네모 점들로 (도트 느낌의 점선) */
function dotsAlong(ctx:CanvasRenderingContext2D, pts:Point[], spacing:number, size:number, color:string) {
  ctx.fillStyle = color;
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let d = carry;
    while (d <= len) {
      const k = d / len;
      ctx.fillRect(Math.round(a.x + (b.x - a.x) * k - size / 2), Math.round(a.y + (b.y - a.y) * k - size / 2), size, size);
      d += spacing;
    }
    carry = d - len;
  }
}

/** 경로의 0~ratio 부분 */
function partialPath(path:Path, ratio:number):Point[] {
  if (ratio >= 1) return path.points;
  const target = ratio * path.length;
  const out:Point[] = [ path.points[0] ];
  for (let i = 1; i < path.points.length; i++) {
    if (path.cumulative[i] >= target) {
      out.push(pointAlong(path, ratio).point);
      break;
    }
    out.push(path.points[i]);
  }
  return out;
}

export function renderFrame({ ctx, vp, cam, world, images, clouds, state, t, realMs }:FrameInput) {
  const { w: W, h: H } = vp;
  const { minuteOfDay, day } = tripTimeToParts(t);
  const { night, sunset } = daylight(minuteOfDay);
  const s = cam.scale;
  const scr = (p:Point) => toScreen(cam, vp, p);
  ctx.imageSmoothingEnabled = false;

  // 하늘
  ctx.fillStyle = skyColor(night, sunset);
  ctx.fillRect(0, 0, W, H);

  // 구름 (섬 아래로 흘러감)
  const { bounds } = world;
  const spanX = bounds.maxX - bounds.minX + 800;
  ctx.globalAlpha = 0.85 - night * 0.55;
  for (const c of clouds) {
    const x = bounds.minX - 400 + ((((c.x - bounds.minX + 400 + (realMs / 1000) * c.speed) % spanX) + spanX) % spanX);
    const p = scr({ x, y: c.y });
    const cw = c.canvas.width * s;
    const ch = c.canvas.height * s;
    if (p.x + cw < 0 || p.y + ch < 0 || p.x > W || p.y > H) continue;
    ctx.drawImage(c.canvas, p.x, p.y, cw, ch);
  }
  ctx.globalAlpha = 1;

  // 섬(구역) — 그림자 → 지형
  const visible = images.filter((img) => {
    const p = scr({ x: img.x0, y: img.y0 });
    return p.x < W && p.y < H && p.x + img.w * s > 0 && p.y + img.h * s > 0;
  });
  const shadowOff = Math.max(3, s * 3);
  for (const img of visible) {
    const p = scr({ x: img.x0, y: img.y0 });
    ctx.drawImage(img.shadow, p.x + shadowOff * 0.6, p.y + shadowOff, img.w * s, img.h * s);
  }
  for (const img of visible) {
    const p = scr({ x: img.x0, y: img.y0 });
    ctx.drawImage(img.canvas, p.x, p.y, img.w * s, img.h * s);
  }

  // 밤/노을 색조 + 창문 불빛
  if (sunset > 0) {
    ctx.fillStyle = `rgba(255,130,60,${0.16 * sunset})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (night > 0) {
    ctx.fillStyle = `rgba(14,18,58,${0.5 * night})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = night;
    for (const img of visible) {
      const p = scr({ x: img.x0, y: img.y0 });
      ctx.drawImage(img.lights, p.x, p.y, img.w * s, img.h * s);
    }
    ctx.globalAlpha = 1;
  }

  // 오늘의 경로: 앞으로 갈 길은 흰 점선, 지나온 길은 빨간 자취
  const todayMoves = world.moves.filter((m, i) => m && (tripTimeToParts(m.segment.start).day === day || i === state.segmentIndex));
  for (const m of todayMoves) {
    if (!m) continue;
    const pts = m.path.points.map(scr);
    dotsAlong(ctx, pts, 7, 3, night > 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.85)');
  }
  for (const m of todayMoves) {
    if (!m || m.segment.start > t) continue;
    const ratio = m.segment.end <= t ? 1 : (t - m.segment.start) / (m.segment.end - m.segment.start);
    dotsAlong(ctx, partialPath(m.path, ratio).map(scr), 4, 3, TRAIL_COLOR);
  }

  // 장소 표시 (큰 화면에선 아이콘·글자를 키움)
  const big = W >= 900;
  const S = big ? 3 : 2;
  const labelFont = big ? FONT_BIG : FONT;
  const taken:Rect[] = [];
  const activeId = state.placeId;
  if (s < OVERVIEW_SCALE) {
    for (const place of PLACES) {
      const p = scr(world.placePos[place.id]);
      ctx.fillStyle = '#1d1d33';
      ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 3, 6, 6);
      ctx.fillStyle = place.id === activeId ? '#ff5a4e' : '#ffffff';
      ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 4, 4);
    }
    for (const cluster of world.clusters) {
      const name = CLUSTER_NAMES.find(([ id ]) => cluster.places.some((p) => p.id === id))?.[1];
      if (!name) continue;
      const cx = cluster.places.reduce((a, p) => a + p.pos.x, 0) / cluster.places.length;
      const top = Math.min(...cluster.places.map((p) => p.pos.y)) - cluster.radius * 0.6;
      const p = scr({ x: cx, y: top });
      ctx.font = FONT_BIG;
      const r = { x: p.x - ctx.measureText(name).width / 2 - 4, y: p.y - 12, w: ctx.measureText(name).width + 8, h: 22 };
      if (taken.some((o) => overlaps(o, r))) continue;
      taken.push(r);
      outlinedText(ctx, name, p.x, Math.min(p.y, scr(world.placePos[cluster.places[0].id]).y - 14), FONT_BIG);
    }
  } else {
    // 우선순위: 지금 장소 → 오늘 들르는 장소 → 나머지
    const todayIds = new Set(SCHEDULE.filter((seg) => tripTimeToParts(seg.start).day === day).flatMap((seg) => (seg.kind === 'stay' ? [ seg.placeId ] : [ seg.from, seg.to ])));
    const ordered = [ ...PLACES ].sort((a, b) => (b.id === activeId ? 2 : todayIds.has(b.id) ? 1 : 0) - (a.id === activeId ? 2 : todayIds.has(a.id) ? 1 : 0));
    const bw = BADGE_W * S;
    const bh = BADGE_H * S;
    const draws:(() => void)[] = [];
    for (const place of ordered) {
      const p = scr(world.placePos[place.id]);
      if (p.x < -bw || p.y < -bh || p.x > W + bw || p.y > H + bh) continue;
      const badge = { x: p.x - bw / 2, y: p.y - bh, w: bw, h: bh };
      if (taken.some((o) => overlaps(o, badge))) continue;
      taken.push(badge);
      ctx.font = labelFont;
      const tw = ctx.measureText(place.name).width;
      const lh = big ? 18 : 15;
      const label = { x: p.x - tw / 2 - 3, y: p.y + 4, w: tw + 6, h: lh };
      const showLabel = !taken.some((o) => overlaps(o, label));
      if (showLabel) taken.push(label);
      const active = place.id === activeId;
      draws.push(() => {
        const bob = active ? Math.round(Math.sin(realMs / 220) * 2) : 0;
        ctx.fillStyle = 'rgba(20,20,40,0.35)';
        ctx.fillRect(Math.round(p.x) - 3 * S, Math.round(p.y) - 1, 6 * S, 3);
        ctx.drawImage(getBadge(place.icon), Math.round(badge.x), Math.round(badge.y) + bob, bw, bh);
        if (showLabel) outlinedText(ctx, place.name, p.x, p.y + 4 + lh / 2, labelFont, active ? '#fff27a' : '#ffffff');
      });
    }
    // 우선순위 높은 것이 위에 오도록 역순으로 그림
    for (let i = draws.length - 1; i >= 0; i--) draws[i]();
  }

  // 생략된 먼 구간의 실제 거리 — 다른 글자·여행자와 겹치지 않는 자리에만
  const tp = scr(state.pos);
  taken.push({ x: tp.x - 26 * S, y: tp.y - 32 * S, w: 64 * S, h: 36 * S });
  for (const m of todayMoves) {
    if (!m?.gapKm || m.gapKm < 8) continue;
    const mid = scr(pointAlong(m.path, 0.5).point);
    if (mid.x < -60 || mid.y < -20 || mid.x > W + 60 || mid.y > H + 20) continue;
    const text = `약 ${Math.round(m.gapKm)}킬로미터`;
    ctx.font = FONT;
    const tw = ctx.measureText(text).width + 6;
    const spot = [ -12, 14, -28, 30 ].map((dy) => ({ x: mid.x - tw / 2, y: mid.y + dy - 8, w: tw, h: 16 })).find((r) => !taken.some((o) => overlaps(o, r)));
    if (!spot) continue;
    taken.push(spot);
    outlinedText(ctx, text, mid.x, spot.y + 8, FONT, '#fff7c2');
  }

  drawTraveler(ctx, { p: tp, state, realMs, detailed: s >= OVERVIEW_SCALE, S, scr, path: world.moves[state.segmentIndex]?.path, scale: s });
}

interface TravelerDraw {
  p: Point;
  state: TravelerState;
  realMs: number;
  detailed: boolean;
  S: number;
  scr: (p:Point) => Point;
  path?: Path;
  scale: number;
}

/** 발끝 가운데(cx, bottom) 기준으로 스프라이트를 그린다 */
function drawSprite(ctx:CanvasRenderingContext2D, sprite:HTMLCanvasElement, cx:number, bottom:number, S:number, facing:number) {
  const w = sprite.width * S;
  const h = sprite.height * S;
  const top = Math.round(bottom - h);
  ctx.save();
  ctx.translate(Math.round(cx), 0);
  if (facing < 0) ctx.scale(-1, 1);
  ctx.drawImage(sprite, -Math.round(w / 2), top, w, h);
  ctx.restore();
}

function drawTraveler(ctx:CanvasRenderingContext2D, { p, state, realMs, detailed, S, scr, path, scale }:TravelerDraw) {
  const { segment } = state;
  // 투어 경유지에서는 배지 왼쪽에 투어 버스가 대기
  if (segment.kind === 'stay' && segment.tour && detailed) {
    drawSprite(ctx, getVehicle('bus'), p.x - 17 * S, p.y, S, 1);
  }

  if (state.sleeping) {
    // 숙소에서 자는 중 — "쿨쿨"이 피어오름
    const phase = (realMs / 1600) % 1;
    ctx.globalAlpha = 1 - phase;
    outlinedText(ctx, '쿨쿨', p.x + 22, p.y - 40 - phase * 14, FONT_BIG, '#c9d4ff');
    ctx.globalAlpha = 1;
    return;
  }

  const groundY = p.y;

  if (state.mode === 'stay' || state.mode === 'walk') {
    // 엄마·아빠·딸 3명 — 걸을 땐 아빠가 앞장서고 경로를 따라 줄지어, 머물 땐 배지 옆에 나란히
    const gap = 9 * S;
    let feet:Point[];
    if (state.mode === 'walk' && path && path.length > 0) {
      const back = gap / scale / path.length;
      feet = FAMILY.map((_, i) => scr(pointAlong(path, state.progress - back * i).point));
    } else {
      const left = detailed ? p.x + 8 * S : p.x - gap;
      feet = FAMILY.map((_, i) => ({ x: left + i * gap, y: groundY }));
    }
    const xs = feet.map((f) => f.x);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const ringW = (Math.max(...xs) - Math.min(...xs)) / 2 + 6 * S;
    const pulse = Math.sin(realMs / 250) * 2;
    ctx.strokeStyle = 'rgba(255,90,78,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(Math.round(centerX), Math.round(groundY), ringW + pulse, 4 * S + pulse * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 뒤에 선 사람부터 그려서 앞사람이 위에 오게
    for (let i = FAMILY.length - 1; i >= 0; i--) {
      const walking = state.mode === 'walk';
      const frame = walking ? 1 + ((Math.floor(realMs / 180) + i) % 2) : 0;
      const bob = walking ? Math.round(Math.abs(Math.sin(realMs / 120 + i))) : Math.round(Math.sin(realMs / 400 + i * 1.3));
      drawSprite(ctx, getFamilyFrame(FAMILY[i], frame), feet[i].x, feet[i].y - bob, S, state.facing);
    }
  } else {
    const sprite = getVehicle(state.mode);
    const plane = state.mode === 'plane';
    const bob = plane ? Math.round(Math.sin(realMs / 300) * 3) : Math.round(Math.abs(Math.sin(realMs / 120)));
    const ringW = (sprite.width * S) / 2 + 2;
    const pulse = 7 + Math.sin(realMs / 250) * 2;
    ctx.strokeStyle = 'rgba(255,90,78,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(Math.round(p.x), Math.round(groundY), Math.max(ringW, pulse * 1.4), pulse * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    drawSprite(ctx, sprite, p.x, (plane ? groundY + (sprite.height * S) / 2 - 10 : groundY) - bob, S, state.facing);
  }
}