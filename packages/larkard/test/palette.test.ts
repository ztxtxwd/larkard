import { describe, it } from 'node:test';
import { checkCard } from '../src/index.js';
import assert from 'node:assert/strict';

import {
  contrastRatio,
  formatRgba,
  oklchToRgba,
  parseColor,
  relativeLuminance,
  rgbaToOklch,
  type Rgba,
} from '../src/palette/color.js';
import { extractImagePalette, type PixelData } from '../src/palette/extract.js';
import { readCardColorInventory } from '../src/palette/roles.js';
import { applyThemePalette } from '../src/palette/apply.js';
import { recolorCardWithImage } from '../src/palette/index.js';

function solidPixels(width: number, height: number, color: Rgba): PixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    data[offset] = color.r;
    data[offset + 1] = color.g;
    data[offset + 2] = color.b;
    data[offset + 3] = Math.round(color.a * 255);
  }
  return { data, width, height };
}

function twoTonePixels(
  width: number,
  height: number,
  left: Rgba,
  right: Rgba,
): PixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = x < width / 2 ? left : right;
      const offset = (y * width + x) * 4;
      data[offset] = color.r;
      data[offset + 1] = color.g;
      data[offset + 2] = color.b;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

const BLUE = parseColor('rgba(51,102,255,1)')!;
const CREAM = parseColor('rgba(255,248,238,1)')!;

function customVisualCard(): Record<string, unknown> {
  return {
    schema: '2.0',
    config: {
      style: {
        color: {
          cv_canvas: { light_mode: 'rgba(238,250,121,1)', dark_mode: 'rgba(238,250,121,1)' },
          cv_body: { light_mode: 'rgba(255,255,242,1)', dark_mode: 'rgba(255,255,242,1)' },
          cv_panel: { light_mode: 'rgba(255,255,255,1)', dark_mode: 'rgba(255,255,255,1)' },
          cv_ink: { light_mode: 'rgba(10,10,5,1)', dark_mode: 'rgba(10,10,5,1)' },
          cv_muted: { light_mode: 'rgba(90,90,80,1)', dark_mode: 'rgba(90,90,80,1)' },
          cv_accent: { light_mode: 'rgba(10,10,5,1)', dark_mode: 'rgba(10,10,5,1)' },
          cv_accent_2: { light_mode: 'rgba(255,255,242,1)', dark_mode: 'rgba(255,255,242,1)' },
          cv_button: { light_mode: 'rgba(10,10,5,1)', dark_mode: 'rgba(10,10,5,1)' },
          cv_button_text: { light_mode: 'rgba(255,255,255,1)', dark_mode: 'rgba(255,255,255,1)' },
          cv_on_canvas: { light_mode: 'rgba(10,10,5,1)', dark_mode: 'rgba(10,10,5,1)' },
        },
      },
    },
    body: {
      elements: [
        {
          tag: 'interactive_container',
          background_style: 'cv_canvas',
          elements: [
            { tag: 'markdown', content: "<font color='cv_ink'>标题</font>" },
            { tag: 'markdown', content: "<font color='cv_muted'>说明文字</font>" },
            {
              tag: 'interactive_container',
              background_style: 'cv_panel',
              border_color: 'cv_panel',
              elements: [{ tag: 'markdown', content: "<font color='cv_on_canvas'>面板内容</font>" }],
            },
            {
              tag: 'interactive_container',
              background_style: 'cv_button',
              elements: [{ tag: 'markdown', content: "<font color='cv_button_text'>按钮</font>" }],
            },
          ],
        },
      ],
    },
  };
}


