/**
 * 主观题判分：复用仓库工具链
 * parser -> validator -> linter -> compiler -> (golden 相似度 | renderer 渲染检查)
 */
import { compile, lint, parse, validateData } from 'larkard';
import { renderDslToString } from 'larkard/renderer';
import { extractJsonText } from './extract.js';
import type { SubjectiveScore, SubjectiveTask } from './types.js';

const WEIGHTS = { jsonParse: 0.2, schema: 0.3, lint: 0.15, compile: 0.2, similarity: 0.15 } as const;

export function gradeSubjective(task: SubjectiveTask, response: string, golden: unknown | null): SubjectiveScore {
  const details: SubjectiveScore['details'] = {
    parseErrors: [],
    schemaErrors: [],
    lintIssues: [],
    tagSequence: [],
    goldenTagSequence: golden ? tagSequence(golden) : [],
    similarityBase: golden ? 'golden' : 'render',
  };

  // 1. 提取 + JSON 可解析
  const jsonText = extractJsonText(response);
  let data: unknown = null;
  if (jsonText === null) {
    details.parseErrors.push('未能从回复中提取到 JSON 对象');
  } else {
    const parsed = parse(jsonText);
    details.parseErrors.push(...parsed.errors.map((e) => e.message));
    if (parsed.errors.length === 0) data = parsed.data;
  }
  const jsonParseScore = details.parseErrors.length === 0 ? 1 : 0;

  // 2. Schema 合法性（error 级诊断）
  let schemaScore = 0;
  if (data !== null) {
    const diags = validateData(data);
    details.schemaErrors.push(
      ...diags.filter((d) => d.severity === 'error').map((d) => `${d.path}: ${d.message}`),
    );
    schemaScore = clamp(1 - 0.25 * details.schemaErrors.length);
  }

  // 3. 最佳实践（linter warning）
  let lintScore = 0;
  if (data !== null && jsonText !== null) {
    const issues = lint(jsonText).filter((d) => d.severity === 'warning');
    details.lintIssues.push(...issues.map((d) => `[${d.rule}] ${d.message}`));
    lintScore = clamp(1 - 0.2 * issues.length);
  }

  // 4. 编译通过
  let compileScore = 0;
  let compiled = false;
  if (schemaScore > 0 && data !== null) {
    try {
      compile(data);
      compiled = true;
      compileScore = 1;
    } catch (err) {
      details.compileError = String(err);
    }
  }

  // 5. 结构相似度 / 渲染检查
  let similarityScore = 0;
  if (data !== null && golden !== null) {
    details.tagSequence = tagSequence(data);
    similarityScore = bagF1(details.tagSequence, details.goldenTagSequence);
  } else if (data !== null && compiled) {
    try {
      renderDslToString(data);
      similarityScore = 1;
    } catch {
      similarityScore = 0;
    }
  }

  const total =
    jsonParseScore * WEIGHTS.jsonParse +
    schemaScore * WEIGHTS.schema +
    lintScore * WEIGHTS.lint +
    compileScore * WEIGHTS.compile +
    similarityScore * WEIGHTS.similarity;

  return {
    jsonParse: jsonParseScore,
    schema: schemaScore,
    lint: lintScore,
    compile: compileScore,
    similarity: similarityScore,
    total: round(total),
    compiled,
    details,
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * 递归收集卡片正文组件的 tag 序列（只走 elements 树，忽略 plain_text 等子结构）。
 */
export function tagSequence(card: unknown): string[] {
  const tags: string[] = [];
  const root = card as { body?: { elements?: unknown[] } } | null;
  if (!root || typeof root !== 'object') return tags;
  const walkElements = (elements: unknown[]) => {
    for (const el of elements) {
      if (el === null || typeof el !== 'object') continue;
      const obj = el as Record<string, unknown>;
      if (typeof obj.tag === 'string') tags.push(obj.tag);
      if (Array.isArray(obj.elements)) walkElements(obj.elements);
      if (Array.isArray(obj.columns)) {
        for (const col of obj.columns) {
          if (col && typeof col === 'object' && Array.isArray((col as Record<string, unknown>).elements)) {
            walkElements((col as Record<string, unknown>).elements as unknown[]);
          }
        }
      }
    }
  };
  if (root.body && Array.isArray(root.body.elements)) walkElements(root.body.elements);
  return tags;
}

/** 多重集合 F1：衡量两组组件序列的组成相似度。 */
export function bagF1(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const count = new Map<string, number>();
  for (const t of a) count.set(t, (count.get(t) ?? 0) + 1);
  let common = 0;
  for (const t of b) {
    const left = count.get(t) ?? 0;
    if (left > 0) {
      common++;
      count.set(t, left - 1);
    }
  }
  const precision = common / b.length;
  const recall = common / a.length;
  return precision + recall === 0 ? 0 : round((2 * precision * recall) / (precision + recall));
}
