/**
 * 发送前检查：`checkCard()` / `checkSource()`。
 *
 * parser / validator / linter / device 都在 core 内部；两者共用同一套分析流程，
 * CLI、LSP 与下游项目不再各自 wire 一遍 parse → validate → lint：
 *
 * - `checkCard`：面向 Agent / 程序，返回 JSON Pointer；
 * - `checkSource`：面向 CLI / LSP，保留 parser 的源码 Range。
 *
 * 除了 Schema 和最佳实践，这里还会跑**真机硬约束**（`./device.ts`）：那些约束
 * Schema 表达不了，但飞书会整卡拒绝（11310），是「能过校验却发不出去」的主要来源。
 */
import { lintAst, type LintDiagnostic } from './linter.js';
import {
  joinCardPointer,
  parse,
  resolveCardDocument,
  serializeCardDocument,
} from './parser.js';
import { FeishuCardV2Schema } from '../schema/index.js';
import {
  findNodeAtPointer,
  formatIssueMessage,
  validateAst,
  type Diagnostic as ValidatorDiagnostic,
} from './validator.js';

import { repairDeviceIssues } from './device.js';
import { toPointer } from './pointer.js';
import type {
  CheckIssue,
  CheckOptions,
  CheckResult,
  SourceCheckResult,
  SourceDiagnostic,
} from './check-types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fromValidator(diagnostic: ValidatorDiagnostic): CheckIssue {
  return {
    path: diagnostic.path || '/',
    message: diagnostic.message,
    severity: diagnostic.severity,
    source: 'validator',
    ...(diagnostic.code ? { code: diagnostic.code } : {}),
  };
}

/**
 * linter 的诊断只有源码区间、没有 JSON Pointer（它检查的是结构而非某个字段），
 * 所以路径固定为整卡 `/`，规则名放在 `code` 里。
 */
function fromLinter(diagnostic: LintDiagnostic): CheckIssue {
  return {
    path: '/',
    message: diagnostic.message,
    severity: diagnostic.severity,
    source: 'linter',
    code: diagnostic.rule,
  };
}

function pointerTokensOf(pointer: string): string[] {
  if (pointer === '' || pointer === '/') return [];
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
}

interface AnalyzeOptions extends CheckOptions {
  /** 是否允许搭建工具文档（`checkSource` 允许，`checkCard` 不允许） */
  allowBuilder: boolean;
}

interface Analysis {
  card?: Record<string, unknown>;
  diagnostics: SourceDiagnostic[];
  fixes: CheckIssue[];
}

