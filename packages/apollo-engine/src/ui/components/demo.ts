// demo.ts — 验证用示例屏（纯 LayoutNode 数据，零渲染逻辑）。
// 弱模型任务样板：按接口规格写这样的数据，UI Server 负责渲染。

import type { LayoutNode } from './types.js';

/** 设置面板示例：Label + Divider + Dropdown + Button 行 + Badge。 */
export const settingsScreen: LayoutNode = {
  type: 'Panel',
  id: 'settings-root',
  props: { title: 'SETTINGS' },
  layout: { direction: 'column', gap: 16, padding: 20 },
  children: [
    {
      type: 'Label',
      id: 'settings-title',
      props: { text: 'Game Settings', size: 'lg', bold: true },
    },
    { type: 'Divider', id: 'div1', props: {} },
    {
      type: 'Panel',
      id: 'row-volume',
      props: {},
      layout: { direction: 'row', gap: 12, align: 'center', padding: 0 },
      children: [
        {
          type: 'Label',
          id: 'lbl-volume',
          props: { text: 'Volume', color: 'sub' },
          layout: { flex: 1 },
        },
        {
          type: 'Dropdown',
          id: 'dd-volume',
          props: {
            options: [
              { value: '0',   label: 'Off' },
              { value: '50',  label: '50%' },
              { value: '100', label: '100%' },
            ],
            value: '50',
            action: 'setVolume',
          },
        },
      ],
    },
    {
      type: 'Panel',
      id: 'row-theme',
      props: {},
      layout: { direction: 'row', gap: 12, align: 'center', padding: 0 },
      children: [
        {
          type: 'Label',
          id: 'lbl-theme',
          props: { text: 'Theme', color: 'sub' },
          layout: { flex: 1 },
        },
        {
          type: 'Dropdown',
          id: 'dd-theme',
          props: {
            options: [
              { value: 'onyx',   label: '玄铁' },
              { value: 'brocade', label: '锦缎' },
            ],
            value: 'onyx',
            action: 'setTheme',
          },
        },
      ],
    },
    {
      type: 'Input',
      id: 'input-name',
      props: { placeholder: '玩家名称…', value: '', action: 'setName' },
    },
    { type: 'Divider', id: 'div2', props: {} },
    {
      type: 'Panel',
      id: 'row-btns',
      props: {},
      layout: { direction: 'row', gap: 8, align: 'center', padding: 0 },
      children: [
        {
          type: 'Button',
          id: 'btn-cancel',
          props: { label: 'Cancel', kind: 'quiet', action: 'close' },
          layout: { flex: 1 },
        },
        {
          type: 'Button',
          id: 'btn-save',
          props: { label: 'Save', kind: 'primary', action: 'save' },
          layout: { flex: 1 },
        },
      ],
    },
    {
      type: 'Badge',
      id: 'version-badge',
      props: { text: 'UI Server v0.1 · ZeroCraft Engine', tone: 'dim' },
    },
  ],
};
