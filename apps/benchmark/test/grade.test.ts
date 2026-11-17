import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateData } from 'larkard';
import { gradeObjective } from '../src/grade-objective.js';
import { bagF1, gradeSubjective, tagSequence } from '../src/grade-subjective.js';
import { loadObjectiveTasks, loadSubjectiveTasks, loadGolden } from '../src/tasks.js';
import type { ObjectiveTask, SubjectiveTask } from '../src/types.js';

test('客观题判分：单选提取字母并比对', () => {
  const task: ObjectiveTask = {
    id: 'T1',
    category: '测试',
    format: 'mcq',
    question: 'q',
    options: ['a', 'b', 'c', 'd'],
    answer: 'B',
    explanation: '',
    specificity: 3,
    frequency: 3,
  };
  assert.equal(gradeObjective(task, '答案是 B').correct, true);
  assert.equal(gradeObjective(task, '答案是 C').correct, false);
  assert.equal(gradeObjective(task, '不知道').extracted, null);
  assert.equal(gradeObjective(task, '答案是 B').weight, 9);
});

test('客观题判分：填空与是否', () => {
  const fill: ObjectiveTask = {
    id: 'T2',
    category: '测试',
    format: 'fill',
    question: '分隔线 tag？',
    answer: 'hr',
    accept: [],
    explanation: '',
    specificity: 5,
    frequency: 5,
  };
  assert.equal(gradeObjective(fill, '答案是 hr。').correct, true);
  assert.equal(gradeObjective(fill, '答案是 divider').correct, false);
  assert.equal(gradeObjective(fill, '答案是 hr。').weight, 25);

  const boolTask: ObjectiveTask = {
    id: 'T3',
    category: '测试',
    format: 'bool',
    question: '是否支持 note？',
    answer: '否',
    explanation: '',
  };
  assert.equal(gradeObjective(boolTask, '答案是 否。').correct, true);
  assert.equal(gradeObjective(boolTask, '答案是 是').correct, false);
});

test('题库加载：客观题字段合法', () => {
  const tasks = loadObjectiveTasks();
  assert.ok(tasks.length >= 30, `客观题数量不足: ${tasks.length}`);
  const formats = new Set(tasks.map((t) => t.format ?? 'mcq'));
  assert.ok(formats.has('fill'), '应包含填空题');
  assert.ok(formats.has('bool'), '应包含是否题');
});

test('题库加载：主观题字段合法且 golden 可读', () => {
  const tasks = loadSubjectiveTasks();
  assert.ok(tasks.length >= 10);
  for (const t of tasks) {
    assert.ok(t.golden, `${t.id} 应有官方 golden`);
    assert.ok(t.source, `${t.id} 应标注官方文档 source`);
    const golden = loadGolden(t);
    assert.equal(typeof golden, 'object');
  }
});

test('bagF1 多重集合相似度', () => {
  assert.equal(bagF1(['markdown', 'hr', 'div'], ['markdown', 'hr', 'div']), 1);
  assert.equal(bagF1([], []), 1);
  assert.equal(bagF1(['markdown'], []), 0);
  const f1 = bagF1(['markdown', 'button', 'button'], ['button', 'button', 'img']);
  assert.equal(f1, 0.667);
});

test('tagSequence 遍历嵌套容器', () => {
  const card = {
    body: {
      elements: [
        { tag: 'column_set', columns: [{ tag: 'column', elements: [{ tag: 'markdown' }] }] },
        { tag: 'form', elements: [{ tag: 'input' }, { tag: 'button' }] },
      ],
    },
  };
  assert.deepEqual(tagSequence(card), ['column_set', 'markdown', 'form', 'input', 'button']);
});

test('主观题判分：golden 原样回复应得高分', () => {
  const tasks = loadSubjectiveTasks();
  const s01 = tasks.find((t) => t.id === 'S01') as SubjectiveTask;
  const golden = loadGolden(s01);
  const response = '```json\n' + JSON.stringify(golden, null, 2) + '\n```';
  const score = gradeSubjective(s01, response, golden);
  assert.equal(score.jsonParse, 1);
  assert.equal(score.schema, 1);
  assert.equal(score.compiled, true);
  assert.equal(score.similarity, 1);
  assert.ok(score.total >= 0.85, `total=${score.total}`);
});

test('主观题判分：垃圾回复得 0 分', () => {
  const task: SubjectiveTask = { id: 'X', difficulty: 'easy', prompt: 'p' };
  const score = gradeSubjective(task, '这不是一个 JSON', null);
  assert.equal(score.total, 0);
  assert.equal(score.compiled, false);
});

test('主观题判分：带非标属性/结构错误应扣 schema 分', () => {
  const task: SubjectiveTask = { id: 'X', difficulty: 'easy', prompt: 'p' };
  const badCard = {
    schema: '2.0',
    body: { elements: [{ tag: '不存在的组件', foo: 'bar' }] },
  };
  const score = gradeSubjective(task, '```json\n' + JSON.stringify(badCard) + '\n```', null);
  assert.equal(score.jsonParse, 1);
  assert.ok(score.schema < 1, `schema=${score.schema}`);
  assert.ok(score.total < 1, `total=${score.total}`);
});

test('所有 golden 卡片本身应通过 schema 校验', () => {
  for (const t of loadSubjectiveTasks()) {
    if (!t.golden) continue;
    const errors = validateData(loadGolden(t)).filter((d) => d.severity === 'error');
    assert.deepEqual(errors, [], `golden ${t.golden} 存在 schema 错误`);
  }
});

test('dry-run 素材：objective.json 可被 JSON.parse', () => {
  const raw = JSON.parse(
    readFileSync(new URL('../datasets/objective.json', import.meta.url), 'utf8'),
  ) as unknown[];
  assert.ok(Array.isArray(raw) && raw.length > 0);
});
