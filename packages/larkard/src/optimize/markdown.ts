/**
 * 预测 markdown 元素的高度。
 *
 * 只复刻「占高」相关的那部分渲染规则：
 * - 行内元素（加粗 / 链接 / 行内代码 / emoji / @人 / text_tag / number_tag /
 *   link / a）先归一成文字原子；
 * - 块级构造（标题 / 列表 / 引用 / 代码块 / 分割线 / 空行）按 renderer `parseMarkdown`
 *   的分块方式累加；
 * - 换行按 CSS `word-break: break-word` + `white-space: pre-wrap` 的贪心折行估算。
 *
 * 不追求像素级复刻字体排版；目标是「比真机多一行」而不是少一行——统一高度多出来的
 * 是留白，少一行就会裁字（interactive_container 在真机上是 overflow:hidden）。
 */
import { HEADING_LEVELS } from '../content/metrics.js';
import type { MeasureText } from './types.js';

/** 行内文字原子。 */
export interface InlineAtom {
  text: string;
  bold: boolean;
  fontSize: number;
  /** 不能拆开的整体（text_tag / @人 / emoji）。 */
  atomic?: boolean;
  /** 固定宽度（em），用于 emoji / @人这类拿不到字形宽度的原子。 */
  fixedEm?: number;
  /** 额外固定宽度（px）：行内代码的描边和内边距、text_tag 的左右 margin。 */
  extraPx?: number;
}

export interface MarkdownMetrics {
  fontSize: number;
  lineHeight: number;
  bold: boolean;
  measure: MeasureText;
  /** `lines` / `text_lines`：超出行数截断。 */
  maxLines?: number;
}

