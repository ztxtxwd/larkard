import { ExprError, pointer, RenderError, type Diagnostic } from './errors.js';
import type { Expr } from './expr/ast.js';
import { Budget, evaluate } from './expr/evaluate.js';
import { parseExpr, parseForSpec } from './expr/parser.js';
import {
  cloneJson,
  Env,
  isObject,
  jsonProblem,
  RawMarkdown,
  toText,
  truthy,
  typeName,
  type Json,
  type JsonObject,
  type Value,
} from './expr/values.js';
import { escapeMarkdown } from '../schema/markdown/escape.js';
import { checkExpr } from './scope.js';
import { encodeCallbackValue } from './callback.js';

export type TextPart = string | { expr: Expr; raw: boolean };

export interface TemplateLoop {
  item: string;
  index?: string;
  source: Expr;
  key?: Expr;
}

export interface TemplateOn {
  action: string;
  args?: TNode;
}

export type TNode =
  | { kind: 'static'; value: Json }
  | { kind: 'text'; parts: TextPart[]; markdown: boolean }
  | { kind: 'value'; expr: Expr }
  | { kind: 'array'; items: Array<{ node: TNode; loop?: TemplateLoop }> }
  | { kind: 'object'; entries: Array<[string, TNode]>; cond?: Expr; on?: TemplateOn };

export const TEMPLATE_DIRECTIVES = ['$if', '$for', '$key', '$on'] as const;

const VIEW_CONTEXT_DENIED = '共享卡片对所有人显示同一个视图，视图里拿不到点击者；按人反馈请在动作里用 toast';

/** 把带 {{ }} 的字符串拆成文字与表达式。{{{ }}} 表示插值不做 markdown 转义。 */
export function parseText(src: string): TextPart[] {
  const parts: TextPart[] = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{{', i);
    if (open < 0) {
      parts.push(src.slice(i));
      break;
    }
    if (open > i) parts.push(src.slice(i, open));
    const raw = src.startsWith('{{{', open);
    const start = open + (raw ? 3 : 2);
    const close = raw ? '}}}' : '}}';
    let end = -1;
    let depth = 0;
    let quote: string | null = null;
    for (let k = start; k < src.length; k += 1) {
      const c = src[k];
      if (quote) {
        if (c === '\\') k += 1;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === '{') depth += 1;
      else if (c === '}') {
        if (depth > 0) depth -= 1;
        else if (src.startsWith(close, k)) {
          end = k;
          break;
        } else throw new ExprError(`${raw ? '{{{' : '{{'} 没有用 ${close} 闭合`);
      }
    }
    if (end < 0) throw new ExprError(`${raw ? '{{{' : '{{'} 没有用 ${close} 闭合`);
    parts.push({ expr: parseExpr(src.slice(start, end).trim()), raw });
    i = end + close.length;
  }
  return parts;
}

export interface TemplateCompileContext {
  diagnostics: Diagnostic[];
  /** 收集 $on 引用的动作名，供程序级校验 */
  actionRefs: Array<{ name: string; path: string }>;
}

type Path = Array<string | number>;

function error(ctx: TemplateCompileContext, path: Path, message: string): void {
  ctx.diagnostics.push({ severity: 'error', path: pointer(path), message });
}

function checkScope(ctx: TemplateCompileContext, path: Path, expr: Expr, names: ReadonlySet<string>): void {
  for (const problem of checkExpr(expr, { names, context: null, contextDenied: VIEW_CONTEXT_DENIED })) {
    error(ctx, path, problem);
  }
}

function tryParse<T>(ctx: TemplateCompileContext, path: Path, label: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ExprError) {
      error(ctx, path, `${label}${err.message}${err.pos !== undefined ? `（第 ${err.pos + 1} 个字符附近）` : ''}`);
      return undefined;
    }
    throw err;
  }
}

/** 文字模板：动作里的 toast 等也用它，表达式按给定规则做静态检查。 */
export function compileText(
  src: string,
  path: Path,
  ctx: TemplateCompileContext,
  check: (expr: Expr) => string[],
): TextPart[] {
  const parts = tryParse(ctx, path, '', () => parseText(src)) ?? [src];
  for (const part of parts) {
    if (typeof part !== 'string') for (const problem of check(part.expr)) error(ctx, path, problem);
  }
  return parts;
}

