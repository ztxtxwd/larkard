/**
 * @open-feishu-card/linter
 *
 * 与 validator（Schema 正确性）互补的静态最佳实践检查：
 * 嵌套深度、元素数量、超长文本、空 body、硬编码用户 ID、
 * Markdown 加粗星号贴空格等。
 *
 * 输入可为裸 Card JSON，或搭建工具文档；规则作用在解包后的卡片子树上。
 */
import {
  parse,
  resolveCardDocumentAst,
  astToValue,
  type JsonNode,
  type JsonObjectNode,
  type JsonStringNode,
  type Range,
} from '@open-feishu-card/parser';
import { findBoldSpaceIssues } from './markdown-bold-space.js';

export type LintSeverity = 'warning' | 'information' | 'hint';

export interface LintDiagnostic {
  rule: string;
  message: string;
  severity: LintSeverity;
  range: Range;
}

export interface LintOptions {
  maxDepth?: number; // default 8
  maxElements?: number; // default 200
  maxTextLength?: number; // default 3000（经验阈值，非客户端硬性限制）
}

interface Ctx {
  diagnostics: LintDiagnostic[];
  maxDepth: number;
  maxElements: number;
  maxTextLength: number;
}

const ZERO: Range = {
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
};

function isElementNode(node: JsonNode): boolean {
  return node.type === 'object' && node.properties.some((p) => p.key.value === 'tag');
}

function getProp(node: JsonObjectNode, key: string): JsonNode | undefined {
  return node.properties.find((p) => p.key.value === key)?.value;
}

/** 递归遍历元素树，返回最大嵌套深度 */
function checkDepth(node: JsonNode, depth: number, path: string, ctx: Ctx): number {
  let max = depth;
  if (node.type === 'array') {
    for (const item of node.items) max = Math.max(max, checkDepth(item, depth, path, ctx));
    return max;
  }
  if (node.type !== 'object') return depth;
  // 子容器键集合对齐客户端权威映射（模块 248895）：
  //   Div:[extra,fields,text]、Note/Column/Markdown/Form/CollapsiblePanel 等:[elements]、
  //   Action:[actions]、ColumnSet:[columns]、Checker:[buttonArea.buttons]、List:items。
  // 统一键集策略下取其中以数组形态出现的子容器；'children' 为卡片 JSON 不存在的死键，已移除。
  const childContainers = ['elements', 'actions', 'columns', 'fields', 'items'];
  for (const key of childContainers) {
    const child = getProp(node, key);
    if (child && (child.type === 'array' || child.type === 'object')) {
      const nextDepth = depth + 1;
      if (nextDepth > ctx.maxDepth) {
        ctx.diagnostics.push({
          rule: 'nesting-depth',
          message: `嵌套深度达到 ${nextDepth} 层（建议 ≤ ${ctx.maxDepth}），过深的结构会显著降低客户端渲染性能与可读性`,
          severity: 'warning',
          range: child.range,
        });
      }
      max = Math.max(max, checkDepth(child, nextDepth, `${path}/${key}`, ctx));
    }
  }
  // 其他对象属性只递归不加深（props 不算层级）
  for (const p of node.properties) {
    if (!childContainers.includes(p.key.value)) {
      max = Math.max(max, checkDepth(p.value, depth, `${path}/${p.key.value}`, ctx));
    }
  }
  return max;
}

function collectElements(node: JsonNode, out: JsonNode[]): void {
  if (node.type === 'array') {
    for (const item of node.items) collectElements(item, out);
  } else if (node.type === 'object') {
    if (isElementNode(node)) out.push(node);
    for (const p of node.properties) collectElements(p.value, out);
  }
}

function lintDepth(root: JsonObjectNode, ctx: Ctx): void {
  const body = getProp(root, 'body') ?? getProp(root, 'elements');
  if (body) checkDepth(body, 1, '', ctx);
}

