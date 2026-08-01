import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Apollo 引擎的本地开发预览（`pnpm dev:engine`，入口见 index.html → src/dev-preview.ts）。
 *
 * alias 必须与 `tsconfig.json` 的 paths 及 `vitest.config.ts` 同形 —— 引擎内有 750+ 处
 * `@engine/*` 之类的别名 import，三处任意一处漂移都会出现「tsc 过但运行/测试挂」。
 *
 * optimizeDeps 沿用上游口径：3D 线的重依赖藏在动态 import 的 3D 游戏背后，Vite 冷启动
 * 常漏扫 `three/addons/*` 深子路径 → 首次进 3D 场景才发现 → 触发「依赖再优化 + 整页
 * reload」把人弹回主页。预声明后冷启动一次性预打包，之后不再中途重优化。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@engine': resolve(__dirname, 'src/engine'),
      '@skills': resolve(__dirname, 'src/skills'),
      '@atom-skills': resolve(__dirname, 'src/skills/atoms'),
      '@assets': resolve(__dirname, 'src/assets'),
      '@services': resolve(__dirname, 'src/services'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@net': resolve(__dirname, 'src/net'),
    },
  },
  optimizeDeps: {
    include: [
      'three',
      'cannon-es',
      'three/addons/environments/RoomEnvironment.js',
      'three/addons/loaders/GLTFLoader.js',
      'three/addons/utils/SkeletonUtils.js',
    ],
  },
  server: {
    // 固定端口便于书签/文档引用；被占用时直接报错而不是静默换口，避免「打开的是上一次的旧服务」。
    port: 5180,
    strictPort: true,
  },
});
