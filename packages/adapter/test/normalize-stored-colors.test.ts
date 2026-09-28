import { describe, expect, it } from 'vitest';
import { FeishuCardV2Schema } from '@open-feishu-card/schema';
import { normalizeStoredCardColors } from '../src/normalize-stored-colors.js';

describe('normalizeStoredCardColors', () => {
  it('converts custom_background_style hex to cus-bg + config.style.color', () => {
    const dsl: Record<string, unknown> = {
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
      columns: Record<string, unknown>[];
    };
    expect(col.columns[0].background_style).toBe('cus-bg-0');
    expect(col.columns[0].custom_background_style).toBeUndefined();
    const style = (dsl.config as { style: { color: Record<string, unknown> } }).style;
    expect(style.color['cus-bg-0']).toBeDefined();
    expect(style.color['cus-accent']).toBeDefined();
    const md = (col.columns[0].elements as Record<string, unknown>[])[0];
    expect(md.content).toBe("<font color='cus-accent'>**85%**</font>");
    expect(md).not.toHaveProperty('font_color');
  });

  it('keeps separate cus-bg and cus-text aliases when hex matches', () => {
    const dsl: Record<string, unknown> = {
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
    const col = ((dsl.body as { elements: unknown[] }).elements[0] as { columns: Record<string, unknown>[] }).columns[0];
    expect(col.background_style).toMatch(/^cus-bg-/);
    expect(col.background_style).not.toMatch(/^cus-text-/);
    const md = (col.elements as Record<string, unknown>[])[0] as { content: string };
    expect(md.content).toMatch(/<font color='cus-/);
    expect(md.content).not.toContain('#0a0a0a');
  });

  it('normalizes interactive_container custom_border_color to border_color cus-bg', () => {
    const dsl: Record<string, unknown> = {
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
    const ic = (dsl.body as { elements: Record<string, unknown>[] }).elements[0];
    expect(ic.border_color).toMatch(/^cus-bg-/);
    expect(ic.custom_border_color).toBeUndefined();
  });

  it('normalizes interactive_container custom_background_style and reuses existing cus-bg tokens', () => {
    const dsl: Record<string, unknown> = {
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
    const outer = (dsl.body as { elements: Record<string, unknown>[] }).elements[0];
    const inner = (outer.elements as Record<string, unknown>[])[0];
    expect(outer.background_style).toBe('cus-bg-2');
    expect(outer.custom_background_style).toBeUndefined();
    expect(inner.background_style).toBe('cus-bg-1');
    expect(inner.custom_background_style).toBeUndefined();

    const parsed = FeishuCardV2Schema.safeParse(dsl);
    expect(parsed.success).toBe(true);
    const pOuter = parsed.data!.body.elements[0] as Record<string, unknown>;
    const pInner = (pOuter.elements as Record<string, unknown>[])[0];
    expect(pOuter.background_style).toBe('cus-bg-2');
    expect(pInner.background_style).toBe('cus-bg-1');
    expect(pOuter.custom_background_style).toBeUndefined();
    expect(pInner.custom_background_style).toBeUndefined();
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
    expect(parsed.body.elements[0]).toMatchObject({ font_color: 'cus-accent' });
  });
});
