import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, compile } from '../src/index.js';

const RAW_INPUT = {
  schema: '2.0',
  config: { update_multi: true },
  body: {
    elements: [
      { tag: 'markdown', content: 'Hello', extra_invalid_prop: 123 },
    ],
  },
};

test('sanitize strips non-standard props', () => {
  const { card, stripped } = sanitize(RAW_INPUT, { mode: 'strip' });
  assert.deepEqual(stripped, ['/body/elements/0/extra_invalid_prop']);
  assert.equal((card.body.elements[0] as any).extra_invalid_prop, undefined);
  assert.equal((card.body.elements[0] as any).content, 'Hello');
});

test('sanitize default mode is report (pass-through, preserves unknown props)', () => {
  const { card, stripped } = sanitize(RAW_INPUT);
  assert.deepEqual(stripped, ['/body/elements/0/extra_invalid_prop']);
  assert.equal((card.body.elements[0] as any).extra_invalid_prop, 123);
});

test('sanitize report mode does not modify', () => {
  const { card, stripped } = sanitize(RAW_INPUT, { mode: 'report' });
  assert.ok(stripped.length > 0);
  assert.equal((card.body.elements[0] as any).extra_invalid_prop, 123);
});

test('sanitize error mode throws', () => {
  assert.throws(() => sanitize(RAW_INPUT, { mode: 'error' }));
});

test('compile returns renderer raw', () => {
  const { raw } = compile(RAW_INPUT);
  assert.equal((raw as any).body.property.elements[0].tag, 'markdown');
});

test('compile default preserves unknown props (report semantics)', () => {
  const { card } = compile(RAW_INPUT);
  assert.equal((card.body.elements[0] as any).extra_invalid_prop, 123);
});
