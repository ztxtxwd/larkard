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

test('dslToRaw/rawToDsl round-trips open_url platform URLs (copy button)', () => {
  const copy = 'lark://client/core/copy?value=%2Fedit';
  const dsl = {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '复制指令' },
          type: 'default',
          behaviors: [
            {
              type: 'open_url',
              default_url: 'https://miao.cards',
              pc_url: copy,
              ios_url: copy,
              android_url: copy,
            },
          ],
        },
      ],
    },
  };
  const raw = dslToRaw(dsl) as any;
  // 输出对齐服务端存储拼写（snake_case），而不是编辑器/历史数据的 camelCase。
  const action = raw.body.property.elements[0].property.actions[0].action;
  assert.equal(action.url, 'https://miao.cards');
  assert.equal(action.pc_url, copy);
  assert.equal(action.ios_url, copy);
  assert.equal(action.android_url, copy);
  assert.equal(action.pcURL, undefined);
  assert.equal(action.iosURL, undefined);
  assert.equal(action.androidURL, undefined);

  const back = rawToDsl(raw) as any;
  assert.deepEqual(back.body.elements[0].behaviors[0], {
    type: 'open_url',
    default_url: 'https://miao.cards',
    pc_url: copy,
    ios_url: copy,
    android_url: copy,
  });
});

test('dslToRaw writes element_id as outer RAW id (not property)', () => {
  const dsl = {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'markdown',
          element_id: 'md_intro',
          content: 'hello',
        },
        {
          tag: 'button',
          element_id: 'btn_submit',
          text: { tag: 'plain_text', content: '提交' },
          behaviors: [{ type: 'callback', value: { action: 'go' } }],
        },
      ],
    },
  };
  const raw = dslToRaw(dsl) as any;
  const md = raw.body.property.elements[0];
  const btn = raw.body.property.elements[1];
  assert.equal(md.id, 'md_intro');
  assert.equal(btn.id, 'btn_submit');
  assert.equal(md.property.element_id, undefined);
  assert.equal(btn.property.element_id, undefined);
  // 服务端把回调存成 action_request；DSL→RAW 输出同一拼写，往返才能对齐。
  assert.deepEqual(btn.property.actions, [
    { type: 'action_request', action: { value: { action: 'go' } } },
  ]);

  const back = rawToDsl(raw) as any;
  assert.equal(back.body.elements[0].element_id, 'md_intro');
  assert.equal(back.body.elements[1].element_id, 'btn_submit');
  assert.deepEqual(back.body.elements[1].behaviors, [
    { type: 'callback', value: { action: 'go' } },
  ]);
});

test('dslToRaw: video cover.img_key → coverImageID（公开 DSL 官方形态）', () => {
  const raw = dslToRaw({
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'video',
          file_key: 'file_v3_video',
          cover: { img_key: 'img_v3_cover' },
          show_time: true,
        },
      ],
    },
  }) as any;

  const video = raw.body.property.elements[0];
  assert.equal(video.property.fileID, 'file_v3_video');
  assert.equal(video.property.coverImageID, 'img_v3_cover');
  // 嵌套 cover 不能漏进 RAW（飞书会按未知属性 200621 拒收）
  assert.equal(video.property.cover, undefined);

  // 回读仍投影成公开 DSL 的 cover: { img_key }
  const back = rawToDsl(raw) as any;
  assert.deepEqual(back.body.elements[0].cover, { img_key: 'img_v3_cover' });
});

test('dslToRaw/rawToDsl round-trips column_set state host (element_id + action.multi_url)', () => {
  const stateUrl = 'lark://msgcard/unsupported_action#s1.ZGVtbw';
  const dsl = {
    schema: '2.0',
    body: {
      elements: [
        { tag: 'markdown', content: 'visible' },
        {
          tag: 'column_set',
          element_id: 'card_state',
          action: {
            multi_url: { url: stateUrl },
          },
          columns: [{ tag: 'column', width: 'auto', elements: [] }],
        },
      ],
    },
  };

  const raw = dslToRaw(dsl) as any;
  const host = raw.body.property.elements[1];
  assert.equal(host.tag, 'column_set');
  assert.equal(host.id, 'card_state');
  assert.equal(host.property.action, undefined);
  assert.equal(host.property.element_id, undefined);
  assert.deepEqual(host.property.actions, [
    { type: 'open_url', action: { url: stateUrl } },
  ]);

  const back = rawToDsl(raw) as any;
  const backHost = back.body.elements[1];
  assert.equal(backHost.element_id, 'card_state');
  assert.equal(backHost.actions, undefined);
  assert.deepEqual(backHost.action, { multi_url: { url: stateUrl } });
});

