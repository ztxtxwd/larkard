import assert from 'node:assert/strict';
import { test } from 'node:test';
import { balancedObject, extractJsonText, extractOption } from '../src/extract.js';

test('extractOption 识别显式作答', () => {
  assert.equal(extractOption('答案是 B。因为 column_set 才是分栏组件。'), 'B');
  assert.equal(extractOption('我选 C'), 'C');
  assert.equal(extractOption('answer: D'), 'D');
  assert.equal(extractOption('正确答案是 A'), 'A');
});

test('extractOption 退化为首个独立字母', () => {
  assert.equal(extractOption('B. column_set'), 'B');
  assert.equal(extractOption('(A) schema 字段'), 'A');
});

test('extractOption 无法提取时返回 null', () => {
  assert.equal(extractOption('这道题我不会'), null);
});

test('extractJsonText 优先提取代码围栏', () => {
  const reply = '好的，以下是卡片：\n```json\n{"schema":"2.0"}\n```\n希望有帮助';
  assert.equal(extractJsonText(reply), '{"schema":"2.0"}');
});

test('extractJsonText 无围栏时括号配平', () => {
  const reply = '结果为 {"a":{"b":"}"}} 以及后续说明';
  assert.equal(extractJsonText(reply), '{"a":{"b":"}"}}');
});

test('extractJsonText 无 JSON 时返回 null', () => {
  assert.equal(extractJsonText('抱歉我无法生成。'), null);
});

test('balancedObject 处理转义引号', () => {
  assert.equal(balancedObject('x {"k":"a\\"b"} y'), '{"k":"a\\"b"}');
});
