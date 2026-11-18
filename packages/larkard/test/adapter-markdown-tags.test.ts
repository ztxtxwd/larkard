import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dslToRaw,
  parseInline,
  parseMarkdown,
  rawToDsl,
} from '../src/adapter/index.js';
import { renderDslToString } from '../src/renderer/index.js';

type AnyEl = Record<string, any>;

/* ------------------------------------------------------------------ *
 * content 字符串 → 元素树
 * ------------------------------------------------------------------ */

test('parseInline: <br>/<br/> → br，<hr> 单独一行 → hr', () => {
  assert.deepEqual(
    parseInline('A<br>B<br/>C').map((el) => (el as AnyEl).tag),
    ['plain_text', 'br', 'plain_text', 'br', 'plain_text'],
  );
  assert.deepEqual(parseMarkdown('<hr>'), [{ tag: 'hr', property: {} }]);
  assert.deepEqual(parseMarkdown('<hr/>'), [{ tag: 'hr', property: {} }]);
  // 行尾 <br> + 软换行只产生一个换行，不叠加空行。
  assert.deepEqual(
    parseMarkdown('A<br>\nB').map((el) => (el as AnyEl).tag),
    ['plain_text', 'br', 'plain_text'],
  );
});

test('parseInline: <number_tag> → number_tag（保留颜色与多端 URL）', () => {
  const [el] = parseInline(
    "<number_tag background_color='grey' font_color='white' url='https://e.com' pc_url='https://pc.e.com'>7</number_tag>",
  ) as AnyEl[];
  assert.equal(el!.tag, 'number_tag');
  assert.deepEqual(el!.property, {
    text: { tag: 'plain_text', property: { content: '7' } },
    backgroundColor: 'grey',
    fontColor: 'white',
    url: { url: 'https://e.com', pcURL: 'https://pc.e.com' },
  });
});

test('parseInline: <local_datetime> → local_datetime（毫秒归一为 number）', () => {
  const [el] = parseInline(
    "<local_datetime millisecond='1700000000000' format_type='date_num' link='https://e.com'></local_datetime>",
  ) as AnyEl[];
  assert.equal(el!.tag, 'local_datetime');
  assert.deepEqual(el!.property, {
    milliseconds: 1700000000000,
    formatType: 'date_num',
    link: 'https://e.com',
  });
});

test('parseInline: <a href> 与 <link> 均投影为 link', () => {
  const [anchor] = parseInline("<a href='https://e.com'>示例</a>") as AnyEl[];
  assert.deepEqual(anchor, {
    tag: 'link',
    property: { content: '示例', url: 'https://e.com' },
  });

  const [link] = parseInline(
    "<link icon='chat_outlined' url='https://e.com' pc_url='https://pc.e.com' ios_url='https://ios.e.com'>文档</link>",
  ) as AnyEl[];
  assert.deepEqual(link, {
    tag: 'link',
    property: {
      content: '文档',
      icon: 'chat_outlined',
      url: {
        url: 'https://e.com',
        pcURL: 'https://pc.e.com',
        iosURL: 'https://ios.e.com',
      },
    },
  });
});

test('dslToRaw: 六类标签都进入 markdown 子元素树，不再当字面量', () => {
  const raw = dslToRaw({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'markdown',
        content: [
          "A<number_tag background_color='grey' font_color='white'>1</number_tag>B",
          "C<local_datetime millisecond='1700000000000' format_type='date_num'></local_datetime>D",
          "E<a href='https://e.com'>A</a>F<link icon='chat_outlined' url='https://e.com'>L</link>G",
          'H<br>I<hr>J',
        ].join(''),
      }],
    },
  }) as AnyEl;

  const els = raw.body.property.elements[0].property.elements as AnyEl[];
  assert.deepEqual(
    els.map((el) => el.tag),
    [
      'plain_text', 'number_tag',
      'plain_text', 'local_datetime',
      'plain_text', 'link',
      'plain_text', 'link',
      'plain_text', 'br',
      'plain_text', 'hr',
      'plain_text',
    ],
  );
  // number_tag 的数字在 text 叶子里，link 的文案在 content 里。
  assert.equal(els[1]!.property.text.property.content, '1');
  assert.equal(els[5]!.property.content, 'A');
  assert.equal(els[7]!.property.content, 'L');
});

