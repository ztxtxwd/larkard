import type { Expr } from './ast.js';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/** 箭头函数值。只能作为内置函数的参数使用，不能存进状态。 */
export class Lambda {
  constructor(
    readonly params: readonly string[],
    readonly body: Expr,
    readonly env: Env,
  ) {}
}

/** 已是合法 markdown 片段（如 at()/person() 的结果），插值时不转义。 */
export class RawMarkdown {
  constructor(readonly text: string) {}
}

export type Value = Json | Lambda | RawMarkdown;

/** 一层作用域的变量来源。Map 即可；动作执行时用它直接读草稿状态。 */
export interface VarSource {
  has(name: string): boolean;
  get(name: string): Value | undefined;
}

/** 词法作用域链：变量查找自内向外。 */
export class Env {
  constructor(
    private readonly vars: VarSource,
    private readonly parent?: Env,
  ) {}

  lookup(name: string): { found: true; value: Value } | { found: false } {
    for (let env: Env | undefined = this; env; env = env.parent) {
      if (env.vars.has(name)) return { found: true, value: env.vars.get(name) ?? null };
    }
    return { found: false };
  }

  extend(vars: VarSource): Env {
    return new Env(vars, this);
  }
}

/** 把对象的自有字段当作一层作用域（读的是对象当前值）。 */
export function objectScope(target: JsonObject): VarSource {
  return {
    has: (name) => Object.hasOwn(target, name),
    get: (name) => target[name],
  };
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Lambda) && !(value instanceof RawMarkdown);
}

export function truthy(value: Value): boolean {
  if (value instanceof Lambda || value instanceof RawMarkdown) return true;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  return value !== null && value !== false && value !== '';
}

export function deepEqual(a: Value, b: Value): boolean {
  if (a instanceof RawMarkdown || b instanceof RawMarkdown) {
    return a instanceof RawMarkdown && b instanceof RawMarkdown && a.text === b.text;
  }
  if (a instanceof Lambda || b instanceof Lambda) return a === b;
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, i) => deepEqual(item, b[i] as Json));
  }
  if (isObject(a)) {
    if (!isObject(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && deepEqual(a[k] as Json, b[k] as Json));
  }
  return false;
}

/** 插值成文字：null 为空串，数组/对象按 JSON。 */
export function toText(value: Value): string {
  if (value instanceof RawMarkdown) return value.text;
  if (value instanceof Lambda) return '';
  if (value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function typeName(value: Value): string {
  if (value instanceof Lambda) return '函数';
  if (value instanceof RawMarkdown) return 'markdown 片段';
  if (value === null) return 'null';
  if (Array.isArray(value)) return '数组';
  if (typeof value === 'object') return '对象';
  const names: Record<string, string> = { string: '字符串', number: '数字', boolean: '布尔值' };
  return names[typeof value] ?? typeof value;
}

/** 写进状态或卡片前检查：必须是纯 JSON，数字必须有限。返回出问题的描述，合法时为 null。 */
export function jsonProblem(value: Value, depth = 0): string | null {
  if (depth > 64) return '嵌套过深';
  if (value instanceof Lambda) return '函数不能存进状态或卡片';
  if (value instanceof RawMarkdown) return 'markdown 片段只能用于文字插值';
  if (typeof value === 'number') return Number.isFinite(value) ? null : `数字 ${value} 不是有限值`;
  if (Array.isArray(value)) {
    for (const item of value) {
      const p = jsonProblem(item, depth + 1);
      if (p) return p;
    }
    return null;
  }
  if (isObject(value)) {
    for (const item of Object.values(value)) {
      const p = jsonProblem(item, depth + 1);
      if (p) return p;
    }
  }
  return null;
}

export function cloneJson<T extends Json>(value: T): T {
  return structuredClone(value);
}

/** 原型链相关的键一律不让读写，防止原型污染。 */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'prototype', 'constructor']);
