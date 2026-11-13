import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
  resolve: {
    alias: [
      // 精确优先：webui-backend 入口走 shim（绕开 Debug.ts 循环 extends）
      { find: /^snowcat-webui-backend\/index$/, replacement: resolve(__dirname, './shims/webui-backend-index.ts') },
      { find: /^snowcat-webui-backend\/src\/helper\/Data$/, replacement: resolve(__dirname, '../snowcat-webui-backend/src/helper/Data.ts') },
      { find: /^snowcat-webui-backend$/, replacement: resolve(__dirname, './shims/webui-backend-index.ts') },
      { find: /^@\/snowcat-webui-backend/, replacement: resolve(__dirname, '../snowcat-webui-backend') },
      { find: /^snowcat-common\/src/, replacement: resolve(__dirname, '../snowcat-common/src') },
      { find: /^snowcat-common$/, replacement: resolve(__dirname, '../snowcat-common/src/index.ts') },
      { find: /^snowcat-pty$/, replacement: resolve(__dirname, '../snowcat-pty/node-pty.d.ts') },
      { find: /^snowcat-protobuf$/, replacement: resolve(__dirname, '../snowcat-protobuf/NapProto.ts') },
      { find: /^snowcat-core\/packet/, replacement: resolve(__dirname, '../snowcat-core/packet') },
      { find: /^snowcat-core\/helper/, replacement: resolve(__dirname, '../snowcat-core/helper') },
      { find: /^snowcat-core\/types/, replacement: resolve(__dirname, '../snowcat-core/types') },
      { find: /^@\/snowcat-rpc/, replacement: resolve(__dirname, '../snowcat-rpc') },
      { find: /^@\/snowcat-image-size/, replacement: resolve(__dirname, '../snowcat-image-size') },
      { find: /^@\/snowcat-test/, replacement: resolve(__dirname, '.') },
      { find: /^@\/snowcat-common/, replacement: resolve(__dirname, '../snowcat-common') },
      { find: /^@\/snowcat-core/, replacement: resolve(__dirname, '../snowcat-core') },
      { find: /^@\/snowcat-onebot/, replacement: resolve(__dirname, '../snowcat-onebot') },
    ],
  },
});
