// 강수 이동 방향을 나타내는 화살표 아이콘. organ/icon/*.tsx의 인라인 SVG 컨벤션을 따름.
// RainRadarLayer.tsx의 "현재위치" 표시용 ArrowImgMarker(PNG, 빨간 점)와는 시각적으로 구분되도록 별도 색상 사용.
export function RainDirectionArrowIcon() {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width='22'
      height='22'
      viewBox='0 0 22 22'
      fill='none'
    >
      <path d='M11 1L20 20H2L11 1Z' fill='#1f6feb' stroke='white' strokeWidth='1.5' strokeLinejoin='round' />
    </svg>
  );
}