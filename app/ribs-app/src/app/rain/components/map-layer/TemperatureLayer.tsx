/* eslint-disable @next/next/no-img-element */
import { MapControlWrapper, MapMarkerWrapper, Position, useMintMapController } from '@mint-ui/map';
import axios from 'axios';
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

  const [ imageSrc, timeText ] = useTemperatureImageSrc();
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
      {temperatureFlag && (
        <MapControlWrapper positionHorizontal='right' positionVertical='bottom'>
          <MapLegendContainer>
            <Flex flexrow flexgap='4px'>
              <Flex flexfit>
                {tempLegends.map((color) => <LegendItem key={color} style={{ background: color }} />)}
              </Flex>
              <Flex flexfit>
                {Array.from(Array(Math.floor(tempLegends.length / 10))).map((_, idx) => <LegendItemLabel key={idx}>{(3 - idx) * 10}</LegendItemLabel>)}
              </Flex>
            </Flex>
            <Flex flexfit flexalign='right-center' style={{ fontSize: '12px' }}>℃</Flex>
            <div style={{ position: 'absolute', whiteSpace: 'nowrap', transform: 'translate(-85px, 3px)' }}>{timeText}</div>
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

function useTemperatureImageSrc() {

  const [ result, setResult ] = useState<string>();
  const [ date, setDate ] = useState<string>();
  useEffect(() => {

    (async () => {

      const data = await (await fetch('/api/kma/temperature-key', {next:{revalidate: 60}}).json();
      if (data) {
        setResult(data.src);
        setDate(getTimeText(data.time));
      }

    })();

  }, []);

  return [ result, date ];

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
const LegendItemLabel = styled.div({ width: '20px', height: '50px', fontSize: '12px' });

const tempLegends = [
  'rgb(51, 51, 51)',
  'rgb(191, 0, 0)',
  'rgb(200, 0, 0)',
  'rgb(213, 0, 0)',
  'rgb(227, 0, 0)',
  'rgb(238, 11, 11)',
  'rgb(243, 33, 33)',
  'rgb(246, 62, 62)',
  'rgb(248, 96, 96)',
  'rgb(250, 133, 133)',
  'rgb(252, 171, 171)',
  'rgb(204, 170, 0)',
  'rgb(212, 176, 0)',
  'rgb(224, 185, 0)',
  'rgb(237, 195, 0)',
  'rgb(249, 205, 0)',
  'rgb(255, 214, 4)',
  'rgb(255, 220, 31)',
  'rgb(255, 227, 67)',
  'rgb(255, 234, 110)',
  'rgb(255, 240, 154)',
  'rgb(0, 128, 0)',
  'rgb(0, 142, 0)',
  'rgb(0, 164, 0)',
  'rgb(0, 189, 0)',
  'rgb(0, 213, 0)',
  'rgb(8, 233, 8)',
  'rgb(30, 243, 30)',
  'rgb(64, 249, 64)',
  'rgb(105, 252, 105)',
  'rgb(150, 254, 150)',
  'rgb(0, 119, 179)',
  'rgb(0, 128, 196)',
  'rgb(0, 141, 222)',
  'rgb(0, 157, 246)',
  'rgb(7, 171, 255)',
  'rgb(31, 181, 255)',
  'rgb(62, 193, 255)',
  'rgb(97, 205, 255)',
  'rgb(135, 217, 255)',
  'rgb(172, 229, 255)',
  'rgb(0, 3, 144)',
  'rgb(13, 16, 150)',
  'rgb(31, 33, 157)',
  'rgb(52, 54, 167)',
  'rgb(76, 78, 177)',
  'rgb(101, 103, 188)',
  'rgb(128, 129, 199)',
  'rgb(154, 155, 211)',
  'rgb(179, 180, 222)',
  'rgb(203, 204, 232)',
  'rgb(127, 0, 191)',
  'rgb(135, 0, 206)',
  'rgb(146, 0, 228)',
  'rgb(160, 0, 247)',
  'rgb(173, 7, 255)',
  'rgb(183, 31, 255)',
  'rgb(194, 62, 255)',
  'rgb(205, 97, 255)',
  'rgb(218, 135, 255)',
  'rgb(229, 172, 255)',
  'rgb(238, 238, 238)',
];
