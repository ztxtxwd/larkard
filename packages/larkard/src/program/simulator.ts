import type { DispatchResult } from './actions.js';
import { decodeCallbackValue, type ActionEvent, type ActionUser } from './callback.js';
import { pointer } from './errors.js';
import { isObject, type Json, type JsonObject } from './expr/values.js';
import { dispatchAction, loadProgram, renderProgram, type CompiledProgram, type RenderResult } from './program.js';

/** 卡片上一个会触发动作的交互组件。 */
export interface Interaction {
  path: string;
  tag: string;
  /** 按钮文字 / 占位文字，便于按文字点击 */
  text?: string;
  element_id?: string;
  name?: string;
  action: string;
  args?: Json;
  rev?: number;
}

export interface ClickInput {
  /** 表单提交时的 form_value */
  form?: JsonObject;
  input?: string;
  option?: string;
  options?: string[];
  checked?: boolean;
  now?: number;
}

export type ClickTarget = string | { elementId: string } | ((interaction: Interaction) => boolean);

function textOf(value: Json | undefined): string | undefined {
  return isObject(value ?? null) && typeof (value as JsonObject).content === 'string' ? ((value as JsonObject).content as string) : undefined;
}

/** 列出卡片里所有带本协议回调的交互组件。 */
export function findInteractions(card: Json): Interaction[] {
  const out: Interaction[] = [];
  const walk = (node: Json, path: Array<string | number>): void => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, [...path, i]));
      return;
    }
    if (!isObject(node)) return;
    const behaviors = Array.isArray(node.behaviors) ? node.behaviors : [];
    for (const behavior of behaviors) {
      if (!isObject(behavior) || behavior.type !== 'callback') continue;
      const payload = decodeCallbackValue(behavior.value);
      if (!payload) continue;
      const interaction: Interaction = { path: pointer(path), tag: String(node.tag ?? ''), action: payload.action };
      const text = textOf(node.text) ?? textOf(node.placeholder);
      if (text !== undefined) interaction.text = text;
      if (typeof node.element_id === 'string') interaction.element_id = node.element_id;
      if (typeof node.name === 'string') interaction.name = node.name;
      if (payload.args !== undefined) interaction.args = payload.args;
      if (payload.rev !== undefined) interaction.rev = payload.rev;
      out.push(interaction);
    }
    for (const [key, child] of Object.entries(node)) walk(child, [...path, key]);
  };
  walk(card, []);
  return out;
}

export interface Simulator {
  readonly program: CompiledProgram;
  readonly state: JsonObject;
  readonly rev: number;
  readonly card: JsonObject;
  readonly last: RenderResult;
  interactions(): Interaction[];
  /** 按文字 / element_id / 条件找到卡片上的组件并以 user 身份点击 */
  click(target: ClickTarget, user: string | ActionUser, input?: ClickInput): DispatchResult;
  /** 直接投递一个事件（不经过卡片上的组件） */
  dispatch(event: ActionEvent): DispatchResult;
}

/**
 * 在内存里跑一张卡片：渲染 → 点击 → 执行动作 → 状态变了就加版本号重新渲染。
 * 点击走的是渲染出的卡片上真实的回调 value，和线上回调同一条路径。
 */
export function createSimulator(doc: unknown): Simulator {
  const program = loadProgram(doc);
  let state = program.initialState;
  let rev = 0;
  let last = renderProgram(program, state, { rev });

  const apply = (event: ActionEvent): DispatchResult => {
    const result = dispatchAction(program, state, event);
    if (result.changed) {
      state = result.state;
      rev += 1;
      last = renderProgram(program, state, { rev });
    }
    return result;
  };

  const find = (target: ClickTarget): Interaction => {
    const all = findInteractions(last.card);
    const matches =
      typeof target === 'function'
        ? all.filter(target)
        : typeof target === 'string'
          ? all.filter((i) => i.text?.trim() === target.trim())
          : all.filter((i) => i.element_id === target.elementId);
    const label = typeof target === 'function' ? '条件' : JSON.stringify(typeof target === 'string' ? target : target.elementId);
    if (matches.length === 0) {
      const known = all.map((i) => i.text ?? i.element_id ?? i.path).join('、');
      throw new Error(`卡片上找不到可点击的 ${label}${known ? `（现有：${known}）` : ''}`);
    }
    if (matches.length > 1) throw new Error(`卡片上有 ${matches.length} 个 ${label}，请改用 element_id 或条件函数`);
    return matches[0] as Interaction;
  };

  return {
    program,
    get state() {
      return state;
    },
    get rev() {
      return rev;
    },
    get card() {
      return last.card;
    },
    get last() {
      return last;
    },
    interactions: () => findInteractions(last.card),
    click(target, user, input = {}) {
      const hit = find(target);
      const event: ActionEvent = {
        action: hit.action,
        user: typeof user === 'string' ? { open_id: user } : user,
        ...input,
      };
      if (hit.args !== undefined) event.args = hit.args;
      if (hit.rev !== undefined) event.rev = hit.rev;
      return apply(event);
    },
    dispatch: apply,
  };
}
