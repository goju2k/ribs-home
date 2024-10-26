import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';

import { InAndOutEffect, InAndOutEffectControl } from '../effect/InAndOutEffect';

export interface HeroScrollingLayoutProps {

}

const Container = styled.div({});

const Box = styled.div({});

export function HeroScrollingLayout({ children }:React.PropsWithChildren<HeroScrollingLayoutProps>) {
  
  const items = Array.isArray(children) ? children : [ children ];
  
  return (
    <Container>
      {items.map((item, idx) => (
        <ScrollBox
          key={idx}
          idx={idx}
        >{item}
        </ScrollBox>
      ))}
    </Container>
  );
}

interface ScrollBoxProps {
  idx:number;
}
function ScrollBox({ idx, children }:React.PropsWithChildren<ScrollBoxProps>) {

  const boxRef = useRef<HTMLDivElement|null>(null);
  const effectControl = useRef<InAndOutEffectControl>(null);

  const handleIntersection:IntersectionObserverCallback = (entry) => {
    console.log(`intersected ${idx}`, entry[0].isIntersecting);
    const [{ isIntersecting }] = entry;
    if (isIntersecting) {
      boxRef.current && (boxRef.current.style.visibility = 'visible');
      effectControl.current?.in();
    } else {
      effectControl.current?.out(() => {
        boxRef.current && (boxRef.current.style.visibility = 'hidden');
      });
    }
  };

  useEffect(() => {
    let observer:IntersectionObserver|undefined;
    if (boxRef.current) {
      observer = new IntersectionObserver(handleIntersection, { root: boxRef.current.parentElement });
      observer.observe(boxRef.current);
    }
    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, []);
  
  return (
    <Box ref={boxRef}>
      <InAndOutEffect
        ref={effectControl}
        inEffectOnInit={false}
      >
        {children}
      </InAndOutEffect>
    </Box>
  );
}