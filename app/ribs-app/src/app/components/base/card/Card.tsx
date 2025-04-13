import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
}

export function Card({ children }:CardProps) {

  return (
    <>
      {children}
    </>
  );
}