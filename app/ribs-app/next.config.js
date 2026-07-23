// @ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 * */
const nextConfig = {
  nx: {
    // Set this to true if you would like to to use SVGR
    // See: https://github.com/gregberge/svgr
    svgr: false,
  },

  compiler: {
    // For other options, see https://styled-components.com/docs/tooling#babel-plugin
    styledComponents: true,
  },

  reactStrictMode: false,

  // 매 `next build` 실행마다 새로 평가되는 값(Docker 이미지 빌드 1회당 1개) — /rain-assist
  // 웹뷰 모드가 배포 후에도 예전 번들을 계속 들고 있는지 감지하는 용도.
  // 자세한 내용은 use-rain-assist-bridge-hook.ts 참고.
  env: { NEXT_PUBLIC_RAIN_ASSIST_BUILD_ID: `${Date.now()}` },

  images: {
    remotePatterns: [
      { hostname: 'kr.object.ncloudstorage.com' },
    ],
  },
  
  output: 'standalone',
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
];

module.exports = composePlugins(...plugins)(nextConfig);