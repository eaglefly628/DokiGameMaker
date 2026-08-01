/**
 * 项目自动化（`.cindy/automations/schedules.json`）的总开关。
 *
 * File: <userData>/project-automation-settings.json
 *
 * ⚠️ 为什么需要这个开关(2026-08-01 新增,安全加固):
 * 项目自动化把**被打开的工作目录**里的 `.cindy/automations/schedules.json` 当作
 * 强制配置同步进调度器(loader 注释原文:"Project schedules are mandatory
 * project-lead configuration… Users cannot reject them"),而其中的
 * `preRunHook.command` 经 `spawn(command, { shell: true })` 由系统 shell 执行、
 * 且校验只要求非空字符串(无白名单);即便不写 hook,`prompt` + `cronExpr` 本身
 * 也等于"定时唤起一个可执行命令的 agent 会话"。叠加 `reconcileAll()` 在调度器
 * 启动时无条件遍历所有已知 workingDir ——**任何能向被打开仓库推送的人,都等于
 * 能在本机定时执行任意命令**。
 *
 * 因此默认 **关闭**(`enabled: false`):打开一个第三方/多人协作仓库不应隐式获得
 * 本机执行权。用户显式打开后才生效,语义是"我信任我打开的这些目录的维护者"。
 *
 * 关闭时 loader 视同「配置文件不存在」:既不读盘也不同步,并清理掉已落库的
 * project 来源日程(见 project-automation-loader 的 enabled 短路)。
 */

import { app } from 'electron';
import path from 'node:path';

import { desktopMakerLogger } from './maker-host/logger-adapter.js';
import {
  createOverrideSettingsFile,
  type OverrideSettingsState,
} from './maker-host/override-settings-file.js';

const log = desktopMakerLogger.child('project-automation-settings-store');

export interface ProjectAutomationSettings {
  /** 是否允许工作目录里的 `.cindy/automations/schedules.json` 生效。默认 false。 */
  enabled: boolean;
}

/** 安全默认:关。理由见文件头。 */
const DEFAULTS: ProjectAutomationSettings = {
  enabled: false,
};

function settingsFilePath(): string {
  return path.join(app.getPath('userData'), 'project-automation-settings.json');
}

function normalize(raw: unknown): ProjectAutomationSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
  const r = raw as Record<string, unknown>;
  // 只认真正的 true;任何非布尔值(含字符串 "true")一律回落默认关,
  // 不让被投毒/损坏的配置把闸门"意外"打开。
  return { enabled: r.enabled === true };
}

const store = createOverrideSettingsFile<ProjectAutomationSettings>({
  filePath: settingsFilePath,
  defaults: DEFAULTS,
  normalize,
  log,
  label: 'project-automation',
});

export function readProjectAutomationSettings(): ProjectAutomationSettings {
  return store.read();
}

export function readProjectAutomationSettingsState(): OverrideSettingsState<ProjectAutomationSettings> {
  return store.readState();
}

/** 项目自动化是否启用(loader 的唯一判据)。读失败一律按关处理(fail-closed)。 */
export function isProjectAutomationEnabled(): boolean {
  try {
    return store.read().enabled === true;
  } catch {
    return false;
  }
}

export function writeProjectAutomationEnabled(enabled: boolean): ProjectAutomationSettings {
  store.writePatch({ enabled: enabled === true });
  return store.read();
}

export function resetProjectAutomationSettings(): ProjectAutomationSettings {
  return store.reset();
}

export const __testing = { normalize, DEFAULTS };
