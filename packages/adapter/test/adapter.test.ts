import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dslToRaw,
  rawToDsl,
  degradeUnknown,
  isRawCardEnvelope,
  rawCardToDsl,
} from '../src/index.js';

const DSL = {
  schema: '2.0',
  config: { update_multi: true },
  header: { title: { content: 'Hello' }, subtitle: { content: 'World' } },
  body: {
    elements: [
      { tag: 'markdown', content: '**hi** there' },
      {
        tag: 'column_set',
        columns: [{ tag: 'column', elements: [{ tag: 'markdown', content: 'a' }] }],
      },
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

test('rawToDsl round-trips basic card from dslToRaw', () => {
  const dsl = rawToDsl(dslToRaw(DSL)) as any;
  assert.equal(dsl.schema, '2.0');
  assert.equal(dsl.config.update_multi, true);
  assert.equal(dsl.header.title.tag, 'plain_text');
  assert.equal(dsl.header.title.content, 'Hello');
  assert.equal(typeof dsl.body.elements[0].content, 'string');
  assert.match(dsl.body.elements[0].content, /hi/);
});

test('degradeUnknown is available as an optional helper', () => {
  const el = degradeUnknown({ tag: 'secret_private_widget', property: { foo: 1 } });
  assert.equal(el.tag, 'unknown');
  assert.equal(el.raw_tag, 'secret_private_widget');
  assert.deepEqual((el.fallback as any).property, { foo: 1 });
});

test('isRawCardEnvelope / rawCardToDsl match upstream API', () => {
  assert.equal(isRawCardEnvelope({ schema: '2.0' }), false);
  const passthrough = { schema: '2.0', body: { elements: [] } };
  assert.equal(rawCardToDsl(passthrough), passthrough);
});

test('rawToDsl accepts { card } wrapper', () => {
  const dsl = rawToDsl({
    card: {
      schema: '2.0',
      body: {
        tag: 'body',
        property: {
          elements: [
            {
              tag: 'markdown',
              property: {
                elements: [{ tag: 'plain_text', property: { content: 'x' } }],
              },
            },
          ],
        },
      },
    },
  }) as any;
  assert.equal(dsl.schema, '2.0');
  assert.equal(dsl.body.elements[0].tag, 'markdown');
  assert.equal(dsl.body.elements[0].content, 'x');
});
