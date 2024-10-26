export interface CheckIconProps {
  checked?: boolean;
}
export function CheckIcon({ checked = false }:CheckIconProps) {
  return (
    <svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20' fill='none'>
      <circle cx='10' cy='10' r='9.75' fill={checked ? 'url(#paint0_linear_1893_1951)' : undefined} stroke='#FEFDFF' strokeWidth='0.5' />
      <path d='M5 9.5L8.44033 13.2531C8.81699 13.664 9.45692 13.6876 9.86284 13.3056L15.5 8' stroke={checked ? '#FEFDFF' : '#8A8A8A'} strokeLinecap='round' />
      <defs>
        <linearGradient id='paint0_linear_1893_1951' x1='0' y1='10' x2='20' y2='10' gradientUnits='userSpaceOnUse'>
          <stop stopColor='#AF76F7' />
          <stop offset='1' stopColor='#821FFF' />
        </linearGradient>
      </defs>
    </svg>
  );
}