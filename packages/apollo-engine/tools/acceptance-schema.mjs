#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/acceptance-schema.mjs —— 验收剧本 schema 校验器（REQ-ACCEPT·图纸①）
//
//  背景（「绿门不可玩」复盘·owner 2026-07-17）：S4 walkthrough=PE 自写自测——理解错则测码同错、
//  门照绿。药方＝GD（懂规则方）写「验收剧本」纯数据，harness 驱动真引擎逐步对账。本文件是那份剧本
//  的**闭集 schema**：坏剧本装载即错（带行位），杜绝「随便写点 JSON 也算剧本」。
//
//  剧本形态（docs/design/<game>/acceptance/*.scenario.jsonc）：
//    { name, game, seed, config?, steps:[ {signal,args?,by?} | {tick:N} | {expect:[断言…]} ] }
//  断言闭集（只读世界机读态·不读 DOM）：
//    {res:"名", eq|gte|lte:数}      —— Resource.current
//    {flag:"名", eq:布尔}           —— Flag.active
//    {sv:"名", eq:字符串}           —— StringVar.value
//    {comp:{entity,component,field}, eq:值}  —— 任意组件字段
//
//  纯 JS·零依赖·可被 vitest(.test.mjs) 与 runner(vite-node) 共用。内置一个带行位的 JSONC 解析器
//  （允许 // 与 /* */ 注释、尾逗号），因 GD 手写剧本要注释；解析/校验错都带 {line,col} 便于回喂修。
// ═══════════════════════════════════════════════════════════════

const LOC = Symbol('loc'); // 非枚举源位（不进 Object.keys / JSON.stringify）

export class JsoncSyntaxError extends Error {
  constructor(msg, line, col) {
    super(msg);
    this.name = 'JsoncSyntaxError';
    this.line = line;
    this.col = col;
  }
}

/** 源位读取（供 runner/测试拿到某步/某断言在文件里的行位）。无源位（合成对象）→ undefined。 */
export function locOf(node) {
  return node && typeof node === 'object' ? node[LOC] : undefined;
}

// ── 带行位的 JSONC 解析器（递归下降·允许注释 + 尾逗号）──────────────────
export function parseJsonc(text) {
  let i = 0, line = 1, col = 1;
  const n = text.length;

  const advance = () => {
    const ch = text[i++];
    if (ch === '\n') { line++; col = 1; } else { col++; }
    return ch;
  };
  const at = (k = 0) => text[i + k];

  function skipTrivia() {
    for (;;) {
      const ch = text[i];
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') { advance(); continue; }
      if (ch === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') advance(); continue; }
      if (ch === '/' && text[i + 1] === '*') {
        advance(); advance();
        while (i < n && !(text[i] === '*' && text[i + 1] === '/')) advance();
        if (i < n) { advance(); advance(); } else throw new JsoncSyntaxError('块注释 /* 未闭合', line, col);
        continue;
      }
      break;
    }
  }

  function markLoc(obj, l, c) {
    Object.defineProperty(obj, LOC, { value: { line: l, col: c }, enumerable: false, configurable: true });
    return obj;
  }

  function parseValue() {
    skipTrivia();
    const ch = text[i];
    if (ch === undefined) throw new JsoncSyntaxError('意外的文件结尾（期望一个值）', line, col);
    if (ch === '{') return parseObject();
    if (ch === '[') return parseArray();
    if (ch === '"') return parseString();
    if (ch === '-' || (ch >= '0' && ch <= '9')) return parseNumber();
    if (text.startsWith('true', i)) { for (let k = 0; k < 4; k++) advance(); return true; }
    if (text.startsWith('false', i)) { for (let k = 0; k < 5; k++) advance(); return false; }
    if (text.startsWith('null', i)) { for (let k = 0; k < 4; k++) advance(); return null; }
    throw new JsoncSyntaxError(`意外的字符 ${JSON.stringify(ch)}`, line, col);
  }

  function parseObject() {
    const l = line, c = col;
    advance(); // {
    const obj = markLoc({}, l, c);
    skipTrivia();
    if (text[i] === '}') { advance(); return obj; }
    for (;;) {
      skipTrivia();
      if (text[i] === '}') { advance(); return obj; } // 尾逗号后闭合
      if (text[i] !== '"') throw new JsoncSyntaxError('对象键须为字符串', line, col);
      const key = parseString();
      skipTrivia();
      if (text[i] !== ':') throw new JsoncSyntaxError(`键 ${JSON.stringify(key)} 后期望 ':'`, line, col);
      advance();
      obj[key] = parseValue();
      skipTrivia();
      const sep = text[i];
      if (sep === ',') { advance(); continue; }
      if (sep === '}') { advance(); return obj; }
      throw new JsoncSyntaxError(`对象成员后期望 ',' 或 '}'`, line, col);
    }
  }

  function parseArray() {
    const l = line, c = col;
    advance(); // [
    const arr = markLoc([], l, c);
    skipTrivia();
    if (text[i] === ']') { advance(); return arr; }
    for (;;) {
      skipTrivia();
      if (text[i] === ']') { advance(); return arr; } // 尾逗号后闭合
      arr.push(parseValue());
      skipTrivia();
      const sep = text[i];
      if (sep === ',') { advance(); continue; }
      if (sep === ']') { advance(); return arr; }
      throw new JsoncSyntaxError(`数组元素后期望 ',' 或 ']'`, line, col);
    }
  }

  function parseString() {
    advance(); // opening "
    let s = '';
    for (;;) {
      const ch = text[i];
      if (ch === undefined) throw new JsoncSyntaxError('字符串未闭合', line, col);
      if (ch === '"') { advance(); return s; }
      if (ch === '\n') throw new JsoncSyntaxError('字符串内不允许裸换行', line, col);
      if (ch === '\\') {
        advance();
        const esc = text[i];
        if (esc === '"') { s += '"'; advance(); }
        else if (esc === '\\') { s += '\\'; advance(); }
        else if (esc === '/') { s += '/'; advance(); }
        else if (esc === 'b') { s += '\b'; advance(); }
        else if (esc === 'f') { s += '\f'; advance(); }
        else if (esc === 'n') { s += '\n'; advance(); }
        else if (esc === 'r') { s += '\r'; advance(); }
        else if (esc === 't') { s += '\t'; advance(); }
        else if (esc === 'u') {
          advance();
          let hex = '';
          for (let k = 0; k < 4; k++) { const h = text[i]; if (!/[0-9a-fA-F]/.test(h || '')) throw new JsoncSyntaxError('\\u 转义须跟 4 位十六进制', line, col); hex += h; advance(); }
          s += String.fromCharCode(parseInt(hex, 16));
        } else throw new JsoncSyntaxError(`非法转义 \\${esc ?? ''}`, line, col);
        continue;
      }
      s += ch;
      advance();
    }
  }

  function parseNumber() {
    const re = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m || m.index !== i) throw new JsoncSyntaxError('非法数字', line, col);
    const raw = m[0];
    for (let k = 0; k < raw.length; k++) advance(); // 数字无换行·col 逐位推进
    return Number(raw);
  }

  skipTrivia();
  const value = parseValue();
  skipTrivia();
  if (i < n) throw new JsoncSyntaxError(`文件尾部有多余内容 ${JSON.stringify(text[i])}`, line, col);
  return value;
}

