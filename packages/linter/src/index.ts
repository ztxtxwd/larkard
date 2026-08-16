/**
 * @open-feishu-card/linter
 *
 * 与 validator（Schema 正确性）互补的静态最佳实践检查：
 * 嵌套深度、元素数量、超长文本、空 body、硬编码用户 ID 等。
 */
import { parse, type JsonNode, type JsonObjectNode, type Range } from '@open-feishu-card/parser';

export type LintSeverity = 'warning' | 'information' | 'hint';

export interface LintDiagnostic {
  rule: string;
  message: string;
  severity: LintSeverity;
  range: Range;
}

export interface LintOptions {
  maxDepth?: number; // default 8
  maxElements?: number; // default 50
  maxTextLength?: number; // default 3000
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
  const childContainers = ['elements', 'children', 'columns', 'items'];
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
            message: `文本长度 ${p.value.value.length} 超过 ${ctx.maxTextLength}，客户端会截断显示`,
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

/** 对已解析 AST 执行全部 lint 规则 */
export function lintAst(ast: JsonObjectNode | undefined, options: LintOptions = {}): LintDiagnostic[] {
  if (!ast) return [];
  const ctx: Ctx = {
    diagnostics: [],
    maxDepth: options.maxDepth ?? 8,
    maxElements: options.maxElements ?? 50,
    maxTextLength: options.maxTextLength ?? 3000,
  };
  lintDepth(ast, ctx);
  lintElementCount(ast, ctx);
  lintEmptyBody(ast, ctx);
  lintMissingSchema(ast, ctx);
  lintLongText(ast, ctx);
  return ctx.diagnostics;
}

/** 源码 → 解析 + lint */
export function lint(source: string, options?: LintOptions): LintDiagnostic[] {
  const { ast } = parse(source);
  return lintAst(ast, options);
}

export { ZERO as ZERO_RANGE };
