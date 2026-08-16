import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregate } from '../src/metrics.js';
import { renderMarkdown } from '../src/report.js';
import { formatScorecard, loadSelfEval, saveSelfEval } from '../src/self-eval.js';
import type { ObjectiveResult, SubjectiveResult } from '../src/types.js';

test('formatScorecard 列出客观错题与正确答案', () => {
  const wrong: ObjectiveResult = {
    kind: 'objective',
    taskId: 'Q18',
    category: '组件',
    response: '答案是 A。',
    extracted: 'A',
    correct: false,
  };
  const right: ObjectiveResult = {
    kind: 'objective',
    taskId: 'Q01',
    category: '基础结构',
    response: '答案是 B。',
    extracted: 'B',
    correct: true,
  };
  const text = formatScorecard('demo', [wrong, right]);
  assert.match(text, /【成绩单】/);
  assert.match(text, /客观题 1\/2/);
  assert.match(text, /Q18/);
  assert.match(text, /正确答案：B/);
  assert.match(text, /你的答案：A/);
  assert.doesNotMatch(text, /Q01 \[/);
});

test('formatScorecard 摘要主观题 schema 报错', () => {
  const sub: SubjectiveResult = {
    kind: 'subjective',
    taskId: 'S08',
    difficulty: 'medium',
    response: '{}',
    score: {
      jsonParse: 1,
      schema: 0.75,
      lint: 1,
      compile: 1,
      similarity: 1,
      total: 0.9,
      compiled: true,
      details: {
        parseErrors: [],
        schemaErrors: ['/body/elements/0/behaviors: expected array'],
        lintIssues: [],
        tagSequence: ['button'],
        goldenTagSequence: ['button'],
        similarityBase: 'golden',
      },
    },
  };
  const text = formatScorecard('demo', [sub]);
  assert.match(text, /S08/);
  assert.match(text, /behaviors/);
  assert.match(text, /编译通过 1\/1/);
});

test('报告渲染包含模型自评；self-eval.json 不计入题数', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-self-eval-'));
  saveSelfEval(dir, '#### 总评\n领域知识不足。');
  assert.match(loadSelfEval(dir) ?? '', /领域知识不足/);

  const results = [
    {
      kind: 'objective' as const,
      taskId: 'Q01',
      category: '基础结构',
      response: 'B',
      extracted: 'B',
      correct: true,
    },
  ];
  const report = aggregate(results);
  report.model = 'demo';
  report.selfEval = loadSelfEval(dir);
  assert.equal(report.taskCount, 1);
  const md = renderMarkdown({ generatedAt: 't', models: [report] });
  assert.match(md, /### 模型自评/);
  assert.match(md, /领域知识不足/);
});
