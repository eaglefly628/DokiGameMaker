// Game I · 爱诗视频样例（底座「AIGP 视频生成端口 + Video 控件」展示）
//
// 爱诗(AIGP)= 引擎的视频生成端口（services/aigp·AishePort）：游戏数据「外观→提示词」→ generate() →
// 竖屏短视频句柄（异步·status/url）。Null 后端即时返回占位句柄（about:aishe#N·不发网络·不可播），
// 真后端（HttpAishePort）调外部 provider 出真片。这是游戏的「输出点」（分享/开场/转场）。
// 视图用引擎新下沉的 Video 控件（数据驱动 <video>）展示——src=句柄 url、poster=占位海报。
//
// 红线：端口在 sim 之外（不碰 world/hash）；视图是纯 LayoutNode 数据；宿主只调端口 + 局部更新（同声音台）。

import type { LayoutNode } from '@ui/components/index.js';
import type { AisheVideoHandle } from '@services/aigp/index.js';

export type { AisheVideoHandle };

// 示例提示词（数据·模拟「外观→提示词」表的产物）。
export const SAMPLE_PROMPT = '青瓷将领·墨蓝铠甲·赵子龙·长枪挑灯·竖屏国风短视频·电影感运镜·9:16';

export interface AisheState { handle: AisheVideoHandle | null; generating: boolean }
export const INITIAL_AISHE: AisheState = { handle: null, generating: false };

// 竖屏 9:16 占位海报（内联 SVG·自包含·无外部资源）：真片由爱诗 provider 出，这里示意「视频帧」。
const POSTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="270" height="480" viewBox="0 0 270 480">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#16243a"/><stop offset="1" stop-color="#0a0f1e"/></linearGradient></defs>
<rect width="270" height="480" fill="url(#g)"/>
<circle cx="135" cy="220" r="46" fill="rgba(156,210,197,0.16)" stroke="#9cd2c5" stroke-width="2"/>
<path d="M123 198 L123 242 L160 220 Z" fill="#9cd2c5"/>
<text x="135" y="312" fill="#e3e8f0" font-family="sans-serif" font-size="22" font-weight="700" text-anchor="middle">爱诗 AI</text>
<text x="135" y="342" fill="#7f8aa0" font-family="sans-serif" font-size="13" text-anchor="middle">竖屏短视频 · 9:16</text>
<text x="135" y="446" fill="#5d6880" font-family="sans-serif" font-size="11" text-anchor="middle">AIGP 生成 · 占位帧</text>
</svg>`;
export const POSTER_URI = `data:image/svg+xml,${encodeURIComponent(POSTER_SVG)}`;

/** 爱诗视频样例视图：提示词 + 生成按钮 + 句柄状态 + Video 控件（竖屏·占位海报）。 */
export function buildVideoLab(s: AisheState): LayoutNode {
  const h = s.handle;
  const statusText = s.generating ? '⏳ 生成中…'
    : h ? `✅ 就绪 · ${h.id}` : '— 未生成（点下方按钮）';
  const statusTone: 'ok' | 'warn' | 'dim' = s.generating ? 'warn' : h ? 'ok' : 'dim';

  return {
    type: 'Panel', id: 'video-lab', props: {},
    layout: { direction: 'column', gap: 12, padding: 18 },
    children: [
      // 标题条
      { type: 'Panel', id: 'vl-hd', props: {}, layout: { direction: 'row', align: 'center', gap: 10, padding: 12 },
        children: [
          { type: 'Label', id: 'vl-ttl', props: { text: '🎬  爱诗视频 · AIGP 生成端口', size: 'lg', bold: true }, layout: { flex: 1 } },
          { type: 'Badge', id: 'vl-backend', props: { text: 'Null 占位后端', tone: 'dim' } },
        ] },
      { type: 'Label', id: 'vl-desc', props: {
        text: '爱诗(AIGP)是引擎的视频生成端口：游戏数据「外观→提示词」→ AishePort.generate → 竖屏短视频句柄（异步）。Null 后端即时返回占位句柄（about:…·不发网络），真后端 HttpAishePort 调外部 provider 出真片。这是游戏的「输出点」。',
        color: 'sub', size: 'sm' } },

      // 主体：左 = 提示词 + 生成 + 状态；右 = 竖屏 Video
      { type: 'Panel', id: 'vl-body', props: {}, layout: { direction: 'row', gap: 16, padding: 0, align: 'start' },
        children: [
          { type: 'Panel', id: 'vl-left', props: { title: '提示词（数据·外观表产物）' }, layout: { direction: 'column', gap: 10, padding: 14, flex: 1 },
            children: [
              { type: 'Label', id: 'vl-prompt', props: { text: SAMPLE_PROMPT, color: 'text', size: 'sm', mono: true } },
              { type: 'Button', id: 'vl-gen', props: { label: s.generating ? '⏳ 生成中…' : '🎬 生成竖屏视频', kind: 'primary', action: 'aisheGen', disabled: s.generating } },
              { type: 'Divider', id: 'vl-d1', props: {} },
              { type: 'Label', id: 'vl-status', props: { text: `句柄状态：${statusText}`, color: statusTone === 'dim' ? 'dim' : statusTone === 'ok' ? 'jade' : 'warn', bold: true, size: 'sm' } },
              { type: 'Label', id: 'vl-url', props: { text: h ? `url：${h.url ?? '—'}` : 'url：—', color: 'dim', size: 'xs', mono: true } },
            ] },
          // 竖屏 Video 控件（占位海报；真片时 src=句柄 url）
          { type: 'Video', id: 'vl-video', props: { src: h?.url, poster: POSTER_URI, controls: true }, layout: { width: 240, height: 426 } },
        ] },

      // 组合能力标签
      { type: 'Panel', id: 'vl-caps', props: {}, layout: { direction: 'row', align: 'center', gap: 6, padding: 10 },
        children: [
          { type: 'Label', id: 'vl-capl', props: { text: '组合能力', color: 'dim', size: 'xs', bold: true } },
          { type: 'Tag', id: 'vl-cap-0', props: { label: 'services/aigp · AishePort', tone: 'accent' } },
          { type: 'Tag', id: 'vl-cap-1', props: { label: 'Video 控件', tone: 'accent' } },
        ] },
    ],
  };
}
