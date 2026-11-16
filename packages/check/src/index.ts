/**
 * `@open-feishu-card/check`
 *
 * 发送前检查门面：`checkCard()` 一次跑完 Schema、字符级诊断、最佳实践和真机硬约束，
 * 返回带 JSON Pointer 的 `errors` / `hints`，无错时给出可直接发送的净化卡片。
 *
 * 真机硬约束（间距值域、面板内边距、媒体字段等）单独导出，方便只想修卡不想检查的场景。
 */
export { checkCard } from './check.js';
export { findDeviceIssues, normalizeSpacing, pointer, repairDeviceIssues } from './device.js';
export type { DeviceIssue, DeviceRule, RepairResult } from './device.js';
export type { CheckIssue, CheckOptions, CheckResult, CheckSeverity, CheckSource } from './types.js';
