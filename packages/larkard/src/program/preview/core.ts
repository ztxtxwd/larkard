/**
 * 多虚拟用户预览会话（无 DOM）。
 *
 * 一张卡在内存里跑：所有虚拟用户共享同一个状态和视图；切换身份只影响后续
 * 点击里的 `$user`，不会分叉出多张卡片。状态不落盘，`reset()` 或丢弃会话即恢复。
 *
 * 虚拟用户的名单 / 配色 / 首字头像沿用 larklet 本地预览的做法：随机
 * `open_id` / `user_id` / `union_id`，方便在报名、投票这类按人去重的动作里
 * 连续模拟多人点击。
 */

import type { DispatchResult } from '../actions.js';
import type { ActionEvent, ActionUser, CallbackPayload } from '../callback.js';
import type { JsonObject } from '../expr/values.js';
import {
  dispatchAction,
  loadProgram,
  renderProgram,
  type CompiledProgram,
  type RenderResult,
} from '../program.js';
import { findInteraction, findInteractions, type ClickInput, type ClickTarget, type Interaction } from '../simulator.js';

/** 默认候选名单；新建用户时优先取还没用过的名字。 */
export const PREVIEW_USER_NAMES = [
  '阿明',
  '小林',
  '小陈',
  '阿华',
  '小周',
  '小李',
  '阿杰',
  '小吴',
  '小赵',
  '阿宁',
  '小唐',
  '阿欣',
] as const;

/** 默认头像底色（不带 #）；按创建顺序循环。 */
export const PREVIEW_USER_COLORS = [
  '3370ff',
  '00a67e',
  'f54a45',
  'ff8800',
  '8b5cf6',
  '0f6cbd',
  'd83931',
  '2d9d78',
] as const;

/** 预览里的虚拟点击者。字段名与飞书回调的 operator 保持一致。 */
export interface VirtualUser extends ActionUser {
  name: string;
  /** 首字 SVG data URL；渲染 person_list / at 时直接可用。 */
  avatar_url?: string;
  /** 头像底色，不带 #。 */
  color?: string;
}

export interface VirtualUserInput {
  open_id?: string;
  user_id?: string;
  union_id?: string;
  name?: string;
  avatar_url?: string;
  color?: string;
}

export interface VirtualUserFactoryContext {
  /** 已经被占用的显示名，用来避免重名。 */
  usedNames?: Iterable<string>;
  /** 配色下标；默认用 usedNames 的数量。 */
  index?: number;
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2);
  const cryptoAPI = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoAPI?.getRandomValues) {
    cryptoAPI.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomId(prefix: string): string {
  return prefix + randomHex(12);
}

function escapeXmlText(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[char] as string);
}

function normalizeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const hex = value.trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{3,8}$/.test(hex) ? hex : undefined;
}

