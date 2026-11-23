/**
 * Toast 宿主（对齐飞书客户端 kernel.toast）。
 *
 * 事实依据（feishu-card-extract，pcsdk 7.72.0）：
 * - 卡片 action 请求响应里带 `toast: { code, content, ... }`（如复制成功、表单校验失败、
 *   错误码提示），Kernel 收到后调 `options.toast.success/info/warning/error` 弹出。
 * - 调用形态：`{ type: "TOAST_SUCCESS", content, showTime: 2e3, maxLines: 1 }`。
 * - DOM 为 `.ud__toast.ud__notice`：顶部下拉动画（translateY(-100%)→0）、
 *   max-width:600px、box-shadow、margin-bottom:16px、top:32px。
 *
 * renderer 是 SSR 字符串渲染器，此处提供浏览器侧 toast 宿主：预览交互里模拟
 * action 响应（如按钮点击回调）时调用对应方法，视觉与客户端一致。
 */

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastOptions {
  /** toast 文本内容 */
  content: string;
  /** 显示时长 ms，默认 2000（客户端 showTime 常见值 2e3） */
  showTime?: number;
  /** 最大行数，超出截断省略，默认 1（客户端 maxLines:1） */
  maxLines?: number;
  /** 视觉形态：'dark' 深色悬浮胶囊（默认）；'outlined' 浅底彩边（对齐客户端 .ud__notice--outlined） */
  variant?: 'dark' | 'outlined';
}

export interface ToastAPI {
  success: (opts: ToastOptions) => void;
  info: (opts: ToastOptions) => void;
  warning: (opts: ToastOptions) => void;
  error: (opts: ToastOptions) => void;
  /** 清空当前所有 toast */
  destroy: () => void;
}

const DEFAULT_SHOW_TIME = 2000;

/** 四种类型的图标（白色线型 SVG，语义色圆底），复刻客户端 toast 图标位 */
const TYPE_ICON: Record<ToastType, string> = {
  success:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">'
    + '<circle cx="8" cy="8" r="7" fill="#34c724"/>'
    + '<path d="M4.5 8.2l2.2 2.2 4.8-4.8" fill="none" stroke="#fff" stroke-width="1.6" '
    + 'stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">'
    + '<circle cx="8" cy="8" r="7" fill="#3370ff"/>'
    + '<circle cx="8" cy="4.6" r="1" fill="#fff"/>'
    + '<rect x="7.2" y="7" width="1.6" height="4.2" rx="0.8" fill="#fff"/></svg>',
  warning:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">'
    + '<circle cx="8" cy="8" r="7" fill="#fad355"/>'
    + '<rect x="7.2" y="3.8" width="1.6" height="4.6" rx="0.8" fill="#fff"/>'
    + '<circle cx="8" cy="11.8" r="1" fill="#fff"/></svg>',
  error:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">'
    + '<circle cx="8" cy="8" r="7" fill="#f54a45"/>'
    + '<path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="#fff" stroke-width="1.6" '
    + 'stroke-linecap="round"/></svg>',
};

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 生成单个 toast 的 HTML 字符串（纯函数，SSR/测试可用） */
export function renderToastHTML(type: ToastType, opts: ToastOptions): string {
  const maxLines = opts.maxLines ?? 1;
  const styleAttr = maxLines > 1 ? ` style="-webkit-line-clamp:${maxLines};"` : '';
  const variantClass = opts.variant === 'outlined' ? ' universal-card-toast--outlined' : '';
  return (
    `<div class="universal-card-toast universal-card-toast--${type}${variantClass}" role="status" aria-live="polite">`
    + `<span class="universal-card-toast__icon">${TYPE_ICON[type]}</span>`
    + `<span class="universal-card-toast__text"${styleAttr}>${escapeHTML(opts.content)}</span>`
    + `</div>`
  );
}

/**
 * 创建 toast 宿主（浏览器侧）。容器挂在 container（默认 document.body），
 * fixed 顶部居中；每次调用追加一条 toast，showTime 后自动移除。
 * Node/SSR 环境无 DOM 时返回 no-op API（不抛错），仅可用 renderToastHTML。
 */
export function createToastHost(container?: HTMLElement | null): ToastAPI {
  const hostEl =
    typeof document === 'undefined'
      ? null
      : (container ?? document.body);

  const ensureHost = (): HTMLElement | null => {
    if (!hostEl) return null;
    let el = hostEl.querySelector<HTMLElement>('.universal-card-toast-host.js');
    if (!el) {
      el = document.createElement('div');
      // `js` 标记：只管理脚本创建的宿主 / toast，SSR 静态输出不参与 destroy。
      el.className = 'universal-card-toast-host js';
      hostEl.appendChild(el);
    }
    return el;
  };

  const push = (type: ToastType) => (opts: ToastOptions) => {
    const host = ensureHost();
    if (!host || typeof document === 'undefined') return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:contents';
    wrap.innerHTML = renderToastHTML(type, opts);
    const toastEl = wrap.firstElementChild as HTMLElement;
    toastEl.classList.add('js');
    host.appendChild(toastEl);
    const showTime = opts.showTime ?? DEFAULT_SHOW_TIME;
    setTimeout(() => {
      toastEl.classList.add('universal-card-toast--leave');
      toastEl.addEventListener('animationend', () => toastEl.remove(), { once: true });
      // 兜底：动画事件未触发时也移除
      setTimeout(() => toastEl.remove(), 400);
    }, showTime);
  };

  return {
    success: push('success'),
    info: push('info'),
    warning: push('warning'),
    error: push('error'),
    destroy: () => {
      hostEl?.querySelectorAll('.universal-card-toast-host .universal-card-toast.js')
        .forEach((el) => el.remove());
    },
  };
}