function cusCard(): Record<string, unknown> {
  return {
    schema: '2.0',
    config: {
      style: {
        color: {
          'cus-bg-0': { light_mode: 'rgba(247,241,227,1)', dark_mode: 'rgba(247,241,227,1)' },
          'cus-bg-1': { light_mode: 'rgba(231,124,83,1)', dark_mode: 'rgba(231,124,83,1)' },
          'cus-bg-2': { light_mode: 'rgba(243,217,95,1)', dark_mode: 'rgba(243,217,95,1)' },
          'cus-panel': { light_mode: 'rgba(255,248,238,1)', dark_mode: 'rgba(255,248,238,1)' },
          'cus-text-1': { light_mode: 'rgba(39,48,30,1)', dark_mode: 'rgba(39,48,30,1)' },
          'cus-text-2': { light_mode: 'rgba(116,108,91,1)', dark_mode: 'rgba(116,108,91,1)' },
          'cus-accent': { light_mode: 'rgba(255,255,255,1)', dark_mode: 'rgba(255,255,255,1)' },
          'cus-on-accent': { light_mode: 'rgba(10,10,10,1)', dark_mode: 'rgba(10,10,10,1)' },
        },
      },
    },
    body: {
      elements: [
        {
          tag: 'interactive_container',
          background_style: 'cus-bg-0',
          elements: [
            { tag: 'markdown', content: "<font color='cus-text-1'>标题</font>" },
            { tag: 'markdown', content: "<font color='cus-text-2'>说明</font>" },
            {
              tag: 'column_set',
              columns: [
                {
                  tag: 'column',
                  background_style: 'cus-bg-1',
                  elements: [{ tag: 'markdown', content: "<font color='cus-accent'>橙色栏</font>" }],
                },
                {
                  tag: 'column',
                  background_style: 'cus-bg-2',
                  elements: [{ tag: 'markdown', content: "<font color='cus-on-accent'>黄色栏</font>" }],
                },
              ],
            },
            {
              tag: 'interactive_container',
              background_style: 'cus-panel',
              elements: [{ tag: 'markdown', content: "<font color='cus-text-2'>面板</font>" }],
            },
          ],
        },
      ],
    },
  };
}

function colorOf(card: Record<string, unknown>, name: string): string {
  const config = card.config as Record<string, unknown>;
  const style = config.style as Record<string, unknown>;
  const colors = style.color as Record<string, { light_mode: string; dark_mode: string }>;
  return colors[name]!.light_mode;
}

describe('颜色工具', () => {
  it('OKLCH 往返误差不超过 1 个通道', () => {
    for (const input of ['#3366ff', '#EEFA79', '#0A0A05', '#FFF8EE', '#808080']) {
      const color = parseColor(input)!;
      const roundTrip = oklchToRgba(rgbaToOklch(color));
      assert.ok(Math.abs(roundTrip.r - color.r) <= 1, `${input} r`);
      assert.ok(Math.abs(roundTrip.g - color.g) <= 1, `${input} g`);
      assert.ok(Math.abs(roundTrip.b - color.b) <= 1, `${input} b`);
    }
  });

  it('黑白对比度为 21', () => {
    assert.equal(String(contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255, a: 1 })), '21');
    assert.equal(relativeLuminance({ r: 255, g: 255, b: 255, a: 1 }), 1);
  });
});

describe('extractImagePalette', () => {
  it('从双色图里提取出两个主色，并把高彩度色识别为强调色', () => {
    const palette = extractImagePalette(twoTonePixels(64, 32, BLUE, CREAM));
    assert.equal(palette.clusters.length >= 2, true);
    const blueCluster = palette.clusters.find((cluster) => rgbaToOklch(cluster.rgba).h > 240 && rgbaToOklch(cluster.rgba).h < 280);
    assert.ok(blueCluster, '应保留蓝色簇');
    assert.equal(palette.accents.length >= 1, true);
    assert.ok(palette.accents.some((accent) => accent.h > 240 && accent.h < 280));
  });

  it('同一份像素多次提取结果完全一致', () => {
    const pixels = twoTonePixels(32, 32, BLUE, CREAM);
    assert.deepEqual(extractImagePalette(pixels), extractImagePalette(pixels));
  });
});

