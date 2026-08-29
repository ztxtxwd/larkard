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

test('dslToRaw: header subtitle lark_md → markdown elements (originTag:lark_md)', () => {
  const raw = dslToRaw({
    schema: '2.0',
    header: {
      title: { tag: 'plain_text', content: '事件复盘' },
      subtitle: { tag: 'lark_md', content: '<at id=ou_113bce58203b98552a06a738827e95b7></at>' },
    },
    body: { elements: [] },
  }) as any;
  const subtitle = raw.header.property.subtitle;
  assert.equal(subtitle.tag, 'markdown');
  assert.equal(subtitle.property.originTag, 'lark_md');
  assert.equal(subtitle.property.elements[0].tag, 'at');
  assert.equal(subtitle.property.elements[0].property.userID, 'ou_113bce58203b98552a06a738827e95b7');
  assert.equal(subtitle.property.content, undefined);
});

test('rawToDsl: header lark_md subtitle round-trips through dslToRaw', () => {
  const dsl = {
    schema: '2.0',
    header: {
      title: { tag: 'plain_text', content: '事件复盘' },
      subtitle: { tag: 'lark_md', content: '<at id=ou_abc></at>' },
    },
    body: { elements: [] },
  };
  const back = rawToDsl(dslToRaw(dsl)) as any;
  assert.equal(back.header.title.tag, 'plain_text');
  assert.equal(back.header.title.content, '事件复盘');
  assert.equal(back.header.subtitle.tag, 'lark_md');
  assert.equal(back.header.subtitle.content, '<at id=ou_abc></at>');
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
