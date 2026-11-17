/**
 * `larkard/language-server`
 *
 * 轻量 LSP 核心（与传输层解耦）：
 * - 分析：`core.checkSource()` 一次给出 Schema、真机硬约束与最佳实践诊断
 * - 补全：卡片顶层字段、组件 tag、常用属性名
 * - Hover：常见字段说明
 * - Code Action：删除废弃/非标属性、整卡净化
 *
 * 传输层（stdio JSON-RPC）在 server.ts，可运行于 Node.js / WebWorker。
 */
import {
  checkSource,
  parse,
  resolveCardDocument,
  sanitize,
  serializeCardDocument,
  type SourceDiagnostic,
} from '../core/index.js';
import { CARD_ELEMENT_TAGS, CARD_TOP_LEVEL_KEYS } from '../schema/index.js';

export interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

export interface LspDiagnostic {
  range: LspRange;
  message: string;
  severity: 1 | 2 | 3 | 4;
  source: 'larkard';
  code?: string;
}

export interface CompletionItem {
  label: string;
  kind: number; // LSP CompletionItemKind
  detail?: string;
  insertText?: string;
}

export interface Hover {
  contents: { language: string; value: string };
  range?: LspRange;
}

export interface CodeAction {
  title: string;
  kind: string;
  isPreferred?: boolean;
  /** 要删除的文本范围（字符偏移），由传输层换算成 WorkspaceEdit */
  edits: Array<{ range: LspRange; newText: string }>;
}

/** 内部诊断：携带 parser 的字符偏移，用于 Code Action 计算范围 */
export interface FullAnalysis {
  diagnostics: LspDiagnostic[];
  ast: ReturnType<typeof parse>['ast'];
}

function toLspRange(range: { start: { line: number; column: number }; end: { line: number; column: number } }): LspRange {
  return {
    start: { line: range.start.line - 1, character: range.start.column - 1 },
    end: { line: range.end.line - 1, character: range.end.column - 1 },
  };
}

const ZERO_RANGE: LspRange = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

function severityOf(severity: SourceDiagnostic['severity']): 1 | 2 | 3 | 4 {
  if (severity === 'error') return 1;
  if (severity === 'warning') return 2;
  if (severity === 'information') return 3;
  return 4;
}

function toLspDiagnostic(diagnostic: SourceDiagnostic): LspDiagnostic {
  // linter 的规则名对环境最有用，保留在消息前缀里（与旧行为一致）。
  const prefix = diagnostic.source === 'linter' && diagnostic.code ? `[${diagnostic.code}] ` : '';
  return {
    range: diagnostic.range ? toLspRange(diagnostic.range) : ZERO_RANGE,
    message: `${prefix}${diagnostic.message}`,
    severity: severityOf(diagnostic.severity),
    source: 'larkard',
    ...(diagnostic.code ? { code: diagnostic.code } : { code: diagnostic.source }),
  };
}

/** 分析一份文档源码，输出 LSP 诊断 */
export function analyze(source: string): FullAnalysis {
  const result = checkSource(source);
  const parsed = parse(source);
  return {
    diagnostics: result.diagnostics.map(toLspDiagnostic),
    ast: parsed.ast,
  };
}

/* ------------------------------------------------------------------ *
 * 补全
 * ------------------------------------------------------------------ */

const TOP_LEVEL_DETAIL: Record<string, string> = {
  schema: '必填，固定 "2.0"',
  config: '卡片配置（update_multi / enable_forward / width_mode 等）',
  header: '卡片头（title / subtitle / template / icon）',
  body: '卡片正文 { elements: [...] }',
};

export const CARD_TOP_LEVEL_KEYS_COMPLETIONS: CompletionItem[] = CARD_TOP_LEVEL_KEYS.map((key) => ({
  label: key,
  kind: 14, // Keyword
  detail: TOP_LEVEL_DETAIL[key] ?? key,
}));

export const ELEMENT_TAG_COMPLETIONS: CompletionItem[] = CARD_ELEMENT_TAGS.map((tag) => ({
  label: tag,
  kind: 22, // Struct
  detail: `飞书卡片组件 ${tag}`,
  insertText: tag,
}));

const COMMON_PROPS: CompletionItem[] = [
  { label: 'text_align', kind: 10, detail: '文本对齐：left | center | right' },
  { label: 'padding', kind: 10, detail: '内边距，如 "12px" 或 "12px 8px"' },
  { label: 'margin', kind: 10, detail: '外边距' },
  { label: 'background_style', kind: 10, detail: '背景样式' },
  { label: 'behaviors', kind: 10, detail: '点击行为数组 [{type:"open_url", default_url}]' },
  { label: 'icon', kind: 10, detail: '前置图标元素' },
  { label: 'text_size', kind: 10, detail: '字号：normal | small | large' },
  { label: 'text_color', kind: 10, detail: '文本颜色，如 default / green / red' },
];

