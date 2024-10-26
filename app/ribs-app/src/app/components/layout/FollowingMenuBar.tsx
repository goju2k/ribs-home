import { forwardRef, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

const Container = styled.div<{menuHeight:number;}>(({ menuHeight }) => ({
  position: 'relative',
  width: '100%',
  height: `${menuHeight}px`,
}));

interface FollowingMenuBarProps {
  absuloteTop?:number;
  menuHeight?:number;
}

export function FollowingMenuBar({
  absuloteTop = 0,
  menuHeight = 50,
  children, 
}:React.PropsWithChildren<FollowingMenuBarProps>) {

  const [ container, setContainer ] = useState<HTMLDivElement|null>(null);
  const mainRef = useRef<HTMLDivElement|null>(null);
  const mainRef2 = useRef<HTMLDivElement|null>(null);

  const [ menuFloating, setMenuFloating ] = useState(false);

  useEffect(() => {
    
    let io:IntersectionObserver;
    if (mainRef.current && mainRef.current.parentElement) {

      // get scroll parent
      const [ scrollParent, scrollGrandParent ] = findScrollElement(mainRef.current);
      setContainer(scrollGrandParent);
      
      // intersection
      const callback:IntersectionObserverCallback = (entry) => {
        const [ ioInfo ] = entry;
        if (mainRef2.current) {
          if (ioInfo.isIntersecting) {
            setMenuFloating(false);
          } else {
            setMenuFloating(true);
          }
        }
      };
      
      io = new IntersectionObserver(callback, {
        threshold: 1, 
        root: scrollParent,
        rootMargin: `${absuloteTop * -1}px 0px 0px 0px`,
      });
      io.observe(mainRef.current);

    }

    return () => {
      io && io.disconnect();
    };

  }, []);

  function findScrollElement<T extends HTMLElement>(elem:T):[T|null, T|null] {
    const curr = elem.parentElement;
    if (!curr) {
      return [ null, null ];
    }

    if (curr.scrollHeight > curr.offsetHeight && curr.parentElement) {
      return [ curr, curr.parentElement ] as [T, T];
    }

    return findScrollElement(curr) as [T, T];
  }

  return (
    <Container menuHeight={menuHeight}>
      <MainBar ref={mainRef}>
        {children}
      </MainBar>
      {container && createPortal(<MainBar ref={mainRef2} floating displayNone={!menuFloating} baseTop={absuloteTop}>{children}</MainBar>, container)}
    </Container>
  );
}

const Menu = styled.div<{floating:boolean;displayNone:boolean;baseTop:number;menuHeight:number;}>(({
  floating, 
  displayNone,
  baseTop, 
  menuHeight, 
}) => ({
  width: '100%',
  height: `${menuHeight}px`,
  position: floating ? 'absolute' : 'relative',
  color: floating ? 'red' : 'black',
  display: displayNone ? 'none' : 'flex',
  left: '0',
  top: `${baseTop}px`,
  alignItems: 'center',
}));

interface MainBarProps extends React.PropsWithChildren {
  floating?:boolean;
  displayNone?:boolean;
  baseTop?:number;
  menuHeight?:number;
}
const MainBar = forwardRef<HTMLDivElement | null, MainBarProps>((
  {
    floating = false, 
    displayNone = false, 
    baseTop = 0,
    menuHeight = 50,
    children,
  }:MainBarProps,
  ref,
) => (
  <Menu ref={ref} floating={floating} displayNone={displayNone} baseTop={baseTop} menuHeight={menuHeight}>
    {children}
  </Menu>
));

MainBar.displayName = 'MainBar';