import { CSSProperties, forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import styled from 'styled-components';

import { useWindowEvent } from '../hook/window-event-hook';

export interface InAndOutEffectProps {
  option?:EffectOption;
  inEffectOnInit?:boolean;
}

export type onEffectComplete = ()=>void;
export type InEffectStartFunction = ()=>void;
export type OutEffectStartFunction = (onOutComplete:()=>void)=>void;
export interface InAndOutEffectControl {
  in: InEffectStartFunction;
  out: OutEffectStartFunction;
}

interface EffectStyleProps {
  effectOpacity:CSSProperties['opacity'];
  transitionX:number;
  transitionTime:number;
}

interface EffectOption {
  transitionTime:number;
}

const EffectContainer = styled.div<EffectStyleProps>(({ effectOpacity, transitionX, transitionTime }) => ({ 
  all: 'inherit',
  opacity: effectOpacity,
  transform: `translateX(${transitionX}px)`,
  transition: `opacity ${transitionTime}ms, transform ${transitionTime}ms`,
  overflow: 'hidden',
  padding: '0',
  position: 'relative',
  display: 'flex',
  gap: '0px',
}));

export const InAndOutEffect = forwardRef<InAndOutEffectControl, React.PropsWithChildren<InAndOutEffectProps>>(({ 
  inEffectOnInit = true,
  option = { transitionTime: 500 },
  children, 
}, ref) => {

  // Restore page from bfcache
  useWindowEvent('pageshow', (e) => {
    if (e.persisted) {
      setOpacity(1);
      setTransformX(0);
    }
  });
  
  // IN
  useEffect(() => {
    inEffectOnInit && inStart();
  }, []);

  // IN
  const inStart = () => {
    setOpacity(0);
    setTimeout(() => {
      setOpacity(1);
    }, 50);
  };

  // OUT
  const outStart:OutEffectStartFunction = (onOutComplete) => {
    setOpacity(0);
    setTransformX(-10);
    setTimeout(() => {
      onOutComplete();
      setTransformX(0);
    }, option.transitionTime);
  };

  useImperativeHandle(ref, () => ({ in: inStart, out: outStart }), []);

  const [ opacity, setOpacity ] = useState<CSSProperties['opacity']>(0);
  const [ transformX, setTransformX ] = useState<number>(0);
  
  return (
    <EffectContainer effectOpacity={opacity} transitionX={transformX} transitionTime={option.transitionTime}>
      {children}
    </EffectContainer>
  );
});

InAndOutEffect.displayName = 'InAndOutEffect';