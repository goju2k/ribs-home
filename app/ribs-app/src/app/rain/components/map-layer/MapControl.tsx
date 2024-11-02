import { MapControlWrapper, useMintMapController } from '@mint-ui/map';
import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { Flex } from 'ui-base-pack';

import { RequestButton } from '../../../components/base/Button';
import { useGeoLocationHook } from '../../hook/geo-location-hook';
import { MapControlState } from '../../state/map-controls';

export function MapControlLayer() {

  const controller = useMintMapController();

  const [{ tmText, askPosition, opacity, temperatureFlag }, setControlState ] = useRecoilState(MapControlState);
  
  // GPS 요청
  const currPosition = useGeoLocationHook(askPosition);
  useEffect(() => {
    if (currPosition) {
      controller.setCenter(currPosition);
      controller.setZoomLevel(12);
      setControlState((prev) => ({ ...prev, currPosition }));
    }
  }, [ currPosition ]);

  return (
    <MapControlWrapper positionHorizontal='right' positionVertical='top'>
      <div style={{
        background: 'white',
        border: '1px solid gray',
        borderRadius: '3px', 
        padding: '10px', 
        marginTop: '10px',
        marginRight: '10px',
        fontSize: '14px',
      }}
      >
        <Flex flexgap='4px'>
          <Flex flexrow flexalign='center' flexspacebetween>
            <span style={{ width: '100px' }}>기준시각</span>
            <Flex flexalign='center'>{tmText}</Flex>
          </Flex>
          <Flex flexrow flexalign='center' flexspacebetween>
            <span style={{ width: '100px' }}>투명도</span>
            <input
              id='opacity'
              type='range'
              min={0.1}
              max={1.0}
              step={0.1}
              value={opacity}
              onChange={(e) => {
                setControlState((prev) => ({ ...prev, opacity: Number(e.target.value) }));
              }}
            />
          </Flex>
          <Flex flexrow flexalign='center' flexspacebetween>
            <span style={{ width: '100px' }}>현재위치</span>
            <Flex flexalign='center'>
              <RequestButton
                disabled={askPosition}
                onClick={() => {
                  setControlState((prev) => ({ ...prev, askPosition: true }));
                }}
              >바로가기
              </RequestButton>
            </Flex>
          </Flex>
          <Flex flexrow flexalign='center' flexspacebetween>
            <span style={{ width: '100px' }}>기온</span>
            <Flex flexalign='center'>
              <RequestButton
                disabled={askPosition}
                onClick={() => {
                  setControlState((prev) => ({ ...prev, temperatureFlag: !temperatureFlag }));
                }}
              >
                {temperatureFlag ? '기온 숨기기' : '기온 보기'}
              </RequestButton>
            </Flex>
          </Flex>
        </Flex>
      </div>
    </MapControlWrapper>
  );
}