describe('readCardColorInventory', () => {
  it('识别 cv_* 的角色和使用位置', () => {
    const inventory = readCardColorInventory(customVisualCard());
    assert.equal(inventory.canvasName, 'cv_canvas');
    const roles = new Map(inventory.tokens.map((token) => [token.name, token.role]));
    assert.equal(roles.get('cv_canvas'), 'canvas');
    assert.equal(roles.get('cv_ink'), 'ink');
    assert.equal(roles.get('cv_muted'), 'muted');
    assert.equal(roles.get('cv_button_text'), 'button_text');
    const ink = inventory.byName.get('cv_ink')!;
    assert.equal(ink.usage.texts[0]?.background, 'cv_canvas');
  });
});

describe('recolorCardWithImage', () => {
  it('只改 config.style.color 的值，不动引用', () => {
    const card = customVisualCard();
    const result = recolorCardWithImage(card, twoTonePixels(64, 32, BLUE, CREAM));
    assert.equal(result.supported, true);

    const original = card as { body: { elements: Array<Record<string, unknown>> } };
    const recolored = result.card as { body: { elements: Array<Record<string, unknown>> } };
    assert.equal(
      (recolored.body.elements[0]!.elements as Array<Record<string, unknown>>)[0]!.content,
      (original.body.elements[0]!.elements as Array<Record<string, unknown>>)[0]!.content,
    );

    const canvas = parseColor(colorOf(result.card, 'cv_canvas'))!;
    const ink = parseColor(colorOf(result.card, 'cv_ink'))!;
    assert.ok(contrastRatio(ink, canvas) >= 7, `ink/canvas 对比度 ${contrastRatio(ink, canvas)}`);

    const button = parseColor(colorOf(result.card, 'cv_button'))!;
    const buttonText = parseColor(colorOf(result.card, 'cv_button_text'))!;
    assert.ok(
      contrastRatio(buttonText, button) >= 4.5,
      `button_text/button 对比度 ${contrastRatio(buttonText, button)}`,
    );
  });

  it('保留源卡的等价类：原本同色的 ink/button 换色后仍同色', () => {
    const result = recolorCardWithImage(customVisualCard(), twoTonePixels(64, 32, BLUE, CREAM));
    assert.equal(colorOf(result.card, 'cv_ink'), colorOf(result.card, 'cv_button'));
    assert.equal(colorOf(result.card, 'cv_accent'), colorOf(result.card, 'cv_ink'));
  });

  it('同一张图重复换色结果一致', () => {
    const card = customVisualCard();
    const pixels = twoTonePixels(48, 24, BLUE, CREAM);
    const first = recolorCardWithImage(card, pixels);
    const second = recolorCardWithImage(card, pixels);
    assert.deepEqual(first.card, second.card);
  });

  it('没有 config.style.color 的卡原样返回并标记 unsupported', () => {
    const card = { schema: '2.0', body: { elements: [{ tag: 'markdown', content: 'hi' }] } };
    const result = recolorCardWithImage(card, solidPixels(8, 8, BLUE));
    assert.equal(result.supported, false);
    assert.deepEqual(result.card, card);
  });
});

describe('applyThemePalette', () => {
  it('返回新对象，不修改输入', () => {
    const card = customVisualCard();
    const before = JSON.stringify(card);
    const result = applyThemePalette(card, {
      cv_canvas: { light_mode: 'rgba(1,2,3,1)', dark_mode: 'rgba(4,5,6,1)' },
    });
    assert.equal(JSON.stringify(card), before);
    assert.equal(colorOf(result.card, 'cv_canvas'), 'rgba(1,2,3,1)');
    assert.equal(result.changed.length, 1);
  });
});

