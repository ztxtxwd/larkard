import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli.js';

function fixture(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ofc-'));
  const f = join(dir, 'card.json');
  writeFileSync(f, content);
  return f;
}

const BAD = `{
  "schema": "2.0",
  "body": { "elements": [{ "tag": "markdown", "content": "x", "extra_invalid_prop": 1 }] },
  "i18n_elements": {}
}`;

test('lint exits 1 on deprecated prop warnings only when errors', () => {
  const f = fixture('{"schema":"2.0","body":{"elements":[{"tag":"markdown","content":"ok"}]}}');
  assert.equal(run(['lint', f]), 0);
});

test('lint reports invalid tag as error', () => {
  const f = fixture('{"schema":"2.0","body":{"elements":[{"tag":"nope","content":"x"}]}}');
  assert.equal(run(['lint', f]), 1);
});

test('clean strips invalid props and writes output', () => {
  const f = fixture(BAD);
  const out = f.replace('.json', '.clean.json');
  assert.equal(run(['clean', f, '--out', out]), 0);
  const cleaned = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(cleaned.body.elements[0].extra_invalid_prop, undefined);
  assert.equal(cleaned.body.elements[0].content, 'x');
});

test('clean --check detects dirty file', () => {
  const f = fixture(BAD);
  assert.equal(run(['clean', f, '--check']), 1);
});

test('clean preserves builder envelope', () => {
  const f = fixture(`{
    "name": "demo",
    "dsl": {
      "schema": "2.0",
      "body": { "elements": [{ "tag": "markdown", "content": "x", "extra_invalid_prop": 1 }] }
    },
    "variables": []
  }`);
  const out = f.replace('.json', '.clean.json');
  assert.equal(run(['clean', f, '--out', out]), 0);
  const cleaned = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(cleaned.name, 'demo');
  assert.deepEqual(cleaned.variables, []);
  assert.equal(cleaned.dsl.body.elements[0].extra_invalid_prop, undefined);
  assert.equal(cleaned.dsl.body.elements[0].content, 'x');
});

test('lint accepts builder envelope', () => {
  const f = fixture(`{
    "name": "demo",
    "dsl": {
      "schema": "2.0",
      "body": { "elements": [{ "tag": "markdown", "content": "ok" }] }
    },
    "variables": []
  }`);
  assert.equal(run(['lint', f]), 0);
});
