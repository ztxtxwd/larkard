/**
 * `larkard/patch`
 *
 * 卡片 DSL 的 RFC 6902 JSON Patch：**操作校验 + 不可变应用 + 可定位的报错**。
 *
 * 为什么单开一个包：卡片编辑器、Agent 改卡、工作台 diff 预览都需要「只改一处」，
 * 而下游各自写一遍 `fast-json-patch` 包装时，错误会变成 `OPERATION_PATH_UNRESOLVABLE`
 * 这种没法喂给模型/用户的库内部名字。这里统一成「第 N 个操作 + JSON Pointer + 原因」，
 * 并保证失败时原文档不被改坏。
 */
export type PatchOpKind = 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';

interface BaseOp {
  op: PatchOpKind;
  /** JSON Pointer（RFC 6901），空串表示整份文档 */
  path: string;
}

export type PatchOperation =
  | (BaseOp & { op: 'add'; value: unknown })
  | (BaseOp & { op: 'remove' })
  | (BaseOp & { op: 'replace'; value: unknown })
  | (BaseOp & { op: 'move'; from: string })
  | (BaseOp & { op: 'copy'; from: string })
  | (BaseOp & { op: 'test'; value: unknown });

export type PatchErrorCode =
  /** 补丁本身不是数组 / 不是合法 JSON */
  | 'invalid-patch'
  /** 操作对象形状不对：未知 op、path 不是字符串、缺 value / from */
  | 'invalid-operation'
  /** JSON Pointer 语法非法（不以 / 开头、`~` 后不是 0/1） */
  | 'invalid-path'
  /** 路径的父级不存在，或父级不是对象/数组 */
  | 'parent-not-found'
  /** 要替换/删除/读取的成员不存在 */
  | 'path-not-found'
  /** 数组下标越界，或 add 时用了非 `-` 的坏下标 */
  | 'index-invalid'
  /** `test` 断言与实际值不等 */
  | 'test-failed'
  /** 补丁为空（`allowEmpty: false` 时） */
  | 'empty-patch';

/** 应用/解析补丁失败。`index` 是 0-based 操作序号，`path` 是出错的那条路径。 */
export class PatchError extends Error {
  readonly code: PatchErrorCode;
  readonly index: number;
  readonly path: string;
  readonly operation?: unknown;

  constructor(
    code: PatchErrorCode,
    message: string,
    options: { index?: number; path?: string; operation?: unknown } = {},
  ) {
    super(message);
    this.name = 'PatchError';
    this.code = code;
    this.index = options.index ?? -1;
    this.path = options.path ?? '';
    this.operation = options.operation;
  }
}

/** 解析选项。 */
export interface ParseOptions {
  /**
   * 空数组是否算合法（默认 `false`）。
   *
   * RFC 6902 允许空补丁（无操作），但对「模型/用户提交修改」的场景，空补丁几乎总是
   * 漏了内容，直接报错比静默无操作更有用。需要 RFC 行为时显式传 `true`。
   */
  allowEmpty?: boolean;
}
