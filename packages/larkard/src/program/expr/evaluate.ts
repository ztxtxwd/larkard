import { ExprError } from '../errors.js';
import type { Expr } from './ast.js';
import { BUILTINS } from './builtins.js';
import {
  deepEqual,
  Env,
  FORBIDDEN_KEYS,
  isObject,
  Lambda,
  RawMarkdown,
  toText,
  truthy,
  typeName,
  type Json,
  type Value,
} from './values.js';

/** 一次渲染 / 一次动作共享的计算预算，防止失控的表达式拖垮服务。 */
export class Budget {
  private used = 0;

  constructor(readonly limit: number) {}

  spend(steps = 1): void {
    this.used += steps;
    if (this.used > this.limit) throw new ExprError(`计算量超出上限（${this.limit} 步）`);
  }
}

export interface EvalContext {
  budget: Budget;
}

export function callLambda(fn: Value, args: Value[], ctx: EvalContext): Value {
  if (!(fn instanceof Lambda)) throw new ExprError(`这里需要箭头函数（如 x => x.done），实际是${typeName(fn)}`);
  const vars = new Map<string, Value>();
  fn.params.forEach((name, i) => vars.set(name, args[i] ?? null));
  return evaluate(fn.body, fn.env.extend(vars), ctx);
}

function readMember(object: Value, key: Value, pos: number): Value {
  if (object === null) return null;
  if (typeof key === 'number') {
    if (Array.isArray(object) || typeof object === 'string') {
      const index = key < 0 ? object.length + key : key;
      if (!Number.isInteger(index)) return null;
      const item = Array.isArray(object) ? object[index] : object[index];
      return item === undefined ? null : item;
    }
    key = String(key);
  }
  if (typeof key !== 'string') throw new ExprError(`属性名应为字符串或数字，实际是${typeName(key)}`, pos);
  if (key === 'length' && (Array.isArray(object) || typeof object === 'string')) return object.length;
  if (FORBIDDEN_KEYS.has(key)) throw new ExprError(`不能访问属性 ${key}`, pos);
  if (isObject(object)) return Object.hasOwn(object, key) ? (object[key] as Json) : null;
  return null;
}

function arithmetic(op: string, left: Value, right: Value, pos: number): Value {
  if (op === '+') {
    if (typeof left === 'number' && typeof right === 'number') return left + right;
    if (typeof left === 'string' || typeof right === 'string' || left instanceof RawMarkdown || right instanceof RawMarkdown) {
      return toText(left) + toText(right);
    }
    if (Array.isArray(left) && Array.isArray(right)) return [...left, ...right];
    throw new ExprError(`无法把${typeName(left)}和${typeName(right)}相加`, pos);
  }
  if (typeof left !== 'number' || typeof right !== 'number') {
    throw new ExprError(`${op} 两边都应为数字，实际是${typeName(left)}和${typeName(right)}`, pos);
  }
  switch (op) {
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
    case '%':
      if (right === 0) throw new ExprError('除数不能为 0', pos);
      return op === '/' ? left / right : left % right;
  }
  throw new ExprError(`未知运算符 ${op}`, pos);
}

function compare(op: string, left: Value, right: Value, pos: number): boolean {
  const comparable =
    (typeof left === 'number' && typeof right === 'number') || (typeof left === 'string' && typeof right === 'string');
  if (!comparable) {
    if (left === null || right === null) return false;
    throw new ExprError(`${op} 两边应同为数字或同为字符串，实际是${typeName(left)}和${typeName(right)}`, pos);
  }
  const l = left as number | string;
  const r = right as number | string;
  switch (op) {
    case '<':
      return l < r;
    case '<=':
      return l <= r;
    case '>':
      return l > r;
    default:
      return l >= r;
  }
}

export function evaluate(expr: Expr, env: Env, ctx: EvalContext): Value {
  ctx.budget.spend();
  switch (expr.type) {
    case 'literal':
      return expr.value;
    case 'ident': {
      const hit = env.lookup(expr.name);
      if (!hit.found) throw new ExprError(`未定义的变量 ${expr.name}`, expr.pos);
      return hit.value;
    }
    case 'array':
      return expr.items.map((item) => evaluate(item, env, ctx)) as Json[];
    case 'object': {
      const out: Record<string, Value> = {};
      for (const { key, value } of expr.entries) {
        if (FORBIDDEN_KEYS.has(key)) throw new ExprError(`不能使用键 ${key}`, expr.pos);
        out[key] = evaluate(value, env, ctx);
      }
      return out as Json;
    }
    case 'member':
      return readMember(evaluate(expr.object, env, ctx), evaluate(expr.property, env, ctx), expr.pos);
    case 'call': {
      const fn = BUILTINS[expr.name];
      if (!fn) throw new ExprError(`没有内置函数 ${expr.name}`, expr.pos);
      const args = expr.args.map((arg) => evaluate(arg, env, ctx));
      try {
        return fn(args, {
          spend: (steps) => ctx.budget.spend(steps),
          call: (lambda, lambdaArgs) => callLambda(lambda, lambdaArgs, ctx),
        });
      } catch (err) {
        if (err instanceof ExprError && err.pos === undefined) throw new ExprError(`${expr.name}(): ${err.message}`, expr.pos);
        throw err;
      }
    }
    case 'unary': {
      const value = evaluate(expr.arg, env, ctx);
      if (expr.op === '!') return !truthy(value);
      if (typeof value !== 'number') throw new ExprError(`${expr.op} 只能用于数字，实际是${typeName(value)}`, expr.pos);
      return expr.op === '-' ? -value : value;
    }
    case 'binary': {
      const left = evaluate(expr.left, env, ctx);
      const right = evaluate(expr.right, env, ctx);
      switch (expr.op) {
        case '==':
          return deepEqual(left, right);
        case '!=':
          return !deepEqual(left, right);
        case '<':
        case '<=':
        case '>':
        case '>=':
          return compare(expr.op, left, right, expr.pos);
        default:
          return arithmetic(expr.op, left, right, expr.pos);
      }
    }
    case 'logical': {
      const left = evaluate(expr.left, env, ctx);
      if (expr.op === '&&') return truthy(left) ? evaluate(expr.right, env, ctx) : left;
      if (expr.op === '||') return truthy(left) ? left : evaluate(expr.right, env, ctx);
      return left === null ? evaluate(expr.right, env, ctx) : left;
    }
    case 'conditional':
      return truthy(evaluate(expr.test, env, ctx)) ? evaluate(expr.consequent, env, ctx) : evaluate(expr.alternate, env, ctx);
    case 'lambda':
      return new Lambda(expr.params, expr.body, env);
  }
}
