/** 表达式语法或求值错误。pos 是在表达式源码里的字符下标。 */
export class ExprError extends Error {
  constructor(
    message: string,
    readonly pos?: number,
  ) {
    super(message);
    this.name = 'ExprError';
  }
}

/** 动作里的 assert 不成立：整个动作回滚，toast 提示给点击者。 */
export class AssertionFailed extends Error {
  constructor(readonly toast: string) {
    super(toast);
    this.name = 'AssertionFailed';
  }
}

export type Severity = 'error' | 'warning';

/** 面向生成方（Agent）的诊断：path 是 JSON Pointer，指到出错的字段。 */
export interface Diagnostic {
  severity: Severity;
  path: string;
  message: string;
}

/** 程序校验不通过。diagnostics 里至少有一条 error。 */
export class ProgramError extends Error {
  constructor(readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map((d) => `${d.path || '/'}: ${d.message}`).join('\n'));
    this.name = 'ProgramError';
  }
}

/** 渲染出的卡片不合法（如 element_id 重复）。 */
export class RenderError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(`${path || '/'}: ${message}`);
    this.name = 'RenderError';
  }
}

export function pointer(segments: ReadonlyArray<string | number>): string {
  return segments.map((s) => `/${String(s).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
}
