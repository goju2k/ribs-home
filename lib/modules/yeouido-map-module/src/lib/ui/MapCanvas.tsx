import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import styled from 'styled-components';

import { PIXEL_FONT } from './pixel';

import { YeouidoGrid } from '../data/decode';
import { usePanZoom } from '../hooks/use-pan-zoom';
import { Camera, clampToImage, fitRect, toScreen, Viewport } from '../render/camera';
import { Composite, heightPx } from '../render/compose';
import { BACKGROUND } from '../render/palette';

export interface MapCanvasHandle {
  fitAll: () => void;
}

interface MapCanvasProps {
  grid: YeouidoGrid;
  composite: Composite;
  night: boolean;
  showLabels: boolean;
}

function toCanvas(c:Composite, data:Uint8ClampedArray) {
  const canvas = document.createElement('canvas');
  canvas.width = c.width;
  canvas.height = c.height;
  canvas.getContext('2d')!.putImageData(new ImageData(data, c.width, c.height), 0, 0);
  return canvas;
}

const LABEL_COLORS:Record<string, string> = { landmark: '#ffd84a', park: '#9be07a', bridge: '#e6e6ee', water: '#bfe0ff' };

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(({ grid, composite, night, showLabels }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ x: composite.width / 2, y: composite.height / 2, scale: 1 });
  const vpRef = useRef<Viewport>({ w: 1, h: 1 });
  const nightRef = useRef(night);
  nightRef.current = night;
  const labelsRef = useRef(showLabels);
  labelsRef.current = showLabels;

  const images = useMemo(() => ({ day: toCanvas(composite, composite.day), night: toCanvas(composite, composite.night) }), [ composite ]);

  usePanZoom(canvasRef, camRef, vpRef, () => {
    camRef.current = clampToImage(camRef.current, composite.width, composite.height);
  });

  const fit = () => {
    const vp = vpRef.current;
    const cam = fitRect(composite.width, composite.height, vp, 8);
    // 폰처럼 좁은 화면에선 너무 작아지니 섬 가운데를 적당히 확대해서 시작
    camRef.current = cam.scale < 0.9 ? { ...cam, scale: 0.9 } : cam;
  };

  useImperativeHandle(ref, () => ({ fitAll: fit }), [ composite ]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let first = true;
    let mix = nightRef.current ? 1 : 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { clientWidth: w, clientHeight: h } = canvas;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      vpRef.current = { w, h };
      if (first) {
        fit();
        first = false;
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const frame = (now:number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // 낮 ↔ 밤 전환은 0.8초 동안 겹쳐서
      const target = nightRef.current ? 1 : 0;
      mix += Math.sign(target - mix) * Math.min(Math.abs(target - mix), dt / 0.8);

      const vp = vpRef.current;
      const cam = camRef.current;
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, vp.w, vp.h);
      ctx.imageSmoothingEnabled = false;
      const o = toScreen(cam, vp, 0, 0);
      const dw = composite.width * cam.scale;
      const dh = composite.height * cam.scale;
      if (mix < 1) {
        ctx.globalAlpha = 1;
        ctx.drawImage(images.day, o.x, o.y, dw, dh);
      }
      if (mix > 0) {
        ctx.globalAlpha = mix;
        ctx.drawImage(images.night, o.x, o.y, dw, dh);
      }
      ctx.globalAlpha = 1;

      if (labelsRef.current) drawLabels(ctx, grid, composite, cam, vp);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [ composite, images, grid ]);

  return <Canvas ref={canvasRef} />;
});

MapCanvas.displayName = 'MapCanvas';

function drawLabels(ctx:CanvasRenderingContext2D, grid:YeouidoGrid, c:Composite, cam:Camera, vp:Viewport) {
  ctx.font = `11px ${PIXEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  grid.labels.forEach((l) => {
    // 랜드마크는 옥상 위에 이름표를 띄운다
    const lift = l.kind === 'landmark' ? heightPx(l.h) + 6 : 0;
    const p = toScreen(cam, vp, l.x, l.y + c.top - lift);
    if (p.x < -60 || p.y < -20 || p.x > vp.w + 60 || p.y > vp.h + 20) return;
    const tw = Math.ceil(ctx.measureText(l.label).width) + 8;
    const x = Math.round(p.x - tw / 2);
    const y = Math.round(p.y - 8);
    ctx.fillStyle = 'rgba(11,14,34,0.82)';
    ctx.fillRect(x, y, tw, 16);
    ctx.fillStyle = LABEL_COLORS[l.kind] ?? '#fff';
    ctx.fillRect(x, y + 15, tw, 1);
    ctx.fillText(l.label, Math.round(p.x), Math.round(p.y));
  });
}

const Canvas = styled.canvas({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
  touchAction: 'none',
  cursor: 'grab',
  imageRendering: 'pixelated',
});