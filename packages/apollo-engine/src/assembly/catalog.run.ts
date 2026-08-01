/**
 * catalog.run —— 把引擎全部能力（积木）导成 LLM 可读目录，供 ZeroCraft Skill 查询。
 *
 * 这是 Skill 与引擎之间的**唯一接口**：Skill 不把能力清单抄进 prompt（会过期），
 * 而是让 agent 现场跑本命令拿最新清单。新增/修改能力只需改 `describe`，目录自动跟上，
 * 零 prompt 维护（见 capability-catalog.ts 头注释）。
 *
 * 用法：
 *   pnpm --filter @zerocraft/apollo-engine catalog            # 全量目录
 *   pnpm --filter @zerocraft/apollo-engine catalog -- --ids   # 只列 id（省 token）
 *   pnpm --filter @zerocraft/apollo-engine catalog -- --grep 卡牌
 */
import { ALL_CAPABILITIES } from './capability-registry.js';
import { buildCapabilityCatalog } from './capability-catalog.js';

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const valueOf = (flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};

// --grep：按 id / 名称 / 摘要 / whenToUse 粗筛，找“做某类玩法该用哪些积木”。
const keyword = valueOf('--grep');
const caps = keyword
  ? ALL_CAPABILITIES.filter((c) => {
      const d = c.describe;
      const hay = `${c.id} ${d.name} ${d.summary} ${d.whenToUse ?? ''}`.toLowerCase();
      return hay.includes(keyword.toLowerCase());
    })
  : ALL_CAPABILITIES;

if (has('--ids')) {
  // 省 token 模式：先看有哪些 id，再对感兴趣的用 --grep 拉详情。
  console.log(caps.map((c) => c.id).join('\n'));
} else {
  console.log(`# ZeroCraft 引擎能力目录（共 ${caps.length} 项${keyword ? ` · 关键词「${keyword}」` : ''}）`);
  console.log('# 格式：- <id> (<名称>): <摘要> / provides:<提供的组件与字段> / when:<何时用> / e.g.:<示例>');
  console.log('');
  console.log(
    buildCapabilityCatalog(caps, {
      withExamples: !has('--no-examples'),
      withWhenToUse: true,
    }),
  );
}

if (caps.length === 0) {
  console.log('（无匹配能力；换个关键词，或先跑 --ids 看全部 id）');
}
