import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, complete, hover } from '../src/index.js';

const SRC = `{
  "schema": "2.0",
  "body": { "elements": [{ "tag": "markdown", "content": "x" }] },
  "i18n_elements": {}
}`;

test('analyze merges validator + linter diagnostics', () => {
  const { diagnostics } = analyze(SRC);
  assert.ok(diagnostics.some((d) => d.code === 'deprecated-prop'));
  assert.ok(diagnostics.every((d) => d.source === 'open-feishu-card'));
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