function compileString(src: string, path: Path, names: ReadonlySet<string>, ctx: TemplateCompileContext, markdown: boolean): TNode {
  if (!src.includes('{{')) return { kind: 'static', value: src };
  const parts = tryParse(ctx, path, '', () => parseText(src));
  if (!parts) return { kind: 'static', value: src };
  for (const part of parts) if (typeof part !== 'string') checkScope(ctx, path, part.expr, names);
  const only = parts[0];
  if (!markdown && parts.length === 1 && only !== undefined && typeof only !== 'string' && !only.raw) {
    return { kind: 'value', expr: only.expr };
  }
  return { kind: 'text', parts, markdown };
}

function isMarkdownHost(obj: Record<string, unknown>): boolean {
  return obj.tag === 'markdown' || obj.tag === 'lark_md';
}

/** 编译模板树。names 是当前可见的名字（状态字段 + 外层循环变量）。 */
export function compileTemplate(
  value: unknown,
  path: Path,
  names: ReadonlySet<string>,
  ctx: TemplateCompileContext,
  options: { markdown?: boolean; arrayItem?: boolean } = {},
): TNode {
  if (typeof value === 'string') return compileString(value, path, names, ctx, options.markdown === true);
  if (Array.isArray(value)) return compileArray(value, path, names, ctx);
  if (isObject(value as Value)) return compileObject(value as Record<string, unknown>, path, names, ctx, options.arrayItem === true).node;
  if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
    return { kind: 'static', value: value as Json };
  }
  error(ctx, path, `不支持的值类型 ${typeof value}`);
  return { kind: 'static', value: null };
}

function compileArray(value: unknown[], path: Path, names: ReadonlySet<string>, ctx: TemplateCompileContext): TNode {
  const items: Array<{ node: TNode; loop?: TemplateLoop }> = [];
  value.forEach((item, i) => {
    const itemPath = [...path, i];
    if (isObject(item as Value)) {
      const { node, loop } = compileObject(item as Record<string, unknown>, itemPath, names, ctx, true);
      items.push(loop ? { node, loop } : { node });
    } else {
      items.push({ node: compileTemplate(item, itemPath, names, ctx) });
    }
  });
  if (items.every((item) => !item.loop && item.node.kind === 'static')) {
    return { kind: 'static', value: items.map((item) => (item.node as { value: Json }).value) };
  }
  return { kind: 'array', items };
}

