/** 执行编排：加载题库 -> 调用模型 -> 判分 -> 落盘缓存。 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPool, type ChatClient } from './client.js';
import { gradeObjective } from './grade-objective.js';
import { gradeSubjective } from './grade-subjective.js';
import { loadGolden, loadObjectiveTasks, loadSubjectiveTasks } from './tasks.js';
import { taskFormat } from './grade-objective.js';
import {
  OBJECTIVE_SYSTEM_PROMPT,
  SUBJECTIVE_SYSTEM_PROMPT,
  composeSystemPrompt,
  objectiveUserPrompt,
} from './prompts.js';
import { runSelfEval } from './self-eval.js';
import type { TaskResult } from './types.js';

export interface RunOptions {
  tasks: 'objective' | 'subjective' | 'all';
  outDir: string;
  concurrency: number;
  noCache: boolean;
  dryRun: boolean;
  temperature: number;
  /** 被测对象的提示优化，拼进系统提示词 */
  promptHint?: string;
}

function slug(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

/** dry-run 假客户端：客观题用预置答案，主观题返回 golden 卡片（加代码围栏）。 */
function createDryRunClient(
  modelName: string,
  goldenResponses: Map<string, string>,
  objectiveAnswers: Map<string, string> = new Map(),
): ChatClient {
  return {
    name: modelName,
    async chat(messages) {
      const user = messages.find((m) => m.role === 'user')?.content ?? '';
      const qm = /【(?:单选|填空|是否)】(Q\d+)\b/.exec(user) ?? /^(Q\d+)\./.exec(user);
      if (qm) {
        const ans = objectiveAnswers.get(qm[1]) ?? 'A';
        return `答案是 ${ans}。${qm[1]} 的 dry-run 演示作答。`;
      }
      const firstLine = user.split('\n')[0] ?? '';
      if (firstLine.startsWith('【成绩单】')) {
        return '#### 做得好\n- dry-run\n\n#### 做得不好\n- 无\n\n#### 已掌握的知识\n- 无\n\n#### 尚未掌握的知识\n- 无\n\n#### 总评\ndry-run。';
      }
      const golden = goldenResponses.get(firstLine);
      if (golden) return '```json\n' + golden + '\n```';
      return '这是一条无法解析为卡片的 dry-run 回复。';
    },
  };
}

export async function runBenchmark(client: ChatClient, opts: RunOptions): Promise<TaskResult[]> {
  const objective = opts.tasks === 'objective' || opts.tasks === 'all' ? loadObjectiveTasks() : [];
  const subjective = opts.tasks === 'subjective' || opts.tasks === 'all' ? loadSubjectiveTasks() : [];

  const modelDir = join(opts.outDir, slug(client.name));
  mkdirSync(modelDir, { recursive: true });

  interface Job {
    file: string;
    execute: () => Promise<TaskResult>;
  }
  const jobs: Job[] = [];

  for (const task of objective) {
    const file = join(modelDir, `obj-${task.id}.json`);
    jobs.push({
      file,
      execute: async () => {
        const format = taskFormat(task);
        const response = await client.chat(
          [
            { role: 'system', content: composeSystemPrompt(OBJECTIVE_SYSTEM_PROMPT, opts.promptHint) },
            {
              role: 'user',
              content: objectiveUserPrompt(`${task.id}. ${task.question}`, task.options, format),
            },
          ],
          { temperature: opts.temperature },
        );
        return gradeObjective(task, response);
      },
    });
  }

  for (const task of subjective) {
    const file = join(modelDir, `sub-${task.id}.json`);
    const golden = loadGolden(task);
    jobs.push({
      file,
      execute: async () => {
        const response = await client.chat(
          [
            { role: 'system', content: composeSystemPrompt(SUBJECTIVE_SYSTEM_PROMPT, opts.promptHint) },
            { role: 'user', content: task.prompt },
          ],
          { temperature: opts.temperature },
        );
        return {
          ...({ kind: 'subjective', taskId: task.id, difficulty: task.difficulty } as const),
          response,
          score: gradeSubjective(task, response, golden),
        };
      },
    });
  }

  let cached = 0;
  const results = await runPool(jobs, opts.concurrency, async (job) => {
    if (!opts.noCache && existsSync(job.file)) {
      try {
        cached++;
        return JSON.parse(readFileSync(job.file, 'utf8')) as TaskResult;
      } catch {
        /* 缓存损坏则重跑 */
      }
    }
    const result = await job.execute();
    writeFileSync(job.file, JSON.stringify(result, null, 2));
    return result;
  });

  process.stdout.write(
    `[benchmark] ${client.name}: ${results.length} 题（缓存复用 ${cached}，新跑 ${results.length - cached}）\n`,
  );

  try {
    await runSelfEval(client, modelDir, results, { noCache: opts.noCache, dryRun: opts.dryRun });
    process.stdout.write(`[benchmark] ${client.name}: 自评已写入 self-eval.json\n`);
  } catch (err) {
    process.stderr.write(`[benchmark] ${client.name} 自评失败（成绩仍保留）：${String(err)}\n`);
  }

  return results;
}

export { createDryRunClient };
