import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@sparticuz/chromium/**',
      'node_modules/puppeteer-core/**',
      'node_modules/@napi-rs/**',
      'node_modules/canvas/**',
      'node_modules/sharp/**',
    ],
  },
};

export default nextConfig;