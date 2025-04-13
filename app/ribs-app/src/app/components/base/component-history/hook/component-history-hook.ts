import { useContext, useEffect } from 'react';

import { ComponentHistoryContext, ComponentHistoryOption } from '../context/component-history-context';

export function useComponentHistory(componentName:string, option:ComponentHistoryOption) {
  
  const { push } = useContext(ComponentHistoryContext);
  const { onActive } = option;
  useEffect(() => {

  }, []);

  return '';

}