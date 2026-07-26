// 지도 위 CCTV 위치 마커 아이콘. organ/icon/*.tsx 대신 이 페이지의 실제 컨벤션(RainDirectionArrowIcon.tsx)을
// 따라 rain-assist/components/에 인라인 SVG로 둔다.
export function CctvIcon() {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      style={{ cursor: 'pointer' }}
    >
      <circle cx='12' cy='12' r='11' fill='#1f6feb' stroke='white' strokeWidth='1.5' />
      <path d='M6 9.5A1.5 1.5 0 0 1 7.5 8h5A1.5 1.5 0 0 1 14 9.5v5A1.5 1.5 0 0 1 12.5 16h-5A1.5 1.5 0 0 1 6 14.5v-5Z' fill='white' />
      <path d='M14 10.7 18 9v6l-4-1.7v-2.6Z' fill='white' />
    </svg>
  );
}