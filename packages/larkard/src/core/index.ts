/**
 * `larkard`
 *
 * 卡片的模型层：解析（JSON/JSONC + 搭建工具文档）、Schema 校验、最佳实践 lint、
 * 发送前检查（含真机硬约束）、净化与编译。
 *
 * 子路径：
 * - `larkard/patch`：RFC 6902 JSON Patch
 * - `larkard/state`：把卡片 state 封印进空分栏 URL
 */
export * from './parser.js';
export * from './validator.js';
export * from './linter.js';
export * from './check.js';
export * from './check-types.js';
export * from './device.js';
export * from './compile.js';
export { toPointer } from './pointer.js';
