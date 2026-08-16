/**
 * 飞书卡片 JSON 2.0 — 模块化 Zod Schema
 *
 * 基于飞书开放平台官方文档构建，使用 `tag` / `type` 判别联合以获得最佳类型推导。
 */

// 先注册 ElementSchema，确保 Body / 容器的 lazy 引用可用
export * from './element.js';

export * from './common/index.js';
export * from './markdown/index.js';
export * from './config.js';
export * from './header.js';
export * from './content/index.js';
export * from './interactive/index.js';
export * from './containers/index.js';
export * from './card.js';
