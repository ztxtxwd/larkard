/**
 * `larkard/renderer`
 *
 * 同步、零框架依赖的飞书卡片渲染核心：RAW 或公开 DSL → VNode → HTML 字符串。
 * 适用于 Node / SSR / 截图 / 邮件。
 *
 * 浏览器 DOM 渲染与交互水合在 `larkard/renderer/browser`；
 * 图标 / emoji / 布局 CSS 在 `larkard/renderer/assets`；
 * 按 access token 拉图 / 拉消息的异步渲染在 `larkard/renderer/async`。
 */
export { buildCardVNode, renderCardToString, renderDslToString } from './render.js';
export { registerComponent, getComponent } from './registry.js';
export { dslToRaw } from '../adapter/index.js';
export { parseMarkdown, parseInline } from '../adapter/index.js';
export { h } from './vnode.js';
export { CHART_PALETTE } from './constants.js';
export * from './types.js';