/** 两种公共 API 共用的分析流程：parse → resolve → repair → validate → device → lint → schema。 */
function analyze(source: string, options: AnalyzeOptions): Analysis {
  const parsed = parse(source);
  if (parsed.errors.length > 0 || !parsed.ast) {
    // 语法错误没有可分析的卡片，直接把 parser/validator 的定位诊断交回去。
    const diagnostics: SourceDiagnostic[] = validateAst(parsed).map((diagnostic) => ({
      ...fromValidator(diagnostic),
      range: diagnostic.range,
    }));
    return { diagnostics, fixes: [] };
  }

  const resolved = resolveCardDocument(parsed);
  if (!resolved) {
    return {
      diagnostics: [{
        path: '/',
        message: '不是有效的卡片文档',
        severity: 'error',
        source: 'schema',
        range: parsed.ast.range,
      }],
      fixes: [],
    };
  }

  if (!options.allowBuilder && resolved.kind === 'builder') {
    throw new TypeError(
      'checkCard 只接受卡片本身；搭建工具文档（{ name, dsl, variables }）请先用 parser 的 unwrapCardData() 取出 dsl 再检查',
    );
  }

  const value = resolved.cardData;
  if (!isRecord(value)) {
    return {
      diagnostics: [{
        path: resolved.pathPrefix || '/',
        message: '卡片必须是 JSON 对象（顶层不能是数组或标量）',
        severity: 'error',
        source: 'schema',
        range: resolved.cardAst.range,
      }],
      fixes: [],
    };
  }

  // 修复函数同时是「真机约束」的唯一判断来源：检查也走它在克隆上跑一遍。
  const repaired = repairDeviceIssues(value);
  const checkedCard = options.fix ? repaired.card : value;

  let analysis = parsed;
  let checkedResolved = resolved;
  if (options.fix) {
    const output = serializeCardDocument(resolved, checkedCard);
    analysis = parse(JSON.stringify(output, null, 2));
    checkedResolved = resolveCardDocument(analysis) ?? resolved;
  }

  const validatorDiagnostics: SourceDiagnostic[] = validateAst(analysis).map((diagnostic) => ({
    ...fromValidator(diagnostic),
    range: diagnostic.range,
  }));

  const linterDiagnostics: SourceDiagnostic[] = lintAst(analysis.ast, {
    ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
    ...(options.maxElements !== undefined ? { maxElements: options.maxElements } : {}),
    ...(options.maxTextLength !== undefined ? { maxTextLength: options.maxTextLength } : {}),
  }).map((diagnostic) => ({
    ...fromLinter(diagnostic),
    path: joinCardPointer(checkedResolved.pathPrefix, '/'),
    range: diagnostic.range,
  }));

  const deviceIssues = options.fix
    ? repaired.issues.filter((issue) => !issue.fixable)
    : repaired.issues;
  const deviceDiagnostics: SourceDiagnostic[] = deviceIssues.map((issue) => ({
    ...issue,
    path: joinCardPointer(checkedResolved.pathPrefix, issue.path),
    range: findNodeAtPointer(checkedResolved.cardAst, pointerTokensOf(issue.path))?.range,
  }));

  const diagnostics: SourceDiagnostic[] = [
    ...validatorDiagnostics,
    ...deviceDiagnostics,
    ...linterDiagnostics,
  ];

  let card: Record<string, unknown> | undefined;
  if (!diagnostics.some((issue) => issue.severity === 'error')) {
    const schemaResult = FeishuCardV2Schema.safeParse(checkedCard);
    if (schemaResult.success) {
      card = schemaResult.data as Record<string, unknown>;
    } else {
      // validator 已经过了却在这里失败，说明 Zod 与 validator 的映射有缝隙；兜底报告。
      for (const issue of schemaResult.error.issues) {
        const node = findNodeAtPointer(checkedResolved.cardAst, issue.path);
        diagnostics.push({
          path: joinCardPointer(checkedResolved.pathPrefix, toPointer(issue.path)),
          message: formatIssueMessage(issue),
          severity: 'error',
          source: 'schema',
          ...(node ? { range: node.range } : {}),
        });
      }
    }
  }

  return {
    card,
    diagnostics,
    fixes: options.fix ? repaired.fixes : [],
  };
}

/**
 * 检查一张卡片能否发送。
 *
 * @param input 卡片 JSON 对象，或 JSON / JSONC 源码字符串
 * @param options `fix: true` 时先按真机硬约束修复再检查（有损，改了什么见 `fixes`）
 *
 * @example
 * ```ts
 * const result = checkCard(dsl)
 * if (result.errors.length > 0) throw new Error(result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'))
 * await sendMessage(result.card!)
 * ```
 */
export function checkCard(
  input: string | Record<string, unknown>,
  options: CheckOptions = {},
): CheckResult {
  const source = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
  const { card, diagnostics, fixes } = analyze(source, { ...options, allowBuilder: false });
  const issues: CheckIssue[] = diagnostics.map(({ range: _range, ...issue }) => issue);
  return {
    card,
    errors: issues.filter((issue) => issue.severity === 'error'),
    hints: issues.filter((issue) => issue.severity !== 'error'),
    fixes,
  };
}

/**
 * 带源码位置的发送前检查（CLI / LSP）。
 *
 * 与 `checkCard` 走同一套规则；区别只是允许搭建工具文档，并保留 Range。
 */
export function checkSource(source: string, options: CheckOptions = {}): SourceCheckResult {
  const { card, diagnostics, fixes } = analyze(source, { ...options, allowBuilder: true });
  return {
    card,
    diagnostics,
    errors: diagnostics.filter((issue) => issue.severity === 'error'),
    hints: diagnostics.filter((issue) => issue.severity !== 'error'),
    fixes,
  };
}