function lintElementCount(root: JsonObjectNode, ctx: Ctx): void {
  const body = getProp(root, 'body') ?? getProp(root, 'elements');
  if (!body) return;
  const elements: JsonNode[] = [];
  collectElements(body, elements);
  if (elements.length > ctx.maxElements) {
    ctx.diagnostics.push({
      rule: 'element-count',
      message: `卡片包含 ${elements.length} 个元素（建议 ≤ ${ctx.maxElements}），可能触发渲染性能问题`,
      severity: 'warning',
      range: body.range,
    });
  }
}

function lintEmptyBody(root: JsonObjectNode, ctx: Ctx): void {
  const body = getProp(root, 'body');
  const elements = body && body.type === 'object' ? getProp(body, 'elements') : getProp(root, 'elements');
  if (!elements || (elements.type === 'array' && elements.items.length === 0)) {
    ctx.diagnostics.push({
      rule: 'empty-body',
      message: '卡片 body.elements 为空，将渲染空白卡片',
      severity: 'information',
      range: elements?.range ?? (body?.range ?? root.range),
    });
  }
}

function lintLongText(node: JsonNode, ctx: Ctx): void {
  if (node.type === 'object') {
    for (const p of node.properties) {
      if ((p.key.value === 'content' || p.key.value === 'text') && p.value.type === 'string') {
        if (p.value.value.length > ctx.maxTextLength) {
          ctx.diagnostics.push({
            rule: 'long-text',
            message: `文本长度 ${p.value.value.length} 超过经验阈值 ${ctx.maxTextLength}，建议控制长度以保证可读性与展示效果（阈值为经验值，客户端按样式渲染、不会按字符数截断）`,
            severity: 'warning',
            range: p.value.range,
          });
        }
      }
      lintLongText(p.value, ctx);
    }
  } else if (node.type === 'array') {
    for (const item of node.items) lintLongText(item, ctx);
  }
}

/**
 * Input 输入框的文本长度规则（对齐客户端表单校验硬约束）。
 * 客户端事实：Input 组件 maxLength 缺省 1000，输入值长度超限会触发
 * Lark_MessageCard_TextLengthErr（表单校验错误，非显示截断）。
 * 静态卡片 JSON 中唯一可见的“输入值”是 default_value，故对其长度做校验。
 */
function lintInputMaxLength(node: JsonNode, ctx: Ctx): void {
  if (node.type === 'object') {
    const tagProp = node.properties.find((p) => p.key.value === 'tag');
    if (tagProp && tagProp.value.type === 'string' && tagProp.value.value === 'input') {
      const dv = getProp(node, 'default_value');
      const ml = getProp(node, 'max_length');
      const maxLen = ml && ml.type === 'number' ? ml.value : 1000;
      if (dv && dv.type === 'string' && dv.value.length > maxLen) {
        ctx.diagnostics.push({
          rule: 'input-max-length',
          message: `输入框默认值长度 ${dv.value.length} 超过 max_length ${maxLen}（缺省 1000），客户端提交表单时会报文本长度错误`,
          severity: 'warning',
          range: dv.range,
        });
      }
    }
    for (const p of node.properties) lintInputMaxLength(p.value, ctx);
  } else if (node.type === 'array') {
    for (const item of node.items) lintInputMaxLength(item, ctx);
  }
}

/** 该对象是否是渲染 Markdown 的文本载体（markdown 组件 / lark_md / markdown 文本对象） */
function markdownContentNode(node: JsonObjectNode): JsonStringNode | undefined {
  const tag = getProp(node, 'tag');
  if (!tag || tag.type !== 'string') return undefined;
  if (tag.value !== 'markdown' && tag.value !== 'lark_md') return undefined;
  const content = getProp(node, 'content');
  return content && content.type === 'string' ? content : undefined;
}

