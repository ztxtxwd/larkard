import { ExprError } from '../errors.js';
import {
  deepEqual,
  FORBIDDEN_KEYS,
  isObject,
  Lambda,
  RawMarkdown,
  toText,
  truthy,
  typeName,
  type Json,
  type JsonObject,
  type Value,
} from './values.js';

export interface BuiltinRuntime {
  /** 记账：遍历 n 个元素就花 n 步。 */
  spend(steps: number): void;
  /** 调用作为参数传入的箭头函数。 */
  call(fn: Value, args: Value[]): Value;
}

export type Builtin = (args: Value[], rt: BuiltinRuntime) => Value;

export const MAX_RANGE = 1000;

function arg(args: Value[], i: number): Value {
  return args[i] ?? null;
}

function list(args: Value[], i: number): Json[] {
  const v = arg(args, i);
  if (v === null) return [];
  if (!Array.isArray(v)) throw new ExprError(`第 ${i + 1} 个参数应为数组，实际是${typeName(v)}`);
  return v;
}

function num(args: Value[], i: number, fallback?: number): number {
  const v = arg(args, i);
  if (v === null && fallback !== undefined) return fallback;
  if (typeof v !== 'number') throw new ExprError(`第 ${i + 1} 个参数应为数字，实际是${typeName(v)}`);
  return v;
}

function text(args: Value[], i: number, fallback?: string): string {
  const v = arg(args, i);
  if (v === null && fallback !== undefined) return fallback;
  if (typeof v !== 'string') throw new ExprError(`第 ${i + 1} 个参数应为字符串，实际是${typeName(v)}`);
  return v;
}

function obj(args: Value[], i: number): JsonObject {
  const v = arg(args, i);
  if (v === null) return {};
  if (!isObject(v)) throw new ExprError(`第 ${i + 1} 个参数应为对象，实际是${typeName(v)}`);
  return v;
}

function fn(args: Value[], i: number): Lambda {
  const v = arg(args, i);
  if (!(v instanceof Lambda)) throw new ExprError(`第 ${i + 1} 个参数应为箭头函数（如 x => x.done），实际是${typeName(v)}`);
  return v;
}

/** 数组遍历类函数：回调收到 (item, index)。 */
function each<T>(rt: BuiltinRuntime, items: Json[], f: Lambda, visit: (result: Value, item: Json, index: number) => T | undefined): T | undefined {
  rt.spend(items.length);
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i] as Json;
    const hit = visit(rt.call(f, [item, i]), item, i);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function sortKey(a: Value, b: Value): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  throw new ExprError(`sort 只能比较数字或字符串，实际是${typeName(a)}和${typeName(b)}`);
}

function numbersOf(args: Value[]): number[] {
  const source = args.length === 1 && Array.isArray(args[0]) ? (args[0] as Json[]) : args;
  return source.map((v, i) => {
    if (typeof v !== 'number') throw new ExprError(`第 ${i + 1} 个值应为数字，实际是${typeName(v)}`);
    return v;
  });
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function userId(args: Value[]): string {
  const id = text(args, 0);
  if (!ID_PATTERN.test(id)) throw new ExprError(`不是合法的用户 ID：${JSON.stringify(id)}`);
  return id;
}

const DATE_TOKENS = /YYYY|MM|DD|HH|mm|ss/g;

function formatDate(ms: number, pattern: string, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(ms));
  } catch {
    throw new ExprError(`不认识的时区 ${timeZone}`);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const map: Record<string, string> = {
    YYYY: get('year'),
    MM: get('month'),
    DD: get('day'),
    HH: get('hour'),
    mm: get('minute'),
    ss: get('second'),
  };
  return pattern.replace(DATE_TOKENS, (token) => map[token] ?? token);
}

