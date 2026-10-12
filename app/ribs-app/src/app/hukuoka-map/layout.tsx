import { Metadata } from 'next';

export const metadata:Metadata = { title: '후쿠오카 지도' };

export default function HukuokaMapLayout({ children }: {
  children: React.ReactNode;
}) {
  return children;
}