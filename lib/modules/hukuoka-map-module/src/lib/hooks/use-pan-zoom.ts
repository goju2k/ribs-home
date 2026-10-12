import { MutableRefObject, RefObject, useEffect } from 'react';

import { Camera, Viewport, zoomAt } from '../render/camera';

/** 한 손가락/마우스 드래그 = 이동, 두 손가락 = 핀치 줌, 휠 = 커서 기준 줌 */
export function usePanZoom(
  canvasRef:RefObject<HTMLCanvasElement>,
  camRef:MutableRefObject<Camera>,
  vpRef:MutableRefObject<Viewport>,
  onManual:() => void,
) {
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const pointers = new Map<number, { x: number; y: number; }>();
    let pinch:{ dist: number; mx: number; my: number; } | null = null;

    const local = (e:PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const pinchInfo = () => {
      const [ a, b ] = [ ...pointers.values() ];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };

    const down = (e:PointerEvent) => {
      // 새 제스처의 첫 손가락이면 이전에 끝나지 않은(놓친) 포인터는 버린다
      if (e.isPrimary) pointers.clear();
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 2) pinch = pinchInfo();
    };
    const move = (e:PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      const cam = camRef.current;
      if (pointers.size === 1) {
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        if (dx === 0 && dy === 0) return;
        camRef.current = { ...cam, x: cam.x - dx / cam.scale, y: cam.y - dy / cam.scale };
        onManual();
      } else if (pointers.size === 2 && pinch) {
        const next = pinchInfo();
        let c = zoomAt(cam, vpRef.current, next.mx, next.my, next.dist / Math.max(pinch.dist, 1));
        c = { ...c, x: c.x - (next.mx - pinch.mx) / c.scale, y: c.y - (next.my - pinch.my) / c.scale };
        camRef.current = c;
        pinch = next;
        onManual();
      }
    };
    const up = (e:PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = pointers.size === 2 ? pinchInfo() : null;
    };
    const wheel = (e:WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      camRef.current = zoomAt(camRef.current, vpRef.current, p.x, p.y, Math.exp(-e.deltaY * 0.0015));
      onManual();
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('lostpointercapture', up);
      el.removeEventListener('wheel', wheel);
    };
  }, []);
}