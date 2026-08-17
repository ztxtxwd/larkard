/** 客观题判分：单选 / 填空 / 是否，带 specificity×frequency 权重。 */
import { extractBool, extractFill, extractOption, normalizeBoolToken, normalizeFillAnswer } from './extract.js';
import type { ObjectiveFormat, ObjectiveResult, ObjectiveTask } from './types.js';

export function taskFormat(task: ObjectiveTask): ObjectiveFormat {
  return task.format ?? 'mcq';
}

export function taskWeight(task: ObjectiveTask): number {
  const s = clampWeight(task.specificity ?? 3);
  const f = clampWeight(task.frequency ?? 3);
  return s * f;
}

function clampWeight(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export function gradeObjective(task: ObjectiveTask, response: string): ObjectiveResult {
  const format = taskFormat(task);
  const weight = taskWeight(task);
  let extracted: string | null = null;
  let correct = false;

  if (format === 'mcq') {
    extracted = extractOption(response);
    correct = extracted === task.answer;
  } else if (format === 'bool') {
    extracted = extractBool(response);
    const expected = normalizeBoolToken(task.answer);
    correct = extracted !== null && expected !== null && extracted === expected;
  } else {
    extracted = extractFill(response);
    correct = fillMatches(task, extracted);
  }

  return {
    kind: 'objective',
    taskId: task.id,
    category: task.category,
    format,
    response,
    extracted,
    correct,
    weight,
  };
}

function fillMatches(task: ObjectiveTask, extracted: string | null): boolean {
  if (extracted === null) return false;
  const got = normalizeFillAnswer(extracted);
  const candidates = [task.answer, ...(task.accept ?? [])].map(normalizeFillAnswer);
  return candidates.includes(got);
}
