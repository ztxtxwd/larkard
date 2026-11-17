import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FeishuCardV2Schema } from '../src/schema/index.js';
import { normalizeStoredCardColors } from '../src/adapter/normalize-stored-colors.js';

describe('normalizeStoredCardColors', () => {
  it('converts custom_background_style hex to cus-bg + config.style.color', () => {
    const dsl: Record<string, any> = {
      schema: '2.0',
      config: { update_multi: true },
      body: {
        elements: [
          {
            tag: 'column_set',
            columns: [
              {
                tag: 'column',
                custom_background_style: {
                  light_mode: '#da5c2a14',
                  dark_mode: '#da5c2a28',
                },
                elements: [
                  {
                    tag: 'markdown',
                    content: '**85%**',
                    text_size: 'heading',
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    normalizeStoredCardColors(dsl);
    const col = (dsl.body as { elements: unknown[] }).elements[0] as {
      columns: Record<string, any>[];
    };
    assert.equal(col.columns[0].background_style, 'cus-bg-0');
    assert.equal(col.columns[0].custom_background_style, undefined);
    const style = (dsl.config as { style: { color: Record<string, any> } }).style;
    assert.notEqual(style.color['cus-bg-0'], undefined);
    assert.notEqual(style.color['cus-accent'], undefined);
    const md = (col.columns[0].elements as Record<string, any>[])[0];
    assert.equal(md.content, "<font color='cus-accent'>**85%**</font>");
    assert.ok(!Object.prototype.hasOwnProperty.call(md, 'font_color'));
  });

  it('keeps separate cus-bg and cus-text aliases when hex matches', () => {
    const dsl: Record<string, any> = {
      schema: '2.0',
      config: { update_multi: true },
      body: {
        elements: [{
          tag: 'column_set',
          columns: [
            {
              tag: 'column',
              custom_background_style: {
                light_mode: '#0a0a0aff',
                dark_mode: '#0a0a0aff',
              },
              elements: [{
                tag: 'markdown',
                content: "<font color='#0a0a0aff'>label</font>",
              }],
            },
          ],
        }],
      },
    };
    normalizeStoredCardColors(dsl);
    const col = ((dsl.body as { elements: unknown[] }).elements[0] as { columns: Record<string, any>[] }).columns[0];
    assert.match(col.background_style, /^cus-bg-/);
    assert.doesNotMatch(col.background_style, /^cus-text-/);
    const md = (col.elements as Record<string, any>[])[0] as { content: string };
    // 与背景同 hex 的显式字色必须仍是 cus-text-*，不能并进 cus-accent
    assert.match(md.content, /<font color='cus-text-\d+'>/);
    assert.ok(!(md.content).includes('cus-accent'));
    assert.ok(!(md.content).includes('#0a0a0a'));
  });

  it('normalizes interactive_container custom_border_color to border_color cus-bg', () => {
    const dsl: Record<string, any> = {
      schema: '2.0',
      config: { update_multi: true },
      body: {
        elements: [{
          tag: 'interactive_container',
          has_border: true,
          custom_border_color: {
            light_mode: '#0a0a0aff',
            dark_mode: '#0a0a0aff',
          },
          elements: [{ tag: 'markdown', content: 'quote' }],
        }],
      },
    };
    normalizeStoredCardColors(dsl);
    const ic = (dsl.body as { elements: Record<string, any>[] }).elements[0];
    assert.match(ic.border_color, /^cus-bg-/);
    assert.equal(ic.custom_border_color, undefined);
  });

  it('normalizes interactive_container custom_background_style and reuses existing cus-bg tokens', () => {
    const dsl: Record<string, any> = {
      schema: '2.0',
      config: {
        update_multi: true,
        style: {
          color: {
            'cus-bg-0': { light_mode: 'rgba(230,255,61,1)', dark_mode: 'rgba(230,255,61,1)' },
            'cus-bg-1': { light_mode: 'rgba(10,10,10,1)', dark_mode: 'rgba(10,10,10,1)' },
            'cus-text-0': { light_mode: 'rgba(245,244,239,1)', dark_mode: 'rgba(245,244,239,1)' },
          },
        },
      },
      body: {
        elements: [{
          tag: 'interactive_container',
          disabled: true,
          background_style: 'default',
          custom_background_style: {
            light_mode: '#f5f4efff',
            dark_mode: '#f5f4efff',
          },
          elements: [{
            tag: 'interactive_container',
            disabled: true,
            background_style: 'default',
            custom_background_style: {
              light_mode: '#0a0a0aff',
              dark_mode: '#0a0a0aff',
            },
            elements: [{ tag: 'markdown', content: 'badge' }],
          }],
        }],
      },
    };
    normalizeStoredCardColors(dsl);
    const outer = (dsl.body as { elements: Record<string, any>[] }).elements[0];
    const inner = (outer.elements as Record<string, any>[])[0];
    assert.equal(outer.background_style, 'cus-bg-2');
    assert.equal(outer.custom_background_style, undefined);
    assert.equal(inner.background_style, 'cus-bg-1');
    assert.equal(inner.custom_background_style, undefined);

    const parsed = FeishuCardV2Schema.safeParse(dsl);
    assert.equal(parsed.success, true);
    const pOuter = parsed.data!.body.elements[0] as Record<string, any>;
    const pInner = (pOuter.elements as Record<string, any>[])[0];
    assert.equal(pOuter.background_style, 'cus-bg-2');
    assert.equal(pInner.background_style, 'cus-bg-1');
    assert.equal(pOuter.custom_background_style, undefined);
    assert.equal(pInner.custom_background_style, undefined);
  });
  it('keeps explicit text color as cus-text even when it matches the first background hex', () => {
    const dsl: Record<string, any> = {
      schema: '2.0',
      config: { update_multi: true },
      body: {
        elements: [
          {
            tag: 'interactive_container',
            custom_background_style: {
              light_mode: '#ede7ddff',
              dark_mode: '#ede7ddff',
            },
            elements: [
              {
                tag: 'column_set',
                columns: [
                  {
                    tag: 'column',
                    custom_background_style: {
                      light_mode: '#25211bff',
                      dark_mode: '#25211bff',
                    },
                    elements: [
                      {
                        tag: 'markdown',
                        content: "<font color='#ede7ddff'>**暖金 × 黑顶**</font>",
                      },
                      {
                        tag: 'markdown',
                        content: "<font color='#6e6558ff'>次要说明</font>",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    normalizeStoredCardColors(dsl);
    const style = (dsl.config as { style: { color: Record<string, { light_mode: string }> } }).style;

    const outer = (dsl.body as { elements: Record<string, any>[] }).elements[0];
    const col = ((outer.elements as Record<string, any>[])[0] as {
      columns: Record<string, any>[];
    }).columns[0];
    const [title, muted] = col.elements as { content: string }[];
    assert.match(title.content, /<font color='cus-text-\d+'>/);
    assert.ok(!(title.content).includes('cus-accent'));
    const titleAlias = title.content.match(/cus-text-\d+/)?.[0]!;
    assert.equal(style.color[titleAlias].light_mode, 'rgba(237,231,221,1)');
    assert.match(muted.content, /<font color='cus-text-\d+'>/);
    assert.ok(!(muted.content).includes('cus-muted'));
  });
});

describe('MarkdownSchema font_color', () => {
  it('preserves font_color through FeishuCardV2Schema', () => {
    const card = {
      schema: '2.0',
      config: {
        style: {
          color: {
            'cus-accent': { light_mode: 'rgba(204,85,0,1)', dark_mode: 'rgba(240,138,75,1)' },
          },
        },
      },
      header: { title: { tag: 'plain_text', content: 't' }, template: 'orange' },
      body: {
        elements: [
          {
            tag: 'markdown',
            content: '**85%**',
            font_color: 'cus-accent',
            text_size: 'heading',
          },
        ],
      },
    };
    const parsed = FeishuCardV2Schema.parse(card);
    assert.partialDeepStrictEqual(parsed.body.elements[0], { font_color: 'cus-accent' });
  });
});
