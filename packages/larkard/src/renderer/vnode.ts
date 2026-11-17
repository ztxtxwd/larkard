/**
 * 轻量「虚拟节点」模型：让同一套渲染逻辑既能输出 HTML 字符串（Node/SSR），
 * 又能输出真实 DOM（浏览器）。无 React 依赖。
 */
import type { VNode, VNodeChild, VNodeProps } from './types.js';

/** 创建 VNode。children 可为 VNode / string / null / false / 数组（自动扁平+去空） */
export function h(tag: string, props?: VNodeProps | null, ...children: Array<VNodeChild | VNodeChild[]>): VNode {
  const flat: VNodeChild[] = [];
  const walk = (c: VNodeChild | VNodeChild[]): void => {
    if (Array.isArray(c)) c.forEach(walk);
    else if (c != null && c !== false) flat.push(c);
  };
  children.forEach(walk);
  return { tag, props: props || {}, children: flat };
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input']);
const ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, (c) => ESCAPE[c]);

/** style 对象 -> CSS 字符串（camelCase -> kebab-case） */
export function styleToString(style: Record<string, string | number | null | undefined>): string {
  return Object.keys(style)
    .filter((k) => style[k] != null && style[k] !== '')
    .map((k) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${style[k]}`)
    .join(';');
}

/** VNode -> HTML 字符串 */
export function vnodeToString(node: VNodeChild | VNodeChild[]): string {
  if (node == null || node === false) return '';
  if (typeof node === 'string') return esc(node);
  if (Array.isArray(node)) return node.map(vnodeToString).join('');
  const { tag, children } = node;
  // Defensive: a component may hand back a node whose `props` is null/undefined
  // (e.g. built as a literal instead of via h()). Object.keys(null) throws and
  // would take down the whole tree, so coerce to an empty object here.
  const props = node.props || {};
  let attrs = '';
  for (const k of Object.keys(props)) {
    const v = props[k];
    if (k === 'style' && v && typeof v === 'object') {
      const s = styleToString(v as Record<string, string | number>);
      if (s) attrs += ` style="${esc(s)}"`;
    } else if (k === 'className') {
      if (v) attrs += ` class="${esc(v)}"`;
    } else if (k === 'dangerouslySetInnerHTML') {
      continue;
    } else if (v != null && v !== false) {
      attrs += ` ${k}="${esc(v)}"`;
    }
  }
  if (VOID_TAGS.has(tag)) return `<${tag}${attrs}>`;
  const html = props.dangerouslySetInnerHTML;
  const inner = html ? html.__html : (children || []).map(vnodeToString).join('');
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

/** VNode -> 真实 DOM 节点 */
export function vnodeToDom(node: VNodeChild | VNodeChild[], doc: Document): Node | null {
  if (node == null || node === false) return null;
  if (typeof node === 'string') return doc.createTextNode(node);
  if (Array.isArray(node)) {
    const frag = doc.createDocumentFragment();
    node.forEach((n) => { const d = vnodeToDom(n, doc); if (d) frag.appendChild(d); });
    return frag;
  }
  const { tag, children } = node;
  const props = node.props || {};
  const el = doc.createElement(tag);
  for (const k of Object.keys(props)) {
    const v = props[k];
    if (k === 'style' && v && typeof v === 'object') {
      el.setAttribute('style', styleToString(v as Record<string, string | number>));
    } else if (k === 'className') {
      if (v) el.setAttribute('class', String(v));
    } else if (k === 'dangerouslySetInnerHTML') {
      el.innerHTML = (v as { __html: string }).__html;
    } else if (v != null && v !== false) {
      el.setAttribute(k, String(v));
    }
  }
  if (!props.dangerouslySetInnerHTML) {
    (children || []).forEach((c) => { const d = vnodeToDom(c, doc); if (d) el.appendChild(d); });
  }
  return el;
}
