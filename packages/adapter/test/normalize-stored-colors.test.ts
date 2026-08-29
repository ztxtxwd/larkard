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
    expect(md.font_color).toBe('cus-accent');
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
