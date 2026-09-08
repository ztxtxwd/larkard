import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lint } from '../src/index.js';

test('missing schema warning', () => {
  const ds = lint('{ "body": { "elements": [{ "tag": "markdown", "content": "x" }] } }');
  assert.ok(ds.some((d) => d.rule === 'missing-schema'));
});

test('empty body info', () => {
  const ds = lint('{ "schema": "2.0", "body": { "elements": [] } }');
  assert.ok(ds.some((d) => d.rule === 'empty-body'));
});

test('deep nesting warning', () => {
  let el = '{ "tag": "markdown", "content": "x" }';
  for (let i = 0; i < 10; i++) {
    el = `{ "tag": "column", "elements": [${el}] }`;
  }
  const ds = lint(`{ "schema": "2.0", "body": { "elements": [${el}] } }`);
  assert.ok(ds.some((d) => d.rule === 'nesting-depth'));
});

test('long text warning', () => {
  const long = 'x'.repeat(4000);
  const ds = lint(`{ "schema": "2.0", "body": { "elements": [{ "tag": "markdown", "content": "${long}" }] } }`);
  assert.ok(ds.some((d) => d.rule === 'long-text'));
});

test('builder document lints the dsl subtree', () => {
  const ds = lint(`{
    "name": "demo",
    "dsl": { "body": { "elements": [{ "tag": "markdown", "content": "x" }] } },
    "variables": []
  }`);
  assert.ok(ds.some((d) => d.rule === 'missing-schema'));
});

test('builder empty body is reported on dsl body', () => {
  const ds = lint(`{
    "name": "demo",
    "dsl": { "schema": "2.0", "body": { "elements": [] } },
    "variables": []
  }`);
  assert.ok(ds.some((d) => d.rule === 'empty-body'));
});
