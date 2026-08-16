import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/index.js';

test('parses plain JSON with positions', () => {
  const r = parse('{\n  "schema": "2.0"\n}');
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.data, { schema: '2.0' });
  const key = r.ast!.properties[0].key;
  assert.equal(key.range.start.line, 2);
  assert.equal(key.range.start.column, 3);
});

test('supports JSONC comments and trailing commas', () => {
  const r = parse(`{
    // card comment
    "schema": "2.0", /* block */
    "elements": [1, 2,],
  }`);
  assert.equal(r.errors.length, 0);
  assert.deepEqual((r.data as any).elements, [1, 2]);
});

test('reports precise error position', () => {
  const r = parse('{\n  "a": @\n}');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].range.start.line, 2);
});

test('rejects non-object root', () => {
  const r = parse('[1,2]');
  assert.ok(r.errors.length > 0);
});
