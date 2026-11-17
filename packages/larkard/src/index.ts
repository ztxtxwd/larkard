/**
 * larkard
 *
 * 飞书卡片 JSON 2.0 工具链主入口：解析、Schema 校验、最佳实践 lint、
 * 发送前检查（含真机硬约束）、净化与编译。
 *
 * 其它能力走子路径：
 * - `larkard/schema`：Zod Schema 与类型
 * - `larkard/adapter`：RAW ↔ DSL
 * - `larkard/renderer`：SSR 渲染；`/browser`、`/assets`、`/async` 为运行时子入口
 * - `larkard/components`：TSX 创作
 * - `larkard/optimize`：发送前视觉优化
 * - `larkard/patch` / `larkard/state`：增量修改 / 卡片内嵌 state
 */
export * from './core/index.js';
