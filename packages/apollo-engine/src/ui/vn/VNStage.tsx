import React, { useEffect, useRef, useState } from 'react';
import type { State } from '@engine/protocol/components.js';
import { useWorldVersion } from '../hooks/use-engine.js';
import { useComponent } from '../hooks/use-component.js';
import { optionAvailable, DIALOGUE_ACTION_ADVANCE, DIALOGUE_ACTION_CHOOSE } from '@skills/tier3/index.js';
import { StatPanel } from './StatPanel.js';
import { PortraitSlot } from './PortraitSlot.js';
import { DialogBox } from './DialogBox.js';
import { ChoiceList, type ChoiceItem } from './ChoiceList.js';
import type { VNStageProps } from './types.js';

// ═══════════════════════════════════════════════════════════════
//  通用可主题化 VN 演出组件（R16）。读世界投影成 VN 画面——背景 + 立绘 + 属性面板 + 对话框 + 选项，
//  全部由 theme（配色/字体/形状=数据）+ binding（对话实体/属性/立绘=数据）驱动。
//  任何 VN/乙游换皮 = 换一份主题数据 + 一份绑定数据，零游戏专属 React。
//
//  输入走 R3 确定性接缝（input.enqueueAction → InputQueue → dialogue 能力在 tick 边界消费），
//  不再直接 world.addComponent 改世界（消除原 demo 的 mid-frame hack）。
//  叙事状态住世界里（State/Text/Resource/Flag），React 只读它渲染。
// ═══════════════════════════════════════════════════════════════
export function VNStage({ engine, script, theme, binding, input, width = 760, height = 500 }: VNStageProps): React.ReactElement {
  useWorldVersion(engine);
  const state = useComponent<State>(engine, binding.dialogueEntityId, 'State');
  const node = state ? script[state.current] : undefined;

  // 当前节点演出投影：名牌走 speaker，正文走 line.text / choice|check.prompt，表情走 emotion。
  let speaker: string | undefined;
  let body = '';
  let emotion = 'neutral';
  if (node) {
    speaker = node.speaker;
    emotion = node.emotion ?? 'neutral';
    body = node.kind === 'line' ? node.text : (node.prompt ?? '');
  }

  // 打字机（纯演出，按内容变化重置）。速度取自主题 dialog.typingSpeed。
  const [shown, setShown] = useState(0);
  const prev = useRef('');
  useEffect(() => {
    if (body !== prev.current) {
      prev.current = body;
      setShown(0);
    }
  }, [body]);
  useEffect(() => {
    if (shown >= body.length) return;
    const ms = parseInt(theme.components.dialog.typingSpeed, 10) || 28;
    const tm = setTimeout(() => setShown((n) => n + 1), ms);
    return () => clearTimeout(tm);
  }, [shown, body, theme]);
  const typed = body.slice(0, shown);
  const done = shown >= body.length;

  // R3 接缝：点击 → enqueueAction（tick 边界确定性注入），缺 input 则只读。
  const advance = (): void => input?.enqueueAction(DIALOGUE_ACTION_ADVANCE);
  const choose = (index: number): void => input?.enqueueAction(DIALOGUE_ACTION_CHOOSE, { x: index });

  const isLine = node?.kind === 'line';
  const choiceItems: ChoiceItem[] =
    node?.kind === 'choice'
      ? node.options
          .map((opt, index) => ({ opt, index }))
          .filter(({ opt }) => optionAvailable(engine.world, opt)) // 条件门控：不满足的选项不显示
          .map(({ opt, index }) => ({ text: opt.text, index }))
      : [];
  const continueHint = isLine && done && node?.kind === 'line' ? (node.next ? '▼ 点击继续' : '（完）') : undefined;

  const t = theme.tokens;
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        fontFamily: t.fontFamily,
        color: t.text,
        borderRadius: t.borderRadius,
        background: `linear-gradient(135deg, ${t.bg}, ${t.bgSecondary})`,
      }}
    >
      {/* 立绘 */}
      <div style={{ position: 'absolute', left: 50, bottom: 150 }}>
        <PortraitSlot theme={theme} label={binding.portrait?.label} emotion={emotion} />
      </div>

      {/* 属性面板 */}
      <div style={{ position: 'absolute', top: 12, right: 12 }}>
        <StatPanel engine={engine} theme={theme} title={binding.panelTitle} stats={binding.stats} flags={binding.flags} />
      </div>

      {/* 对话框 + 选项 */}
      <div style={{ position: 'absolute', left: 24, right: 220, bottom: 24 }}>
        <DialogBox theme={theme} speaker={speaker} typedText={typed} clickable={isLine && done} onAdvance={advance} continueHint={continueHint}>
          {node?.kind === 'choice' && done && choiceItems.length > 0 && <ChoiceList theme={theme} options={choiceItems} onChoose={choose} />}
        </DialogBox>
      </div>
    </div>
  );
}