function compileObject(
  obj: Record<string, unknown>,
  path: Path,
  outerNames: ReadonlySet<string>,
  ctx: TemplateCompileContext,
  arrayItem: boolean,
): { node: TNode; loop?: TemplateLoop } {
  let names = outerNames;
  let loop: TemplateLoop | undefined;

  if ('$for' in obj) {
    const forPath = [...path, '$for'];
    if (!arrayItem) error(ctx, forPath, '$for 只能用在数组里的对象上（会展开成多个元素）');
    else if (typeof obj.$for !== 'string') error(ctx, forPath, '$for 应为字符串，如 "item in list"');
    else {
      const spec = tryParse(ctx, forPath, '', () => parseForSpec(obj.$for as string));
      if (spec) {
        checkScope(ctx, forPath, spec.source, outerNames);
        loop = spec.index ? { item: spec.item, index: spec.index, source: spec.source } : { item: spec.item, source: spec.source };
        names = new Set([...outerNames, spec.item, ...(spec.index ? [spec.index] : [])]);
      }
    }
  }

  if ('$key' in obj) {
    const keyPath = [...path, '$key'];
    if (!('$for' in obj)) error(ctx, keyPath, '$key 只能和 $for 写在同一个对象上');
    else if (typeof obj.$key !== 'string') error(ctx, keyPath, '$key 应为字符串表达式，如 "{{ item.id }}"');
    else if (loop) {
      const keySrc = obj.$key.trim().replace(/^\{\{([\s\S]*)\}\}$/, '$1');
      const key = tryParse(ctx, keyPath, '', () => parseExpr(keySrc));
      if (key) {
        checkScope(ctx, keyPath, key, names);
        loop.key = key;
      }
    }
  }

  let cond: Expr | undefined;
  if ('$if' in obj) {
    const ifPath = [...path, '$if'];
    if (path.length === 0) error(ctx, ifPath, '卡片根节点不能用 $if');
    else if (typeof obj.$if !== 'string') error(ctx, ifPath, '$if 应为表达式字符串，如 "len(list) > 0"');
    else {
      const src = obj.$if.trim().replace(/^\{\{([\s\S]*)\}\}$/, '$1');
      cond = tryParse(ctx, ifPath, '', () => parseExpr(src));
      if (cond) checkScope(ctx, ifPath, cond, names);
    }
  }

  let on: TemplateOn | undefined;
  if ('$on' in obj) {
    const onPath = [...path, '$on'];
    const raw = obj.$on;
    if (typeof raw === 'string') {
      on = { action: raw };
    } else if (isObject(raw as Value) && typeof (raw as Record<string, unknown>).action === 'string') {
      const spec = raw as Record<string, unknown>;
      for (const key of Object.keys(spec)) {
        if (key !== 'action' && key !== 'args') error(ctx, [...onPath, key], `$on 只支持 action 和 args，不认识 ${key}`);
      }
      on = { action: spec.action as string };
      if ('args' in spec) on.args = compileTemplate(spec.args, [...onPath, 'args'], names, ctx);
    } else {
      error(ctx, onPath, '$on 应为动作名，或 { "action": "动作名", "args": { ... } }');
    }
    if (on) ctx.actionRefs.push({ name: on.action, path: pointer(onPath) });
  }

  const markdown = isMarkdownHost(obj);
  const entries: Array<[string, TNode]> = [];
  for (const [key, child] of Object.entries(obj)) {
    if (key.startsWith('$')) {
      if (!(TEMPLATE_DIRECTIVES as readonly string[]).includes(key)) {
        error(ctx, [...path, key], `不认识的指令 ${key}，模板里可用的有 ${TEMPLATE_DIRECTIVES.join(', ')}`);
      }
      continue;
    }
    entries.push([key, compileTemplate(child, [...path, key], names, ctx, { markdown: markdown && key === 'content' })]);
  }

  // 带 element_id 的对象不折叠成静态值：渲染时要给它加循环后缀并查重。
  if (!cond && !on && !loop && !('element_id' in obj) && entries.every(([, node]) => node.kind === 'static')) {
    const value: JsonObject = {};
    for (const [key, node] of entries) value[key] = (node as { value: Json }).value;
    return { node: { kind: 'static', value } };
  }
  const node: TNode = { kind: 'object', entries };
  if (cond) node.cond = cond;
  if (on) node.on = on;
  return loop ? { node, loop } : { node };
}

const OMIT: unique symbol = Symbol('omit');

export interface RenderOptions {
  /** 写进回调 value 的版本号，用于识别过期点击 */
  rev?: number;
  budget: Budget;
}

interface RenderScope {
  options: RenderOptions;
  /** 外层循环的 key 链，用来给循环里的 element_id 加后缀 */
  keyPath: string[];
  ids: Map<string, string>;
}

const ELEMENT_ID_MAX = 20;

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** 循环里的 element_id 加上 key 的哈希后缀，保证唯一且不超过 20 字符。 */
function loopElementId(base: string, keyPath: string[]): string {
  const suffix = fnv1a(keyPath.join('\u0000'));
  return `${base.slice(0, ELEMENT_ID_MAX - suffix.length - 1)}_${suffix}`;
}

function evalJson(expr: Expr, env: Env, scope: RenderScope, path: Path): Json {
  const value = evaluate(expr, env, { budget: scope.options.budget });
  if (value instanceof RawMarkdown) return value.text;
  const problem = jsonProblem(value);
  if (problem) throw new RenderError(problem, pointer(path));
  return value as Json;
}

function renderText(parts: TextPart[], markdown: boolean, env: Env, budget: Budget): string {
  let out = '';
  for (const part of parts) {
    if (typeof part === 'string') {
      out += part;
      continue;
    }
    const value = evaluate(part.expr, env, { budget });
    out += markdown && !part.raw && !(value instanceof RawMarkdown) ? escapeMarkdown(toText(value)) : toText(value);
  }
  return out;
}

