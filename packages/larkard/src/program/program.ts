import { compileAction, executeAction, type DispatchResult, type Op } from './actions.js';
import type { ActionEvent } from './callback.js';
import { ExprError, ProgramError, RenderError, type Diagnostic } from './errors.js';
import { CARD_SIZE_BUDGET } from '../core/limits.js';
import { Budget } from './expr/evaluate.js';
import { Env, isObject, jsonProblem, objectScope, type Json, type JsonObject, type Value } from './expr/values.js';
import { compileTemplate, renderTemplate, type TemplateCompileContext, type TNode } from './template.js';

export const PROTOCOL_VERSION = 1;

/** 卡片程序根上的保留字段。其余字段都是 Card JSON 2.0 模板。 */
export const PROGRAM_KEYS = ['$v', '$state', '$actions'] as const;

export const RENDER_BUDGET = 200_000;
export const ACTION_BUDGET = 50_000;
/** 官方：一张卡最多 200 个元素或组件 */
export const MAX_CARD_ELEMENTS = 200;

export { CARD_SIZE_BUDGET } from '../core/limits.js';

const STATE_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_NAMES = new Set(['true', 'false', 'null', 'undefined', 'Math']);

export interface CompiledProgram {
  readonly version: number;
  readonly initialState: JsonObject;
  readonly template: TNode;
  readonly actions: ReadonlyMap<string, Op[]>;
  /** 原始程序文档（去掉 $state 之外原样保留），用于封印 */
  readonly source: JsonObject;
}

export interface CompileResult {
  program?: CompiledProgram;
  diagnostics: Diagnostic[];
}

function compileState(raw: unknown, diagnostics: Diagnostic[]): JsonObject {
  if (!isObject(raw as Value)) {
    diagnostics.push({ severity: 'error', path: '/$state', message: '$state 应为对象，列出卡片的全部状态字段及初始值' });
    return {};
  }
  const state = raw as JsonObject;
  const problem = jsonProblem(state);
  if (problem) diagnostics.push({ severity: 'error', path: '/$state', message: problem });
  for (const key of Object.keys(state)) {
    if (!STATE_KEY.test(key) || RESERVED_NAMES.has(key)) {
      diagnostics.push({
        severity: 'error',
        path: `/$state/${key}`,
        message: `状态字段名 ${JSON.stringify(key)} 不合法：须以字母或下划线开头，只含字母、数字、下划线，且不能是 true/false/null`,
      });
    }
  }
  return state;
}

/** 编译并静态校验卡片程序。有 error 级诊断时不返回 program。 */
export function compileProgram(doc: unknown): CompileResult {
  const diagnostics: Diagnostic[] = [];
  if (!isObject(doc as Value)) {
    return { diagnostics: [{ severity: 'error', path: '', message: '卡片程序应为 JSON 对象' }] };
  }
  const source = doc as JsonObject;

  const version = source.$v ?? PROTOCOL_VERSION;
  if (version !== PROTOCOL_VERSION) {
    diagnostics.push({ severity: 'error', path: '/$v', message: `不支持的协议版本 ${JSON.stringify(version)}，当前为 ${PROTOCOL_VERSION}` });
  }
  if (!('$state' in source)) {
    diagnostics.push({ severity: 'error', path: '/$state', message: '缺少 $state：卡片程序必须声明状态（没有状态就写 {}）' });
  }
  const initialState = compileState(source.$state ?? {}, diagnostics);
  const stateKeys = new Set(Object.keys(initialState));

  const ctx: TemplateCompileContext = { diagnostics, actionRefs: [] };

  const actions = new Map<string, Op[]>();
  const rawActions = source.$actions ?? {};
  if (!isObject(rawActions as Value)) {
    diagnostics.push({ severity: 'error', path: '/$actions', message: '$actions 应为对象：动作名 → 操作数组' });
  } else {
    for (const [name, raw] of Object.entries(rawActions as JsonObject)) {
      actions.set(name, compileAction(name, raw, stateKeys, ctx));
    }
  }

  const templateDoc: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!(PROGRAM_KEYS as readonly string[]).includes(key)) templateDoc[key] = value;
  }
  if (!('schema' in templateDoc)) templateDoc.schema = '2.0';
  else if (templateDoc.schema !== '2.0') {
    diagnostics.push({ severity: 'error', path: '/schema', message: '只支持卡片 JSON 2.0（schema 写 "2.0"）' });
  }
  // 卡片 JSON 2.0 只支持共享卡片，update_multi 归一为 true：渲染结果可以直接发出去，
  // 平台更新卡片时也要求更新前后都是共享卡片。
  const config = isObject(templateDoc.config as Value) ? { ...(templateDoc.config as JsonObject) } : {};
  if (config.update_multi === false) {
    diagnostics.push({
      severity: 'warning',
      path: '/config/update_multi',
      message: '卡片 JSON 2.0 只支持共享卡片，update_multi 只能为 true，已按 true 处理',
    });
  }
  config.update_multi = true;
  templateDoc.config = config;
  if (!('body' in templateDoc)) diagnostics.push({ severity: 'error', path: '/body', message: '缺少 body' });
  const template = compileTemplate(templateDoc, [], stateKeys, ctx);

  const referenced = new Set<string>();
  for (const ref of ctx.actionRefs) {
    referenced.add(ref.name);
    if (!actions.has(ref.name)) {
      const known = [...actions.keys()];
      diagnostics.push({
        severity: 'error',
        path: ref.path,
        message: `没有动作 ${ref.name}${known.length ? `，已定义的有 ${known.join(', ')}` : '，请在 $actions 里定义'}`,
      });
    }
  }
  for (const name of actions.keys()) {
    if (!referenced.has(name)) {
      diagnostics.push({ severity: 'warning', path: `/$actions/${name}`, message: `动作 ${name} 没有被任何 $on 引用` });
    }
  }

  if (diagnostics.some((d) => d.severity === 'error')) return { diagnostics };
  return { program: { version: PROTOCOL_VERSION, initialState, template, actions, source }, diagnostics };
}

