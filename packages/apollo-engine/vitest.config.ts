import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Apollo 引擎（vendored）的测试配置。
 *
 * alias 与上游 vite.config.ts 保持一致——引擎内部有 750+ 处 `@engine/*` 之类的
 * 别名 import，宿主侧不配同名 alias 就全部解析失败。改动时与
 * `tsconfig.json` 的 paths 同步（两者必须同形，否则 tsc 过而 vitest 挂）。
 *
 * 上游的「快/慢双车道」在此保留语义：默认排除耗时最长的冻结游戏与整局通关走查，
 * `APOLLO_DEEP=1` 跑全量。上游 exclude 里针对 scripts/*.test.mjs 的条目在本包
 * 不适用（那些脚本测试留在上游仓，本包 tools/ 下的 .test.mjs 不经 vitest 跑）。
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
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // 美术库内容守卫：整文件断言「公用 3D 素材货架（mat/*、基础 glb、天空盒）是否在
      // assets/index.json 在册」。该索引与其 6373 个美术文件未随引擎 vendored 进本仓
      // （见 SYNC.json excluded），故本文件整体不适用——它测的是上游美术库的库存，
      // 不是引擎代码。搬入美术库后删掉本行即恢复。
      'src/assets/shelf-3d.test.ts',
      ...(process.env.APOLLO_DEEP === '1'
        ? []
        : [
            // 上游「快车道」口径：冻结游戏 game-f（26s/133 测，无人开发）只在慢车道跑。
            'src/games/game-f/**',
          ]),
    ],
  },
});
