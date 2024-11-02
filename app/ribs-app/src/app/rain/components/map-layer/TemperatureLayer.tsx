/* eslint-disable @next/next/no-img-element */
import { MapMarkerWrapper, Offset, Position, useMintMapController } from '@mint-ui/map';
import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';

import { MapControlState } from '../../state/map-controls';
import { getOffset } from '../../util/map-util';

export function TemperatureLayer() {

  const controller = useMintMapController();

  const width = useRef(776);
  const height = useRef(1333);

  const off1 = getOffset(controller, new Position(43.2573752, 123.578397));
  const off2 = new Offset(off1.x + width.current, off1.y + height.current);
  const pos2 = controller.offsetToPosition(off2);
  
  controller.offsetToPosition(new Offset(width.current, height.current));

  const [ startPosition ] = useState([ new Position(43.2573752, 123.578397), pos2 ]);

  const imageSrc = useTemperatureImageSrc();
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
      {/* <MapControlWrapper>
        <input
          type='range'
          min={2.5}
          max={3.0}
          step={0.01}
          value={scale}
          onChange={(e) => {
            setScale(Number(e.target.value));
          }}
        />
        스케일: {scale}
      </MapControlWrapper> */}
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
  useEffect(() => {

    (async () => {

      const { data } = await axios.get('/api/kma/temperature-key');
      if (data) {
        setResult(data);
      }

    })();

  }, []);

  return result;

}