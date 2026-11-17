/**
 * `checkCard()` 的输入输出类型。
 *
 * 设计原则：**检查结果全部带 JSON Pointer**。卡片工作台、Agent、CLI 拿到问题后
 * 都能直接落到「改哪个字段」，不需要再解析一遍卡片。
 */

/** 问题来源。`device` 是 Schema 表达不了、但飞书会拒绝的真机硬约束。 */
export type CheckSource = 'schema' | 'validator' | 'linter' | 'device';

/** 严重级别沿用 validator 的四档，避免下游再做一层映射。 */
export type CheckSeverity = 'error' | 'warning' | 'information' | 'hint';

export interface CheckIssue {
  /** 违规字段的 JSON Pointer（如 `/body/elements/0/vertical_spacing`）；整卡问题为 `/` */
  path: string;
  message: string;
  severity: CheckSeverity;
  source: CheckSource;
  /** validator 的诊断 code 或 linter 的 rule，如 `deprecated-prop` / `nesting-depth` */
  code?: string;
}

export interface CheckOptions {
  /**
   * 先按真机硬约束修复，再检查（默认 `false`）。
   *
   * 修复是**有损**的（删字段 / 夹到合法域），只在调用方明确要「帮我修成能发」时打开；
   * 改了什么在 `fixes` 里逐条返回，不会静默改卡。
   */
  fix?: boolean;
  /** 传给 linter 的阈值，默认与 linter 一致（深度 8 / 元素 200 / 文本 3000） */
  maxDepth?: number;
  maxElements?: number;
  maxTextLength?: number;
}

export interface CheckResult {
  /**
   * 可以直接发给 `/open-apis/im/v1/messages` 的卡片（Schema 净化后的输出）。
   * 只有 `errors` 为空时才有值；有错时调用方只应展示问题，不应发送。
   */
  card?: Record<string, unknown>;
  errors: CheckIssue[];
  /** 不拦发送、但值得提示的问题（validator 的 warning 及以下 + linter 全部规则） */
  hints: CheckIssue[];
  /** `fix: true` 且确实改动了卡片时，本轮修复的条目 */
  fixes: CheckIssue[];
}

/** 带源码位置的检查结果（CLI / LSP 用） */
export interface SourceDiagnostic extends CheckIssue {
  range?: import('./parser.js').Range;
}

export interface SourceCheckResult {
  card?: Record<string, unknown>;
  errors: SourceDiagnostic[];
  hints: SourceDiagnostic[];
  /** 全部诊断，按 validator → device → linter 顺序 */
  diagnostics: SourceDiagnostic[];
  fixes: CheckIssue[];
}
