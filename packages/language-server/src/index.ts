/**
 * @open-feishu-card/language-server
 *
 * 轻量 LSP 语言服务器核心（与传输层解耦）：
 * - 分析：validate (Schema) + lint (最佳实践) → LSP Diagnostics
 * - 补全：卡片顶层字段、组件 tag、常用属性名
 * - Hover：基于 Schema 描述的属性提示
 * - Code Action：非标属性一键删除（Quick Fix，调 compiler.sanitize 定位路径）
 *
 * 传输层（stdio JSON-RPC）在 server.ts，可运行于 Node.js / WebWorker。
 */
import {
  parse,
  resolveCardDocument,
  serializeCardDocument,
  type JsonObjectNode,
} from '@open-feishu-card/parser';
import { sanitize } from '@open-feishu-card/compiler';
import { validateAst, type Diagnostic } from '@open-feishu-card/validator';
import { lintAst, type LintDiagnostic } from '@open-feishu-card/linter';

export interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

export interface LspDiagnostic {
  range: LspRange;
  message: string;
  severity: 1 | 2 | 3 | 4;
  source: 'open-feishu-card';
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
  ast: JsonObjectNode | undefined;
}

function toLspRange(r: { start: { line: number; column: number }; end: { line: number; column: number } }): LspRange {
  return {
    start: { line: r.start.line - 1, character: r.start.column - 1 },
    end: { line: r.end.line - 1, character: r.end.column - 1 },
  };
}

/** 分析一份文档源码，输出 LSP 诊断 */
export function analyze(source: string): FullAnalysis {
  const result = parse(source);
  const vdiags: Diagnostic[] = validateAst(result);
  const ldiags: LintDiagnostic[] = lintAst(result.ast);
  const diagnostics: LspDiagnostic[] = [
    ...vdiags.map((d) => ({
      range: toLspRange(d.range),
      message: d.message,
      severity: (d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : d.severity === 'information' ? 3 : 4) as 1 | 2 | 3 | 4,
      source: 'open-feishu-card' as const,
      code: d.code,
    })),
    ...ldiags.map((d) => ({
      range: toLspRange(d.range),
      message: `[${d.rule}] ${d.message}`,
      severity: (d.severity === 'warning' ? 2 : 3) as 2 | 3,
      source: 'open-feishu-card' as const,
      code: d.rule,
    })),
  ];
  return { diagnostics, ast: result.ast };
}

/* ------------------------------------------------------------------ *
 * 补全
 * ------------------------------------------------------------------ */

export const CARD_TOP_LEVEL_KEYS: CompletionItem[] = [
  { label: 'schema', kind: 14, detail: '必填，固定 "2.0"' },
  { label: 'config', kind: 14, detail: '卡片配置（update_multi / enable_forward / style 等）' },
  { label: 'header', kind: 14, detail: '卡片头（title / subtitle / template / icon）' },
  { label: 'body', kind: 14, detail: '卡片正文 { elements: [...] }' },
];

const ELEMENT_TAGS = [
  'column_set', 'column', 'form', 'interactive_container', 'collapsible_panel',
  'div', 'markdown', 'img', 'img_combination', 'person', 'person_list',
  'avatar', 'chart', 'table', 'hr', 'collapse_divider', 'fallback_text',
  'audio', 'video',
  'input', 'button', 'overflow',
  'select_static', 'multi_select_static', 'select_person', 'multi_select_person',
  'date_picker', 'picker_time', 'picker_datetime', 'select_img', 'checker',
];

export const ELEMENT_TAG_COMPLETIONS: CompletionItem[] = ELEMENT_TAGS.map((t) => ({
  label: t,
  kind: 22, // Struct
  detail: `飞书卡片组件 ${t}`,
  insertText: t,
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
  // 找光标前最近的一个未闭合的 "tag": 上下文
  const before = source.slice(0, offset);
  const tagCtx = /"tag"\s*:\s*"([^"]*)$/.exec(before);
  if (tagCtx) return ELEMENT_TAG_COMPLETIONS;
  // 顶层对象的属性补全：光标前没有更深的嵌套证据时给全量
  return [...CARD_TOP_LEVEL_KEYS, ...COMMON_PROPS];
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
  const m = /"?([a-z_]*)$/.exec(before);
  const rest = /^([a-z_]*)/.exec(after)?.[1] ?? '';
  const key = (m?.[1] ?? '') + rest;
  const doc = key && HOVER_DOCS[key];
  if (!doc) return undefined;
  return { contents: { language: 'markdown', value: `**${key}** — ${doc}` } };
}

/* ------------------------------------------------------------------ *
 * Code Action（Quick Fix）
 * ------------------------------------------------------------------ */

/** 对指定范围给出快速修复：删除非标/废弃属性 */
export function quickFixes(source: string, range: LspRange): CodeAction[] {
  const actions: CodeAction[] = [];
  const { diagnostics, ast } = analyze(source);
  const inRange = diagnostics.filter(
    (d) =>
      (d.code === 'deprecated-prop' || d.code === 'unrecognized-key') &&
      d.range.start.line >= range.start.line &&
      d.range.end.line <= range.end.line,
  );
  for (const d of inRange) {
    actions.push({
      title: `删除属性（${d.message.split(':')[0]}）`,
      kind: 'quickfix',
      isPreferred: true,
      edits: [
        {
          // 覆盖 key（含引号与冒号前的空白），删除后留空
          range: {
            start: { line: d.range.start.line, character: d.range.start.character - 1 },
            end: { line: d.range.start.line, character: d.range.start.character + `${d.message.split('"')[1] ?? ''}`.length + 1 },
          },
          newText: '',
        },
      ],
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
    title: `open-feishu-card: 净化卡片（剥离 ${stripped.length} 个非标属性）`,
    kind: 'source.fixAll',
    isPreferred: true,
    edits: [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: lastLine, character: lines[lastLine].length },
        },
        newText: JSON.stringify(output, null, 2) + '\n',
      },
    ],
  };
}
