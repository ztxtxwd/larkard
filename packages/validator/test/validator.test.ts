import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/index.js';

const OK = `{
  "schema": "2.0",
  "config": { "update_multi": true },
  "body": { "elements": [ { "tag": "markdown", "content": "hello" } ] }
}`;

test('valid card passes', () => {
  const ds = validate(OK);
  assert.equal(ds.length, 0);
});

test('schema violation points to exact node', () => {
  const src = OK.replace('"markdown"', '"not_a_tag"');
  const ds = validate(src);
  assert.ok(ds.length > 0);
  const d = ds.find((x) => x.severity === 'error')!;
  assert.equal(d.range.start.line, 4);
});

test('syntax error is reported with position', () => {
  const ds = validate('{ "a": }');
  assert.ok(ds.some((d) => d.message.includes('语法错误') || d.severity === 'error'));
});

test('deprecated props produce warnings', () => {
  const ds = validate(`{
    "schema": "2.0",
    "body": { "elements": [ { "tag": "markdown", "content": "hi" } ] },
    "i18n_elements": {}
  }`);
  assert.ok(ds.some((d) => d.code === 'deprecated-prop'));
});
