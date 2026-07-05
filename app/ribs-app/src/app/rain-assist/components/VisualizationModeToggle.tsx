'use client';

import { MapControlWrapper } from '@mint-ui/map';
import styled from 'styled-components';
import { Flex } from 'ui-base-pack';

interface VisualizationModeToggleProps {
  checked:boolean;
  onChange:(checked:boolean) => void;
}

export function VisualizationModeToggle({ checked, onChange }:VisualizationModeToggleProps) {
  return (
    <MapControlWrapper positionHorizontal='right' positionVertical='bottom'>
      <ToggleContainer>
        <Flex flexrow flexalign='center' flexgap='6px'>
          <input
            type='checkbox'
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>시각화 확인 모드</span>
        </Flex>
      </ToggleContainer>
    </MapControlWrapper>
  );
}

const ToggleContainer = styled.div({
  background: 'white',
  border: '1px solid gray',
  borderRadius: '8px',
  padding: '5px 8px',
  marginBottom: '20px',
  marginRight: '10px',
  fontSize: '14px',
});