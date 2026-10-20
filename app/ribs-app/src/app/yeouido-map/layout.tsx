import { Metadata } from 'next';

export const metadata:Metadata = { title: '여의도 픽셀맵' };

export default function YeouidoMapLayout({ children }: {
  children: React.ReactNode;
}) {
  return children;
}