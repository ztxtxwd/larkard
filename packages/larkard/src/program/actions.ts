import type { ActionEvent } from './callback.js';
import { AssertionFailed, ExprError, pointer, type Diagnostic } from './errors.js';
import type { Expr } from './expr/ast.js';
import { Budget, callLambda, evaluate } from './expr/evaluate.js';
import { parseExpr } from './expr/parser.js';
import {
  cloneJson,
  deepEqual,
  Env,
  FORBIDDEN_KEYS,
  isObject,
  jsonProblem,
  objectScope,
  truthy,
  typeName,
  type Json,
  type JsonObject,
  type Value,
} from './expr/values.js';
import { checkExpr } from './scope.js';
import { compileText, renderTextParts, type TemplateCompileContext, type TextPart } from './template.js';

export const TOAST_TYPES = ['info', 'success', 'warning', 'error'] as const;
export type ToastType = (typeof TOAST_TYPES)[number];

/** 动作里可用的上下文变量。 */
export const ACTION_CONTEXT = ['$user', '$args', '$form', '$input', '$option', '$options', '$checked', '$now'] as const;

/** 写入目标：状态根字段 + 若干层下标/属性。 */
export interface Target {
  root: string;
  segments: Expr[];
  src: string;
}

export type Op =
  | { op: 'set'; target: Target; value: Expr }
  | { op: 'push'; target: Target; value: Expr; unique: boolean }
  | { op: 'remove'; target: Target; by: 'value' | 'where' | 'index'; expr: Expr }
  | { op: 'inc'; target: Target; by?: Expr }
  | { op: 'toggle'; target: Target }
  | { op: 'let'; name: string; value: Expr }
  | { op: 'if'; test: Expr; then: Op[]; else: Op[] }
  | { op: 'assert'; test: Expr; toast?: TextPart[] }
  | { op: 'toast'; text: TextPart[]; type: ToastType };

