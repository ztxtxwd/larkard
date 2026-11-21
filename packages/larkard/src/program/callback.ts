import { isObject, type Json, type JsonObject } from './expr/values.js';

/** 写进交互组件回调 value 的协议字段。 */
export const CALLBACK_ACTION_KEY = '__a';
export const CALLBACK_ARGS_KEY = '__p';
export const CALLBACK_REV_KEY = '__r';

export interface CallbackPayload {
  action: string;
  args?: Json;
  rev?: number;
}

export function encodeCallbackValue(payload: CallbackPayload): JsonObject {
  const value: JsonObject = { [CALLBACK_ACTION_KEY]: payload.action };
  if (payload.args !== undefined) value[CALLBACK_ARGS_KEY] = payload.args;
  if (payload.rev !== undefined) value[CALLBACK_REV_KEY] = payload.rev;
  return value;
}

/** 从回调 action.value 里读出动作；不是本协议生成的 value 时返回 null。 */
export function decodeCallbackValue(value: unknown): CallbackPayload | null {
  if (!isObject(value as Json)) return null;
  const obj = value as JsonObject;
  const action = obj[CALLBACK_ACTION_KEY];
  if (typeof action !== 'string' || !action) return null;
  const payload: CallbackPayload = { action };
  if (obj[CALLBACK_ARGS_KEY] !== undefined) payload.args = obj[CALLBACK_ARGS_KEY];
  const rev = obj[CALLBACK_REV_KEY];
  if (typeof rev === 'number') payload.rev = rev;
  return payload;
}

/** 点击者。open_id 必有；user_id 需要应用开通权限才会下发。 */
export interface ActionUser {
  open_id: string;
  user_id?: string;
  union_id?: string;
}

/** 一次交互：动作执行时可用的全部上下文。 */
export interface ActionEvent {
  action: string;
  user: ActionUser;
  args?: Json;
  /** 表单容器提交的 form_value */
  form?: JsonObject;
  /** 输入框回调的 input_value */
  input?: string;
  /** 单选类组件选中的值 */
  option?: string;
  /** 多选类组件选中的值 */
  options?: string[];
  /** 勾选器状态 */
  checked?: boolean;
  /** 渲染这次点击的卡片时的版本号 */
  rev?: number;
  /** 毫秒时间戳；不传用当前时间 */
  now?: number;
}

/**
 * 把飞书 card.action.trigger 回调的 event 部分转成 ActionEvent。
 * 不是本协议生成的交互（value 里没有动作名）时返回 null。
 */
export function eventFromCallback(event: unknown): ActionEvent | null {
  if (!isObject(event as Json)) return null;
  const e = event as JsonObject;
  const action = isObject(e.action as Json) ? (e.action as JsonObject) : null;
  const operator = isObject(e.operator as Json) ? (e.operator as JsonObject) : null;
  if (!action || !operator || typeof operator.open_id !== 'string') return null;
  const payload = decodeCallbackValue(action.value);
  if (!payload) return null;

  const user: ActionUser = { open_id: operator.open_id };
  if (typeof operator.user_id === 'string') user.user_id = operator.user_id;
  if (typeof operator.union_id === 'string') user.union_id = operator.union_id;

  const out: ActionEvent = { action: payload.action, user };
  if (payload.args !== undefined) out.args = payload.args;
  if (payload.rev !== undefined) out.rev = payload.rev;
  if (isObject(action.form_value as Json)) out.form = action.form_value as JsonObject;
  if (typeof action.input_value === 'string') out.input = action.input_value;
  if (typeof action.option === 'string') out.option = action.option;
  if (Array.isArray(action.options)) out.options = action.options.filter((o): o is string => typeof o === 'string');
  if (typeof action.checked === 'boolean') out.checked = action.checked;
  return out;
}
