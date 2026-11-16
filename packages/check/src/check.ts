/**
 * `checkCard()`：一条命令回答「这张卡能不能发」。
 *
 * 上游已经有 parser / schema / validator / linter 四个零件，但「拼成一次发送前检查」
 * 这件事此前散落在 CLI、LSP 和各个下游项目里（各自 wire 一遍 parse → validate → lint，
 * 再决定谁算 error）。这里把它收成一个纯函数：
 *
 * - 输入：卡片 JSON（对象，或带注释的 JSONC 字符串，走 parser）；
 * - 输出：`errors`（拦发送）/ `hints`（只提示）/ `fixes`（本轮改了什么），
 *   以及无错时的 `card`（Schema 净化输出，可直接发 `im/v1/messages`）。
 *
 * 除了 Schema 和最佳实践，这里还跑一遍**真机硬约束**（`./device.ts`）：那些约束
 * Schema 表达不了，但飞书会整卡拒绝（11310），是「能过校验却发不出去」的主要来源。
 */
import { lintAst, type LintDiagnostic } from '@open-feishu-card/linter';
import { astToValue, isBuilderDocument, parse } from '@open-feishu-card/parser';
import { FeishuCardV2Schema } from '@open-feishu-card/schema';
import { validateAst, type Diagnostic as ValidatorDiagnostic } from '@open-feishu-card/validator';

import { repairDeviceIssues } from './device.js';
import type { CheckIssue, CheckOptions, CheckResult } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Zod issue 的 path 数组 → JSON Pointer；转义规则与 compiler 的 `stripped` 一致。 */
function toPointer(path: readonly PropertyKey[]): string {
  return '/' + path.map((seg) => String(seg).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
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

function schemaIssue(issue: { path: readonly PropertyKey[]; message: string }): CheckIssue {
  return {
    path: issue.path.length > 0 ? toPointer(issue.path) : '/',
    message: issue.message,
    severity: 'error',
    source: 'schema',
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
export function checkCard(input: string | Record<string, unknown>, options: CheckOptions = {}): CheckResult {
  const source = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
  const parsed = parse(source);
  if (parsed.errors.length > 0 || !parsed.ast) {
    // 语法错误没有可分析的卡片，直接把 parser/validator 的定位诊断交回去。
    const issues = validateAst(parsed).map(fromValidator);
    return {
      errors: issues.filter((issue) => issue.severity === 'error'),
      hints: issues.filter((issue) => issue.severity !== 'error'),
      fixes: [],
    };
  }

  const value = astToValue(parsed.ast);
  if (!isRecord(value)) {
    return {
      errors: [
        { path: '/', message: '卡片必须是 JSON 对象（顶层不能是数组或标量）', severity: 'error', source: 'schema' },
      ],
      hints: [],
      fixes: [],
    };
  }
  if (isBuilderDocument(value)) {
    throw new TypeError(
      'checkCard 只接受卡片本身；搭建工具文档（{ name, dsl, variables }）请先用 parser 的 unwrapCardData() 取出 dsl 再检查',
    );
  }

  // 修复函数同时是「真机约束」的唯一判断来源：检查也走它在克隆上跑一遍。
  const repaired = repairDeviceIssues(value);
  const deviceIssues = options.fix ? repaired.issues.filter((issue) => !issue.fixable) : repaired.issues;
  const checked = options.fix ? repaired.card : value;

  const checkedSource = JSON.stringify(checked, null, 2);
  // 只解析一次：validator 和 linter 都吃同一份 AST，别各 parse 一遍。
  const analysis = parse(checkedSource);
  const validatorIssues = validateAst(analysis).map(fromValidator);
  const lintIssues = lintAst(analysis.ast, {
    ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
    ...(options.maxElements !== undefined ? { maxElements: options.maxElements } : {}),
    ...(options.maxTextLength !== undefined ? { maxTextLength: options.maxTextLength } : {}),
  }).map(fromLinter);

  const errors: CheckIssue[] = [];
  const hints: CheckIssue[] = [];
  const split = (issue: CheckIssue): void => {
    (issue.severity === 'error' ? errors : hints).push(issue);
  };
  validatorIssues.forEach(split);
  deviceIssues.forEach(split);
  // linter 全是「不拦发送」的建议，直接进 hints。
  hints.push(...lintIssues);

  let card: Record<string, unknown> | undefined;
  if (errors.length === 0) {
    const schemaResult = FeishuCardV2Schema.safeParse(checked);
    if (schemaResult.success) {
      card = schemaResult.data as Record<string, unknown>;
    } else {
      // validator 已经过了却在这里失败，说明 Zod 与 validator 的映射有缝隙；兜底报告。
      errors.push(...schemaResult.error.issues.map(schemaIssue));
    }
  }

  return { card, errors, hints, fixes: options.fix ? repaired.fixes : [] };
}
