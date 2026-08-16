import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dslToRaw, rawToDsl } from '../src/index.js';

const DSL = {
  schema: '2.0',
  config: { update_multi: true },
  header: { title: { content: 'Hello' }, subtitle: { content: 'World' } },
  body: {
    elements: [
      { tag: 'markdown', content: '**hi** there' },
      { tag: 'column_set', columns: [{ tag: 'column', elements: [{ tag: 'markdown', content: 'a' }] }] },
    ],
  },
};

test('dslToRaw produces renderer raw shape', () => {
  const raw = dslToRaw(DSL) as any;
  assert.equal(raw.schema, '2.0');
  assert.equal(raw.header.tag, 'card_header');
  assert.equal(raw.header.property.title.property.content, 'Hello');
  const md = raw.body.property.elements[0];
  assert.equal(md.tag, 'markdown');
  assert.ok(Array.isArray(md.property.elements));
});

test('rawToDsl round-trips basic card', () => {
  const dsl = rawToDsl(dslToRaw(DSL)) as any;
  assert.equal(dsl.schema, '2.0');
  assert.equal(dsl.header.title, 'Hello');
  assert.equal(typeof dsl.body.elements[0].content, 'string');
});

test('unknown raw components degrade with fallback', () => {
  const dsl = rawToDsl({
    card: {
      schema: '2.0',
      body: { tag: 'body', property: { elements: [{ tag: 'secret_private_widget', property: { foo: 1 } }] } },
    },
  }) as any;
  const el = dsl.body.elements[0];
  assert.equal(el.tag, 'unknown');
  assert.equal(el.raw_tag, 'secret_private_widget');
  assert.deepEqual(el.fallback.property, { foo: 1 });
});
