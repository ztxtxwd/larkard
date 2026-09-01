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

test('dslToRaw: expands config.style.color mm_* (non-cus) aliases', () => {
  const dsl = {
    schema: '2.0',
    config: {
      style: {
        color: {
          mm_key_point_blue_surface: {
            light_mode: 'rgba(236, 249, 254, 1)',
            dark_mode: 'rgba(236, 249, 254, 1)',
          },
          mm_key_point_icon_border: {
            light_mode: 'rgba(31, 35, 41, 0.10)',
            dark_mode: 'rgba(31, 35, 41, 0.10)',
          },
          mm_ink: {
            light_mode: 'rgba(31, 35, 41, 1)',
            dark_mode: 'rgba(31, 35, 41, 1)',
          },
        },
      },
    },
    body: {
      elements: [{
        tag: 'interactive_container',
        background_style: 'mm_key_point_blue_surface',
        has_border: true,
        border_color: 'mm_key_point_icon_border',
        elements: [
          { tag: 'markdown', content: "<font color='mm_ink'>标题</font>" },
        ],
      }],
    },
  };
  const raw = dslToRaw(dsl) as any;
  const ic = raw.body.property.elements[0].property;
  assert.deepEqual(ic.customBackgroundStyle, {
    light_mode: 'rgba(236, 249, 254, 1)',
    dark_mode: 'rgba(236, 249, 254, 1)',
  });
  assert.deepEqual(ic.customBorderColor, {
    lightMode: 'rgba(31, 35, 41, 0.10)',
    darkMode: 'rgba(31, 35, 41, 0.10)',
  });
  const ts = ic.elements[0].property.elements[0].property.textStyle;
  assert.equal(ts.customColor.lightMode, 'rgba(31, 35, 41, 1)');
});

test('dslToRaw: expands config.style.color cus-* into renderer raw fields', () => {
  const dsl = {
    schema: '2.0',
    config: {
      update_multi: true,
      style: {
        color: {
          'cus-bg-0': { light_mode: 'rgba(217,107,39,0.08)', dark_mode: 'rgba(217,107,39,0.15)' },
          'cus-accent': { light_mode: 'rgba(217,107,39,1)', dark_mode: 'rgba(217,107,39,1)' },
          'cus-text-1': { light_mode: 'rgba(110,115,125,1)', dark_mode: 'rgba(166,166,166,1)' },
        },
      },
    },
    body: {
      elements: [{
        tag: 'column_set',
        columns: [{
          tag: 'column',
          background_style: 'cus-bg-0',
          elements: [
            { tag: 'markdown', content: "<font color='cus-accent'>**85%**</font>", text_size: 'heading' },
            { tag: 'markdown', content: 'caption', font_color: 'cus-text-1', text_size: 'small' },
          ],
        }],
      }],
    },
  };
  const raw = dslToRaw(dsl) as any;
  assert.ok(raw.config?.style?.color?.['cus-accent']);
  const col = raw.body.property.elements[0].property.columns[0].property;
  assert.deepEqual(col.customBackgroundStyle, {
    light_mode: 'rgba(217,107,39,0.08)',
    dark_mode: 'rgba(217,107,39,0.15)',
  });
  assert.equal(col.backgroundStyle, 'cus-bg-0');
  const heading = col.elements[0].property.elements[0].property.textStyle;
  assert.equal(heading.customColor.lightMode, 'rgba(217,107,39,1)');
  assert.equal(heading.color, undefined);
  const caption = col.elements[1].property.elements[0].property.textStyle;
  assert.equal(caption.customColor.lightMode, 'rgba(110,115,125,1)');
});

