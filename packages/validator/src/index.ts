/**
 * @open-feishu-card/validator
 *
 * 把 Zod Schema 2.0 的校验结果映射回 parser 产出的 AST 节点，
 * 让每条诊断都精确定位到源码的 Line/Column/Range（字符级）。
 *
 * 输入可为裸 Card JSON，或搭建工具文档 `{ name, dsl, variables }`；
 * Schema 只校验解包后的卡片层。
 */
import {
  parse,
  resolveCardDocument,
  unwrapCardData,
  joinCardPointer,
  isBuilderDocument,
  type JsonNode,
  type JsonObjectNode,
  type ParseResult,
  type Range,
  type ResolvedCardDocument,
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

const BUILDER_ROOT_KEYS = new Set(['name', 'dsl', 'variables']);

export interface ValidateOptions {
  /** 额外的废弃属性规则（与内置规则合并） */
  deprecatedProps?: Record<string, string>;
}

function getProp(node: JsonObjectNode, key: string): JsonNode | undefined {
  return node.properties.find((p) => p.key.value === key)?.value;
}

/** 搭建工具外层：name / variables 类型与未知顶栏字段 */
function validateBuilderEnvelope(resolved: ResolvedCardDocument, diagnostics: Diagnostic[]): void {
  if (resolved.kind !== 'builder') return;
  const root = resolved.rootAst;

  for (const prop of root.properties) {
    const key = prop.key.value;
    if (!BUILDER_ROOT_KEYS.has(key)) {
      diagnostics.push({
        message: `搭建工具文档不认识的顶层字段 "${key}"（仅支持 name / dsl / variables）`,
        severity: 'warning',
        range: prop.key.range,
        path: '/' + key,
        code: 'builder-unknown-key',
      });
    }
  }

  const nameNode = getProp(root, 'name');
  if (nameNode && nameNode.type !== 'string') {
    diagnostics.push({
      message: '搭建工具文档的 "name" 应为字符串',
      severity: 'error',
      range: nameNode.range,
      path: '/name',
      code: 'builder-envelope',
    });
  }

  const variablesNode = getProp(root, 'variables');
  if (variablesNode && variablesNode.type !== 'array') {
    diagnostics.push({
      message: '搭建工具文档的 "variables" 应为数组',
      severity: 'error',
      range: variablesNode.range,
      path: '/variables',
      code: 'builder-envelope',
    });
  }
}

function validateCardAgainstSchema(
  cardAst: JsonObjectNode,
  cardData: unknown,
  pathPrefix: string,
  options: ValidateOptions,
  diagnostics: Diagnostic[],
): void {
  const checkResult = FeishuCardV2Schema.safeParse(cardData);
  if (!checkResult.success) {
    for (const issue of checkResult.error.issues) {
      const node = findNodeAtPointer(cardAst, issue.path);
      const range: Range = node
        ? node.range
        : { start: cardAst.range.start, end: cardAst.range.start };
      diagnostics.push({
        message: issue.message,
        severity: 'error',
        range,
        path: joinCardPointer(pathPrefix, pointerToString(issue.path)),
      });
    }
  }

  // 废弃属性检查（warning 级别，只针对卡片根级字段）
  const deprecated = { ...DEPRECATED_PROPS, ...(options.deprecatedProps ?? {}) };
  for (const prop of cardAst.properties) {
    const hint = deprecated[prop.key.value];
    if (hint) {
      diagnostics.push({
        message: `废弃属性 "${prop.key.value}": ${hint}`,
        severity: 'warning',
        range: prop.key.range,
        path: joinCardPointer(pathPrefix, '/' + prop.key.value),
        code: 'deprecated-prop',
      });
    }
  }
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

  const resolved = resolveCardDocument(result);
  if (!resolved) return diagnostics;

  validateBuilderEnvelope(resolved, diagnostics);
  validateCardAgainstSchema(
    resolved.cardAst,
    resolved.cardData,
    resolved.pathPrefix,
    options,
    diagnostics,
  );

  return diagnostics;
}

/** 一步到位：源码 → 解析 + 校验 */
export function validate(source: string, options?: ValidateOptions): Diagnostic[] {
  return validateAst(parse(source), options);
}

/** 校验普通 JS 对象（无位置信息时 range 退化为 {0,0}） */
export function validateData(data: unknown): Diagnostic[] {
  const ZERO: Range = {
    start: { offset: 0, line: 1, column: 1 },
    end: { offset: 0, line: 1, column: 1 },
  };
  const diagnostics: Diagnostic[] = [];

  if (isBuilderDocument(data)) {
    const rec = data as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      if (!BUILDER_ROOT_KEYS.has(key)) {
        diagnostics.push({
          message: `搭建工具文档不认识的顶层字段 "${key}"（仅支持 name / dsl / variables）`,
          severity: 'warning',
          range: ZERO,
          path: '/' + key,
          code: 'builder-unknown-key',
        });
      }
    }
    if ('name' in rec && typeof rec.name !== 'string') {
      diagnostics.push({
        message: '搭建工具文档的 "name" 应为字符串',
        severity: 'error',
        range: ZERO,
        path: '/name',
        code: 'builder-envelope',
      });
    }
    if ('variables' in rec && !Array.isArray(rec.variables)) {
      diagnostics.push({
        message: '搭建工具文档的 "variables" 应为数组',
        severity: 'error',
        range: ZERO,
        path: '/variables',
        code: 'builder-envelope',
      });
    }
  }

  const card = unwrapCardData(data);
  const checkResult = FeishuCardV2Schema.safeParse(card);
  if (!checkResult.success) {
    const prefix = isBuilderDocument(data) ? '/dsl' : '';
    for (const issue of checkResult.error.issues) {
      diagnostics.push({
        message: issue.message,
        severity: 'error',
        range: ZERO,
        path: joinCardPointer(prefix, pointerToString(issue.path)),
      });
    }
  }
  return diagnostics;
}
