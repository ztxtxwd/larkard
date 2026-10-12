/**
 * @open-feishu-card/compiler
 *
 * - compile(dsl): 公开 DSL → 渲染器认得的 RAW JSON（委托 adapter）。
 * - sanitize(input, {mode}): 对照 Schema 2.0 校验并报告非标属性。
 *     mode 'report' ——（默认）不修改输入，原样返回卡片，只报告非标属性路径；
 *     mode 'strip'  ——【有损】删除非标属性后返回净化卡片（显式 opt-in）；
 *     mode 'error'  —— 遇到任何非标属性抛错。
 *
 * 默认语义对齐客户端事实：飞书客户端对未知属性是「透传保留 + 渲染时按需读取、
 * 未读即忽略」（fallbackCard/fallbackHeader 用 spread 展开、fallbackElement 末尾
 * 返回原对象），既不剥离也不报错。因此默认不做有损剥离，保留前向兼容字段；
 * 仅当确实需要把卡片规范化为严格 2.0 形态时，才显式传 mode:'strip'。
 *
 * 原理：Zod 默认在 parse 输出中丢弃未声明 key，因此「净化后的卡片」就是
 * Schema.parse 的输出；被剥离的路径通过 deep-diff（输入 vs 输出）得到。
 */
import { dslToRaw } from '@open-feishu-card/adapter';
import { FeishuCardV2Schema } from '@open-feishu-card/schema';

export type SanitizeMode = 'strip' | 'report' | 'error';

export interface SanitizeReport {
  /** 被剥离的属性路径（JSON Pointer，如 /body/elements/0/extra_invalid_prop） */
  stripped: string[];
  /** 卡片：默认 report 模式下即输入原样（保真往返）；仅 strip 模式下为剥离后的卡片 */
  card: Record<string, unknown>;
}

export interface SanitizeOptions {
  /** 容错模式，默认 'report'（透传保留、仅报告）；'strip' 为显式 opt-in 的有损规范化 */
  mode?: SanitizeMode;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pointer(path: PropertyKey[]): string {
  return '/' + path.map((s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
}

/** 找出 input 中存在、cleaned（Schema parse 输出）中不存在/被替换的路径 */
function diffStripped(input: unknown, cleaned: unknown, path: PropertyKey[], out: string[]): void {
  if (Array.isArray(input) && Array.isArray(cleaned)) {
    const n = Math.max(input.length, cleaned.length);
    for (let i = 0; i < n; i++) {
      if (i >= cleaned.length) out.push(pointer([...path, i]));
      else diffStripped(input[i], cleaned[i], [...path, i], out);
    }
    return;
  }
  if (isRecord(input) && isRecord(cleaned)) {
    for (const [k, v] of Object.entries(input)) {
      if (!(k in cleaned)) out.push(pointer([...path, k]));
      else diffStripped(v, cleaned[k], [...path, k], out);
    }
    return;
  }
  // 类型不一致（如非法值被替换成默认值）不算「多余属性」，交给 validator 报告
}

/**
 * 校验并报告非标属性。默认 mode='report'：原样返回输入（对齐客户端透传保留），
 * 仅通过 stripped 报告非标路径；mode='strip' 才真正删除非标属性（有损）。
 */
export function sanitize(input: unknown, options: SanitizeOptions = {}): SanitizeReport {
  const mode = options.mode ?? 'report';
  const result = FeishuCardV2Schema.safeParse(input);
  if (!result.success) {
    // 结构性错误（缺 schema、非法 tag 等）不是「多余属性」，原样返回交给 validator
    return { stripped: [], card: input as Record<string, unknown> };
  }
  const cleaned = result.data as unknown as Record<string, unknown>;
  const stripped: string[] = [];
  diffStripped(input, cleaned, [], stripped);

  if (stripped.length > 0 && mode === 'error') {
    throw new Error(`发现非标属性: ${stripped.join(', ')}`);
  }
  return { stripped, card: mode === 'strip' ? cleaned : (input as Record<string, unknown>) };
}

/** 编译：DSL → 渲染器 RAW。默认按 report 语义保留输入原样（透传），再适配；需严格规范化时显式传 mode:'strip' */
export interface CompileOptions extends SanitizeOptions {
  /** 跳过校验/报告，直接适配（默认 false） */
  noSanitize?: boolean;
}

export function compile(dsl: unknown, options: CompileOptions = {}) {
  const clean = options.noSanitize ? dsl : sanitize(dsl, { mode: options.mode ?? 'report' }).card;
  return { raw: dslToRaw(clean), card: clean };
}

export { dslToRaw };