export const BUILTINS: Readonly<Record<string, Builtin>> = {
  len: (args) => {
    const v = arg(args, 0);
    if (v === null) return 0;
    if (Array.isArray(v) || typeof v === 'string') return v.length;
    if (isObject(v)) return Object.keys(v).length;
    throw new ExprError(`len 的参数应为数组、字符串或对象，实际是${typeName(v)}`);
  },
  includes: (args, rt) => {
    const coll = arg(args, 0);
    const needle = arg(args, 1);
    if (coll === null) return false;
    if (typeof coll === 'string') return coll.includes(toText(needle));
    const items = list(args, 0);
    rt.spend(items.length);
    return items.some((item) => deepEqual(item, needle));
  },
  indexOf: (args, rt) => {
    const coll = arg(args, 0);
    const needle = arg(args, 1);
    if (coll === null) return -1;
    if (typeof coll === 'string') return coll.indexOf(toText(needle));
    const items = list(args, 0);
    rt.spend(items.length);
    return items.findIndex((item) => deepEqual(item, needle));
  },
  join: (args, rt) => {
    const items = list(args, 0);
    rt.spend(items.length);
    return items.map(toText).join(text(args, 1, ','));
  },
  slice: (args) => {
    const v = arg(args, 0);
    const start = num(args, 1, 0);
    const end = arg(args, 2) === null ? undefined : num(args, 2);
    if (typeof v === 'string') return v.slice(start, end);
    return list(args, 0).slice(start, end);
  },
  concat: (args, rt) => {
    const out: Json[] = [];
    for (const v of args) {
      if (Array.isArray(v)) out.push(...v);
      else out.push(v as Json);
    }
    rt.spend(out.length);
    return out;
  },
  reverse: (args) => [...list(args, 0)].reverse(),
  sort: (args, rt) => {
    const items = [...list(args, 0)];
    rt.spend(items.length * Math.max(1, Math.ceil(Math.log2(items.length + 1))));
    const f = arg(args, 1);
    if (f === null) return items.sort(sortKey);
    const lambda = fn(args, 1);
    if (lambda.params.length >= 2) {
      return items.sort((a, b) => {
        const r = rt.call(lambda, [a, b]);
        if (typeof r !== 'number') throw new ExprError('sort 的比较函数应返回数字');
        return r;
      });
    }
    const keyed = items.map((item) => ({ item, key: rt.call(lambda, [item]) }));
    return keyed.sort((a, b) => sortKey(a.key, b.key)).map((k) => k.item);
  },
  unique: (args, rt) => {
    const items = list(args, 0);
    rt.spend(items.length * items.length);
    const out: Json[] = [];
    for (const item of items) if (!out.some((seen) => deepEqual(seen, item))) out.push(item);
    return out;
  },
  first: (args) => list(args, 0)[0] ?? null,
  last: (args) => {
    const items = list(args, 0);
    return items[items.length - 1] ?? null;
  },
  range: (args, rt) => {
    const [start, end] = args.length >= 2 ? [num(args, 0), num(args, 1)] : [0, num(args, 0)];
    if (!Number.isInteger(start) || !Number.isInteger(end)) throw new ExprError('range 的参数应为整数');
    const n = Math.max(0, end - start);
    if (n > MAX_RANGE) throw new ExprError(`range 最多生成 ${MAX_RANGE} 个数`);
    rt.spend(n);
    return Array.from({ length: n }, (_, i) => start + i);
  },
  keys: (args) => Object.keys(obj(args, 0)),
  values: (args) => Object.values(obj(args, 0)),
  entries: (args) => Object.entries(obj(args, 0)).map(([k, v]) => [k, v]),
  has: (args) => Object.hasOwn(obj(args, 0), text(args, 1)),
  merge: (args) => {
    const out: JsonObject = {};
    args.forEach((_, i) => {
      for (const [k, v] of Object.entries(obj(args, i))) {
        if (!FORBIDDEN_KEYS.has(k)) out[k] = v;
      }
    });
    return out;
  },
  filter: (args, rt) => {
    const out: Json[] = [];
    each(rt, list(args, 0), fn(args, 1), (r, item) => {
      if (truthy(r)) out.push(item);
      return undefined;
    });
    return out;
  },
  map: (args, rt) => {
    const out: Value[] = [];
    each(rt, list(args, 0), fn(args, 1), (r) => {
      out.push(r);
      return undefined;
    });
    return out as Json[];
  },
  find: (args, rt) => each(rt, list(args, 0), fn(args, 1), (r, item) => (truthy(r) ? item : undefined)) ?? null,
  findIndex: (args, rt) => each(rt, list(args, 0), fn(args, 1), (r, _item, i) => (truthy(r) ? i : undefined)) ?? -1,
  some: (args, rt) => each(rt, list(args, 0), fn(args, 1), (r) => (truthy(r) ? true : undefined)) ?? false,
  every: (args, rt) => each(rt, list(args, 0), fn(args, 1), (r) => (truthy(r) ? undefined : false)) ?? true,
  count: (args, rt) => {
    const items = list(args, 0);
    const probe = arg(args, 1);
    let n = 0;
    if (probe instanceof Lambda) {
      each(rt, items, probe, (r) => {
        if (truthy(r)) n += 1;
        return undefined;
      });
      return n;
    }
    rt.spend(items.length);
    return items.filter((item) => deepEqual(item, probe)).length;
  },
  sum: (args, rt) => {
    const items = list(args, 0);
    const f = arg(args, 1);
    rt.spend(items.length);
    return items.reduce<number>((acc, item, i) => {
      const v = f === null ? item : rt.call(fn(args, 1), [item, i]);
      if (typeof v !== 'number') throw new ExprError(`sum 只能累加数字，实际是${typeName(v)}`);
      return acc + v;
    }, 0);
  },
  min: (args) => {
    const ns = numbersOf(args);
    return ns.length ? Math.min(...ns) : null;
  },
  max: (args) => {
    const ns = numbersOf(args);
    return ns.length ? Math.max(...ns) : null;
  },
  abs: (args) => Math.abs(num(args, 0)),
  round: (args) => {
    const digits = num(args, 1, 0);
    const factor = 10 ** digits;
    return Math.round(num(args, 0) * factor) / factor;
  },
  floor: (args) => Math.floor(num(args, 0)),
  ceil: (args) => Math.ceil(num(args, 0)),
  num: (args) => {
    const v = arg(args, 0);
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  },
  str: (args) => toText(arg(args, 0)),
  upper: (args) => text(args, 0).toUpperCase(),
  lower: (args) => text(args, 0).toLowerCase(),
  trim: (args) => text(args, 0).trim(),
  split: (args) => text(args, 0).split(text(args, 1, ',')),
  replace: (args) => text(args, 0).split(text(args, 1)).join(text(args, 2, '')),
  startsWith: (args) => text(args, 0).startsWith(text(args, 1)),
  endsWith: (args) => text(args, 0).endsWith(text(args, 1)),
  padStart: (args) => text(args, 0).padStart(num(args, 1), text(args, 2, ' ')),
  json: (args) => JSON.stringify(arg(args, 0)),
  date: (args) => formatDate(num(args, 0), text(args, 1, 'YYYY-MM-DD HH:mm'), text(args, 2, 'Asia/Shanghai')),
  at: (args) => {
    const id = text(args, 0);
    return new RawMarkdown(id === 'all' ? '<at id=all></at>' : `<at id=${userId(args)}></at>`);
  },
  person: (args) => new RawMarkdown(`<person id='${userId(args)}' show_name=true show_avatar=true style='normal'></person>`),
};

/** JS 习惯写法到内置函数的别名，如 name.toUpperCase()。 */
const ALIASES: Record<string, string> = {
  toUpperCase: 'upper',
  toLowerCase: 'lower',
  toString: 'str',
  length: 'len',
};

for (const [alias, target] of Object.entries(ALIASES)) {
  (BUILTINS as Record<string, Builtin>)[alias] = BUILTINS[target] as Builtin;
}

export const BUILTIN_NAMES: ReadonlySet<string> = new Set(Object.keys(BUILTINS));
