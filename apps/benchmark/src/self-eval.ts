/** 模型自评：把成绩单交给被测模型，生成反思文字。 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatClient } from './client.js';
import { SELF_EVAL_SYSTEM_PROMPT } from './prompts.js';
import { loadObjectiveTasks } from './tasks.js';
import type { ObjectiveResult, SubjectiveResult, TaskResult } from './types.js';

export interface SelfEvalRecord {
  generatedAt: string;
  text: string;
}

export function selfEvalPath(modelDir: string): string {
  return join(modelDir, 'self-eval.json');
}

export function loadSelfEval(modelDir: string): string | null {
  const p = selfEvalPath(modelDir);
  if (!existsSync(p)) return null;
  try {
    const rec = JSON.parse(readFileSync(p, 'utf8')) as SelfEvalRecord;
    return typeof rec.text === 'string' && rec.text.trim() ? rec.text : null;
  } catch {
    return null;
  }
}

export function saveSelfEval(modelDir: string, text: string): void {
  const rec: SelfEvalRecord = { generatedAt: new Date().toISOString(), text };
  writeFileSync(selfEvalPath(modelDir), JSON.stringify(rec, null, 2));
}

/** 供模型阅读的成绩单正文（不含完整卡片 JSON，避免把答案当教材灌回去）。 */
export function formatScorecard(model: string, results: TaskResult[]): string {
  const objective = results.filter((r): r is ObjectiveResult => r.kind === 'objective');
  const subjective = results.filter((r): r is SubjectiveResult => r.kind === 'subjective');
  const tasks = new Map(loadObjectiveTasks().map((t) => [t.id, t]));

  const lines: string[] = [`【成绩单】被测对象：${model}`, ''];

  if (objective.length > 0) {
    const correct = objective.filter((r) => r.correct).length;
    lines.push(`## 客观题 ${correct}/${objective.length}`);
    const byCat = new Map<string, { correct: number; total: number }>();
    for (const r of objective) {
      const slot = byCat.get(r.category) ?? { correct: 0, total: 0 };
      slot.total++;
      if (r.correct) slot.correct++;
      byCat.set(r.category, slot);
    }
    for (const [cat, s] of byCat) lines.push(`- ${cat}：${s.correct}/${s.total}`);
    lines.push('', '### 错题');
    const wrong = objective.filter((r) => !r.correct);
    if (wrong.length === 0) lines.push('（无）');
    for (const r of wrong) {
      const t = tasks.get(r.taskId);
      const opts = t?.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('；') ?? '';
      lines.push(`- ${r.taskId} [${r.category}] ${t?.question ?? ''}`);
      if (opts) lines.push(`  选项：${opts}`);
      lines.push(`  你的答案：${r.extracted ?? '（未能提取）'}；正确答案：${t?.answer ?? '?'}`);
      if (t?.explanation) lines.push(`  说明：${t.explanation}`);
    }
    lines.push('');
  }

  if (subjective.length > 0) {
    const compiled = subjective.filter((r) => r.score.compiled).length;
    const schemaFail = subjective.filter((r) => r.score.details.schemaErrors.length > 0);
    lines.push(`## 主观题 ${subjective.length} 道（编译通过 ${compiled}/${subjective.length}）`);
    for (const r of subjective) {
      const err = r.score.details.schemaErrors.slice(0, 3).join('；');
      lines.push(
        `- ${r.taskId} (${r.difficulty}) 总分 ${(r.score.total * 100).toFixed(1)}% schema=${(r.score.schema * 100).toFixed(0)}% compile=${r.score.compiled ? '通过' : '失败'}${err ? ` 报错：${err}` : ''}`,
      );
    }
    if (schemaFail.length === 0) lines.push('主观题 schema 全部通过。');
    lines.push('');
  }

  return lines.join('\n');
}

export const DRY_RUN_SELF_EVAL = `#### 做得好
- dry-run 演示：流程可走通。

#### 做得不好
- dry-run 未调用真实模型。

#### 已掌握的知识
- （dry-run 无真实作答）

#### 尚未掌握的知识
- （dry-run 无真实作答）

#### 总评
dry-run 占位自评。`;

export async function runSelfEval(
  client: ChatClient,
  modelDir: string,
  results: TaskResult[],
  opts: { noCache: boolean; dryRun: boolean },
): Promise<string> {
  if (!opts.noCache) {
    const cached = loadSelfEval(modelDir);
    if (cached) return cached;
  }
  if (opts.dryRun) {
    saveSelfEval(modelDir, DRY_RUN_SELF_EVAL);
    return DRY_RUN_SELF_EVAL;
  }
  const scorecard = formatScorecard(client.name, results);
  const text = await client.chat(
    [
      { role: 'system', content: SELF_EVAL_SYSTEM_PROMPT },
      { role: 'user', content: scorecard },
    ],
    { temperature: 0 },
  );
  const trimmed = text.trim();
  saveSelfEval(modelDir, trimmed);
  return trimmed;
}
