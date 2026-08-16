/** 报告生成：汇总 results/ 目录，输出 report.json + REPORT.md。 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { aggregate } from './metrics.js';
import { loadSelfEval } from './self-eval.js';
import type { ModelReport, TaskResult } from './types.js';

export interface ReportOutput {
  generatedAt: string;
  models: ModelReport[];
}

export function buildReport(resultsDir: string): ReportOutput {
  const models: ModelReport[] = [];
  for (const entry of readdirSync(resultsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const results: TaskResult[] = [];
    const modelDir = join(resultsDir, entry.name);
    for (const f of readdirSync(modelDir)) {
      if (!f.startsWith('obj-') && !f.startsWith('sub-')) continue;
      try {
        results.push(JSON.parse(readFileSync(join(modelDir, f), 'utf8')) as TaskResult);
      } catch {
        /* 跳过损坏文件 */
      }
    }
    if (results.length === 0) continue;
    const report = aggregate(results);
    report.model = entry.name;
    report.selfEval = loadSelfEval(modelDir);
    models.push(report);
  }
  models.sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1));
  return { generatedAt: new Date().toISOString(), models };
}

export function renderMarkdown(report: ReportOutput): string {
  const pct = (n: number | null) => (n === null ? '-' : `${(n * 100).toFixed(1)}%`);
  const lines: string[] = [];
  lines.push('# 飞书卡片生成 Benchmark 报告', '');
  lines.push(`生成时间：${report.generatedAt}`, '');
  lines.push('## 排行榜', '');
  lines.push('| 模型 | 总分 | 客观准确率 | 编译通过率 | 主观总分 | JSON | Schema | Lint | 编译 | 相似度 | 题数 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const m of report.models) {
    const d = m.subjectiveDims;
    lines.push(
      `| ${m.model} | ${pct(m.overallScore)} | ${pct(m.objectiveAccuracy)} | ${pct(m.compilePassRate)} | ${pct(d?.total ?? null)} | ${pct(d?.jsonParse ?? null)} | ${pct(d?.schema ?? null)} | ${pct(d?.lint ?? null)} | ${pct(d?.compile ?? null)} | ${pct(d?.similarity ?? null)} | ${m.taskCount} |`,
    );
  }
  lines.push('');

  for (const m of report.models) {
    lines.push(`## ${m.model}`, '');
    const cats = Object.entries(m.objectiveByCategory).sort();
    if (cats.length > 0) {
      lines.push('### 客观题分类准确率', '');
      lines.push('| 分类 | 正确 / 总数 | 准确率 |');
      lines.push('| --- | --- | --- |');
      for (const [cat, { correct, total }] of cats) {
        lines.push(`| ${cat} | ${correct} / ${total} | ${pct(total === 0 ? 0 : correct / total)} |`);
      }
      lines.push('');
    }
    const diffs = Object.entries(m.subjectiveByDifficulty);
    if (diffs.length > 0) {
      lines.push('### 主观题难度得分', '');
      lines.push('| 难度 | 平均分 |');
      lines.push('| --- | --- |');
      for (const [d, { total, count }] of diffs) {
        lines.push(`| ${d} | ${pct(total === 0 ? 0 : count / total)} |`);
      }
      lines.push('');
    }
    if (m.selfEval) {
      lines.push('### 模型自评', '');
      lines.push(m.selfEval.trim(), '');
    }
  }

  lines.push('## 评分说明', '');
  lines.push('- **客观题**：单选，提取选项字母与标准答案比对。');
  lines.push('- **主观题**：五维度加权 —— JSON 可解析 20%、Schema 合法 30%、最佳实践 15%、编译通过 20%、结构相似度 15%（无 golden 时为渲染检查）。');
  lines.push('- **总分** = 客观准确率 × 40% + 主观总分 × 60%。');
  lines.push('- **模型自评**：跑题结束后把成绩单（错题、标准答案、schema 报错）交回被测模型，由其撰写反思；不是评分依据。');
  return lines.join('\n');
}

export function writeReport(report: ReportOutput, resultsDir: string): { jsonPath: string; mdPath: string } {
  const jsonPath = join(resultsDir, 'report.json');
  const mdPath = join(resultsDir, 'REPORT.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, renderMarkdown(report));
  return { jsonPath, mdPath };
}
