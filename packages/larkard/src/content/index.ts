/**
 * 内部 content 模块（公开入口为 `larkard/icons` / `larkard/emoji` / `larkard/metrics` / `larkard/spacing`）
 *
 * 飞书卡片的内容与真机常量层：图标 / emoji 数据、字号行高、间距枚举。
 * 纯数据与纯函数，零运行时依赖；schema、adapter、renderer、optimize、core
 * 共用这一份真源。
 */
export * from './icons/index.js';
export * from './emoji/index.js';
export * from './metrics.js';
export * from './spacing.js';
export * from './colors.js';
export * from './official-colors.js';