/** 编译，有错误就抛 ProgramError。 */
export function loadProgram(doc: unknown): CompiledProgram {
  const { program, diagnostics } = compileProgram(doc);
  if (!program) throw new ProgramError(diagnostics);
  return program;
}

export interface CardStats {
  /** tag 节点数（元素 + 组件），官方上限 200 */
  elements: number;
  /** 渲染结果的 UTF-8 字节数（尚未封印程序与状态） */
  bytes: number;
}

export interface RenderResult {
  card: JsonObject;
  stats: CardStats;
  warnings: string[];
}

export function measureCard(card: Json): CardStats {
  let elements = 0;
  const walk = (node: Json): void => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (isObject(node)) {
      if (typeof node.tag === 'string') elements += 1;
      Object.values(node).forEach(walk);
    }
  };
  walk(card);
  return { elements, bytes: new TextEncoder().encode(JSON.stringify(card)).length };
}

/**
 * 用给定状态渲染出纯 Card JSON。rev 会写进每个回调 value，用于识别过期点击。
 * rev 必填：没有它，卡片回调里就没有 `__r`，运行时分不清点击来自哪一版卡片。
 */
export function renderProgram(program: CompiledProgram, state: JsonObject, options: { rev: number }): RenderResult {
  const env = new Env(objectScope(state));
  let card: JsonObject;
  try {
    card = renderTemplate(program.template, env, {
      budget: new Budget(RENDER_BUDGET),
      rev: options.rev,
    });
  } catch (err) {
    if (err instanceof ExprError) throw new RenderError(err.message, '');
    throw err;
  }
  const stats = measureCard(card);
  const warnings: string[] = [];
  if (stats.elements > MAX_CARD_ELEMENTS) warnings.push(`卡片有 ${stats.elements} 个元素，超过官方上限 ${MAX_CARD_ELEMENTS}`);
  if (stats.bytes > CARD_SIZE_BUDGET) warnings.push(`卡片渲染后 ${stats.bytes} 字节，超过建议上限 ${CARD_SIZE_BUDGET}`);
  return { card, stats, warnings };
}

/** 执行一次交互。不改传入的 state；返回新状态与给点击者的提示。 */
export function dispatchAction(program: CompiledProgram, state: JsonObject, event: ActionEvent): DispatchResult {
  const ops = program.actions.get(event.action);
  if (!ops) {
    return { ok: false, state, changed: false, error: `没有动作 ${event.action}`, toast: { type: 'error', content: '卡片出错了，操作没有生效' } };
  }
  return executeAction(ops, state, event, new Budget(ACTION_BUDGET));
}
