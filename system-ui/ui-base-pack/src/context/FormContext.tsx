import { createContext } from 'react';

export interface FormContextType<T> {
  data:T;
  setData?:(data:T)=>void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FormContext = createContext<FormContextType<any>>({ data: {} });