void formatRgba;
describe('cus-* 存量卡', () => {
  it('按实际用途区分 canvas / 高亮面 / 面板', () => {
    const inventory = readCardColorInventory(cusCard());
    const roles = new Map(inventory.tokens.map((token) => [token.name, token.role]));
    assert.equal(inventory.canvasName, 'cus-bg-0');
    assert.equal(roles.get('cus-bg-0'), 'canvas');
    assert.equal(roles.get('cus-bg-1'), 'highlight');
    assert.equal(roles.get('cus-bg-2'), 'highlight');
    assert.equal(roles.get('cus-panel'), 'panel');
    assert.equal(roles.get('cus-accent'), 'on_surface');
  });

  it('前景色按真实父背景修对比度', () => {
    const result = recolorCardWithImage(cusCard(), twoTonePixels(64, 32, BLUE, CREAM));
    const accent = parseColor(colorOf(result.card, 'cus-accent'))!;
    const orange = parseColor(colorOf(result.card, 'cus-bg-1'))!;
    assert.ok(contrastRatio(accent, orange) >= 4.5);
    const onAccent = parseColor(colorOf(result.card, 'cus-on-accent'))!;
    const yellow = parseColor(colorOf(result.card, 'cus-bg-2'))!;
    assert.ok(contrastRatio(onAccent, yellow) >= 4.5);
  });
});