// ── schema 校验（闭集·严格·未知键即错）───────────────────────────────
const ASSERT_KINDS = ['res', 'flag', 'sv', 'comp'];
const isPlainObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function checkNoExtraKeys(obj, allowed, path, errs) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) errs.push(mk(path, obj, `未知字段 ${JSON.stringify(k)}（闭集只认 ${allowed.join('/')}）`));
  }
}
function mk(path, node, msg) {
  const l = locOf(node);
  return { path, line: l?.line, col: l?.col, msg };
}

function validateAssertion(a, path, errs) {
  if (!isPlainObj(a)) { errs.push(mk(path, a, '断言须为对象')); return; }
  const kinds = ASSERT_KINDS.filter((k) => k in a);
  if (kinds.length === 0) { errs.push(mk(path, a, `断言须含 ${ASSERT_KINDS.join('/')} 之一（闭集）`)); return; }
  if (kinds.length > 1) { errs.push(mk(path, a, `断言只能是一种：同时含 ${kinds.join('+')}`)); return; }
  const kind = kinds[0];
  if (kind === 'res') {
    if (typeof a.res !== 'string' || !a.res) errs.push(mk(path, a, 'res 须为非空字符串（资源 id）'));
    const cmps = ['eq', 'gte', 'lte'].filter((c) => c in a);
    if (cmps.length !== 1) errs.push(mk(path, a, `res 断言须恰有一个比较算子 eq/gte/lte（现 ${cmps.length} 个）`));
    else if (typeof a[cmps[0]] !== 'number') errs.push(mk(path, a, `res 的 ${cmps[0]} 值须为数字`));
    checkNoExtraKeys(a, ['res', 'eq', 'gte', 'lte'], path, errs);
  } else if (kind === 'flag') {
    if (typeof a.flag !== 'string' || !a.flag) errs.push(mk(path, a, 'flag 须为非空字符串（flag id）'));
    if (typeof a.eq !== 'boolean') errs.push(mk(path, a, 'flag 断言须带 eq:布尔'));
    checkNoExtraKeys(a, ['flag', 'eq'], path, errs);
  } else if (kind === 'sv') {
    if (typeof a.sv !== 'string' || !a.sv) errs.push(mk(path, a, 'sv 须为非空字符串（StringVar id）'));
    if (typeof a.eq !== 'string') errs.push(mk(path, a, 'sv 断言须带 eq:字符串'));
    checkNoExtraKeys(a, ['sv', 'eq'], path, errs);
  } else if (kind === 'comp') {
    const c = a.comp;
    if (!isPlainObj(c)) errs.push(mk(path, a, 'comp 须为对象 {entity,component,field}'));
    else {
      for (const f of ['entity', 'component', 'field']) {
        if (typeof c[f] !== 'string' || !c[f]) errs.push(mk(path, a, `comp.${f} 须为非空字符串`));
      }
      checkNoExtraKeys(c, ['entity', 'component', 'field'], `${path}.comp`, errs);
    }
    if (!('eq' in a)) errs.push(mk(path, a, 'comp 断言须带 eq:期望值'));
    checkNoExtraKeys(a, ['comp', 'eq'], path, errs);
  }
}

