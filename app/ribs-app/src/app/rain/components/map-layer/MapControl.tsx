import { MapControlWrapper, useMintMapController } from '@mint-ui/map';
import { useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import styled from 'styled-components';
import { Flex } from 'ui-base-pack';

import { RequestButton } from '../../../components/base/Button';
import { overrideFC } from '../../../components/OverrideFc';
import { useGeoLocationHook } from '../../hook/geo-location-hook';
import { MapControlState, useUpdateMapControl } from '../../state/map-controls';

export function MapControlLayer() {

  const controller = useMintMapController();

  const { tmText, askPosition, opacity, temperatureFlag } = useRecoilValue(MapControlState);
  
  const updateControl = useUpdateMapControl();
  
  // GPS 요청
  const currPosition = useGeoLocationHook(askPosition);
  useEffect(() => {
    if (currPosition) {
      controller.setCenter(currPosition);
      controller.setZoomLevel(12);
      updateControl('currPosition', currPosition);
    }
  }, [ currPosition ]);

  return (
    <MapControlWrapper positionHorizontal='right' positionVertical='top'>

      <MapControlContainer>
        
        <Flex flexgap='4px'>

          <Row>
            <RowTitle>기준시각</RowTitle>
            <Flex flexalign='center'>{tmText}</Flex>
          </Row>

          <Row>
            <RowTitle>투명도</RowTitle>
            <RowContent>
              <input
                id='opacity'
                type='range'
                min={0.1}
                max={1.0}
                step={0.1}
                value={opacity}
                onChange={(e) => {
                  updateControl('opacity', Number(e.target.value));
                }}
              />
            </RowContent>
          </Row>

          <Row>
            <RowTitle>현재위치</RowTitle>
            <RowContent>
              <RequestButton
                disabled={askPosition}
                onClick={() => {
                  updateControl('askPosition', true);
                }}
              >바로가기
              </RequestButton>
            </RowContent>
          </Row>

          <Row>
            <RowTitle>기온</RowTitle>
            <RowContent>
              <RequestButton
                disabled={askPosition}
                onClick={() => {
                  updateControl('temperatureFlag', !temperatureFlag);
                }}
              >
                {temperatureFlag ? '기온 숨기기' : '기온 보기'}
              </RequestButton>
            </RowContent>
          </Row>

        </Flex>

      </MapControlContainer>

    </MapControlWrapper>
  );
}

const MapControlContainer = styled.div({
  background: 'white',
  border: '1px solid gray',
  borderRadius: '8px', 
  padding: '8px', 
  marginTop: '10px',
  marginRight: '10px',
  fontSize: '14px',
});

const Row = overrideFC(Flex)({
  flexrow: true,
  flexalign: 'center',
  flexspacebetween: true,
  flexheight: '26px',
});

const RowTitle = styled.span({ width: '100px' });
const RowContent = overrideFC(Flex)({ flexalign: 'center' });