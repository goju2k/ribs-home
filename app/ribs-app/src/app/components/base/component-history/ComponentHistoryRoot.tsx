import { ReactNode, useEffect, useState } from 'react';

// import { ComponentHistory } from './context/component-history';
import { ComponentHistoryContext } from './context/component-history-context';

interface ComponentHistoryRootProps {
  children: ReactNode;
}
export function ComponentHistoryRoot({ children }:ComponentHistoryRootProps) {

  // const componentHistoryRef = useRef(new ComponentHistory());
  useEffect(() => {
    
    const handlePopState = () => {

    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const push = () => {
    window.history.pushState(null, '');
  };

  const pop = () => {
    window.history.back();
  };

  const [ context ] = useState({
    push,
    pop,
  });

  return (
    <ComponentHistoryContext.Provider value={context}>
      {children}
    </ComponentHistoryContext.Provider>
  );
}