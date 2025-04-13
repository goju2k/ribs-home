import { createContext } from 'react';

export interface ComponentHistoryControl {
  push: (componentName:string)=>void;
  pop: ()=>void;
}

export const ComponentHistoryContext = createContext<ComponentHistoryControl>({ 
  push: () => {},
  pop: () => {},
});