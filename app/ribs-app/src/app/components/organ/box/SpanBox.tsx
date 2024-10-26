import { MouseEventHandler } from 'react';
import styled from 'styled-components';
import { BaseFlex } from 'ui-base-pack';

export interface SpanBoxProps {
  cursorPointerOnHover?:boolean;
  spanGap?:string;
  boxOnClick?:MouseEventHandler<HTMLDivElement>;
}

const BoxContainer = styled.div<SpanBoxProps>(({ cursorPointerOnHover }) => ({ '&:hover': { cursor: cursorPointerOnHover ? 'pointer' : undefined } }));

export function SpanBox({
  cursorPointerOnHover,
  spanGap = '5px',
  boxOnClick,
  children, 
}:React.PropsWithChildren<SpanBoxProps>) {
  return (
    <BoxContainer cursorPointerOnHover={cursorPointerOnHover} onClick={boxOnClick}>
      <BaseFlex flexrow flexalign='left-center' flexgap={spanGap} flexsize='fit-content' flexwidth='fit-content'>
        {children}
      </BaseFlex>
    </BoxContainer>
  );
}