test('dslToRaw: expands cus-* colors inside list items', () => {
  const dsl = {
    schema: '2.0',
    config: {
      update_multi: true,
      style: {
        color: {
          'cus-text-1': { light_mode: 'rgba(10,10,10,1)', dark_mode: 'rgba(10,10,10,1)' },
        },
      },
    },
    body: {
      elements: [{
        tag: 'markdown',
        content: "- <font color='cus-text-1'>**bold**</font><font color='cus-text-1'>: detail</font>\n",
      }],
    },
  };
  const raw = dslToRaw(dsl) as any;
  const list = raw.body.property.elements[0].property.elements[0];
  assert.equal(list.tag, 'list');
  const ts = list.property.items[0].elements[0].property.textStyle;
  assert.equal(ts.customColor.lightMode, 'rgba(10,10,10,1)');
  assert.equal(ts.color, undefined);
});

test('dslToRaw: expands interactive_container border_color cus-* to customBorderColor', () => {
  const dsl = {
    schema: '2.0',
    config: {
      update_multi: true,
      style: {
        color: {
          'cus-bg-0': { light_mode: 'rgba(10,10,10,1)', dark_mode: 'rgba(10,10,10,1)' },
        },
      },
    },
    body: {
      elements: [{
        tag: 'interactive_container',
        has_border: true,
        border_color: 'cus-bg-0',
        elements: [{ tag: 'markdown', content: 'q' }],
      }],
    },
  };
  const raw = dslToRaw(dsl) as any;
  const ic = raw.body.property.elements[0].property;
  assert.deepEqual(ic.customBorderColor, {
    lightMode: 'rgba(10,10,10,1)',
    darkMode: 'rgba(10,10,10,1)',
  });
  assert.equal(ic.border_color ?? ic.borderColor, 'cus-bg-0');
});

test('dslToRaw: expands interactive_container background_style cus-* to customBackgroundStyle', () => {
  const dsl = {
    schema: '2.0',
    config: {
      style: {
        color: {
          'cus-canvas': { light_mode: 'rgba(250,249,245,1)', dark_mode: 'rgba(250,249,245,1)' },
          'cus-ink': { light_mode: 'rgba(20,20,19,1)', dark_mode: 'rgba(20,20,19,1)' },
        },
      },
    },
    body: {
      elements: [{
        tag: 'interactive_container',
        background_style: 'cus-canvas',
        elements: [{
          tag: 'interactive_container',
          background_style: 'cus-ink',
          elements: [{ tag: 'markdown', content: 'tag' }],
        }],
      }],
    },
  };
  const raw = dslToRaw(dsl) as any;
  const outer = raw.body.property.elements[0].property;
  const inner = outer.elements[0].property;
  assert.deepEqual(outer.customBackgroundStyle, {
    light_mode: 'rgba(250,249,245,1)',
    dark_mode: 'rgba(250,249,245,1)',
  });
  assert.equal(outer.backgroundStyle, 'cus-canvas');
  assert.deepEqual(inner.customBackgroundStyle, {
    light_mode: 'rgba(20,20,19,1)',
    dark_mode: 'rgba(20,20,19,1)',
  });
});

test('dslToRaw: expands collapsible_panel background_color and border.color cus-*', () => {
  const dsl = {
    schema: '2.0',
    config: {
      style: {
        color: {
          'cus-panel': { light_mode: 'rgba(245,244,237,1)', dark_mode: 'rgba(245,244,237,1)' },
          'cus-secondary': { light_mode: 'rgba(232,230,220,1)', dark_mode: 'rgba(232,230,220,1)' },
        },
      },
    },
    body: {
      elements: [{
        tag: 'collapsible_panel',
        background_color: 'cus-panel',
        border: { color: 'cus-secondary', corner_radius: '10px' },
        header: { title: { tag: 'plain_text', content: 'h' } },
        elements: [{ tag: 'markdown', content: 'body' }],
      }],
    },
  };
  const raw = dslToRaw(dsl) as any;
  const panel = raw.body.property.elements[0].property;
  assert.deepEqual(panel.customBackgroundStyle, {
    light_mode: 'rgba(245,244,237,1)',
    dark_mode: 'rgba(245,244,237,1)',
  });
  assert.equal(panel.backgroundColor, 'cus-panel');
  assert.equal(panel.border.color, 'rgba(232,230,220,1)');
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
