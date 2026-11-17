/**
 * 浏览器入口：DOM 渲染 + 交互水合 + 资源与样式。
 *
 * 与 SSR 入口（`./index`）分开，避免只需要 `renderCardToString` 的 Node / SSR
 * 消费者把图标字体（含 ~300KB base64）和 emoji 雪碧 CSS 打进产物。
 */
export { renderCard, renderDsl } from './dom.js';
export { dslToRaw } from '../adapter/index.js';
export { CHART_PALETTE } from './constants.js';
export { ALL_CSS, feishuCardStyleTag } from './assets/all-css.js';
export { HEADER_BG_LIGHT, HEADER_BG_DARK } from './assets/header.js';

export {
  hydrateFeishuCharts, renderFeishuChart, normalizeFeishuChartSpec,
  feishuChartHydrateScript, feishuChartHydrateJs,
  CHART_SPEC_ATTR, CHART_HYDRATED_ATTR,
} from './chart-hydrate.js';
export {
  hydrateFeishuAudios,
  feishuAudioHydrateScript, feishuAudioHydrateJs,
  AUDIO_HYDRATED_ATTR, AUDIO_PLAY_ICON_SVG, AUDIO_PAUSE_ICON_SVG,
} from './audio-hydrate.js';
export {
  hydrateFeishuTablePagers,
  feishuTablePagerHydrateScript, feishuTablePagerHydrateJs,
  TABLE_PAGER_ATTR, TABLE_PAGE_ATTR, TABLE_PAGER_HYDRATED_ATTR,
} from './table-pager.js';
export { createToastHost, renderToastHTML } from './toast.js';
export type { ToastAPI, ToastOptions, ToastType } from './toast.js';
