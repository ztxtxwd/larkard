import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, complete, hover, quickFixes, sanitizeAllAction } from '../src/language-server/index.js';

const SRC = `{
  "schema": "2.0",
  "body": { "elements": [{ "tag": "markdown", "content": "x" }] },
  "i18n_elements": {}
}`;

test('analyze merges validator + linter diagnostics', () => {
  const { diagnostics } = analyze(SRC);
  assert.ok(diagnostics.some((d) => d.code === 'deprecated-prop'));
  assert.ok(diagnostics.every((d) => d.source === 'larkard'));
});

test('complete returns tag completions inside tag value', () => {
  const items = complete('{ "tag": "mar', 12);
  assert.ok(items.some((i) => i.label === 'markdown'));
  assert.ok(items.some((i) => i.label === 'note'));
});

test('hover explains known keys', () => {
  const h = hover('"column_set":', 5);
  assert.ok(h && h.contents.value.includes('column_set'));
});

test('analyze 包含真机硬约束诊断', () => {
  const source = `{
    "schema": "2.0",
    "body": { "vertical_spacing": "huge", "elements": [] }
  }`;
  const { diagnostics } = analyze(source);
  assert.ok(diagnostics.some((d) => d.code === 'spacing-domain'));
});

test('quickFixes 对废弃属性给出删除编辑', () => {
  const actions = quickFixes(SRC, { start: { line: 3, character: 0 }, end: { line: 3, character: 20 } });
  assert.ok(actions.length > 0);
  const edit = actions[0]!.edits[0]!;
  assert.equal(edit.range.start.line, 3);
  assert.equal(edit.newText, '');
});

test('sanitizeAllAction 提供整文档净化', () => {
  const action = sanitizeAllAction(SRC);
  assert.ok(action);
  assert.ok(action!.edits[0]!.newText.includes('"schema": "2.0"'));
  assert.ok(!action!.edits[0]!.newText.includes('i18n_elements'));
});