test('dslToRaw / rawToDsl round-trips img_combination + select_img', () => {
  const dsl = {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'img_combination',
          combination_mode: 'double',
          img_list: [{ img_key: 'img_a' }, { img_key: 'img_b', transparent: true }],
          combination_transparent: true,
          corner_radius: '8px',
        },
        {
          tag: 'form',
          name: 'f1',
          elements: [
            {
              tag: 'select_img',
              name: 'pick',
              options: [
                {
                  img_key: 'img_a',
                  value: 'a',
                  disabled: true,
                  disabled_tips: { tag: 'plain_text', content: '不可选' },
                },
                { img_key: 'img_b', value: 'b' },
              ],
              multi_select: true,
              layout: 'trisect',
              style: 'laser',
              aspect_ratio: '1:1',
              selected_values: ['a'],
              can_preview: false,
            },
          ],
        },
      ],
    },
  };

  const raw = dslToRaw(dsl) as any;
  const combo = raw.body.property.elements[0];
  assert.equal(combo.property.combinationMode, 'double');
  assert.deepEqual(combo.property.imgList, [
    { imageID: 'img_a' },
    { imageID: 'img_b', transparent: true },
  ]);
  assert.equal(combo.property.transparent, true);

  const select = raw.body.property.elements[1].property.elements[0];
  assert.equal(select.tag, 'select_img');
  assert.equal(select.property.multiSelect, true);
  assert.equal(select.property.selectedValues[0], 'a');
  assert.equal(select.property.aspectRatio, '1:1');
  assert.equal(select.property.canPreview, false);
  assert.equal(select.property.options[0].imageID, 'img_a');
  assert.deepEqual(select.property.options[0].disabled_tips, {
    tag: 'plain_text',
    property: { content: '不可选' },
  });

  const back = rawToDsl(raw) as any;
  assert.deepEqual(back.body.elements[0], {
    tag: 'img_combination',
    combination_mode: 'double',
    img_list: [{ img_key: 'img_a' }, { img_key: 'img_b', transparent: true }],
    combination_transparent: true,
    corner_radius: '8px',
  });
  const backSelect = back.body.elements[1].elements[0];
  assert.equal(backSelect.tag, 'select_img');
  assert.equal(backSelect.multi_select, true);
  assert.deepEqual(backSelect.selected_values, ['a']);
  assert.equal(backSelect.layout, 'trisect');
  assert.equal(backSelect.style, 'laser');
  assert.equal(backSelect.aspect_ratio, '1:1');
  assert.equal(backSelect.can_preview, false);
  assert.deepEqual(backSelect.options[0], {
    img_key: 'img_a',
    value: 'a',
    disabled: true,
    disabled_tips: { tag: 'plain_text', content: '不可选' },
  });
});

test('note: DSL ↔ RAW 保留 is_footer 与图标/文本子项', () => {
  const dsl = {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'note',
          is_footer: true,
          elements: [
            { tag: 'standard_icon', token: 'info_outlined', color: 'grey' },
            { tag: 'plain_text', content: '备注信息' },
          ],
        },
      ],
    },
  };

  const raw = dslToRaw(dsl) as any;
  const note = raw.body.property.elements[0];
  assert.equal(note.tag, 'note');
  assert.equal(note.property.is_footer, true);
  assert.equal(note.property.elements[0].tag, 'standard_icon');
  assert.equal(note.property.elements[1].property.content, '备注信息');

  const back = rawToDsl(raw) as any;
  const backNote = back.body.elements[0];
  assert.equal(backNote.tag, 'note');
  assert.equal(backNote.is_footer, true);
  assert.equal(backNote.elements[0].tag, 'standard_icon');
  assert.equal(backNote.elements[1].tag, 'plain_text');
  assert.equal(backNote.elements[1].content, '备注信息');
});