function validateStep(s, path, errs) {
  if (!isPlainObj(s)) { errs.push(mk(path, s, '步骤须为对象')); return; }
  const disc = ['signal', 'tick', 'expect'].filter((k) => k in s);
  if (disc.length === 0) { errs.push(mk(path, s, '步骤须为 signal/tick/expect 之一（闭集）')); return; }
  if (disc.length > 1) { errs.push(mk(path, s, `步骤只能是一种：同时含 ${disc.join('+')}`)); return; }
  const kind = disc[0];
  if (kind === 'signal') {
    if (typeof s.signal !== 'string' || !s.signal) errs.push(mk(path, s, 'signal 须为非空字符串'));
    if ('args' in s && !isPlainObj(s.args)) errs.push(mk(path, s, 'args 须为对象'));
    if ('by' in s && typeof s.by !== 'string') errs.push(mk(path, s, 'by 须为字符串'));
    checkNoExtraKeys(s, ['signal', 'args', 'by'], path, errs);
  } else if (kind === 'tick') {
    if (!Number.isInteger(s.tick) || s.tick < 1) errs.push(mk(path, s, 'tick 须为 ≥1 的整数'));
    checkNoExtraKeys(s, ['tick'], path, errs);
  } else if (kind === 'expect') {
    if (!Array.isArray(s.expect) || s.expect.length === 0) errs.push(mk(path, s, 'expect 须为非空断言数组'));
    else s.expect.forEach((a, j) => validateAssertion(a, `${path}.expect[${j}]`, errs));
    checkNoExtraKeys(s, ['expect'], path, errs);
  }
}

/** 校验一份剧本值 → {ok, errors:[{path,line?,col?,msg}]}。严格闭集·未知字段即错。 */
export function validateScenario(v) {
  const errs = [];
  if (!isPlainObj(v)) return { ok: false, errors: [{ path: '', msg: '剧本根须为对象' }] };
  if (typeof v.name !== 'string' || !v.name) errs.push(mk('name', v, 'name 须为非空字符串'));
  if (typeof v.game !== 'string' || !v.game) errs.push(mk('game', v, 'game 须为非空字符串（游戏 slug）'));
  if (!Number.isInteger(v.seed) || v.seed < 0) errs.push(mk('seed', v, 'seed 须为 ≥0 的整数（确定性种子）'));
  if ('config' in v && !isPlainObj(v.config)) errs.push(mk('config', v, 'config 须为对象'));
  if (!Array.isArray(v.steps) || v.steps.length === 0) errs.push(mk('steps', v, 'steps 须为非空数组'));
  else v.steps.forEach((s, k) => validateStep(s, `steps[${k}]`, errs));
  checkNoExtraKeys(v, ['name', 'game', 'seed', 'config', 'steps'], '', errs);
  return { ok: errs.length === 0, errors: errs };
}

/** 文本 → 解析 + 校验 → {ok, value?, errors}。语法错也归一成 errors（带行位）。 */
export function parseAndValidate(text) {
  let value;
  try {
    value = parseJsonc(text);
  } catch (e) {
    if (e instanceof JsoncSyntaxError) return { ok: false, errors: [{ path: '', line: e.line, col: e.col, msg: `JSONC 语法错误: ${e.message}` }] };
    return { ok: false, errors: [{ path: '', msg: `解析失败: ${e?.message ?? e}` }] };
  }
  const r = validateScenario(value);
  return { ok: r.ok, value: r.ok ? value : undefined, errors: r.errors };
}

/** 错误列表格式化（带行位·回喂 GD 修）。 */
export function formatErrors(errors) {
  return errors.map((e) => {
    const at = e.line ? ` (第 ${e.line} 行${e.col ? ':' + e.col : ''})` : '';
    const p = e.path ? `${e.path}: ` : '';
    return `  ✗ ${p}${e.msg}${at}`;
  }).join('\n');
}
