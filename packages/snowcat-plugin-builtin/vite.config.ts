import { defineConfig } from 'vite';
import { resolve } from 'path';
import nodeResolve from '@rollup/plugin-node-resolve';
import { builtinModules } from 'module';

const nodeModules = [...builtinModules, builtinModules.map((m) => `node:${m}`)].flat();
// 依赖排除
const external = [];

export default defineConfig({
  resolve: {
    conditions: ['node', 'default'],
    alias: {
      '@/snowcat-core': resolve(__dirname, '../snowcat-core'),
      '@': resolve(__dirname, '../'),
      // snowcat-types 的类型是 tsc-alias 重排后落在 dist/<pkg>/ 下的（包根无实体文件，
      // workspace 链接解析深层路径会失败），这里把深层导入直接映射到 dist。
      'snowcat-types/snowcat-onebot': resolve(__dirname, '../snowcat-types/dist/snowcat-onebot'),
      'snowcat-types/snowcat-core': resolve(__dirname, '../snowcat-types/dist/snowcat-core'),
      'snowcat-types/snowcat-common': resolve(__dirname, '../snowcat-types/dist/snowcat-common'),
      'snowcat-types/snowcat-webui-backend': resolve(__dirname, '../snowcat-types/dist/snowcat-webui-backend'),
      'snowcat-types': resolve(__dirname, '../snowcat-types/dist/snowcat-types'),
    },
  },
  build: {
    sourcemap: false,
    target: 'esnext',
    minify: false,
    lib: {
      entry: 'index.ts',
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    rollupOptions: {
      external: [...nodeModules, ...external],
    },
  },
  plugins: [nodeResolve()],
});