export function renderTextParts(parts: TextPart[], env: Env, budget: Budget): string {
  return renderText(parts, false, env, budget);
}

function iterate(source: Json, path: Path): Array<[Json, Json]> {
  if (source === null) return [];
  if (Array.isArray(source)) return source.map((item, i) => [item, i]);
  if (isObject(source)) return Object.entries(source).map(([k, v]) => [v, k]);
  throw new RenderError(`$for 只能遍历数组或对象，实际是${typeName(source)}`, pointer(path));
}

function renderNode(node: TNode, env: Env, scope: RenderScope, path: Path): Json | typeof OMIT {
  try {
    return renderNodeInner(node, env, scope, path);
  } catch (err) {
    if (err instanceof ExprError) throw new RenderError(err.message, pointer(path));
    throw err;
  }
}

function renderNodeInner(node: TNode, env: Env, scope: RenderScope, path: Path): Json | typeof OMIT {
  switch (node.kind) {
    case 'static':
      return cloneJson(node.value);
    case 'value':
      return evalJson(node.expr, env, scope, path);
    case 'text':
      return renderText(node.parts, node.markdown, env, scope.options.budget);
    case 'array': {
      const out: Json[] = [];
      node.items.forEach((item, i) => {
        const itemPath = [...path, i];
        if (!item.loop) {
          const value = renderNode(item.node, env, scope, itemPath);
          if (value !== OMIT) out.push(value);
          return;
        }
        const { loop } = item;
        const source = evalJson(loop.source, env, scope, [...itemPath, '$for']);
        for (const [value, index] of iterate(source, [...itemPath, '$for'])) {
          const vars = new Map<string, Value>([[loop.item, value]]);
          if (loop.index) vars.set(loop.index, index);
          const loopEnv = env.extend(vars);
          const key = loop.key ? toText(evalJson(loop.key, loopEnv, scope, [...itemPath, '$key'])) : String(index);
          scope.keyPath.push(key);
          try {
            const rendered = renderNode(item.node, loopEnv, scope, itemPath);
            if (rendered !== OMIT) out.push(rendered);
          } finally {
            scope.keyPath.pop();
          }
        }
      });
      return out;
    }
    case 'object': {
      if (node.cond && !truthy(evaluate(node.cond, env, { budget: scope.options.budget }))) return OMIT;
      const out: JsonObject = {};
      for (const [key, child] of node.entries) {
        const value = renderNode(child, env, scope, [...path, key]);
        if (value !== OMIT) out[key] = value;
      }
      if (node.on) {
        const args = node.on.args ? renderNode(node.on.args, env, scope, [...path, '$on', 'args']) : OMIT;
        const callback = {
          type: 'callback',
          value: encodeCallbackValue({
            action: node.on.action,
            ...(args !== OMIT && args !== null ? { args } : {}),
            ...(scope.options.rev !== undefined ? { rev: scope.options.rev } : {}),
          }),
        };
        const behaviors = Array.isArray(out.behaviors) ? out.behaviors : [];
        out.behaviors = [...behaviors, callback];
      }
      if (typeof out.element_id === 'string') claimElementId(out, scope, path);
      return out;
    }
  }
}

/** 循环里的 element_id 加 key 后缀；并检查整张卡内是否重复。 */
function claimElementId(out: JsonObject, scope: RenderScope, path: Path): void {
  let id = out.element_id as string;
  if (scope.keyPath.length > 0) {
    id = loopElementId(id, scope.keyPath);
    out.element_id = id;
  }
  const seen = scope.ids.get(id);
  if (seen !== undefined) {
    throw new RenderError(`element_id ${id} 重复（另一个在 ${seen || '/'}）；循环里的元素请加 $key`, pointer(path));
  }
  scope.ids.set(id, pointer(path));
}

/** 渲染模板，得到纯 Card JSON。 */
export function renderTemplate(template: TNode, env: Env, options: RenderOptions): JsonObject {
  const scope: RenderScope = { options, keyPath: [], ids: new Map() };
  const card = renderNode(template, env, scope, []);
  if (card === OMIT || !isObject(card)) throw new RenderError('卡片根节点应为对象', '');
  return card;
}