/** table 中 data_type 为 lark_md / markdown 的列，行值同样是 Markdown 字符串 */
function tableMarkdownCells(node: JsonObjectNode): JsonStringNode[] {
  const tag = getProp(node, 'tag');
  if (!tag || tag.type !== 'string' || tag.value !== 'table') return [];
  const columns = getProp(node, 'columns');
  const rows = getProp(node, 'rows');
  if (!columns || columns.type !== 'array' || !rows || rows.type !== 'array') return [];

  const mdColumns = new Set<string>();
  for (const col of columns.items) {
    if (col.type !== 'object') continue;
    const name = getProp(col, 'name');
    const dataType = getProp(col, 'data_type');
    if (
      name?.type === 'string' &&
      dataType?.type === 'string' &&
      (dataType.value === 'lark_md' || dataType.value === 'markdown')
    ) {
      mdColumns.add(name.value);
    }
  }
  if (mdColumns.size === 0) return [];

  const cells: JsonStringNode[] = [];
  for (const row of rows.items) {
    if (row.type !== 'object') continue;
    for (const p of row.properties) {
      if (mdColumns.has(p.key.value) && p.value.type === 'string') cells.push(p.value);
    }
  }
  return cells;
}

function reportBoldSpace(nodes: JsonNode[], ctx: Ctx): void {
  for (const node of nodes) {
    if (node.type !== 'string') continue;
    const issues = findBoldSpaceIssues(node.value);
    if (issues.length === 0) continue;
    const samples = issues.slice(0, 3).map((issue) => `「${issue.sample}」`).join('、');
    const more = issues.length > 3 ? ` 等 ${issues.length} 处` : '';
    ctx.diagnostics.push({
      rule: 'markdown-bold-space',
      message:
        `加粗星号内侧紧贴空格${more}：${samples}。` +
        'Markdown 要求 ** 与文字之间不能有空格，否则不会加粗、** 会按字面显示；' +
        '文字内部的空格无影响，去掉星号内侧的空格即可（如 **标题**）',
      severity: 'warning',
      range: node.range,
    });
  }
}

/**
 * Markdown 加粗星号贴空格的检测。
 * 覆盖 markdown 组件 content、lark_md / markdown 文本对象，以及 table 的
 * lark_md / markdown 列单元格。
 */
function lintMarkdownBoldSpace(node: JsonNode, ctx: Ctx): void {
  if (node.type === 'array') {
    for (const item of node.items) lintMarkdownBoldSpace(item, ctx);
    return;
  }
  if (node.type !== 'object') return;

  const targets: JsonNode[] = [];
  const content = markdownContentNode(node);
  if (content) targets.push(content);
  targets.push(...tableMarkdownCells(node));
  reportBoldSpace(targets, ctx);

  for (const p of node.properties) lintMarkdownBoldSpace(p.value, ctx);
}

function lintMissingSchema(root: JsonObjectNode, ctx: Ctx): void {
  if (!getProp(root, 'schema')) {
    ctx.diagnostics.push({
      rule: 'missing-schema',
      message: '缺少 "schema": "2.0" 声明，无法使用 2.0 能力',
      severity: 'warning',
      range: root.range,
    });
  }
}

/** 对已解析 AST 执行全部 lint 规则（自动解包搭建工具文档） */
export function lintAst(ast: JsonObjectNode | undefined, options: LintOptions = {}): LintDiagnostic[] {
  if (!ast) return [];
  const resolved = resolveCardDocumentAst(ast, astToValue(ast));
  const cardAst = resolved.cardAst;
  const ctx: Ctx = {
    diagnostics: [],
    maxDepth: options.maxDepth ?? 8,
    maxElements: options.maxElements ?? 200,
    maxTextLength: options.maxTextLength ?? 3000,
  };
  lintDepth(cardAst, ctx);
  lintElementCount(cardAst, ctx);
  lintEmptyBody(cardAst, ctx);
  lintMissingSchema(cardAst, ctx);
  lintLongText(cardAst, ctx);
  lintInputMaxLength(cardAst, ctx);
  lintMarkdownBoldSpace(cardAst, ctx);
  return ctx.diagnostics;
}

/** 源码 → 解析 + lint */
export function lint(source: string, options?: LintOptions): LintDiagnostic[] {
  const { ast } = parse(source);
  return lintAst(ast, options);
}

export { ZERO as ZERO_RANGE };