const RE_HEADING = /^(#{1,6})\s+(.*)$/;
const RE_HR = /^\s*([-*_])\1{2,}\s*$/;
const RE_LIST = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
const RE_FENCE = /^\s*```(.*)$/;
const RE_BLOCKQUOTE = /^\s*>\s?/;

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_\-./'"]/.test(ch);
}

function isCjkChar(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp == null) return false;
  return (
    (cp >= 0x1100 && cp <= 0x115f)
    || (cp >= 0x2e80 && cp <= 0xa4cf)
    || (cp >= 0xac00 && cp <= 0xd7a3)
    || (cp >= 0xf900 && cp <= 0xfaff)
    || (cp >= 0xfe30 && cp <= 0xfe4f)
    || (cp >= 0xff00 && cp <= 0xff60)
    || (cp >= 0xffe0 && cp <= 0xffe6)
    || (cp >= 0x20000 && cp <= 0x2fa1f)
    || (cp >= 0x2600 && cp <= 0x27bf)
    || (cp >= 0x1f000 && cp <= 0x1faff)
  );
}

/** 把普通文字切成「可断行单元」：CJK 每字一个，拉丁单词/空格各成一单元。 */
function splitUnits(atom: InlineAtom): InlineAtom[] {
  if (atom.atomic || atom.fixedEm != null) return [atom];
  const out: InlineAtom[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) {
      out.push({ ...atom, text: buffer });
      buffer = '';
    }
  };
  for (const ch of atom.text) {
    if (isCjkChar(ch) || ch === '\t') {
      flush();
      out.push({ ...atom, text: ch, atomic: true });
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      out.push({ ...atom, text: ch, atomic: true });
      continue;
    }
    if (isWordChar(ch)) {
      buffer += ch;
      continue;
    }
    // 其它 ASCII 标点：跟在前一个单词后面，避免在标点前断行。
    if (buffer) {
      buffer += ch;
      continue;
    }
    out.push({ ...atom, text: ch, atomic: true });
  }
  flush();
  return out;
}

function unitWidth(unit: InlineAtom, measure: MeasureText): number {
  if (unit.fixedEm != null) return unit.fixedEm * unit.fontSize;
  return measure(unit.text, unit.fontSize, unit.bold) + (unit.extraPx ?? 0);
}

/** 贪心折行：返回视觉行数（至少 1）。 */
export function countVisualLines(
  atoms: readonly InlineAtom[],
  width: number,
  measure: MeasureText,
): number {
  if (width <= 0) return 1;
  let lines = 1;
  let lineWidth = 0;
  for (const atom of atoms) {
    for (const unit of splitUnits(atom)) {
      const w = unitWidth(unit, measure);
      if (lineWidth > 0 && lineWidth + w > width) {
        lines += 1;
        lineWidth = 0;
      }
      if (w <= width) {
        lineWidth += w;
        continue;
      }
      // 单元本身比整行还宽：逐字断开。atomic 单元（text_tag / @人）按整体溢出。
      if (unit.atomic) {
        lineWidth += w;
        continue;
      }
      for (const ch of unit.text) {
        const cw = measure(ch, unit.fontSize, unit.bold);
        if (lineWidth > 0 && lineWidth + cw > width) {
          lines += 1;
          lineWidth = 0;
        }
        lineWidth += cw;
      }
    }
  }
  return lines;
}

/**
 * 行内 markdown → 原子数组。遇到本优化器无法可靠测量的构造（图片 / 音频）返回
 * `undefined`，让上层跳过整组等高，而不是猜一个可能裁字的高度。
 */
export function parseInline(
  source: string,
  fontSize: number,
  bold = false,
): InlineAtom[] | undefined {
  const out: InlineAtom[] = [];
  let buffer = '';
  let isBold = bold;
  const pushText = (text: string) => {
    if (!text) return;
    out.push({ text, bold: isBold, fontSize });
  };
  const flush = () => {
    pushText(buffer);
    buffer = '';
  };

  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const ch = source[i]!;

    if (ch === '\\' && i + 1 < source.length) {
      buffer += source[i + 1];
      i += 2;
      continue;
    }
    if (rest.startsWith('**')) {
      flush();
      isBold = !isBold;
      i += 2;
      continue;
    }
    if (rest.startsWith('~~')) {
      flush();
      i += 2;
      continue;
    }
    if (ch === '*' || ch === '_') {
      const prev = source[i - 1];
      const next = source[i + 1];
      const boundaryOk = ch === '*' || !isWordChar(prev ?? '') || !isWordChar(next ?? '');
      if (boundaryOk) {
        flush();
        i += 1;
        continue;
      }
    }
    if (ch === '`') {
      const end = source.indexOf('`', i + 1);
      if (end !== -1) {
        flush();
        out.push({
          text: source.slice(i + 1, end),
          bold: false,
          fontSize: 13,
          atomic: true,
          extraPx: 5,
        });
        i = end + 1;
        continue;
      }
    }
    if (ch === '!' && source[i + 1] === '[') {
      // 行内图片带真实宽高，服务端拿不到；不猜。
      return undefined;
    }
    if (ch === '[') {
      const match = /^\[([^\]]*)\]\(([^)]*)\)/.exec(rest);
      if (match) {
        flush();
        pushText(match[1]!);
        i += match[0].length;
        continue;
      }
    }
    if (rest.startsWith('<font')) {
      const match = /^<font\b[^>]*>/.exec(rest);
      if (match) { flush(); i += match[0].length; continue; }
    }
    if (rest.startsWith('</font>')) { flush(); i += '</font>'.length; continue; }
    if (rest.startsWith('<at')) {
      const match = /^<at\b[^>]*>(?:\s*<\/at>)?/.exec(rest);
      if (match) {
        flush();
        // 真机是头像 + 姓名，拿不到通讯录时按约 4em 估。
        out.push({ text: '@', bold: isBold, fontSize, atomic: true, fixedEm: 4 });
        i += match[0].length;
        continue;
      }
    }
    if (rest.startsWith('<text_tag')) {
      const match = /^<text_tag\b[^>]*>([\s\S]*?)<\/text_tag>/.exec(rest);
      if (match) {
        flush();
        out.push({
          text: match[1]!,
          bold: isBold,
          fontSize,
          atomic: true,
          extraPx: 4,
        });
        i += match[0].length;
        continue;
      }
    }
    if (rest.startsWith('<person')) {
      const match = /^<person\b[^>]*(?:\/>|>[\s\S]*?<\/person>)/.exec(rest);
      if (match) {
        flush();
        out.push({ text: '@', bold: isBold, fontSize, atomic: true, fixedEm: 4 });
        i += match[0].length;
        continue;
      }
    }
    if (rest.startsWith('<audio')) {
      return undefined;
    }
    if (rest.startsWith('<number_tag')) {
      const match = /^<number_tag\b[^>]*>([\s\S]*?)<\/number_tag>/i.exec(rest);
      if (match) {
        flush();
        // 徽标字号约为主文 0.85；左右 margin 2px + 内边距 4px。
        out.push({
          text: match[1]!,
          bold: isBold,
          fontSize: Math.max(11, Math.round(fontSize * 0.85)),
          atomic: true,
          extraPx: 8,
        });
        i += match[0].length;
        continue;
      }
    }
    if (rest.startsWith('<local_datetime')) {
      // 时间按客户端时区/格式渲染，静态测量拿不到真实宽度：不猜。
      return undefined;
    }
    if (rest.startsWith('<link')) {
      const match = /^<link\b[^>]*>([\s\S]*?)<\/link>/i.exec(rest);
      if (match) {
        flush();
        const inner = parseInline(match[1]!, fontSize, isBold);
        if (!inner) return undefined;
        // 前缀图标约 1.1em（14px 图标 + 4px 间距）。
        out.push({ text: '', bold: isBold, fontSize, atomic: true, fixedEm: 1.1 });
        out.push(...inner);
        i += match[0].length;
        continue;
      }
    }
    if (rest.startsWith('<a')) {
      const match = /^<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(rest);
      if (match) {
        flush();
        const inner = parseInline(match[1]!, fontSize, isBold);
        if (!inner) return undefined;
        out.push(...inner);
        i += match[0].length;
        continue;
      }
    }
    if (rest.startsWith('<br')) {
      const match = /^<br\s*\/?>/i.exec(rest);
      if (match) { flush(); i += match[0].length; continue; }
    }
    if (rest.startsWith('<hr')) {
      const match = /^<hr\s*\/?>/i.exec(rest);
      if (match) { flush(); i += match[0].length; continue; }
    }
    if (ch === ':') {
      const match = /^:([A-Za-z0-9_+-]+):/.exec(rest);
      if (match) {
        flush();
        out.push({ text: match[0], bold: isBold, fontSize, atomic: true, fixedEm: 1.05 });
        i += match[0].length;
        continue;
      }
    }
    buffer += ch;
    i += 1;
  }
  flush();
  return out;
}