describe('图片强调色', () => {
  it('彩色图片的强调色会落到 accent token 上', () => {
    const card = {
      schema: '2.0',
      config: {
        style: {
          color: {
            cv_canvas: { light_mode: 'rgba(255,255,255,1)', dark_mode: 'rgba(255,255,255,1)' },
            cv_ink: { light_mode: 'rgba(20,20,20,1)', dark_mode: 'rgba(20,20,20,1)' },
            cv_accent: { light_mode: 'rgba(230,120,40,1)', dark_mode: 'rgba(230,120,40,1)' },
          },
        },
      },
      body: {
        elements: [{
          tag: 'interactive_container',
          background_style: 'cv_canvas',
          elements: [
            { tag: 'markdown', content: "<font color='cv_ink'>标题</font>" },
            { tag: 'interactive_container', background_style: 'cv_accent', elements: [] },
          ],
        }],
      },
    };
    const result = recolorCardWithImage(card, twoTonePixels(64, 32, BLUE, CREAM));
    const accent = parseColor(colorOf(result.card, 'cv_accent'))!;
    const hue = rgbaToOklch(accent).h;
    assert.ok(hue > 230 && hue < 290, `accent hue=${hue}`);
  });
});
describe('暗色模式', () => {
  it('源卡 light/dark 不同时分别生成两套颜色并保持可读', () => {
    const card = {
      schema: '2.0',
      config: {
        style: {
          color: {
            cv_canvas: { light_mode: 'rgba(255,255,255,1)', dark_mode: 'rgba(20,20,20,1)' },
            cv_panel: { light_mode: 'rgba(245,245,245,1)', dark_mode: 'rgba(35,35,35,1)' },
            cv_ink: { light_mode: 'rgba(20,20,20,1)', dark_mode: 'rgba(240,240,240,1)' },
          },
        },
      },
      body: {
        elements: [{
          tag: 'interactive_container',
          background_style: 'cv_canvas',
          elements: [
            { tag: 'markdown', content: "<font color='cv_ink'>标题</font>" },
            { tag: 'interactive_container', background_style: 'cv_panel', elements: [] },
          ],
        }],
      },
    };
    const dark = parseColor('rgba(10,26,58,1)')!;
    const navy = parseColor('rgba(18,61,122,1)')!;
    const result = recolorCardWithImage(card, twoTonePixels(64, 32, dark, navy));
    const config = result.card.config as { style: { color: Record<string, { light_mode: string; dark_mode: string }> } };
    const canvas = config.style.color.cv_canvas!;
    assert.notEqual(canvas.light_mode, canvas.dark_mode);

    const lightCanvas = parseColor(canvas.light_mode)!;
    const darkCanvas = parseColor(canvas.dark_mode)!;
    assert.ok(rgbaToOklch(lightCanvas).l > 0.8, 'light canvas should stay light');
    assert.ok(rgbaToOklch(darkCanvas).l < 0.4, 'dark canvas should stay dark');

    const darkInk = parseColor(config.style.color.cv_ink!.dark_mode)!;
    assert.ok(contrastRatio(darkInk, darkCanvas) >= 7, 'dark ink contrast');
  });
});
describe('透明度', () => {
  it('半透明背景 token 换色后仍保留 alpha', () => {
    const card = {
      schema: '2.0',
      config: {
        style: {
          color: {
            cv_canvas: { light_mode: 'rgba(255,255,255,1)', dark_mode: 'rgba(255,255,255,1)' },
            cv_tint: { light_mode: 'rgba(218,92,42,0.08)', dark_mode: 'rgba(218,92,42,0.08)' },
          },
        },
      },
      body: {
        elements: [{
          tag: 'interactive_container',
          background_style: 'cv_canvas',
          elements: [{ tag: 'interactive_container', background_style: 'cv_tint', elements: [] }],
        }],
      },
    };
    const result = recolorCardWithImage(card, twoTonePixels(32, 32, BLUE, CREAM));
    const tint = parseColor(colorOf(result.card, 'cv_tint'))!;
    assert.equal(tint.a, 0.08);
  });
});
describe('灰度图片', () => {
  it('不凭空合成彩色高亮面或强调色', () => {
    const card = {
      schema: '2.0',
      config: {
        style: {
          color: {
            cv_canvas: { light_mode: 'rgba(255,255,255,1)', dark_mode: 'rgba(255,255,255,1)' },
            cv_ink: { light_mode: 'rgba(20,20,20,1)', dark_mode: 'rgba(20,20,20,1)' },
            cv_accent: { light_mode: 'rgba(230,120,40,1)', dark_mode: 'rgba(230,120,40,1)' },
            cv_column_1: { light_mode: 'rgba(243,217,95,1)', dark_mode: 'rgba(243,217,95,1)' },
          },
        },
      },
      body: {
        elements: [{
          tag: 'interactive_container',
          background_style: 'cv_canvas',
          elements: [
            { tag: 'markdown', content: "<font color='cv_ink'>标题</font>" },
            { tag: 'column_set', columns: [{
              tag: 'column',
              background_style: 'cv_column_1',
              elements: [{ tag: 'markdown', content: "<font color='cv_ink'>高亮</font>" }],
            }] },
            { tag: 'interactive_container', background_style: 'cv_accent', elements: [] },
          ],
        }],
      },
    };
    const black = parseColor('rgba(0,0,0,1)')!;
    const white = parseColor('rgba(255,255,255,1)')!;
    const result = recolorCardWithImage(card, twoTonePixels(32, 32, black, white));
    for (const name of ['cv_canvas', 'cv_column_1', 'cv_accent']) {
      const color = parseColor(colorOf(result.card, name))!;
      assert.ok(rgbaToOklch(color).c < 0.05, `${name} chroma=${rgbaToOklch(color).c}`);
    }
  });
});
describe('任意卡：官方枚举色', () => {
  it('把支持自定义色的官方背景/文字/描边物化成 cus-* token', () => {
    const card = {
      schema: '2.0',
      body: {
        elements: [{
          tag: 'interactive_container',
          background_style: 'blue-50',
          border_color: 'blue',
          elements: [
            { tag: 'markdown', content: "<font color='orange'>标题</font> 正文", font_color: 'grey' },
          ],
        }],
      },
    };
    const result = recolorCardWithImage(card, twoTonePixels(64, 32, BLUE, CREAM));
    assert.equal(result.supported, true);
    assert.ok(result.changed.custom >= 3, `custom changed=${result.changed.custom}`);

    const config = result.card.config as { style: { color: Record<string, { light_mode: string }> } };
    const names = Object.keys(config.style.color);
    assert.ok(names.some((name) => name.startsWith('cus-bg-')));
    assert.ok(names.some((name) => name.startsWith('cus-border-')));
    assert.ok(names.some((name) => name.startsWith('cus-accent-text-')));
    assert.ok(names.some((name) => name.startsWith('cus-muted-')));

    const body = result.card.body as { elements: Array<Record<string, unknown>> };
    const container = body.elements[0]!;
    assert.match(String(container.background_style), /^cus-bg-/);
    assert.match(String(container.border_color), /^cus-border-/);
    assert.match(String((container.elements as Array<Record<string, unknown>>)[0]!.content), /<font color='cus-accent-text-\d+'>/);
  });

  it('枚举-only 的 icon / text_tag / header.template 回写成合法官方枚举', () => {
    const card = {
      schema: '2.0',
      header: {
        template: 'green',
        text_tag_list: [{ tag: 'text_tag', text: 'NEW', color: 'orange' }],
      },
      body: {
        elements: [{
          tag: 'markdown',
          content: "<text_tag color='red'>状态</text_tag> 正文",
          icon: { tag: 'standard_icon', token: 'info_outlined', color: 'green' },
        }],
      },
    };
    const result = recolorCardWithImage(card, twoTonePixels(64, 32, BLUE, CREAM));
    assert.equal(result.supported, true);
    assert.ok(result.changed.enums > 0);

    const header = result.card.header as { template: string; text_tag_list: Array<{ color: string }> };
    assert.ok(['blue', 'wathet', 'turquoise', 'green', 'yellow', 'orange', 'red', 'carmine', 'violet', 'purple', 'indigo', 'grey', 'default'].includes(header.template));
    assert.ok(['neutral', 'blue', 'turquoise', 'lime', 'orange', 'violet', 'indigo', 'wathet', 'green', 'yellow', 'red', 'purple', 'carmine'].includes(header.text_tag_list[0]!.color));

    const el = (result.card.body as { elements: Array<Record<string, unknown>> }).elements[0]!;
    const icon = el.icon as { color: string };
    assert.ok(/^(blue|wathet|turquoise|green|lime|yellow|orange|red|carmine|violet|purple|indigo|grey)/.test(icon.color));
    assert.match(String(el.content), /<text_tag color='(neutral|blue|turquoise|lime|orange|violet|indigo|wathet|green|yellow|red|purple|carmine)'>/);
  });

  it('只有枚举色的卡也能换：没有自定义 token 时仍走枚举回写', () => {
    const card = {
      schema: '2.0',
      header: { template: 'blue' },
      body: { elements: [{ tag: 'markdown', content: "<text_tag color='green'>状态</text_tag>" }] },
    };
    const result = recolorCardWithImage(card, twoTonePixels(32, 32, BLUE, CREAM));
    assert.equal(result.supported, true);
    assert.equal(result.changed.custom, 0);
    assert.ok(result.changed.enums > 0);
    assert.ok(result.theme.preview.length > 0);
  });
});

