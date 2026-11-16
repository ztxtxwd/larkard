/**
 * `@open-feishu-card/patch`
 *
 * 卡片 DSL 的 RFC 6902 JSON Patch：`parsePatch()` 校验形状、`applyPatch()` 不可变应用，
 * 错误统一带「第 N 个操作 + JSON Pointer + 原因」，可直接回给模型或用户。
 *
 * 与 `@open-feishu-card/check` 配套：patch → check → 发送，是卡片编辑器/Agent 的最小闭环。
 */
export { applyPatch, parsePatch, pointerTokens } from './apply.js';
export { PatchError } from './types.js';
export type { ParseOptions, PatchErrorCode, PatchOpKind, PatchOperation } from './types.js';
