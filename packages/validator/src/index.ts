/**
 * @open-feishu-card/validator
 *
 * 把 Zod Schema 2.0 的校验结果映射回 parser 产出的 AST 节点，
 * 让每条诊断都精确定位到源码的 Line/Column/Range（字符级）。
 */
import {
  parse,
  type JsonNode,
  type JsonObjectNode,
  type ParseResult,
  type Range,
} from '@open-feishu-card/parser';
import { FeishuCardV2Schema } from '@open-feishu-card/schema';

export type DiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint';

export interface Diagnostic {
  message: string;
  severity: DiagnosticSeverity;
  range: Range;
  /** 引发诊断的 JSON Pointer（如 /elements/0/text），便于自动修复定位 */
  path: string;
  /** 可选的快速修复标识（由 compiler 提供 fix 实现） */
  code?: string;
}

/** 按 Zod issue 的 path 在 AST 中查找对应节点 */
export function findNodeAtPointer(ast: JsonObjectNode, pointer: PropertyKey[]): JsonNode | undefined {
  let node: JsonNode = ast;
  for (const seg of pointer) {
    if (node.type === 'object') {
      const prop: import("@open-feishu-card/parser").JsonPropertyNode | undefined = node.properties.find((p) => p.key.value === String(seg));
      if (!prop) return undefined;
      node = prop.value;
    } else if (node.type === 'array') {
      const item = node.items[seg as number] as import("@open-feishu-card/parser").JsonNode | undefined;
      if (!item) return undefined;
      node = item;
    } else {
      return undefined;
    }
  }
  return node;
}

function pointerToString(path: PropertyKey[]): string {
  if (path.length === 0) return '/';
  return '/' + path.map((s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
}

const DEPRECATED_PROPS: Record<string, string> = {
  // 常见 1.0 → 2.0 迁移期废弃写法
  i18n_elements: '2.0 请使用 body.elements + config.locale',
  card_link: '2.0 请使用 elements 中的 button/open_url 行为',
};

export interface ValidateOptions {
  /** 额外的废弃属性规则（与内置规则合并） */
  deprecatedProps?: Record<string, string>;
}

/** 对已解析结果做 Schema 校验并生成诊断 */
export function validateAst(
  result: ParseResult,
  options: ValidateOptions = {},
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const e of result.errors) {
    diagnostics.push({
      message: `JSON 语法错误: ${e.message}`,
      severity: 'error',
      range: e.range,
      path: '/',
    });
  }
  if (!result.ast || result.data === undefined) return diagnostics;

  const checkResult = FeishuCardV2Schema.safeParse(result.data);
  if (!checkResult.success) {
    for (const issue of checkResult.error.issues) {
      const node = findNodeAtPointer(result.ast, issue.path);
      const range: Range = node
        ? node.range
        : { start: result.ast.range.start, end: result.ast.range.start };
      diagnostics.push({
        message: issue.message,
        severity: 'error',
        range,
        path: pointerToString(issue.path),
      });
    }
  }

  // 废弃属性检查（warning 级别，只针对卡片根级字段）
  const deprecated = { ...DEPRECATED_PROPS, ...(options.deprecatedProps ?? {}) };
  for (const prop of result.ast.properties) {
    const hint = deprecated[prop.key.value];
    if (hint) {
      diagnostics.push({
        message: `废弃属性 "${prop.key.value}": ${hint}`,
        severity: 'warning',
        range: prop.key.range,
        path: '/' + prop.key.value,
        code: 'deprecated-prop',
      });
    }
  }

  return diagnostics;
}

/** 一步到位：源码 → 解析 + 校验 */
export function validate(source: string, options?: ValidateOptions): Diagnostic[] {
  return validateAst(parse(source), options);
}

/** 校验普通 JS 对象（无位置信息时 range 退化为 {0,0}） */
export function validateData(data: unknown): Diagnostic[] {
  const checkResult = FeishuCardV2Schema.safeParse(data);
  if (checkResult.success) return [];
  return checkResult.error.issues.map((issue) => ({
    message: issue.message,
    severity: 'error' as const,
    range: {
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 0, line: 1, column: 1 },
    },
    path: pointerToString(issue.path),
  }));
}
