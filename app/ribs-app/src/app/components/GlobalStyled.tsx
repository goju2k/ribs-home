import { createGlobalStyle } from 'styled-components';

export const GlobalStyled = createGlobalStyle`

html {
  -webkit-text-size-adjust: 100%;
  font-family: Pretendard Variable, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif,
    Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji;
  line-height: 1.5;
  tab-size: 4;
  scroll-behavior: smooth;
}
body {
  overflow: hidden;
  margin: 0;
}
h1,
h2,
p,
pre {
  margin: 0;
}
*,
::before,
::after {
  box-sizing: border-box;
  border-width: 0;
  border-style: solid;
  border-color: currentColor;
}
h1,
h2 {
  font-size: inherit;
  font-weight: inherit;
}
a {
  color: inherit;
  text-decoration: inherit;
}

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 17px;
  background: transparent;
  outline: none;
  opacity: 0.7;
  -webkit-transition: .2s;
  transition: opacity .2s;
}

input[type="range"]:hover {
  opacity: 1;
}

input[type="range"]::-webkit-slider-runnable-track {
  width: 100%;
  height: 3px;
  cursor: pointer;
  background: #C6C6C6;
  border-radius: 3px;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 17px;
  height: 17px;
  background: black;
  cursor: pointer;
  border-radius: 50%;
  margin-top: -7px;
}
`;