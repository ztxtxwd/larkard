/**
 * 浏览器里的多用户卡片预览。
 *
 * - 只有一张卡：所有虚拟用户共享同一个状态，切换身份只影响下一次点击的 `$user`；
 * - 点击 / 表单提交 / 下拉 / 勾选都走和真机相同的回调 value，交给内存里的程序执行；
 * - 状态不落盘，`reset()` 回到初始状态；
 * - 可选的 `mountPreviewUserBar` 提供「新建 / 选择虚拟用户」的最小 UI。
 *
 * 宿主只需要给一个容器和程序文档；渲染、事件桥接、toast 都在这里完成。
 */

import type { DispatchResult } from '../actions.js';
import { decodeCallbackValue, type ActionEvent, type CallbackPayload } from '../callback.js';
import type { JsonObject } from '../expr/values.js';
import { renderDsl } from '../../renderer/dom.js';
import { createToastHost, type ToastAPI } from '../../renderer/toast.js';
import type { PersonInfo, RenderOptions } from '../../renderer/types.js';
import {
  buildPreviewActionEvent,
  createProgramPreview,
  virtualUserToActionUser,
  type PreviewControlState,
  type ProgramPreview,
  type ProgramPreviewChange,
  type ProgramPreviewOptions,
  type VirtualUser,
  type VirtualUserInput,
} from './core.js';

/** 点击会直接触发动作的组件。 */
const CLICK_TAGS = new Set(['button', 'interactive_container']);

/** 值变化时触发回调的组件。 */
const FIELD_TAGS = new Set([
  'input',
  'select_static',
  'multi_select_static',
  'select_person',
  'multi_select_person',
  'date_picker',
  'picker_time',
  'picker_datetime',
  'checker',
]);

export interface ProgramPreviewMountOptions extends ProgramPreviewOptions {
  /** 透传给 `renderCard`；`interactive` 由预览强制打开。 */
  render?: Omit<RenderOptions, 'interactive'>;
  /** 自定义 toast 宿主；传 null 关闭。默认挂在预览根节点里。 */
  toast?: ToastAPI | null;
  /** 动作执行出错（表达式错误、渲染失败）时回调；默认打印到 console。 */
  onError?: (message: string, error?: unknown) => void;
  /** 每次动作执行后回调，无论状态是否变化。 */
  onAction?: (preview: ProgramPreview, event: ActionEvent, result: DispatchResult) => void;
  /** 卡片 / 用户 / 当前身份变化后回调。 */
  onChange?: (preview: ProgramPreview, change: ProgramPreviewChange) => void;
  /**
   * 每次卡片重绘后的后处理（图表水合、彩色图标替换、媒体加载骨架等）。
   * 入参是包含卡片根节点的容器，不会在重绘时被替换。
   */
  decorate?: (root: HTMLElement) => void;
}

export interface MountedProgramPreview {
  readonly preview: ProgramPreview;
  /** 预览自己的根节点（卡片 + toast 层）。 */
  readonly element: HTMLElement;
  /** 按当前会话状态重画卡片。 */
  refresh(): void;
  reset(): void;
  addUser(input?: VirtualUserInput, options?: { select?: boolean }): VirtualUser;
  removeUser(openId: string): boolean;
  selectUser(openId: string): boolean;
  destroy(): void;
}

function reportError(
  options: ProgramPreviewMountOptions,
  message: string,
  error?: unknown,
): void {
  if (options.onError) options.onError(message, error);
  else if (typeof console !== 'undefined') console.error('[larkard/preview]', message, error);
}

function elementTag(el: Element): string {
  return (el.getAttribute('data-feishu-tag') || el.tagName.toLowerCase()).trim();
}

function actionElement(target: EventTarget | null): Element | null {
  const node = target as Element | null;
  return node && typeof node.closest === 'function'
    ? node.closest('[data-feishu-action]')
    : null;
}

