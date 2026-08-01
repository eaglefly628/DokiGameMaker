// 文本换行布局（纯函数，可测；渲染器注入 measure=ctx.measureText 宽度）。
// 先按 \n 硬换行；每段再按 maxWidth 自动换行：优先在空格处断词（拉丁文友好），
// 单个超宽 token 退化为按字符断（CJK 无空格亦可正确换行）。maxWidth<=0 → 只硬换行。

export type MeasureFn = (text: string) => number;

function breakLongToken(token: string, maxWidth: number, measure: MeasureFn, lines: string[]): string {
  let chunk = '';
  for (const ch of token) {
    if (chunk !== '' && measure(chunk + ch) > maxWidth) {
      lines.push(chunk);
      chunk = ch;
    } else {
      chunk += ch;
    }
  }
  return chunk; // 余量（成为后续行的起点）
}

function wrapParagraph(text: string, maxWidth: number, measure: MeasureFn): string[] {
  if (text === '') return [''];
  const lines: string[] = [];
  const tokens = text.split(/(\s+)/); // 保留空白分隔符
  let cur = '';
  for (const tok of tokens) {
    if (tok === '') continue;
    if (cur === '' || measure(cur + tok) <= maxWidth) {
      cur += tok;
      // 行首即超宽的长 token：按字符断
      if (measure(cur) > maxWidth) {
        cur = breakLongToken(cur, maxWidth, measure, lines);
      }
    } else {
      lines.push(cur.trimEnd());
      cur = tok.trimStart();
      if (measure(cur) > maxWidth) {
        cur = breakLongToken(cur, maxWidth, measure, lines);
      }
    }
  }
  if (cur.trimEnd() !== '' || lines.length === 0) lines.push(cur.trimEnd());
  return lines;
}

export function wrapLines(content: string, maxWidth: number, measure: MeasureFn): string[] {
  const paras = content.split('\n');
  if (maxWidth <= 0) return paras;
  return paras.flatMap((p) => wrapParagraph(p, maxWidth, measure));
}
