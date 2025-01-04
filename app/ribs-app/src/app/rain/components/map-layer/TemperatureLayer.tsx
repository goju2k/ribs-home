/* eslint-disable @next/next/no-img-element */
import { MapControlWrapper, MapMarkerWrapper, Position, useMintMapController } from '@mint-ui/map';
import { useEffect, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import styled from 'styled-components';
import { Flex } from 'ui-base-pack';

import { MapControlState } from '../../state/map-controls';
import { getOffset } from '../../util/map-util';

export function TemperatureLayer() {

  const controller = useMintMapController();

  const width = useRef(776);
  const height = useRef(1333);
  // const off1 = getOffset(controller, new Position(43.2573752, 123.578397));
  // const off2 = new Offset(off1.x + width.current, off1.y + height.current);
  // const pos2 = controller.offsetToPosition(off2);
  const [ startPosition ] = useState([ 
    new Position(43.2573752, 123.578397), 
    // pos2,
    new Position(31.754418719732577, 132.1037876401973),
  ]);

  const { result: imageSrc, date: timeText, legend } = useTemperatureImageSrc();
  const [ imageShow, setImageShow ] = useState(true);
  
  // const scale = useRef(1);
  useEffect(() => {
    
    const handleZoomStart = () => {
      setImageShow(false);
    };

    const handleZoomChanged = () => {

      // x축
      const offset1 = getOffset(controller, startPosition[0]);
      const offset2 = getOffset(controller, startPosition[1]);
      const size = Math.floor(offset2.x - offset1.x);
      const size_y = Math.floor(offset2.y - offset1.y);
    
      width.current = size;
      height.current = size_y;

      setImageShow(true);
    };

    // const mousedown:Parameters<MintMapController['addEventListener']>[1] = ({ param }) => {
      
    //   console.log('param', param);
      
    //   if (param.pointerEvent?.button === 2) {
    //     setStartPosition(param.position);
    //   }
      
    // };

    controller.addEventListener('ZOOMSTART', handleZoomStart);
    controller.addEventListener('ZOOM_CHANGED', handleZoomChanged);
    // controller.addEventListener('MOUSEDOWN', mousedown);
    return () => {
      // controller.removeEventListener('MOUSEDOWN', mousedown);
      controller.removeEventListener('ZOOMSTART', handleZoomStart);
      controller.removeEventListener('ZOOM_CHANGED', handleZoomChanged);
    };
  }, []);
  
  const { temperatureFlag } = useRecoilValue(MapControlState);

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

      {imageSrc && (
        <MapMarkerWrapper position={startPosition[0]} disablePointerEvent>
          <div
            style={{
              width: `${width.current}px`, 
              height: `${height.current}px`,
              border: '0px solid coral',
              visibility: temperatureFlag && imageShow ? 'visible' : 'hidden', 
            }}
          >  
            <img 
              src={imageSrc}
              alt='Korean Temperature'
              style={{ width: '100%', height: '100%', opacity: 0.4 }}
            />
          </div>
        </MapMarkerWrapper>
      )}
    </>
  );
}

interface LegendData {
  color: string[];
  label: string[];
  key: string[];
}
function useTemperatureImageSrc() {

  const [ result, setResult ] = useState<string>();
  const [ date, setDate ] = useState<string>();
  const [ legend, setLegend ] = useState<LegendData>();
  useEffect(() => {

    (async () => {

      const data = await (await fetch('/api/kma/temperature-key', { next: { revalidate: 60 } })).json();
      if (data) {
        setResult(data.src);
        setDate(getTimeText(data.time));

        const leData = data.legend as LegendData;
        leData.color.reverse();
        leData.label.reverse();
        leData.key.reverse();
        setLegend(leData);
      }

    })();

  }, []);

  return { result, date, legend };

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