function readAction(el: Element): CallbackPayload | null {
  const raw = el.getAttribute('data-feishu-action');
  if (!raw) return null;
  try {
    return decodeCallbackValue(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** 把表单里所有具名控件收集成 form_value；重名控件聚合成数组。 */
function collectFormValues(form: HTMLFormElement | null): JsonObject | undefined {
  if (!form) return undefined;
  const values: Record<string, string | string[]> = {};
  const add = (key: string, value: string): void => {
    if (!key) return;
    const current = values[key];
    if (current === undefined) values[key] = value;
    else if (Array.isArray(current)) current.push(value);
    else values[key] = [current, value];
  };

  let read = false;
  if (typeof FormData !== 'undefined') {
    try {
      new FormData(form).forEach((value, key) => {
        if (typeof value === 'string') add(key, value);
      });
      read = true;
    } catch {
      // 非浏览器 DOM（例如 linkedom）没有可用的 FormData(form)，走下面的手动收集。
    }
  }
  if (!read) {
    for (const node of Array.from(form.querySelectorAll('input[name], select[name], textarea[name]'))) {
      const el = node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (el.disabled) continue;
      if (el.tagName === 'SELECT') {
        const select = el as HTMLSelectElement;
        for (const option of Array.from(select.options ?? [])) {
          if (option.selected) add(select.name, option.value);
        }
      } else if (el.tagName === 'INPUT') {
        const input = el as HTMLInputElement;
        const type = (input.type || '').toLowerCase();
        if ((type === 'checkbox' || type === 'radio') && !input.checked) continue;
        add(input.name, input.value);
      } else {
        add(el.name, (el as HTMLTextAreaElement).value);
      }
    }
  }

  return Object.keys(values).length > 0 ? (values as JsonObject) : undefined;
}

/** 按控件类型读取 input / option(s) / checked，和 eventFromCallback 的字段对齐。 */
function controlState(el: Element, tag: string): PreviewControlState {
  const control: PreviewControlState = {};
  const form = collectFormValues(el.closest('form') as HTMLFormElement | null);
  if (form) control.form = form;

  if (tag === 'checker') {
    control.checked = (el as HTMLInputElement).checked;
    return control;
  }
  if (tag === 'multi_select_static' || tag === 'multi_select_person') {
    const select = el as HTMLSelectElement;
    control.options = Array.from(select.selectedOptions ?? []).map((option) => option.value);
    return control;
  }
  if (tag === 'select_static' || tag === 'select_person') {
    control.option = (el as HTMLSelectElement).value;
    return control;
  }
  if (tag === 'input' || tag === 'date_picker' || tag === 'picker_time' || tag === 'picker_datetime') {
    control.input = (el as HTMLInputElement).value;
  }
  return control;
}

export function mountProgramPreview(
  container: HTMLElement,
  program: unknown,
  options: ProgramPreviewMountOptions = {},
): MountedProgramPreview {
  const preview = createProgramPreview(program, options);
  const ownerDoc = options.render?.document ?? container.ownerDocument;

  const root = ownerDoc.createElement('div');
  root.className = 'larkard-program-preview';
  root.style.width = '100%';

  const cardLayer = ownerDoc.createElement('div');
  cardLayer.className = 'larkard-program-preview__card';
  cardLayer.style.width = '100%';

  const toastLayer = ownerDoc.createElement('div');
  toastLayer.className = 'larkard-program-preview__toasts';

  root.append(cardLayer, toastLayer);
  container.appendChild(root);

  const toast = options.toast === null
    ? null
    : options.toast ?? createToastHost(toastLayer);

  const personsFor = (): Record<string, PersonInfo> => {
    const persons: Record<string, PersonInfo> = {};
    for (const user of preview.users) {
      persons[user.open_id] = {
        person_id: user.open_id,
        content: user.name,
        ...(user.avatar_url ? { avatar_url: user.avatar_url } : {}),
      };
    }
    return { ...persons, ...(options.render?.persons ?? {}) };
  };

  const render = (): void => {
    try {
      // renderProgram 产出的是公开 DSL（tag / 字段在顶层），渲染器入口要的是 RAW。
      const node = renderDsl(preview.card, {
        ...options.render,
        document: ownerDoc,
        interactive: true,
        persons: personsFor(),
      });
      cardLayer.replaceChildren(node);
      options.decorate?.(cardLayer);
    } catch (error) {
      reportError(options, error instanceof Error ? error.message : String(error), error);
    }
  };

  const run = (el: Element, payload: CallbackPayload): void => {
    const event = buildPreviewActionEvent(
      payload,
      virtualUserToActionUser(preview.activeUser),
      controlState(el, elementTag(el)),
    );
    let result: DispatchResult;
    try {
      result = preview.dispatch(event);
    } catch (error) {
      reportError(options, error instanceof Error ? error.message : String(error), error);
      return;
    }
    options.onAction?.(preview, event, result);
    if (result.toast && toast) {
      toast[result.toast.type]({ content: result.toast.content });
    }
    if (result.error) reportError(options, result.error);
  };

  const onClick = (event: MouseEvent): void => {
    const el = actionElement(event.target);
    if (!el || !root.contains(el)) return;
    const tag = elementTag(el);
    if (!CLICK_TAGS.has(tag)) return;

    if (el.tagName === 'BUTTON') {
      const type = (el.getAttribute('type') || 'button').toLowerCase();
      if (type === 'reset') return;
      // 表单里的 submit 由 submit 事件统一处理，避免同一次点击走两遍。
      if (type === 'submit' && (el as HTMLButtonElement).form) return;
    }

    const payload = readAction(el);
    if (!payload) {
      const url = el.getAttribute('data-url');
      if (url) {
        event.preventDefault();
        ownerDoc.defaultView?.open(url, '_blank', 'noopener');
      }
      return;
    }
    event.preventDefault();
    run(el, payload);
  };

  const onChange = (event: Event): void => {
    const el = actionElement(event.target);
    if (!el || !root.contains(el)) return;
    if (!FIELD_TAGS.has(elementTag(el))) return;
    const payload = readAction(el);
    if (payload) run(el, payload);
  };

  const onSubmit = (event: Event): void => {
    const form = event.target as HTMLFormElement | null;
    if (!form || form.tagName !== 'FORM' || !root.contains(form)) return;
    // 不管有没有回调都拦住：预览页不能因为一个表单刷新整页。
    event.preventDefault();
    const submitter = (event as SubmitEvent).submitter as HTMLElement | null;
    const el = submitter?.hasAttribute('data-feishu-action')
      ? submitter
      : form.querySelector<Element>('button[type="submit"][data-feishu-action]');
    if (!el) return;
    const payload = readAction(el);
    if (payload) run(el, payload);
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter') return;
    const el = actionElement(event.target);
    if (!el || !root.contains(el)) return;
    const tag = elementTag(el);
    if (tag !== 'input' && tag !== 'date_picker' && tag !== 'picker_time' && tag !== 'picker_datetime') {
      return;
    }
    // 表单内交给原生 submit；表单外按「回车提交输入框」处理：失焦触发 change。
    if (el.closest('form')) return;
    event.preventDefault();
    (el as HTMLInputElement).blur();
  };

  const abort = new AbortController();
  root.addEventListener('click', onClick as EventListener, { signal: abort.signal });
  root.addEventListener('change', onChange, { signal: abort.signal });
  root.addEventListener('submit', onSubmit, { signal: abort.signal });
  root.addEventListener('keydown', onKeydown as EventListener, { signal: abort.signal });

  const unsubscribe = preview.subscribe((_, change) => {
    // 只换点击身份时卡片和状态都没变；不重绘，避免把表单里没提交的输入冲掉。
    if (change !== 'active-user') render();
    options.onChange?.(preview, change);
  });

  render();

  return {
    preview,
    element: root,
    refresh: render,
    reset: () => preview.reset(),
    addUser: (input, addOptions) => preview.addUser(input, addOptions),
    removeUser: (openId) => preview.removeUser(openId),
    selectUser: (openId) => preview.selectUser(openId),
    destroy: () => {
      abort.abort();
      unsubscribe();
      toast?.destroy();
      root.remove();
    },
  };
}

export interface PreviewUserBarOptions {
  /** 是否显示「移除」按钮，默认 true；只剩一人时按钮禁用。 */
  removable?: boolean;
  labels?: {
    user?: string;
    add?: string;
    remove?: string;
  };
}

export interface MountedPreviewUserBar {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

/**
 * 可选的虚拟用户工具条：下拉选择当前点击者 + 新建 / 移除。
 *
 * 只是一个最薄的 DOM 封装，方便 demo / 工作台直接用；自带 UI 的宿主可以
 * 只使用 `ProgramPreview` 的 addUser / selectUser / removeUser。
 */
export function mountPreviewUserBar(
  container: HTMLElement,
  preview: ProgramPreview,
  options: PreviewUserBarOptions = {},
): MountedPreviewUserBar {
  const ownerDoc = container.ownerDocument;
  const labels = {
    user: options.labels?.user ?? '点击身份',
    add: options.labels?.add ?? '新建用户',
    remove: options.labels?.remove ?? '移除',
  };

  const root = ownerDoc.createElement('div');
  root.className = 'larkard-program-preview__users';
  root.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;'
    + 'margin:0 0 8px;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#646a73;';

  const label = ownerDoc.createElement('span');
  label.textContent = labels.user;

  const select = ownerDoc.createElement('select');
  select.setAttribute('aria-label', labels.user);
  select.style.cssText = 'font:inherit;padding:4px 6px;border:1px solid #dee0e3;border-radius:6px;'
    + 'background:#fff;color:#1f2329;max-width:240px;';

  const add = ownerDoc.createElement('button');
  add.type = 'button';
  add.textContent = labels.add;
  add.style.cssText = 'font:inherit;padding:4px 10px;border:1px solid #dee0e3;border-radius:6px;'
    + 'background:#fff;color:#1f2329;cursor:pointer;';

  const remove = ownerDoc.createElement('button');
  remove.type = 'button';
  remove.textContent = labels.remove;
  remove.style.cssText = add.style.cssText;

  root.append(label, select, add);
  if (options.removable !== false) root.append(remove);
  container.appendChild(root);

  const refresh = (): void => {
    const activeId = preview.activeUser.open_id;
    select.replaceChildren(...preview.users.map((user) => {
      const option = ownerDoc.createElement('option');
      option.value = user.open_id;
      option.textContent = user.name;
      option.title = user.open_id;
      option.selected = user.open_id === activeId;
      return option;
    }));
    remove.disabled = preview.users.length <= 1;
    remove.style.opacity = remove.disabled ? '0.45' : '1';
    remove.style.cursor = remove.disabled ? 'default' : 'pointer';
  };

  select.addEventListener('change', () => {
    preview.selectUser(select.value);
  });
  add.addEventListener('click', () => {
    preview.addUser(undefined, { select: true });
  });
  remove.addEventListener('click', () => {
    preview.removeUser(preview.activeUser.open_id);
  });

  const unsubscribe = preview.subscribe(refresh);
  refresh();

  return {
    element: root,
    refresh,
    destroy: () => {
      unsubscribe();
      root.remove();
    },
  };
}
