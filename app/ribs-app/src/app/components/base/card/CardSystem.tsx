import { ReactNode } from 'react';

interface CardSystemProps {
  children: Iterable<ReactNode>;
}

export function CardSystem({ children }:CardSystemProps) {
  return <div>{children}</div>;
}