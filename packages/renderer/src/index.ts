/**
 * open-feishu-card
 * 独立、零依赖的飞书 Universal Card 渲染器（RAW 格式输入）。
 * 同时适用于 Node/SSR（renderCardToString）与浏览器（renderCard）。
 */
import type {
  CardInput, JsonCard, RenderContext, RenderOptions, VNode,
} from './types';
import { BASE_FONT_SIZE, BASE_LINE_HEIGHT, CLS } from './constants';
import { h, vnodeToDom, vnodeToString } from './vnode';
import {
  getComponent, registerComponent, renderElement, renderElements,
} from './registry';
import { registerBuiltins, ensureBaseStylesInjected } from './components';
import { dslToRaw } from '@open-feishu-card/adapter';

// 模块加载时注册全部内置组件（显式调用，避免被 tree-shake）
registerBuiltins();

/** 把多种外层包装归一到 json_card 对象 */
function unwrap(card: CardInput | null | undefined): JsonCard | null {
  if (!card) return null;
  const anyCard = card as Record<string, unknown>;
  if (anyCard.json_card) return anyCard.json_card as JsonCard;
  if (anyCard.card && (anyCard.card as Record<string, unknown>).json_card) {
    return (anyCard.card as { json_card: JsonCard }).json_card;
  }
  return card as JsonCard;
}

/**
 * 从输入里捞 json_attachment.persons 合进 options.persons（不覆盖 caller 显式传入的）。
 * 这样直接把整条消息对象 { json_card, json_attachment } 丢给同步渲染时，人员姓名/头像也能出。
 */
function withPersonsFromAttachment(card: CardInput, options: RenderOptions): RenderOptions {
  if (options.persons) return options; // caller 显式给了就以它为准
  const anyCard = card as Record<string, unknown>;
  const att = (anyCard.json_attachment
    || (anyCard.card as Record<string, unknown> | undefined)?.json_attachment) as
    { persons?: RenderOptions['persons'] } | undefined;
  if (att?.persons) return { ...options, persons: att.persons };
  return options;
}

/** 构建整张卡片的 VNode 树 */
function buildCardVNode(card: CardInput, options: RenderOptions): VNode {
  const jc = unwrap(card);
  if (!jc) throw new Error('[FeishuCard] 无效的卡片数据');
  const ctx: RenderContext = {
    options: withPersonsFromAttachment(card, options),
    kernel: { getComponent, renderElement, renderElements },
  };
  // 浏览器端注入布局地基样式（幂等）；Node/SSR 无 DOM 自动跳过，由消费者引 CSS。
  ensureBaseStylesInjected(ctx);

  const parts: Array<VNode | null> = [];
  if (jc.header) parts.push(renderElement(jc.header, ctx));
  const bodyEl = jc.body || jc.newBody;
  // RAW 里 body 常无 tag（直接 { elements: [...] }），补上 'body' 以走 body 组件渲染。
  if (bodyEl) parts.push(renderElement(bodyEl.tag ? bodyEl : { ...bodyEl, tag: 'body' }, ctx));

  return h('div', {
    className: `${CLS}-root ${CLS}`,
    style: { fontSize: BASE_FONT_SIZE + 'px', lineHeight: String(BASE_LINE_HEIGHT) },
  }, parts.filter((p): p is VNode => !!p));
}

/** 渲染为 HTML 字符串（Node / SSR / 邮件 / 截图等） */
export function renderCardToString(card: CardInput, options: RenderOptions = {}): string {
  return vnodeToString(buildCardVNode(card, options));
}

/** 渲染为真实 DOM 节点（浏览器）。Node 端请用 renderCardToString */
export function renderCard(card: CardInput, options: RenderOptions = {}): Node {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) throw new Error('[FeishuCard] renderCard 需要 DOM 环境；Node 端请用 renderCardToString');
  const dom = vnodeToDom(buildCardVNode(card, options), doc);
  if (!dom) throw new Error('[FeishuCard] 渲染结果为空');
  return dom;
}

/**
 * 输入公开 DSL（JSON Schema 2.0 卡片），渲染为 HTML 字符串。
 * = renderCardToString(dslToRaw(dsl))。DSL 里 markdown 写字符串、字段用 snake_case，
 * 内部转成 RAW 再渲染，无需真发一遍卡片。
 */
export function renderDslToString(dsl: unknown, options: RenderOptions = {}): string {
  return renderCardToString(dslToRaw(dsl), options);
}

/** 输入公开 DSL，渲染为真实 DOM 节点（浏览器）。= renderCard(dslToRaw(dsl)) */
export function renderDsl(dsl: unknown, options: RenderOptions = {}): Node {
  return renderCard(dslToRaw(dsl), options);
}

export { registerComponent, getComponent };
// DSL → RAW 转换（公开 JSON Schema 2.0 卡片 → 渲染器 RAW 输入）。
export { dslToRaw } from '@open-feishu-card/adapter';
export { parseMarkdown, parseInline } from './md-parse';
export { h } from './vnode';
export { HEADER_BG_LIGHT, HEADER_BG_DARK } from './assets';
// 图标字体：ICON_FONT_CSS 供 SSR/自助注入；ICON_CODEPOINTS 供查表/校验 token。
export { ICON_FONT_CSS, ICON_CODEPOINTS } from './icon-font';
// emoji：EMOJI_SPRITE_CSS 供 SSR/自助注入；EMOJI_KEY_TO_NAME 供查表/校验短码。
export { EMOJI_SPRITE_CSS, EMOJI_KEY_TO_NAME } from './emoji-data';
// 聚合样式：ALL_CSS（布局+图标+emoji 一份）/ feishuCardStyleTag()，供 SSR 页面级一次性注入。
export { ALL_CSS, feishuCardStyleTag } from './all-css';
// 图表水合：chart 组件只输出挂载容器，真正画图交给运行期 VChart。
// 浏览器：hydrateFeishuCharts(root, VChart)；SSR：feishuChartHydrateScript() 连同 VChart CDN 一起塞页面。
export {
  hydrateFeishuCharts, renderFeishuChart,
  feishuChartHydrateScript, feishuChartHydrateJs,
  CHART_SPEC_ATTR, CHART_HYDRATED_ATTR,
} from './chart-hydrate';
export { CHART_PALETTE } from './constants';
export * from './types';
// 异步渲染（按 access token 自动拉图 / 按 message_id 拉取整条消息）。
// 注意：remote.ts 反向 import 本文件的 renderCard*，但只在异步函数运行时调用，
// 不在模块加载期触发，故此处的循环引用是安全的。
export {
  renderCardToStringAsync, renderCardAsync,
  fetchCardMessage, fetchImageDataUri, prefetchImages, arrayBufferToBase64,
} from './remote';