/** 每种操作的关键字与允许出现的其它字段。 */
const OP_FIELDS: Record<Op['op'], readonly string[]> = {
  set: ['value'],
  push: ['value', 'unique'],
  remove: ['value', 'where', 'index'],
  inc: ['by'],
  toggle: [],
  let: ['value'],
  if: ['then', 'else'],
  assert: ['toast'],
  toast: ['type'],
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Path = Array<string | number>;

interface ActionCompileContext extends TemplateCompileContext {
  stateKeys: ReadonlySet<string>;
}

function report(ctx: ActionCompileContext, path: Path, message: string, severity: Diagnostic['severity'] = 'error'): void {
  ctx.diagnostics.push({ severity, path: pointer(path), message });
}

function parseIn(ctx: ActionCompileContext, path: Path, src: unknown, label: string): Expr | undefined {
  if (typeof src !== 'string') {
    report(ctx, path, `${label}应为表达式字符串`);
    return undefined;
  }
  const trimmed = src.trim().replace(/^\{\{([\s\S]*)\}\}$/, '$1');
  try {
    return parseExpr(trimmed);
  } catch (err) {
    if (!(err instanceof ExprError)) throw err;
    report(ctx, path, `${label}${err.message}${err.pos !== undefined ? `（第 ${err.pos + 1} 个字符附近）` : ''}`);
    return undefined;
  }
}

function checkNames(ctx: ActionCompileContext, path: Path, expr: Expr, locals: ReadonlySet<string>): void {
  const names = new Set([...ctx.stateKeys, ...locals]);
  for (const problem of checkExpr(expr, { names, context: new Set(ACTION_CONTEXT) })) report(ctx, path, problem);
}

function compileTarget(ctx: ActionCompileContext, path: Path, src: unknown, locals: ReadonlySet<string>): Target | undefined {
  const expr = parseIn(ctx, path, src, '写入路径');
  if (!expr) return undefined;
  const segments: Expr[] = [];
  let node = expr;
  while (node.type === 'member') {
    segments.unshift(node.property);
    node = node.object;
  }
  if (node.type !== 'ident') {
    report(ctx, path, `写入路径应形如 count、form.title、items[i].done，不能是 ${JSON.stringify(src)}`);
    return undefined;
  }
  if (node.name.startsWith('$')) {
    report(ctx, path, `${node.name} 是只读的上下文变量，只能写状态字段`);
    return undefined;
  }
  if (!ctx.stateKeys.has(node.name)) {
    report(ctx, path, `状态里没有字段 ${node.name}，请先在 $state 里声明`);
    return undefined;
  }
  for (const segment of segments) checkNames(ctx, path, segment, locals);
  return { root: node.name, segments, src: src as string };
}

function compileOps(ctx: ActionCompileContext, path: Path, raw: unknown, outerLocals: ReadonlySet<string>): Op[] {
  if (!Array.isArray(raw)) {
    report(ctx, path, '动作应为操作数组，如 [{ "push": "list", "value": "$user.open_id" }]');
    return [];
  }
  const locals = new Set(outerLocals);
  const ops: Op[] = [];
  raw.forEach((item, i) => {
    const op = compileOp(ctx, [...path, i], item, locals);
    if (op) ops.push(op);
    if (op?.op === 'let') locals.add(op.name);
  });
  return ops;
}

function compileOp(ctx: ActionCompileContext, path: Path, raw: unknown, locals: ReadonlySet<string>): Op | undefined {
  if (!isObject(raw as Value)) {
    report(ctx, path, '每个操作应为对象');
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const present = (Object.keys(OP_FIELDS) as Array<Op['op']>).filter((k) => k in obj);
  // toast 既是独立操作也是 assert 的字段：作为别的操作的字段出现时不算关键字。
  const kinds = present.filter((k) => !present.some((other) => other !== k && OP_FIELDS[other].includes(k)));
  if (kinds.length !== 1) {
    report(
      ctx,
      path,
      kinds.length === 0
        ? `不认识的操作，可用的有 ${Object.keys(OP_FIELDS).join(', ')}`
        : `一个操作里只能有一个关键字，这里同时出现了 ${kinds.join(', ')}`,
    );
    return undefined;
  }
  const kind = kinds[0] as Op['op'];
  for (const key of Object.keys(obj)) {
    if (key !== kind && !OP_FIELDS[kind].includes(key)) {
      report(ctx, [...path, key], `${kind} 操作不支持字段 ${key}，可用的有 ${[kind, ...OP_FIELDS[kind]].join(', ')}`);
    }
  }
  const expr = (key: string, label: string): Expr | undefined => {
    const parsed = parseIn(ctx, [...path, key], obj[key], label);
    if (parsed) checkNames(ctx, [...path, key], parsed, locals);
    return parsed;
  };
  const text = (key: string): TextPart[] => {
    const src = obj[key];
    if (typeof src !== 'string') {
      report(ctx, [...path, key], '提示文字应为字符串，可用 {{ }} 插值');
      return [];
    }
    const names = new Set([...ctx.stateKeys, ...locals]);
    return compileText(src, [...path, key], ctx, (e) => checkExpr(e, { names, context: new Set(ACTION_CONTEXT) }));
  };

  switch (kind) {
    case 'set':
    case 'push': {
      const target = compileTarget(ctx, [...path, kind], obj[kind], locals);
      if (!('value' in obj)) report(ctx, path, `${kind} 需要 value`);
      const value = expr('value', 'value ');
      if (!target || !value) return undefined;
      if (kind === 'set') return { op: 'set', target, value };
      if ('unique' in obj && typeof obj.unique !== 'boolean') report(ctx, [...path, 'unique'], 'unique 应为 true 或 false');
      return { op: 'push', target, value, unique: obj.unique === true };
    }
    case 'remove': {
      const target = compileTarget(ctx, [...path, 'remove'], obj.remove, locals);
      const modes = (['value', 'where', 'index'] as const).filter((m) => m in obj);
      if (modes.length !== 1) {
        report(ctx, path, 'remove 需要且只能有 value（按值删）、where（按条件删，如 "x => x.id == $args.id"）、index（按下标删）之一');
        return undefined;
      }
      const by = modes[0] as 'value' | 'where' | 'index';
      const e = expr(by, `${by} `);
      if (by === 'where' && e && e.type !== 'lambda') report(ctx, [...path, 'where'], 'where 应为箭头函数，如 "x => x.id == $args.id"');
      return target && e ? { op: 'remove', target, by, expr: e } : undefined;
    }
    case 'inc': {
      const target = compileTarget(ctx, [...path, 'inc'], obj.inc, locals);
      const by = 'by' in obj ? expr('by', 'by ') : undefined;
      if (!target) return undefined;
      return by ? { op: 'inc', target, by } : { op: 'inc', target };
    }
    case 'toggle': {
      const target = compileTarget(ctx, [...path, 'toggle'], obj.toggle, locals);
      return target ? { op: 'toggle', target } : undefined;
    }
    case 'let': {
      const name = obj.let;
      if (typeof name !== 'string' || !IDENT.test(name)) {
        report(ctx, [...path, 'let'], 'let 应为变量名（字母或下划线开头）');
        return undefined;
      }
      if (ctx.stateKeys.has(name)) report(ctx, [...path, 'let'], `变量名 ${name} 和状态字段重名`);
      const value = expr('value', 'value ');
      return value ? { op: 'let', name, value } : undefined;
    }
    case 'if': {
      const test = expr('if', 'if ');
      const then = compileOps(ctx, [...path, 'then'], obj.then ?? [], locals);
      const otherwise = 'else' in obj ? compileOps(ctx, [...path, 'else'], obj.else, locals) : [];
      if (!('then' in obj) && !('else' in obj)) report(ctx, path, 'if 需要 then 或 else');
      return test ? { op: 'if', test, then, else: otherwise } : undefined;
    }
    case 'assert': {
      const test = expr('assert', 'assert ');
      const toast = 'toast' in obj ? text('toast') : undefined;
      if (!test) return undefined;
      return toast ? { op: 'assert', test, toast } : { op: 'assert', test };
    }
    case 'toast': {
      const type = obj.type ?? 'info';
      if (!TOAST_TYPES.includes(type as ToastType)) report(ctx, [...path, 'type'], `type 应为 ${TOAST_TYPES.join(' / ')}`);
      return { op: 'toast', text: text('toast'), type: (TOAST_TYPES.includes(type as ToastType) ? type : 'info') as ToastType };
    }
  }
}

export function compileAction(
  name: string,
  raw: unknown,
  stateKeys: ReadonlySet<string>,
  ctx: TemplateCompileContext,
): Op[] {
  return compileOps({ ...ctx, stateKeys }, ['$actions', name], raw, new Set());
}

export interface Toast {
  type: ToastType;
  content: string;
}

export interface DispatchResult {
  /** 动作完整执行且已提交 */
  ok: boolean;
  /** 执行后的状态；失败时为原状态 */
  state: JsonObject;
  changed: boolean;
  /** 给点击者的提示（只保留最后一条） */
  toast?: Toast;
  /** assert 未通过：正常的业务拒绝，状态未变 */
  rejected?: boolean;
  /** 程序出错（表达式类型不对等），给开发者 / Agent 排查用 */
  error?: string;
}

class Execution {
  toast: Toast | undefined;

  constructor(
    readonly draft: JsonObject,
    readonly budget: Budget,
  ) {}

  eval(expr: Expr, env: Env): Value {
    return evaluate(expr, env, { budget: this.budget });
  }

  key(segment: Expr, env: Env, src: string): string | number {
    const key = this.eval(segment, env);
    if (typeof key === 'number' && Number.isInteger(key)) return key;
    if (typeof key === 'string') {
      if (FORBIDDEN_KEYS.has(key)) throw new ExprError(`${src}：不能写入键 ${key}`);
      return key;
    }
    throw new ExprError(`${src}：下标应为字符串或整数，实际是${typeName(key)}`);
  }

  /** 定位写入目标的容器与键；中间缺失的对象自动补上。 */
  locate(target: Target, env: Env): { container: JsonObject | Json[]; key: string | number } {
    let container: JsonObject | Json[] = this.draft;
    let key: string | number = target.root;
    for (const segment of target.segments) {
      let next = read(container, key);
      if (next === null) {
        next = {};
        write(container, key, next, target.src);
      }
      if (!Array.isArray(next) && !isObject(next)) {
        throw new ExprError(`${target.src}：中间的值是${typeName(next)}，不能再往下写`);
      }
      container = next;
      key = this.key(segment, env, target.src);
    }
    return { container, key };
  }

  run(ops: Op[], parent: Env, label = ''): void {
    const locals = new Map<string, Value>();
    const env = parent.extend(locals);
    ops.forEach((op, i) => {
      this.budget.spend();
      try {
        this.step(op, env, locals);
      } catch (err) {
        if (err instanceof ExprError) throw new ExprError(`${label}第 ${i + 1} 步（${op.op}）：${err.message}`);
        throw err;
      }
    });
  }

  private assign(target: Target, env: Env, value: Value): void {
    const problem = jsonProblem(value);
    if (problem) throw new ExprError(`${target.src}：${problem}`);
    const { container, key } = this.locate(target, env);
    write(container, key, cloneJson(value as Json), target.src);
  }

  private step(op: Op, env: Env, locals: Map<string, Value>): void {
    switch (op.op) {
      case 'set':
        this.assign(op.target, env, this.eval(op.value, env));
        return;
      case 'push': {
        const value = this.eval(op.value, env);
        const list = this.list(op.target, env);
        if (op.unique && list.some((item) => deepEqual(item, value))) return;
        const problem = jsonProblem(value);
        if (problem) throw new ExprError(`${op.target.src}：${problem}`);
        list.push(cloneJson(value as Json));
        return;
      }
      case 'remove': {
        const list = this.list(op.target, env);
        if (op.by === 'index') {
          const index = this.eval(op.expr, env);
          if (typeof index !== 'number' || !Number.isInteger(index)) throw new ExprError(`${op.target.src}：index 应为整数`);
          const at = index < 0 ? list.length + index : index;
          if (at >= 0 && at < list.length) list.splice(at, 1);
          return;
        }
        const probe = this.eval(op.expr, env);
        const keep = list.filter((item, i) =>
          op.by === 'value' ? !deepEqual(item, probe) : !truthy(callLambda(probe, [item, i], { budget: this.budget })),
        );
        this.budget.spend(list.length);
        list.splice(0, list.length, ...keep);
        return;
      }
      case 'inc': {
        const { container, key } = this.locate(op.target, env);
        const current = read(container, key);
        const by = op.by ? this.eval(op.by, env) : 1;
        if (current !== null && typeof current !== 'number') throw new ExprError(`${op.target.src}：当前值是${typeName(current)}，不能累加`);
        if (typeof by !== 'number') throw new ExprError(`${op.target.src}：by 应为数字，实际是${typeName(by)}`);
        const base = typeof current === 'number' ? current : 0;
        this.assign(op.target, env, base + by);
        return;
      }
      case 'toggle': {
        const { container, key } = this.locate(op.target, env);
        this.assign(op.target, env, !truthy(read(container, key)));
        return;
      }
      case 'let':
        locals.set(op.name, this.eval(op.value, env));
        return;
      case 'if': {
        const pass = truthy(this.eval(op.test, env));
        this.run(pass ? op.then : op.else, env, pass ? 'then ' : 'else ');
        return;
      }
      case 'assert':
        if (!truthy(this.eval(op.test, env))) {
          throw new AssertionFailed(op.toast ? renderTextParts(op.toast, env, this.budget) : '当前不能执行这个操作');
        }
        return;
      case 'toast':
        this.toast = { type: op.type, content: renderTextParts(op.text, env, this.budget) };
        return;
    }
  }

  /** 读出目标数组；目标为空时补一个空数组。 */
  private list(target: Target, env: Env): Json[] {
    const { container, key } = this.locate(target, env);
    const current = read(container, key);
    if (current === null) {
      const created: Json[] = [];
      write(container, key, created, target.src);
      return created;
    }
    if (!Array.isArray(current)) throw new ExprError(`${target.src} 是${typeName(current)}，不是数组`);
    return current;
  }
}

function read(container: JsonObject | Json[], key: string | number): Json {
  if (Array.isArray(container)) {
    if (typeof key !== 'number') return null;
    return container[key < 0 ? container.length + key : key] ?? null;
  }
  return Object.hasOwn(container, String(key)) ? (container[String(key)] as Json) : null;
}

function write(container: JsonObject | Json[], key: string | number, value: Json, src: string): void {
  if (Array.isArray(container)) {
    if (typeof key !== 'number') throw new ExprError(`${src}：数组下标应为整数`);
    const at = key < 0 ? container.length + key : key;
    if (at < 0 || at >= container.length) throw new ExprError(`${src}：下标 ${key} 超出数组范围（长度 ${container.length}）`);
    container[at] = value;
    return;
  }
  container[String(key)] = value;
}

function contextScope(event: ActionEvent): Map<string, Value> {
  const user: JsonObject = { open_id: event.user.open_id, user_id: event.user.user_id ?? null, union_id: event.user.union_id ?? null };
  return new Map<string, Value>([
    ['$user', user],
    ['$args', event.args ?? null],
    ['$form', event.form ?? null],
    ['$input', event.input ?? null],
    ['$option', event.option ?? null],
    ['$options', event.options ?? null],
    ['$checked', event.checked ?? null],
    ['$now', event.now ?? Date.now()],
  ]);
}

/** 以事务方式执行动作：assert 不成立或出错时整体回滚。 */
export function executeAction(ops: Op[], state: JsonObject, event: ActionEvent, budget: Budget): DispatchResult {
  const draft = cloneJson(state);
  const exec = new Execution(draft, budget);
  const env = new Env(contextScope(event)).extend(objectScope(draft));
  try {
    exec.run(ops, env);
  } catch (err) {
    if (err instanceof AssertionFailed) {
      return { ok: false, rejected: true, state, changed: false, toast: { type: 'warning', content: err.toast } };
    }
    if (err instanceof ExprError) {
      return { ok: false, state, changed: false, error: err.message, toast: { type: 'error', content: '卡片出错了，操作没有生效' } };
    }
    throw err;
  }
  const changed = !deepEqual(draft, state);
  const result: DispatchResult = { ok: true, state: changed ? draft : state, changed };
  if (exec.toast) result.toast = exec.toast;
  return result;
}
