import { Metadata } from 'next';

export const metadata:Metadata = { title: '여의도 3D' };

export default function Yeouido3DLayout({ children }: {
  children: React.ReactNode;
}) {
  return children;
}