/** 生成首字头像（SVG data URL），不依赖外网头像服务。 */
export function virtualUserAvatar(name: string, color: string): string {
  const initial = Array.from(name.trim())[0] ?? '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">`
    + `<rect width="64" height="64" rx="32" fill="#${escapeXmlText(color)}"/>`
    + `<text x="32" y="34" text-anchor="middle" dominant-baseline="middle" `
    + `fill="white" font-size="28" font-family="system-ui,sans-serif">${escapeXmlText(initial)}</text>`
    + '</svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * 创建一个虚拟用户。字段都可以显式指定；缺省时用候选名单、循环配色和随机 ID。
 * 测试里传 `open_id` / `user_id` / `union_id` 就能得到稳定身份。
 */
export function createVirtualUser(
  input: VirtualUserInput = {},
  context: VirtualUserFactoryContext = {},
): VirtualUser {
  const usedNames = new Set(context.usedNames ?? []);
  const index = context.index ?? usedNames.size;
  const color = normalizeColor(input.color)
    ?? PREVIEW_USER_COLORS[index % PREVIEW_USER_COLORS.length];

  let name = input.name?.trim();
  if (!name) {
    name = PREVIEW_USER_NAMES.find((candidate) => !usedNames.has(candidate));
    if (!name) {
      let suffix = usedNames.size + 1;
      do {
        name = `用户${suffix}`;
        suffix += 1;
      } while (usedNames.has(name));
    }
  }

  return {
    open_id: input.open_id?.trim() || randomId('ou_'),
    user_id: input.user_id?.trim() || randomId('u_'),
    union_id: input.union_id?.trim() || randomId('on_'),
    name,
    color,
    avatar_url: input.avatar_url?.trim() || virtualUserAvatar(name, color),
  };
}

/** 只取动作需要的身份字段，避免把 name / avatar 塞进 `$user`。 */
export function virtualUserToActionUser(user: VirtualUser): ActionUser {
  const actionUser: ActionUser = { open_id: user.open_id };
  if (user.user_id) actionUser.user_id = user.user_id;
  if (user.union_id) actionUser.union_id = user.union_id;
  return actionUser;
}

/** 一次 DOM 控件交互里读到的上下文；只有存在的字段会写进 ActionEvent。 */
export interface PreviewControlState {
  form?: JsonObject;
  input?: string;
  option?: string;
  options?: string[];
  checked?: boolean;
  now?: number;
}

/**
 * 把渲染器写进 `data-feishu-action` 的回调 value + 控件状态拼成动作事件。
 * 与 `eventFromCallback` 的字段一一对应，保证预览和真机走同一条动作路径。
 */
export function buildPreviewActionEvent(
  payload: CallbackPayload,
  user: ActionUser,
  control: PreviewControlState = {},
): ActionEvent {
  const event: ActionEvent = { action: payload.action, user };
  if (payload.args !== undefined) event.args = payload.args;
  if (payload.rev !== undefined) event.rev = payload.rev;
  if (control.form !== undefined) event.form = control.form;
  if (control.input !== undefined) event.input = control.input;
  if (control.option !== undefined) event.option = control.option;
  if (control.options !== undefined) event.options = control.options;
  if (control.checked !== undefined) event.checked = control.checked;
  if (control.now !== undefined) event.now = control.now;
  return event;
}

export interface ProgramPreviewOptions {
  /** 初始虚拟用户；不传时自动创建一个。 */
  users?: VirtualUserInput[];
  /** 初始选中的用户 open_id；找不到时用第一个。 */
  activeUser?: string;
}

/** 动作事件，但 user 可以省略（用当前选中用户）或直接给 open_id。 */
export type PreviewActionEvent = Omit<ActionEvent, 'user'> & {
  user?: string | ActionUser;
};

export interface ProgramPreview {
  readonly program: CompiledProgram;
  readonly card: JsonObject;
  readonly state: JsonObject;
  readonly rev: number;
  readonly last: RenderResult;
  readonly users: readonly VirtualUser[];
  readonly activeUser: VirtualUser;

  interactions(): Interaction[];
  /** 创建虚拟用户；`select: true` 时同时切换为当前点击者。 */
  addUser(input?: VirtualUserInput, options?: { select?: boolean }): VirtualUser;
  /** 删除用户；至少保留一人，删掉当前用户时自动切到第一个。 */
  removeUser(openId: string): boolean;
  /** 切换当前点击者；共享状态和卡片不变。 */
  selectUser(openId: string): boolean;
  /** 回到程序的初始状态和 rev=0；保留用户列表与当前身份。 */
  reset(): void;

  /** 以当前选中用户点击卡片上的组件。 */
  click(target: ClickTarget, input?: ClickInput): DispatchResult;
  /** 以指定用户点击；不切换当前选中身份。 */
  clickAs(openId: string, target: ClickTarget, input?: ClickInput): DispatchResult;
  /** 直接投递事件（不经过卡片上的组件）。 */
  dispatch(event: PreviewActionEvent): DispatchResult;

  /**
   * 会话变化后回调；返回取消订阅函数。
   * `active-user` 只换点击身份，卡片和状态都没变，宿主不必重绘。
   */
  subscribe(listener: (preview: ProgramPreview, change: ProgramPreviewChange) => void): () => void;
}

export type ProgramPreviewChange = 'card' | 'users' | 'active-user' | 'reset';

/**
 * 在内存里创建一张多用户预览。
 *
 * 一个会话只有一份 `state` / `card`：所有用户看到的是同一张共享卡片，
 * 谁点击都推进同一份状态——这正是飞书共享卡片的行为。切换用户不会重置状态，
 * 也不会生成第二张卡片。
 */
export function createProgramPreview(
  doc: unknown,
  options: ProgramPreviewOptions = {},
): ProgramPreview {
  const program = loadProgram(doc);
  let state = program.initialState;
  let rev = 0;
  let last = renderProgram(program, state, { rev });

  const users: VirtualUser[] = [];
  const inputs = options.users && options.users.length > 0 ? options.users : [{}];
  for (const [index, input] of inputs.entries()) {
    const user = createVirtualUser(input, {
      usedNames: users.map((item) => item.name),
      index,
    });
    if (users.some((item) => item.open_id === user.open_id)) {
      throw new Error(`虚拟用户 open_id 重复：${user.open_id}`);
    }
    users.push(user);
  }

  let activeId = options.activeUser && users.some((user) => user.open_id === options.activeUser)
    ? options.activeUser
    : users[0]!.open_id;

  const listeners = new Set<(preview: ProgramPreview, change: ProgramPreviewChange) => void>();
  let preview!: ProgramPreview;

  const notify = (change: ProgramPreviewChange): void => {
    for (const listener of [...listeners]) {
      try {
        listener(preview, change);
      } catch {
        // 订阅方自己的异常不能影响动作执行。
      }
    }
  };

  const requireUser = (openId: string): VirtualUser => {
    const user = users.find((item) => item.open_id === openId);
    if (!user) throw new Error(`预览里没有 open_id 为 ${openId} 的虚拟用户`);
    return user;
  };

  const resolveActionUser = (user: string | ActionUser | undefined): ActionUser => {
    if (user === undefined) return virtualUserToActionUser(requireUser(activeId));
    if (typeof user === 'string') return virtualUserToActionUser(requireUser(user));
    return user;
  };

  /**
   * 状态先执行、卡片先渲染成功，再提交。渲染失败（例如运行时出现重复
   * element_id）不会把状态推进到一张画不出来的卡上，预览报错后还能重试。
   */
  const apply = (event: ActionEvent): DispatchResult => {
    const result = dispatchAction(program, state, event);
    if (!result.changed) return result;
    const next = renderProgram(program, result.state, { rev: rev + 1 });
    state = result.state;
    rev += 1;
    last = next;
    notify('card');
    return result;
  };

  preview = {
    program,
    get card() {
      return last.card;
    },
    get state() {
      return state;
    },
    get rev() {
      return rev;
    },
    get last() {
      return last;
    },
    get users() {
      return users.slice();
    },
    get activeUser() {
      return requireUser(activeId);
    },

    interactions: () => findInteractions(last.card),
    addUser(input = {}, addOptions = {}) {
      const user = createVirtualUser(input, {
        usedNames: users.map((item) => item.name),
        index: users.length,
      });
      if (users.some((item) => item.open_id === user.open_id)) {
        throw new Error(`虚拟用户 open_id 重复：${user.open_id}`);
      }
      users.push(user);
      if (addOptions.select) activeId = user.open_id;
      notify('users');
      return user;
    },
    removeUser(openId) {
      if (users.length <= 1) return false;
      const index = users.findIndex((user) => user.open_id === openId);
      if (index < 0) return false;
      users.splice(index, 1);
      if (activeId === openId) activeId = users[0]!.open_id;
      notify('users');
      return true;
    },
    selectUser(openId) {
      if (!users.some((user) => user.open_id === openId)) return false;
      if (activeId === openId) return true;
      activeId = openId;
      notify('active-user');
      return true;
    },
    reset() {
      state = program.initialState;
      rev = 0;
      last = renderProgram(program, state, { rev });
      notify('reset');
    },

    click(target, input = {}) {
      return preview.clickAs(activeId, target, input);
    },
    clickAs(openId, target, input = {}) {
      const interaction = findInteraction(last.card, target);
      const event: ActionEvent = {
        action: interaction.action,
        user: virtualUserToActionUser(requireUser(openId)),
        ...input,
      };
      if (interaction.args !== undefined) event.args = interaction.args;
      if (interaction.rev !== undefined) event.rev = interaction.rev;
      return apply(event);
    },
    dispatch(event) {
      const { user, ...rest } = event;
      return apply({ ...rest, user: resolveActionUser(user) });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return preview;
}
