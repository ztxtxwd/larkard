/**
 * 卡片级硬约束常量，供 program / state / renderer 等入口共用。
 *
 * 放在这里而不是 `core/state/size.ts`，是因为 program 入口是 Universal 的：
 * 不能为了一个数字 import 到依赖 `node:zlib` 的 state 模块。
 */

/** 官方建议的卡片体积上限（创建卡片实体超限报「卡片体积超限，建议控制在 30KB 以内」）。 */
export const CARD_SIZE_BUDGET = 30 * 1024;
