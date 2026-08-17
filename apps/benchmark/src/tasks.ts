/** 题库加载：datasets/ 下的客观题与主观题。 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBoolToken } from './extract.js';
import type { ObjectiveFormat, ObjectiveTask, SubjectiveTask } from './types.js';

const DATASETS_DIR: string = resolveDatasetsDir();

function resolveDatasetsDir(): string {
  // tsx 直接跑源码时 datasets 在包根；tsc 构建后在 dist/../datasets
  const here = dirname(fileURLToPath(import.meta.url));
  for (const dir of [join(here, '..', 'datasets'), join(here, '..', '..', 'datasets')]) {
    try {
      readdirSync(dir);
      return dir;
    } catch {
      /* try next */
    }
  }
  throw new Error('找不到 datasets 目录');
}

export function loadObjectiveTasks(): ObjectiveTask[] {
  const raw = JSON.parse(readFileSync(join(DATASETS_DIR, 'objective.json'), 'utf8')) as ObjectiveTask[];
  for (const t of raw) {
    if (!t.id || !t.question || !t.answer) {
      throw new Error(`客观题 ${t.id ?? '(缺 id)'} 字段不完整`);
    }
    const format: ObjectiveFormat = t.format ?? 'mcq';
    if (format === 'mcq') {
      if (!Array.isArray(t.options) || t.options.length < 2) {
        throw new Error(`客观题 ${t.id} 为 mcq 但 options 不足`);
      }
      if (!/^[A-D]$/.test(t.answer) || t.answer.charCodeAt(0) - 65 >= t.options.length) {
        throw new Error(`客观题 ${t.id} 的 answer "${t.answer}" 非法`);
      }
    } else if (format === 'bool') {
      if (normalizeBoolToken(t.answer) === null) {
        throw new Error(`客观题 ${t.id} 的 bool answer 须为 是/否`);
      }
    } else if (format === 'fill') {
      if (!String(t.answer).trim()) {
        throw new Error(`客观题 ${t.id} 的 fill answer 为空`);
      }
    } else {
      throw new Error(`客观题 ${t.id} 的 format "${String(format)}" 非法`);
    }
    for (const key of ['specificity', 'frequency'] as const) {
      const v = t[key];
      if (v !== undefined && (typeof v !== 'number' || v < 1 || v > 5)) {
        throw new Error(`客观题 ${t.id} 的 ${key} 须在 1–5`);
      }
    }
  }
  return raw;
}

export function loadSubjectiveTasks(): SubjectiveTask[] {
  const dir = join(DATASETS_DIR, 'subjective');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const tasks = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as SubjectiveTask);
  for (const t of tasks) {
    if (!t.id || !t.prompt || !['easy', 'medium', 'hard'].includes(t.difficulty)) {
      throw new Error(`主观题 ${t.id ?? '(缺 id)'} 字段不完整`);
    }
  }
  return tasks;
}

/** 读取主观题的 golden 参考卡片（如有）。 */
export function loadGolden(task: SubjectiveTask): unknown | null {
  if (!task.golden) return null;
  return JSON.parse(readFileSync(join(DATASETS_DIR, 'subjective', 'golden', task.golden), 'utf8'));
}

export function datasetsDir(): string {
  return DATASETS_DIR;
}
