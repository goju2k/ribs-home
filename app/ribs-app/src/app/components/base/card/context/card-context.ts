import { createContext } from 'react';

export interface CardSystemControl {
  appendCard: ()=>void;
  removeCard: ()=>void;
}

export const CardSystemControlContext = createContext<CardSystemControl>({ 
  appendCard() {},
  removeCard() {},
});