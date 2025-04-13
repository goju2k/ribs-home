import { useContext, useEffect } from 'react';

import { ComponentHistoryContext } from '../context/component-history-context';

export function useComponentHistory(componentName:string, option:unknown) {
  
  const { push } = useContext(ComponentHistoryContext);
  //const { onActive } = option;
  useEffect(() => {

  }, []);

  return '';

}
