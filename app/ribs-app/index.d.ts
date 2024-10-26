/* eslint-disable @typescript-eslint/no-explicit-any */
declare module '*.svg' {
  const content: any;
  export const ReactComponent: any;
  export default content;
}

declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_GA_ID: string;
  }
}

interface Window {
  gtag: any;
}