'use client';

import { useEffect } from 'react';
import { RecoilRoot } from 'recoil';
import styled from 'styled-components';

import { StyledCommonRegistry } from './components/CommonRegistry';
import { GlobalStyled } from './components/GlobalStyled';
import { usePackageVersion } from './hook/package-version-hook';

const AppContainer = styled.div`
  width: 100vw;
  height: calc(var(--vh, 1vh) * 100);
`;

const AppStyled = ({ children }:React.PropsWithChildren) => {

  usePackageVersion();

  useEffect(() => {
    
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    setVh();
    window.addEventListener('resize', setVh);
    
    return () => {
      window.removeEventListener('resize', setVh);
    };

  }, []);
  
  return (
    <AppContainer>
      <GlobalStyled />
      <RecoilRoot>
        {children}
      </RecoilRoot>
    </AppContainer>
  );
};

export function StyledComponentsRegistry({ children }: {
  children: React.ReactNode;
}) {
  return <StyledCommonRegistry styledComponent={AppStyled}>{children}</StyledCommonRegistry>;
}