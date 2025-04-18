const { NxWebpackPlugin } = require('@nx/webpack');

const { join } = require('path');

module.exports = {
  output: { path: join(__dirname, '../../dist/app/my-bot-server-app') },
  plugins: [
    new NxWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: [ './src/assets' ],
      optimization: false,
      outputHashing: 'none',
    }),
  ],
};