interface BlockSink {
  total: number;
  prevBottom: number;
  hasBlock: boolean;
  visualLines: number;
  hasBlockSyntax: boolean;
}

function addBlock(sink: BlockSink, height: number, marginTop = 0, marginBottom = 0): void {
  const top = sink.hasBlock ? Math.max(sink.prevBottom, marginTop) : marginTop;
  sink.total += top + height;
  sink.prevBottom = marginBottom;
  sink.hasBlock = true;
}

interface BlockOptions extends MarkdownMetrics {
  /** 正文基础字号 / 行高（text_size 未指定时是 14 / 22.4）。 */
  baseFontSize: number;
  baseLineHeight: number;
}

/**
 * 计算 markdown 内容高度。
 *
 * @param source 公开 DSL 的 `content` 字符串
 * @param width 文字可用宽度（已扣掉 margin / icon）
 * @returns 内容高度（不含 markdown 自身的 margin）；无法测量时返回 undefined
 */
export function measureMarkdownContent(
  source: string,
  width: number,
  options: BlockOptions,
): number | undefined {
  if (width <= 0) return undefined;
  const { measure, baseFontSize, baseLineHeight, maxLines } = options;
  const bold = options.bold;
  const sink: BlockSink = {
    total: 0,
    prevBottom: 0,
    hasBlock: false,
    visualLines: 0,
    hasBlockSyntax: false,
  };

  // `<br>` 是硬换行：正文里按行拆开参与行数计算；代码块内保持字面。
  const rawLines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const lines: string[] = [];
  let inFence = false;
  for (const raw of rawLines) {
    const fence = RE_FENCE.test(raw);
    if (fence) inFence = !inFence;
    if (fence || inFence) lines.push(raw);
    else lines.push(...raw.replace(/<br\s*\/?>/gi, '\n').split('\n'));
  }
  let paragraph: string[] = [];
  let hadParagraph = false;

  const countAtoms = (
    content: string,
    atWidth: number,
    fontSize: number,
    lineHeight: number,
    atBold: boolean,
  ): number | undefined => {
    const atoms = parseInline(content, fontSize, atBold);
    if (!atoms) return undefined;
    const count = countVisualLines(atoms, atWidth, measure);
    sink.visualLines += count;
    return count * lineHeight;
  };

  const flushParagraph = (): boolean => {
    if (paragraph.length === 0) return true;
    let height = 0;
    for (const line of paragraph) {
      const h = countAtoms(line, width, baseFontSize, baseLineHeight, bold);
      if (h == null) return false;
      height += h;
    }
    addBlock(sink, height);
    paragraph = [];
    hadParagraph = true;
    return true;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.trim() === '') {
      if (!flushParagraph()) return undefined;
      // parseMarkdown 只在段落刚结束时补一个 br；连续空行不会叠加。
      if (hadParagraph) {
        sink.total += baseLineHeight;
        sink.visualLines += 1;
        hadParagraph = false;
      }
      continue;
    }

    const fence = RE_FENCE.exec(line);
    if (fence) {
      if (!flushParagraph()) return undefined;
      sink.hasBlockSyntax = true;
      const body: string[] = [];
      i += 1;
      for (; i < lines.length; i++) {
        if (/^\s*```/.test(lines[i]!)) break;
        body.push(lines[i]!);
      }
      const lineCount = Math.max(1, body.length);
      // padding 12×2 + border 1×2 + margin 4×2 + 行高 13×1.5
      const height = 24 + 2 + lineCount * 19.5;
      addBlock(sink, height, 4, 4);
      sink.visualLines += lineCount;
      hadParagraph = false;
      continue;
    }

    const heading = RE_HEADING.exec(line);
    if (heading) {
      if (!flushParagraph()) return undefined;
      sink.hasBlockSyntax = true;
      const level = heading[1]!.length;
      const metrics = HEADING_LEVELS[level] ?? HEADING_LEVELS[3]!;
      const atoms = parseInline(heading[2]!, metrics.fontSize, true);
      if (!atoms) return undefined;
      const count = countVisualLines(atoms, width, measure);
      addBlock(sink, count * metrics.lineHeight, metrics.marginTop, metrics.marginBottom);
      sink.visualLines += count;
      hadParagraph = false;
      continue;
    }

    if (RE_HR.test(line) || /^\s*<hr\s*\/?>\s*$/i.test(line)) {
      if (!flushParagraph()) return undefined;
      sink.hasBlockSyntax = true;
      addBlock(sink, 1, 8, 8);
      hadParagraph = false;
      continue;
    }

    if (RE_BLOCKQUOTE.test(line)) {
      if (!flushParagraph()) return undefined;
      sink.hasBlockSyntax = true;
      const quote: string[] = [];
      for (; i < lines.length; i++) {
        if (!RE_BLOCKQUOTE.test(lines[i]!)) { i -= 1; break; }
        quote.push(lines[i]!.replace(RE_BLOCKQUOTE, ''));
      }
      let height = 0;
      for (const quoteLine of quote) {
        const h = countAtoms(quoteLine, Math.max(1, width - 10), baseFontSize, baseLineHeight, bold);
        if (h == null) return undefined;
        height += h;
      }
      addBlock(sink, height);
      hadParagraph = false;
      continue;
    }

    const list = RE_LIST.exec(line);
    if (list) {
      if (!flushParagraph()) return undefined;
      sink.hasBlockSyntax = true;
      let height = 0;
      for (; i < lines.length; i++) {
        const item = RE_LIST.exec(lines[i]!);
        if (!item) { i -= 1; break; }
        const indent = item[1]!.replace(/\t/g, '  ').length;
        const level = Math.floor(indent / 2);
        const ordered = /\d+\./.test(item[2]!);
        // 有序列表 marker 是 min-width:1em 的 inline-flex；多位数按 0.6em/字符 估。
        const markerWidth = ordered
          ? Math.max(baseFontSize, item[2]!.length * 0.6 * baseFontSize) + 2
          : 22;
        const contentWidth = width - level * 24 - markerWidth;
        const atoms = parseInline(item[3]!, baseFontSize, bold);
        if (!atoms) return undefined;
        const count = countVisualLines(atoms, Math.max(1, contentWidth), measure);
        height += count * baseLineHeight;
        sink.visualLines += count;
      }
      addBlock(sink, height);
      hadParagraph = false;
      continue;
    }

    paragraph.push(line);
    hadParagraph = false;
  }

  if (!flushParagraph()) return undefined;
  sink.total += sink.prevBottom;

  if (maxLines != null && Number.isFinite(maxLines) && maxLines > 0) {
    if (!sink.hasBlockSyntax) {
      return Math.min(sink.visualLines, Math.floor(maxLines)) * baseLineHeight;
    }
    // 含块级构造时 -webkit-line-clamp 的截断点难以精确复刻。这里直接忽略
    // lines（按完整高度算）：多算一点只是留白，少算会裁字。
    return sink.total;
  }

  return sink.total;
}
