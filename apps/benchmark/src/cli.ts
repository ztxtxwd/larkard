#!/usr/bin/env node
/** CLI 入口：open-feishu-card-benchmark run | report | list */
import { pathToFileURL } from 'node:url';
import {
  applyCliOverrides,
  defaultCatalogPath,
  defaultResultsDir,
  expandEnvVars,
  loadCatalog,
  resolveRunModels,
} from './catalog.js';
import { createClient, type ChatClient } from './client.js';
import { buildReport, renderMarkdown, writeReport } from './report.js';
import { createDryRunClient, runBenchmark } from './runner.js';
import { datasetsDir, loadGolden, loadObjectiveTasks, loadSubjectiveTasks } from './tasks.js';
import type { ModelConfig } from './types.js';

interface Args {
  _: string[];
  model?: string;
  'base-url'?: string;
  'api-key'?: string;
  config?: string;
  tasks?: string;
  out?: string;
  concurrency?: string;
  temperature?: string;
  'no-cache'?: boolean;
  'dry-run'?: boolean;
  results?: string;
  help?: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        (args as unknown as Record<string, unknown>)[key] = next;
        i++;
      } else {
        (args as unknown as Record<string, unknown>)[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function usage(): string {
  return `飞书卡片生成 Benchmark

用法：
  open-feishu-card-benchmark run [--model <name>] [--base-url <url>] [--api-key <key>]
                                 [--config <file>] [--tasks objective|subjective|all]
                                 [--out <dir>] [--concurrency <n>] [--temperature <t>]
                                 [--no-cache] [--dry-run]
  open-feishu-card-benchmark report [--results <dir>]
  open-feishu-card-benchmark list

环境变量：OPENAI_API_KEY、OPENAI_BASE_URL（可被参数覆盖）；models.json 里可用 \${TOKENFLUX_API_KEY} 这类占位。

被测对象写在 models.json（或 --config 指定的同结构文件）：name / model / baseUrl / apiKey / extra / promptHint。
同一种上游模型的未优化版与优化版用不同 name；--model 按 name 查找。

示例：
  open-feishu-card-benchmark run --model gemini-3.7-flash
  open-feishu-card-benchmark run --config models.json
  OPENAI_API_KEY=sk-... open-feishu-card-benchmark run --model deepseek-chat --base-url https://api.deepseek.com/v1
  open-feishu-card-benchmark run --dry-run          # 离线演示，无需 API Key
  open-feishu-card-benchmark report                 # 汇总包内 results/ 生成 REPORT.md`;
}

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const command = args._[0];

  if (command === 'list') {
    const objective = loadObjectiveTasks();
    const subjective = loadSubjectiveTasks();
    console.log(`题库目录：${datasetsDir()}`);
    console.log(`客观题 ${objective.length} 道：`);
    const byCat = new Map<string, number>();
    const byFmt = new Map<string, number>();
    for (const t of objective) {
      byCat.set(t.category, (byCat.get(t.category) ?? 0) + 1);
      const fmt = t.format ?? 'mcq';
      byFmt.set(fmt, (byFmt.get(fmt) ?? 0) + 1);
    }
    for (const [cat, n] of byCat) console.log(`  [${cat}] ${n} 道`);
    console.log(`  题型：${[...byFmt.entries()].map(([k, n]) => `${k}=${n}`).join('，')}`);
    console.log(`主观题 ${subjective.length} 道：`);
    for (const t of subjective) console.log(`  ${t.id} (${t.difficulty}${t.golden ? ', 有 golden' : ''}${t.source ? ', 官方示例' : ''})`);
    try {
      const catalogPath = defaultCatalogPath();
      const catalog = loadCatalog(catalogPath);
      console.log(`被测对象（${catalogPath}） ${catalog.length} 个：`);
      for (const m of catalog) {
        const extra = m.extra ? ' extra' : '';
        const hint = m.promptHint?.trim() ? ' promptHint' : '';
        console.log(`  ${m.name}  (${m.model}${extra}${hint})`);
      }
    } catch (err) {
      console.log(`被测对象名录未加载：${String(err)}`);
    }
    return 0;
  }

  if (command === 'report') {
    const resultsDir = args.results ?? defaultResultsDir();
    const report = buildReport(resultsDir);
    if (report.models.length === 0) {
      console.error(`在 ${resultsDir} 下没有找到任何结果，请先运行 run。`);
      return 1;
    }
    const { jsonPath, mdPath } = writeReport(report, resultsDir);
    console.log(renderMarkdown(report));
    console.log(`\n已生成：${jsonPath}\n        ${mdPath}`);
    return 0;
  }

  if (command !== 'run') {
    console.error(usage());
    return command === 'help' || args.help ? 0 : 1;
  }

  // run
  let models: ModelConfig[];
  try {
    models = resolveRunModels({
      model: args.model,
      config: args.config,
      baseUrl: args['base-url'],
      apiKey: args['api-key'],
    });
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    return 1;
  }

  if (models.length === 0) {
    if (args['dry-run']) {
      models = [{ name: 'dry-run-demo', model: 'dry-run' }];
    } else {
      console.error('缺少 --model 或 --config。使用 --help 查看用法。');
      return 1;
    }
  }

  const tasksMode = (args.tasks ?? 'all') as 'objective' | 'subjective' | 'all';
  if (!['objective', 'subjective', 'all'].includes(tasksMode)) {
    console.error(`非法 --tasks 值: ${tasksMode}`);
    return 1;
  }

  // dry-run 预载 golden 回复（以主观题 prompt 首行为键）与客观题标准答案
  const goldenResponses = new Map<string, string>();
  const objectiveAnswers = new Map<string, string>();
  if (args['dry-run']) {
    for (const t of loadSubjectiveTasks()) {
      const golden = loadGolden(t);
      if (golden !== null) goldenResponses.set(t.prompt.split('\n')[0], JSON.stringify(golden, null, 2));
    }
    for (const t of loadObjectiveTasks()) {
      objectiveAnswers.set(t.id, t.answer);
    }
  }

  const outDir = args.out ?? defaultResultsDir();
  const concurrency = Math.max(1, Number(args.concurrency ?? 4));
  const temperature = Number(args.temperature ?? 0);

  for (const raw of models) {
    const m = expandEnvVars(applyCliOverrides(raw, { baseUrl: args['base-url'], apiKey: args['api-key'] }));
    const client: ChatClient = args['dry-run']
      ? createDryRunClient(m.name, goldenResponses, objectiveAnswers)
      : createClient(m, args['api-key']);
    try {
      await runBenchmark(client, {
        tasks: tasksMode,
        outDir,
        concurrency,
        noCache: args['no-cache'] === true,
        dryRun: args['dry-run'] === true,
        temperature,
        promptHint: m.promptHint,
      });
    } catch (err) {
      console.error(`模型 ${m.name} 运行失败：${String(err)}`);
      return 1;
    }
  }

  const report = buildReport(outDir);
  const { jsonPath, mdPath } = writeReport(report, outDir);
  console.log(renderMarkdown(report));
  console.log(`\n已生成：${jsonPath}\n        ${mdPath}`);
  return 0;
}

// 作为可执行入口时（node dist/cli.js / tsx src/cli.ts）自动执行
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
