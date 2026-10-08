/**
 * Action 序列化协议。
 *
 * 交互组件的 `action` 可以是具名函数、`registerAction` / `bindAction` 的结果，
 * 或 `{ id | path | name, params }`。序列化结果写入飞书 `value`：
 *
 * - `value.__action_id`：注册名或函数名（可带路径，如 `approval.approve`）
 * - `value.__params`：预绑定参数；没有预绑定参数时省略
 *
 * 直接传入的纯对象 `value` 会原样保留，再与上述协议字段合并。
 */

export const ACTION_ID_KEY = '__action_id';
export const ACTION_PARAMS_KEY = '__params';

const ACTION_META: unique symbol = Symbol.for('@open-feishu-card/components.action');

export interface ActionMeta {
  id: string;
  params: readonly unknown[];
}

export interface ActionObject {
  id?: string;
  name?: string;
  path?: string;
  params?: readonly unknown[];
  __action_id?: string;
  __params?: readonly unknown[];
}

export type ActionFunction = ((...args: never[]) => unknown) & {
  [ACTION_META]?: ActionMeta;
};

export type ActionInput = ActionFunction | ActionObject;

const registry = new Map<string, ActionFunction>();

function defineMeta(fn: ActionFunction, meta: ActionMeta): void {
  Object.defineProperty(fn, ACTION_META, {
    value: meta,
    configurable: true,
    enumerable: false,
    writable: true,
  });
}

export function readActionMeta(fn: ActionFunction): ActionMeta | undefined {
  return fn[ACTION_META];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * 用稳定 id（可含路径）登记函数。同一函数引用上会记下 id，序列化时优先于 `function.name`。
 */
export function registerAction<F extends (...args: never[]) => unknown>(id: string, fn: F): F {
  if (!id.trim()) {
    throw new Error('registerAction 的 id 不能为空');
  }
  const target = fn as F & ActionFunction;
  defineMeta(target, { id, params: readActionMeta(target)?.params ?? [] });
  registry.set(id, target);
  return target;
}

export function getRegisteredAction(id: string): ActionFunction | undefined {
  return registry.get(id);
}

/**
 * 预绑定参数。序列化时 `__params` 为累计参数；调用时只把本次参数传给上一层函数。
 */
export function bindAction<F extends (...args: never[]) => unknown>(
  fn: F,
  ...params: unknown[]
): F {
  const prev = readActionMeta(fn as ActionFunction);
  const id = prev?.id || fn.name;
  if (!id) {
    throw new Error('bindAction 需要具名函数或已 registerAction 的函数');
  }
  const call = fn as unknown as (...args: unknown[]) => unknown;
  const bound = ((...rest: unknown[]) => call(...params, ...rest)) as unknown as F & ActionFunction;
  Object.defineProperty(bound, 'name', { value: fn.name || id, configurable: true });
  defineMeta(bound, {
    id,
    params: [...(prev?.params ?? []), ...params],
  });
  return bound;
}

export function describeAction(action: ActionInput): ActionMeta {
  if (typeof action === 'function') {
    const meta = readActionMeta(action as ActionFunction);
    if (meta) return { id: meta.id, params: meta.params };
    if (action.name) return { id: action.name, params: [] };
    throw new Error('匿名函数无法序列化为 action，请使用具名函数或 registerAction');
  }

  if (!isPlainObject(action)) {
    throw new Error('action 必须是函数或带 id/path 的对象');
  }

  const id =
    (typeof action.__action_id === 'string' && action.__action_id) ||
    (typeof action.id === 'string' && action.id) ||
    (typeof action.path === 'string' && action.path) ||
    (typeof action.name === 'string' && action.name) ||
    '';

  if (!id) {
    throw new Error('action 对象需要 id、path、name 或 __action_id');
  }

  const raw = action.__params ?? action.params;
  if (raw !== undefined && !Array.isArray(raw)) {
    throw new Error('action.params 必须是数组');
  }
  return { id, params: raw === undefined ? [] : [...raw] };
}

/**
 * 合并用户 `value` 与 action 协议字段。两者都缺省时返回 undefined（不写 value）。
 */
export function serializeActionValue(
  action: ActionInput | undefined,
  value?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (action === undefined && value === undefined) return undefined;
  if (value !== undefined && !isPlainObject(value)) {
    throw new Error('value 必须是纯对象，例如 value={{ key: "val" }}');
  }

  const out: Record<string, unknown> = value ? { ...value } : {};
  if (action !== undefined) {
    const meta = describeAction(action);
    out[ACTION_ID_KEY] = meta.id;
    if (meta.params.length > 0) out[ACTION_PARAMS_KEY] = [...meta.params];
  }
  return out;
}
