/**
 * @open-feishu-card/adapter
 *
 * 公开 DSL（JSON Schema 2.0）↔ 飞书内部 RAW JSON 的双向适配器。
 * - dslToRaw: 公开 DSL → 渲染器认得的 RAW 形态
 * - rawToDsl: RAW envelope → 公开 DSL，未知/私有组件自动降级 (Fallback)
 */
export { dslToRaw } from './dsl-to-raw.js';
export { rawToDsl, degradeUnknown } from './raw-to-dsl.js';
export type { CardElement, ElementProperty, JsonCard } from './types.js';
