// 강수 이동 방향을 나타내는 화살표 아이콘. organ/icon/*.tsx의 인라인 SVG 컨벤션을 따름.
// RainRadarLayer.tsx의 "현재위치" 표시용 ArrowImgMarker(PNG, 빨간 점)와는 시각적으로 구분되도록 별도 색상 사용.
interface RainDirectionArrowIconProps {
  // 기본값(흰색)은 지도 배경 위에서 도드라지게 하기 위함(RainForecastLayer의 단독 화살표용).
  // WebviewForecastLayer처럼 화살표머리를 선 끝에 정확히 붙이는 경우, 흰 테두리가 그 자체로
  // 시각적 틈처럼 보이므로 fill과 같은 색으로 넘겨 테두리를 사실상 없앤다.
  stroke?:string;
  // blob별로 경로 색이 달라질 수 있어(예: isForecastTarget 강조) 채움색도 바꿀 수 있게 함 —
  // 기본값은 기존 RainForecastLayer의 단독 화살표 색 그대로 유지.
  fill?:string;
}

export function RainDirectionArrowIcon({ stroke = 'white', fill = '#1f6feb' }:RainDirectionArrowIconProps = {}) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width='22'
      height='22'
      viewBox='0 0 22 22'
      fill='none'
    >
      <path d='M11 1L20 20H2L11 1Z' fill={fill} stroke={stroke} strokeWidth='1.5' strokeLinejoin='round' />
    </svg>
  );
}