import { forwardRef, MutableRefObject, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import styled from 'styled-components';

import { World } from '../geo/world';
import { usePanZoom } from '../hooks/use-pan-zoom';
import { approach, Camera, fitBounds, followTarget, Viewport } from '../render/camera';
import { CloudSprite, renderFrame } from '../render/renderer';
import { makeCloud } from '../render/sprites';
import { getTravelerState } from '../timeline/position';
import { mulberry32 } from '../world/random';
import { generateClusterImage } from '../world/terrain';

export interface MapCanvasHandle {
  fitAll: () => void;
}

export interface Insets {
  top: number;
  bottom: number;
}

interface MapCanvasProps {
  world: World;
  tRef: MutableRefObject<number>;
  follow: boolean;
  insetsRef: MutableRefObject<Insets>;
  onManual: () => void;
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(({ world, tRef, follow, insetsRef, onManual }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const vpRef = useRef<Viewport>({ w: 1, h: 1, insetTop: 0, insetBottom: 0 });
  const followRef = useRef(follow);
  followRef.current = follow;
  const onManualRef = useRef(onManual);
  onManualRef.current = onManual;

  const images = useMemo(() => world.clusters.map(generateClusterImage), [ world ]);
  const clouds = useMemo<CloudSprite[]>(() => {
    const rand = mulberry32(42);
    const { minX, minY, maxX, maxY } = world.bounds;
    return Array.from({ length: 70 }, () => ({
      x: minX - 400 + rand() * (maxX - minX + 800),
      y: minY - 300 + rand() * (maxY - minY + 600),
      speed: 1.5 + rand() * 3,
      canvas: makeCloud(rand),
    }));
  }, [ world ]);

  usePanZoom(canvasRef, camRef, vpRef, () => onManualRef.current());

  useImperativeHandle(ref, () => ({
    fitAll: () => {
      camRef.current = fitBounds(world.bounds, vpRef.current, 20);
      onManualRef.current();
    },
  }), [ world ]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let first = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { clientWidth: w, clientHeight: h } = canvas;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      vpRef.current = { ...vpRef.current, w, h };
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const frame = (now:number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const vp = { ...vpRef.current, insetTop: insetsRef.current.top, insetBottom: insetsRef.current.bottom };
      vpRef.current = vp;
      const t = tRef.current;
      const state = getTravelerState(t, world);
      if (followRef.current) {
        const target = followTarget(state, world, vp);
        camRef.current = first ? target : approach(camRef.current, target, dt);
      }
      first = false;
      renderFrame({ ctx, vp, cam: camRef.current, world, images, clouds, state, t, realMs: now });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [ world, images, clouds ]);

  return <Canvas ref={canvasRef} />;
});

MapCanvas.displayName = 'MapCanvas';

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