'use client';

import { useServerInsertedHTML } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { ServerStyleSheet, StyleSheetManager, StyledComponent } from 'styled-components';

export function StyledCommonRegistry({ styledComponent: StyledComponent, children }: {
  styledComponent: StyledComponent<any, any, {}, never>|React.FC;
  children: React.ReactNode;
}) {
  // Only create stylesheet once with lazy initial state
  // x-ref: https://reactjs.org/docs/hooks-reference.html#lazy-initial-state
  const [ styledComponentsStyleSheet ] = useState(() => new ServerStyleSheet());

  useServerInsertedHTML(() => {
    const styles = styledComponentsStyleSheet.getStyleElement();

    // Types are out of date, clearTag is not defined.
    // See: https://github.com/DefinitelyTyped/DefinitelyTyped/issues/65021
    (styledComponentsStyleSheet.instance as any).clearTag();

    return <>{styles}</>;
  });

  // hydration error check start
  const [ isMount, setMount ] = useState(false);

  useEffect(() => {
    setMount(true);
  }, []);

  if (!isMount) {
    return null;
  }
  // hydration error check start

  if (typeof window !== 'undefined') return <StyledComponent>{children}</StyledComponent>;

  return (
    <StyleSheetManager sheet={styledComponentsStyleSheet.instance}>
      {children}
    </StyleSheetManager>
  );
}