/**
 * 上下文感知补全：
 * - 光标在 "tag": "..." 值里 → 组件 tag 列表
 * - 光标在对象 key 位置 → 顶层字段或通用属性
 */
export function complete(source: string, offset: number): CompletionItem[] {
  const before = source.slice(0, offset);
  const tagCtx = /"tag"\s*:\s*"([^"]*)$/.exec(before);
  if (tagCtx) return ELEMENT_TAG_COMPLETIONS;
  return [...CARD_TOP_LEVEL_KEYS_COMPLETIONS, ...COMMON_PROPS];
}

/* ------------------------------------------------------------------ *
 * Hover
 * ------------------------------------------------------------------ */

const HOVER_DOCS: Record<string, string> = {
  schema: '卡片 JSON 结构版本，2.0 固定为 "2.0"。',
  config: '卡片级配置：update_multi（多次更新）、enable_forward、style、locale 等。',
  header: '卡片头部：title、subtitle、template（颜色模板）、icon、text_tag_list。',
  body: '卡片正文容器，elements 为组件数组。',
  elements: '组件数组，每项是 { tag, ...属性 }。',
  tag: '组件类型标识，如 markdown / column_set / button / chart。',
  markdown: 'Markdown 组件：content 支持 md 语法与飞书扩展标签（<font>、<person> 等）。',
  column_set: '多列布局容器，flex_mode 控制 均分/定宽/自适应。',
  update_multi: 'config 字段：同一卡片是否允许多次更新叠加。',
};

export function hover(source: string, offset: number): Hover | undefined {
  const before = source.slice(0, offset);
  const after = source.slice(offset);
  // 光标可能位于 key 的引号内任意位置：取光标前的部分 key + 光标后的剩余 key
  const match = /"?([a-z_]*)$/.exec(before);
  const rest = /^([a-z_]*)/.exec(after)?.[1] ?? '';
  const key = (match?.[1] ?? '') + rest;
  const doc = key && HOVER_DOCS[key];
  if (!doc) return undefined;
  return { contents: { language: 'markdown', value: `**${key}** — ${doc}` } };
}

/* ------------------------------------------------------------------ *
 * Code Action（Quick Fix）
 * ------------------------------------------------------------------ */

const FIXABLE_CODES = new Set(['deprecated-prop', 'builder-unknown-key', 'unrecognized-key']);

/** 在源码行里找到 `"key":` 的起始位置，返回删除 key（含引号）的范围。 */
function keyDeletionRange(lineText: string): LspRange | undefined {
  const match = /"([^"]+)"\s*:/.exec(lineText);
  if (!match) return undefined;
  const start = match.index;
  const end = start + match[0].indexOf(':');
  return {
    start: { line: 0, character: start },
    end: { line: 0, character: end },
  };
}

/** 对指定范围给出快速修复：删除非标/废弃属性 */
export function quickFixes(source: string, range: LspRange): CodeAction[] {
  const actions: CodeAction[] = [];
  const { diagnostics } = analyze(source);
  const lines = source.split('\n');
  const inRange = diagnostics.filter(
    (diagnostic) =>
      diagnostic.code != null
      && FIXABLE_CODES.has(diagnostic.code)
      && diagnostic.range.start.line >= range.start.line
      && diagnostic.range.end.line <= range.end.line,
  );
  for (const diagnostic of inRange) {
    const lineText = lines[diagnostic.range.start.line] ?? '';
    const deletion = keyDeletionRange(lineText);
    if (!deletion) continue;
    actions.push({
      title: `删除属性（${diagnostic.message.split(':')[0]}）`,
      kind: 'quickfix',
      isPreferred: true,
      edits: [{
        range: {
          start: { line: diagnostic.range.start.line, character: deletion.start.character },
          end: { line: diagnostic.range.start.line, character: deletion.end.character },
        },
        newText: '',
      }],
    });
  }
  return actions;
}

/** 全文档级快速修复：一键净化（剥离全部非标属性），返回整文档替换编辑 */
export function sanitizeAllAction(source: string): CodeAction | undefined {
  const parsed = parse(source);
  const resolved = resolveCardDocument(parsed);
  if (!resolved) return undefined;
  const { stripped, card } = sanitize(resolved.cardData, { mode: 'strip' });
  if (stripped.length === 0) return undefined;
  const output = serializeCardDocument(resolved, card);
  const lines = source.split('\n');
  const lastLine = lines.length - 1;
  return {
    title: `larkard: 净化卡片（剥离 ${stripped.length} 个非标属性）`,
    kind: 'source.fixAll',
    isPreferred: true,
    edits: [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: lastLine, character: lines[lastLine]!.length },
      },
      newText: JSON.stringify(output, null, 2) + '\n',
    }],
  };
}
