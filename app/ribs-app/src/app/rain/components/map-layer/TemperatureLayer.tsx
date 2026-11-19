/* eslint-disable @next/next/no-img-element */
import { MapMarkerWrapper, Position, useMintMapController } from '@mint-ui/map';
import { useEffect, useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';

import { MapControlState } from '../../state/map-controls';
import { buildMercatorOverlay, useKmaTemperature } from '../../util/kma-temperature';
import { getOffset } from '../../util/map-util';

// 기온 겹쳐 그리기. 범례는 하단 바(rain-assist BottomBar)가 같은 투명도로 그린다 — 예전 세로 범례는
// 오른쪽 지도 버튼·하단 바와 겹쳤고, 원본 색이라 옅게 그려진 지도 색과도 달랐다.
export function TemperatureLayer() {

  const controller = useMintMapController();
  const { temperatureFlag, opacity } = useRecoilValue(MapControlState);
  const temperature = useKmaTemperature();

  // 기상청 격자(LCC)를 지도 투영(메르카토르)으로 다시 그린 이미지. 켤 때만 만든다(약 0.1초).
  const overlay = useMemo(() => (temperatureFlag && temperature ? buildMercatorOverlay(temperature) : null), [ temperatureFlag, temperature ]);
  const corners = useMemo(() => (overlay ? [ new Position(overlay.north, overlay.west), new Position(overlay.south, overlay.east) ] : null), [ overlay ]);

  const [ size, setSize ] = useState<{ width:number; height:number; } | null>(null);
  const [ imageShow, setImageShow ] = useState(true);

  useEffect(() => {
    if (!corners) {
      return undefined;
    }
    const measure = () => {
      const offset1 = getOffset(controller, corners[0]);
      const offset2 = getOffset(controller, corners[1]);
      setSize({ width: Math.round(offset2.x - offset1.x), height: Math.round(offset2.y - offset1.y) });
      setImageShow(true);
    };
    const handleZoomStart = () => setImageShow(false);
    measure();
    controller.addEventListener('ZOOMSTART', handleZoomStart);
    controller.addEventListener('ZOOM_CHANGED', measure);
    return () => {
      controller.removeEventListener('ZOOMSTART', handleZoomStart);
      controller.removeEventListener('ZOOM_CHANGED', measure);
    };
  }, [ corners ]);

  if (!temperatureFlag || !overlay || !corners || !size) {
    return null;
  }

  return (
    <MapMarkerWrapper position={corners[0]} disablePointerEvent>
      <div style={{ width: `${size.width}px`, height: `${size.height}px`, visibility: imageShow ? 'visible' : 'hidden' }}>
        {/* 투명도는 강수 레이더와 같은 슬라이더 값 — 하단 범례도 같은 값으로 섞는다. */}
        <img src={overlay.dataUrl} alt='Korean Temperature' style={{ width: '100%', height: '100%', opacity }} />
      </div>
    </MapMarkerWrapper>
  );
}