/* ------------------------------------------------------------------ *
 * RAW → DSL
 * ------------------------------------------------------------------ */

test('rawToDsl: number_tag / local_datetime / link 可回写为公开语法', () => {
  const raw = {
    schema: '2.0',
    body: {
      elements: [{
        tag: 'markdown',
        property: {
          elements: [
            {
              tag: 'number_tag',
              property: {
                text: { tag: 'plain_text', property: { content: '1' } },
                backgroundColor: 'grey',
                fontColor: 'white',
                url: { url: 'https://e.com', pcURL: 'https://pc.e.com' },
              },
            },
            {
              tag: 'local_datetime',
              property: {
                milliseconds: 1700000000000,
                formatType: 'date_num',
                link: 'https://t.e.com',
              },
            },
            {
              tag: 'link',
              property: {
                content: '文档',
                icon: 'chat_outlined',
                url: { url: 'https://e.com', pcURL: 'https://pc.e.com' },
              },
            },
            { tag: 'br', property: {} },
          ],
        },
      }],
    },
  };

  const dsl = rawToDsl(raw) as AnyEl;
  const content = dsl.body.elements[0].content as string;
  assert.match(
    content,
    /<number_tag background_color='grey' font_color='white' url='https:\/\/e\.com' pc_url='https:\/\/pc\.e\.com'>1<\/number_tag>/,
  );
  assert.match(
    content,
    /<local_datetime millisecond='1700000000000' format_type='date_num' link='https:\/\/t\.e\.com'><\/local_datetime>/,
  );
  assert.match(
    content,
    /<link icon='chat_outlined' url='https:\/\/e\.com' pc_url='https:\/\/pc\.e\.com'>文档<\/link>/,
  );

  // DSL → RAW，关键字段应完全一致（round-trip 锁）。
  const back = dslToRaw(dsl) as AnyEl;
  const els = back.body.property.elements[0].property.elements as AnyEl[];
  assert.deepEqual(els[0]!.property, (raw.body.elements[0]!.property.elements[0] as AnyEl).property);
  assert.deepEqual(els[1]!.property, (raw.body.elements[0]!.property.elements[1] as AnyEl).property);
  assert.deepEqual(els[2]!.property, (raw.body.elements[0]!.property.elements[2] as AnyEl).property);
  assert.equal(els[3]!.tag, 'br');
});

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

test('renderDslToString: 标签渲染为组件而非字面量', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'markdown',
        content: [
          "A<number_tag background_color='grey' font_color='white'>1</number_tag>B",
          "C<local_datetime millisecond='1700000000000'></local_datetime>D",
          "E<a href='https://e.com'>示例</a>F",
          "<link url='https://e.com' pc_url='https://pc.e.com'>文档</link>",
          'G<br>H<hr>I',
        ].join(''),
      }],
    },
  });

  assert.match(html, /universal-card-number-tag/);
  assert.match(html, /universal-card-local-datetime/);
  assert.match(html, /class="universal-card-markdown-link" href="https:\/\/e\.com"[^>]*>示例<\/a>/);
  // 多端链接优先 PC 地址。
  assert.match(html, /class="universal-card-markdown-link" href="https:\/\/pc\.e\.com"[^>]*>文档<\/a>/);
  assert.match(html, /<br>/);
  assert.match(html, /universal-card-hr/);
  // 不应再有标签字面量漏出。
  assert.doesNotMatch(html, /&lt;(?:number_tag|local_datetime|link|a|br|hr)\b/);
});
