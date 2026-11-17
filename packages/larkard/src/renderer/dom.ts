/**
 * 浏览器 DOM 渲染：VNode → 真实 DOM，并接线交互水合与按需样式注入。
 *
 * 单独成文件，供 `./browser` 与 `./async` 复用；只需要 SSR 的消费者不会
 * 通过 `./index` 间接引入 DOM / 资源代码。
 */
import type { CardInput, RenderOptions } from './types.js';
import { CLS } from './constants.js';
import { buildCardVNode } from './render.js';
import { vnodeToDom } from './vnode.js';
import { BASE_STYLES_CSS } from './assets/base-styles.js';
import { EMOJI_SPRITE_CSS } from './assets/emoji.js';
import { ICON_FONT_CSS } from './assets/icon-font.js';
import { hydrateFeishuAudios } from './audio-hydrate.js';
import { hydrateFeishuTablePagers } from './table-pager.js';
import { dslToRaw } from '../adapter/index.js';

const BASE_STYLES_STYLE_ID = `${CLS}-base-styles`;
const ICON_FONT_STYLE_ID = `${CLS}-icon-font`;
const EMOJI_SPRITE_STYLE_ID = `${CLS}-emoji-sprite`;

function getDocument(options: RenderOptions): Document | null {
  return options.document || (typeof document !== 'undefined' ? document : null);
}

/** 幂等注入一份 <style>。 */
function ensureStyle(doc: Document, id: string, css: string): void {
  if (typeof doc.getElementById !== 'function' || doc.getElementById(id)) return;
  const style = doc.createElement('style');
  style.id = id;
  style.textContent = css;
  (doc.head || doc.documentElement).appendChild(style);
}

function injectAssets(doc: Document, asset: 'icons' | 'emoji'): void {
  if (asset === 'icons') ensureStyle(doc, ICON_FONT_STYLE_ID, ICON_FONT_CSS);
  else ensureStyle(doc, EMOJI_SPRITE_STYLE_ID, EMOJI_SPRITE_CSS);
}

/** 渲染为真实 DOM 节点（浏览器）。Node 端请用 `renderCardToString`。 */
export function renderCard(card: CardInput, options: RenderOptions = {}): Node {
  const doc = getDocument(options);
  if (!doc) throw new Error('[FeishuCard] renderCard 需要 DOM 环境；Node 端请用 renderCardToString');
  ensureStyle(doc, BASE_STYLES_STYLE_ID, BASE_STYLES_CSS);
  const dom = vnodeToDom(
    buildCardVNode(card, { ...options, injectAssets: (asset) => injectAssets(doc, asset) }),
    doc,
  );
  if (!dom) throw new Error('[FeishuCard] 渲染结果为空');
  // 音频交互（播放/暂停图标切换、进度条）与表格翻页在浏览器端自动接线。
  if (dom instanceof Element || typeof (dom as ParentNode).querySelectorAll === 'function') {
    hydrateFeishuAudios(dom as ParentNode);
    hydrateFeishuTablePagers(dom as ParentNode);
  }
  return dom;
}

/** 输入公开 DSL，渲染为真实 DOM 节点（浏览器）。= renderCard(dslToRaw(dsl)) */
export function renderDsl(dsl: unknown, options: RenderOptions = {}): Node {
  return renderCard(dslToRaw(dsl), options);
}