describe('按钮转换', () => {
  it('primary 按钮转成 interactive_container，保留 behaviors 并接入 cus-button-*', () => {
    const card = {
      schema: '2.0',
      config: {
        style: {
          color: {
            cv_canvas: { light_mode: 'rgba(255,255,255,1)', dark_mode: 'rgba(255,255,255,1)' },
            cv_ink: { light_mode: 'rgba(20,20,20,1)', dark_mode: 'rgba(20,20,20,1)' },
          },
        },
      },
      body: {
        elements: [{
          tag: 'interactive_container',
          background_style: 'cv_canvas',
          elements: [{
            tag: 'button',
            type: 'primary',
            text: { tag: 'plain_text', content: '立即报名' },
            behaviors: [{ type: 'open_url', default_url: 'https://example.com' }],
            width: 'fill',
          }],
        }],
      },
    };
    const result = recolorCardWithImage(card, twoTonePixels(64, 32, BLUE, CREAM));
    assert.equal(result.supported, true);
    assert.equal(result.changed.buttons, 1);

    const outer = (result.card.body as { elements: Array<Record<string, unknown>> }).elements[0]!;
    const container = (outer.elements as Array<Record<string, unknown>>)[0]!;
    assert.equal(container.tag, 'interactive_container');
    assert.deepEqual(container.behaviors, [{ type: 'open_url', default_url: 'https://example.com' }]);
    assert.match(String(container.background_style), /^cus-button-/);
    assert.equal(container.width, 'fill');
    const markdown = (container.elements as Array<Record<string, unknown>>)[0]!;
    assert.match(String(markdown.content), /<font color='cus-button-text-\d+'>立即报名<\/font>/);

    const config = result.card.config as { style: { color: Record<string, { light_mode: string }> } };
    assert.ok(Object.keys(config.style.color).some((name) => name.startsWith('cus-button-')));
    assert.ok(Object.keys(config.style.color).some((name) => name.startsWith('cus-button-text-')));
  });

  it('form 内按钮和 danger 按钮保持原样', () => {
    const card = {
      schema: '2.0',
      body: {
        elements: [
          { tag: 'button', type: 'danger', text: { tag: 'plain_text', content: '删除' }, behaviors: [{ type: 'callback', value: { a: 1 } }] },
          {
            tag: 'form',
            name: 'f',
            elements: [{
              tag: 'button',
              type: 'primary',
              name: 'submit',
              form_action_type: 'submit',
              text: { tag: 'plain_text', content: '提交' },
            }],
          },
        ],
      },
    };
    const result = recolorCardWithImage(card, twoTonePixels(32, 32, BLUE, CREAM));
    const body = result.card.body as { elements: Array<Record<string, unknown>> };
    assert.equal(body.elements[0]!.tag, 'button');
    const form = body.elements[1]!;
    assert.equal((form.elements as Array<Record<string, unknown>>)[0]!.tag, 'button');
    assert.equal(result.changed.buttons, 0);
  });
});
describe('换色结果合法性', () => {
  it('物化 + 换色 + 按钮转换后的卡片通过 larkard 发送前检查', () => {
    const card = {
      schema: '2.0',
      config: {
        style: {
          color: {
            cv_canvas: { light_mode: 'rgba(255,255,255,1)', dark_mode: 'rgba(255,255,255,1)' },
            cv_ink: { light_mode: 'rgba(20,20,20,1)', dark_mode: 'rgba(20,20,20,1)' },
          },
        },
      },
      header: {
        title: { tag: 'plain_text', content: '标题' },
        template: 'blue',
        text_tag_list: [{ tag: 'text_tag', text: { tag: 'plain_text', content: 'NEW' }, color: 'green' }],
      },
      body: {
        elements: [
          {
            tag: 'interactive_container',
            disabled: true,
            background_style: 'blue-50',
            border_color: 'blue',
            elements: [
              { tag: 'markdown', content: "<font color='orange'>标题</font>", icon: { tag: 'standard_icon', token: 'info_outlined', color: 'green' } },
              {
                tag: 'button',
                type: 'primary',
                text: { tag: 'plain_text', content: '立即报名' },
                behaviors: [{ type: 'open_url', default_url: 'https://example.com' }],
              },
            ],
          },
        ],
      },
    };
    const result = recolorCardWithImage(card, twoTonePixels(64, 32, BLUE, CREAM));
    const checked = checkCard(result.card);
    assert.deepEqual(
      checked.errors.map((issue) => `${issue.path}: ${issue.message}`),
      [],
    );
  });
});
describe('灰度图的枚举回写', () => {
  it('灰图不会把 text_tag / icon / header 硬转成彩色', () => {
    const card = {
      schema: '2.0',
      header: {
        title: { tag: 'plain_text', content: '标题' },
        template: 'blue',
        text_tag_list: [{ tag: 'text_tag', text: { tag: 'plain_text', content: 'NEW' }, color: 'red' }],
      },
      body: {
        elements: [{
          tag: 'markdown',
          content: "<text_tag color='green'>状态</text_tag>",
          icon: { tag: 'standard_icon', token: 'info_outlined', color: 'green' },
        }],
      },
    };
    const black = parseColor('rgba(0,0,0,1)')!;
    const white = parseColor('rgba(255,255,255,1)')!;
    const result = recolorCardWithImage(card, twoTonePixels(32, 32, black, white));
    const header = result.card.header as { template: string; text_tag_list: Array<{ color: string }> };
    assert.ok(['default', 'grey'].includes(header.template), header.template);
    assert.equal(header.text_tag_list[0]!.color, 'neutral');
    const el = (result.card.body as { elements: Array<Record<string, unknown>> }).elements[0]!;
    assert.match(String(el.content), /<text_tag color='neutral'>/);
    const icon = el.icon as { color: string };
    assert.match(icon.color, /^grey/);
  });
});
describe('飞书回读形态', () => {
  it('custom_background_style 收成 cus-bg token，保留 alpha', () => {
    const card = {
      schema: '2.0',
      body: {
        elements: [{
          tag: 'interactive_container',
          disabled: true,
          elements: [{
            tag: 'column_set',
            columns: [{
              tag: 'column',
              custom_background_style: { light_mode: '#DA5C2A14', dark_mode: '#DA5C2A28' },
              elements: [{ tag: 'markdown', content: '回读文字' }],
            }],
          }],
        }],
      },
    };
    const result = recolorCardWithImage(card, twoTonePixels(32, 32, BLUE, CREAM));
    assert.equal(result.supported, true);
    const config = result.card.config as { style: { color: Record<string, { light_mode: string }> } };
    const bgName = Object.keys(config.style.color).find((name) => name.startsWith('cus-bg-'))!;
    assert.ok(bgName);
    const bg = parseColor(config.style.color[bgName]!.light_mode)!;
    assert.ok(bg.a > 0 && bg.a < 1, `alpha=${bg.a}`);
    const column = ((result.card.body as { elements: Array<Record<string, unknown>> }).elements[0]!
      .elements as Array<Record<string, unknown>>)[0]!
      .columns as Array<Record<string, unknown>>;
    assert.equal(column[0]!.background_style, bgName);
    assert.equal(column[0]!.custom_background_style, undefined);
  });
});
describe('文字按钮', () => {
  it('primary_text 按钮转成无底色的交互容器，文字走 accent_text', () => {
    const card = {
      schema: '2.0',
      config: {
        style: {
          color: {
            cv_canvas: { light_mode: 'rgba(255,255,255,1)', dark_mode: 'rgba(255,255,255,1)' },
          },
        },
      },
      body: {
        elements: [{
          tag: 'interactive_container',
          disabled: true,
          background_style: 'cv_canvas',
          elements: [{
            tag: 'button',
            type: 'primary_text',
            text: { tag: 'plain_text', content: '了解更多' },
            behaviors: [{ type: 'open_url', default_url: 'https://example.com' }],
          }],
        }],
      },
    };
    const result = recolorCardWithImage(card, twoTonePixels(32, 32, BLUE, CREAM));
    const outer = (result.card.body as { elements: Array<Record<string, unknown>> }).elements[0]!;
    const container = (outer.elements as Array<Record<string, unknown>>)[0]!;
    assert.equal(container.tag, 'interactive_container');
    assert.equal(container.background_style, undefined);
    const markdown = (container.elements as Array<Record<string, unknown>>)[0]!;
    assert.match(String(markdown.content), /<font color='cus-accent-text-\d+'>了解更多<\/font>/);
    assert.equal(result.changed.buttons, 1);
  });
});
