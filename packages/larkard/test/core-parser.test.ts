import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parse,
  isBuilderDocument,
  unwrapCardData,
  resolveCardDocument,
  serializeCardDocument,
  joinCardPointer,
} from '../src/core/index.js';

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

test('detects builder document and resolves dsl subtree', () => {
  const src = `{
  "name": "demo",
  "dsl": {
    "schema": "2.0",
    "body": { "elements": [{ "tag": "markdown", "content": "hi" }] }
  },
  "variables": []
}`;
  const r = parse(src);
  assert.equal(isBuilderDocument(r.data), true);
  const resolved = resolveCardDocument(r)!;
  assert.equal(resolved.kind, 'builder');
  assert.equal(resolved.pathPrefix, '/dsl');
  assert.equal(resolved.name, 'demo');
  assert.deepEqual(resolved.variables, []);
  assert.equal((resolved.cardData as any).schema, '2.0');
  assert.equal(resolved.cardAst.properties[0].key.value, 'schema');
  assert.ok(resolved.cardAst.range.start.line >= 3);
});

test('bare card is not a builder document', () => {
  const r = parse('{ "schema": "2.0", "body": { "elements": [] } }');
  assert.equal(isBuilderDocument(r.data), false);
  const resolved = resolveCardDocument(r)!;
  assert.equal(resolved.kind, 'card');
  assert.equal(resolved.pathPrefix, '');
  assert.equal(resolved.cardAst, r.ast);
});

test('root schema wins over accidental dsl field', () => {
  const data = { schema: '2.0', dsl: { schema: '2.0' }, body: { elements: [] } };
  assert.equal(isBuilderDocument(data), false);
  assert.equal(unwrapCardData(data), data);
});

test('serializeCardDocument rewraps builder envelope', () => {
  const r = parse('{"name":"n","dsl":{"schema":"2.0"},"variables":[{"k":1}]}');
  const resolved = resolveCardDocument(r)!;
  const out = serializeCardDocument(resolved, { schema: '2.0', body: { elements: [] } });
  assert.deepEqual(out, {
    name: 'n',
    dsl: { schema: '2.0', body: { elements: [] } },
    variables: [{ k: 1 }],
  });
});

test('joinCardPointer prefixes relative paths', () => {
  assert.equal(joinCardPointer('/dsl', '/body/elements/0'), '/dsl/body/elements/0');
  assert.equal(joinCardPointer('/dsl', '/'), '/dsl');
  assert.equal(joinCardPointer('', '/body'), '/body');
});
