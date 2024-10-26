import { DetailedHTMLProps, forwardRef, HTMLAttributes, useImperativeHandle, useRef, useState } from 'react';
import styled from 'styled-components';

export interface ToolTipShowParam {
  elem?:HTMLElement;
  position:'top'|'bottom';
  message: string;
  offset?:[number, number];
  autoHideTime?:number;
  stopAutoHide?:boolean;
}
export interface ToolTipControl {
  show:(param:ToolTipShowParam)=>void;
  hide:()=>void;
}

export interface ToolTipProps extends DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
  padding?:string;
}

export const ToolTip = forwardRef<ToolTipControl, React.PropsWithChildren<ToolTipProps>>(({
  padding,
  children,
  style,
  ...props
}, ref) => {

  const containerRef = useRef<HTMLDivElement>(null);
  
  const left = useRef(100);
  const top = useRef(100);
  const [ scale, setScale ] = useState(0);
  const messageElem = useRef('');
  const arrowPosition = useRef<'top'|'bottom'>('top');

  const hide = () => {
    messageElem.current = '';
    setScale(0);
    // containerRef.current?.addEventListener('transitionend', () => {
    //   setShow(false);
    // }, { once: true });
  };

  useImperativeHandle(ref, () => ({
    show({ elem, message, offset = [ 0, 0 ], position = 'top', autoHideTime = 2500, stopAutoHide }) {

      const box = elem?.getBoundingClientRect() || {
        left: window.innerWidth / 2,
        top: window.innerHeight / 2,
        width: 0,
        height: 0,
      };
      
      // max-width: 480 에 대한 보정분
      const deltaLeft = Math.max((window.screen.width - 480) / 2, 0);

      left.current = box.left + (box.width / 2) + offset[0] - deltaLeft;
      top.current = box.top + (position === 'top' ? -12 : box.height + 12) + offset[1];

      messageElem.current = message;
      setScale(1);
      arrowPosition.current = position;
      
      !stopAutoHide && setTimeout(() => {
        hide();
      }, autoHideTime);

    },
    hide,
  }));

  return (
    <>
      <div
        ref={containerRef}
        style={{
          ...style,
          position: 'fixed',
          top: top.current,
          left: left.current,
          scale,
          transition: 'scale 0.5s',
          transformOrigin: 'left top',
          transform: arrowPosition.current === 'bottom' ? 'translate(-50%, -50%)' : 'translate(-50%, -150%)',
          padding,
          zIndex: 100,
        }}
        {...props}
      >
        <ToolTipBox>
          {messageElem.current}
          <Arrow position={arrowPosition.current} scale={scale} />
        </ToolTipBox>
      </div>
    </>
  );
});

ToolTip.displayName = 'ToolTip';

const ToolTipBox = styled.div`
  display: flex;
  padding: 11px 10px;
  justify-content: center;
  align-items: center;
  gap: 10px;
  align-self: stretch;
  border-radius: 5px;
  background: var(--White, #FEFDFF);
  color: #000;
  font-size: 14px;
  font-weight: 500;
`;

function Arrow({ position, scale }:{scale?:number; position:'top'|'bottom';}) {
  return (
    <svg
      style={{
        position: 'absolute',
        left: '50%',
        top: position === 'bottom' ? '0%' : '100%',
        transform: position === 'bottom' ? 'translate(-50%, calc(-100% + 2px)) rotate(180DEG)' : 'translate(-50%, -2px)',
        scale,
      }}
      xmlns='http://www.w3.org/2000/svg'
      width='14'
      height='10'
      viewBox='0 0 14 10'
      fill='none'
    >
      <path d='M5.45209 9.1081L0.672571 3.26648C-0.395861 1.96061 0.533233 0 2.22049 0L11.7795 0C13.4668 0 14.3959 1.96061 13.3274 3.26647L8.54791 9.1081C7.74771 10.0861 6.25229 10.0861 5.45209 9.1081Z' fill='#FEFDFF' />
    </svg>
  );
}