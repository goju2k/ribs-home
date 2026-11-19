/* eslint-disable @next/next/no-img-element */
import { MapControlWrapper, MapMarkerWrapper, Position, useMintMapController } from '@mint-ui/map';
import { useEffect, useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import styled from 'styled-components';
import { Flex } from 'ui-base-pack';

import { MapControlState } from '../../state/map-controls';
import { buildMercatorOverlay, useKmaTemperature } from '../../util/kma-temperature';
import { getOffset } from '../../util/map-util';

export function TemperatureLayer() {

  const controller = useMintMapController();
  const { temperatureFlag } = useRecoilValue(MapControlState);
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

  // 범례는 위가 높은 기온이 되게 뒤집어 보여 준다(원본은 공유 데이터라 복사해서 뒤집는다).
  const legend = useMemo(() => {
    if (!temperature) {
      return null;
    }
    const { color, label, key } = temperature.legend;
    return { color: [ ...color ].reverse(), label: [ ...label ].reverse(), key: [ ...key ].reverse() };
  }, [ temperature ]);
  const timeText = temperature ? getTimeText(temperature.efcDate) : '';

  return (
    <>
      {temperatureFlag && legend && (
        <MapControlWrapper positionHorizontal='right' positionVertical='bottom'>
          <MapLegendContainer>
            <Flex flexrow flexgap='4px'>
              <Flex flexfit>
                {legend.color.map((c) => <LegendItem key={c} style={{ background: c }} />)}
              </Flex>
              <Flex flexfit>
                {legend.label.map((c, idx) => <LegendItemLabel key={idx}>{c ? Number(legend.key[idx]).toFixed(0) : ''}</LegendItemLabel>)}
              </Flex>
            </Flex>
            <Flex flexfit flexalign='right-center' style={{ fontSize: '12px' }}>℃</Flex>
            <div style={{ position: 'absolute', whiteSpace: 'nowrap', transform: 'translate(-105px, 3px)' }}>{timeText}</div>
          </MapLegendContainer>
        </MapControlWrapper>
      )}

      {temperatureFlag && overlay && corners && size && (
        <MapMarkerWrapper position={corners[0]} disablePointerEvent>
          <div style={{ width: `${size.width}px`, height: `${size.height}px`, visibility: imageShow ? 'visible' : 'hidden' }}>
            <img
              src={overlay.dataUrl}
              alt='Korean Temperature'
              style={{ width: '100%', height: '100%', opacity: 0.4 }}
            />
          </div>
        </MapMarkerWrapper>
      )}
    </>
  );
}

function getTimeText(utcTimeString:string) {
  const date = new Date(`${utcTimeString.replace('T', ' ')} GMT`);
  return `${date.toLocaleString()}`;
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
const LegendItem = styled.div({ width: '10px', height: '5px', fontSize: '12px' });
const LegendItemLabel = styled.div({ width: '20px', height: '5px', fontSize: '12px' });