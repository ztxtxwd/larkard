/**
 * DSL → RAW 转换 + 渲染测试（node --test）。针对构建产物 dist/index.js。
 *   npm run build && npm test
 * 用「渲染出来的 HTML」而非中间结构做断言——契约是「DSL 能画对」，而非某个 RAW 字段名。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { dslToRaw, renderDslToString, renderCardToString, parseMarkdown } from '../dist/renderer/index.js';
import { EMOJI_SPRITE_CSS, ALL_CSS, feishuCardStyleTag } from '../dist/renderer/assets/index.js';
import { feishuChartHydrateScript, feishuChartHydrateJs, CHART_SPEC_ATTR, renderFeishuChart } from '../dist/renderer/browser.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const loadFixture = (name) => JSON.parse(readFileSync(join(HERE, 'fixtures', 'renderer', name), 'utf8'));

/* ---- 结构反演：header + body + markdown 字符串 ---- */

const dsl = {
  schema: '2.0',
  config: { update_multi: true },
  body: {
    elements: [
      { tag: 'markdown', content: '**加粗** 普通 `代码` [飞书](https://feishu.cn)', text_align: 'center' },
      { tag: 'hr' },
      { tag: 'markdown', content: '# 一级标题\n\n- 项一\n- 项二\n\n> 引用行' },
    ],
  },
  header: {
    template: 'green',
    title: '关于配合发布会的通知',
  },
};

test('header: template 色 + 标题文本叶子归一', () => {
  const html = renderDslToString(dsl);
  assert.match(html, /universal-card-header--green/);
  assert.match(html, /关于配合发布会的通知/);
  assert.match(html, /#d0f5ce/); // green header bg
});

// 真机 grey = 中灰底白字（N500/N00），与 neutral 同；不能走通用 -100/-600。
test('header: template=grey → N500 底 + 白字（对齐真机）', () => {
  const html = renderDslToString({
    schema: '2.0',
    header: { template: 'grey', title: { tag: 'plain_text', content: '灰标题' } },
    body: { elements: [{ tag: 'markdown', content: '正文' }] },
  });
  assert.match(html, /universal-card-header--grey/);
  assert.match(html, /background-color:#8f959e/); // N500
  assert.match(html, /color:#ffffff/);            // N00
  assert.doesNotMatch(html, /background-color:#f2f3f5/); // 旧误用 N100
});

test('markdown: 加粗/行内代码/链接 都渲染出来', () => {
  const html = renderDslToString(dsl);
  assert.match(html, /font-weight:600/);      // **加粗**
  assert.match(html, /加粗/);
  assert.match(html, /code-span/);            // `代码`
  assert.match(html, /href="https:\/\/feishu\.cn"/); // [飞书](...)
});

test('markdown: text_align=center 生效', () => {
  const html = renderDslToString(dsl);
  assert.match(html, /text-align:center/);
});

test('markdown: 标题/列表/引用 块级构造', () => {
  const html = renderDslToString(dsl);
  assert.match(html, /markdown-heading/);
  assert.match(html, /一级标题/);
  assert.match(html, /markdown-list/);
  assert.match(html, /项一/);
  assert.match(html, /blockquote/);
});

// 列表结构对齐网页版：每个 item 一个 <ul>/<ol> + <li data-marker>，
// 项目符号和 22px 缩进由 CSS（li::before + padding-left）画，不拼 marker span。
test('markdown: 列表用 ul/li[data-marker]（符号交给 li::before）', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'markdown',
    content: '- 无序一\n- 无序二\n\n1. 有序一',
  }] } });
  assert.match(html, /<ul class="universal-card-markdown-list__ul" style="margin-left:0px"><li data-marker="0">/);
  // 两个无序项各自一个 <ul>，层级 0 → data-marker="0"（•）；有序项回显序号
  assert.equal((html.match(/<li data-marker="0">/g) || []).length, 2);
  assert.match(html, /<ol class="universal-card-markdown-list__ol"[^>]*><li data-marker="1\.">/);
  assert.match(html, /universal-card-markdown-list__li-content/);
  // 不再输出旧的 marker span
  assert.doesNotMatch(html, /markdown-list__marker/);
});

test('hr 渲染', () => {
  const html = renderDslToString(dsl);
  assert.match(html, /universal-card-hr/);
});

// 真机 RAW 里 hr 与后续文本之间的显式 br（空行）必须留下：
// RAW→DSL 会把它写成 <br>，渲染成 hr 之后、链接之前的一行空白。
test('markdown: hr 与后续文本之间的硬换行保留为一行空白', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'markdown',
    content: '正文\n\n---\n\n<br>\n[124513254](https://a.com)',
  }] } });
  assert.match(html, /universal-card-hr"><\/div><br><a class="universal-card-markdown-link"/);
});

/* ---- dslToRaw 结构：元素被包进 property ---- */

test('dslToRaw: 元素字段包进 property', () => {
  const raw = dslToRaw(dsl);
  const md = raw.body.property.elements[0];
  assert.equal(md.tag, 'markdown');
  assert.ok(Array.isArray(md.property.elements)); // content 已解析为子元素树
  assert.equal(md.property.textAlign, 'center');  // snake→camel 重命名
  assert.equal(md.property.content, undefined);   // content 字符串已消费
});

test('dslToRaw: header 文本叶子 = {tag:plain_text,property:{content}}', () => {
  const raw = dslToRaw(dsl);
  assert.equal(raw.header.tag, 'card_header');
  assert.deepEqual(raw.header.property.title, { tag: 'plain_text', property: { content: '关于配合发布会的通知' } });
});

test('dslToRaw: header subtitle lark_md → markdown elements', () => {
  const raw = dslToRaw({
    header: {
      title: { tag: 'plain_text', content: '事件复盘' },
      subtitle: { tag: 'lark_md', content: '<at id=ou_113></at>' },
    },
    body: { elements: [] },
  });
  const subtitle = raw.header.property.subtitle;
  assert.equal(subtitle.tag, 'markdown');
  assert.equal(subtitle.property.originTag, 'lark_md');
  assert.equal(subtitle.property.elements[0].tag, 'at');
  assert.equal(subtitle.property.elements[0].property.userID, 'ou_113');
});

test('header subtitle lark_md：渲染 @ 提及', () => {
  const html = renderDslToString({
    schema: '2.0',
    header: {
      title: { tag: 'plain_text', content: '事件复盘' },
      subtitle: { tag: 'lark_md', content: '<at id=ou_113></at>' },
    },
    body: { elements: [] },
  }, { persons: { ou_113: { content: '赵天雄' } } });
  assert.match(html, /@赵天雄/);
  assert.doesNotMatch(html, /&lt;at/);
});

/* ---- box 简写字符串 → 对象 ---- */

test('padding/margin: CSS 简写 → 四向对象', () => {
  const raw = dslToRaw({
    body: { elements: [
      { tag: 'column_set', columns: [
        { tag: 'column', background_style: 'green-50', padding: '12px', elements: [] },
      ] },
    ] },
  });
  const col = raw.body.property.elements[0].property.columns[0];
  assert.equal(col.property.backgroundStyle, 'green-50'); // snake→camel
  assert.deepEqual(col.property.padding, {
    top: { type: 'pixels', value: 12 }, right: { type: 'pixels', value: 12 },
    bottom: { type: 'pixels', value: 12 }, left: { type: 'pixels', value: 12 },
  });
});

test('padding: 两值简写 = 上下/左右', () => {
  const raw = dslToRaw({ body: { elements: [
    { tag: 'column_set', columns: [{ tag: 'column', padding: '4px 8px', elements: [] }] },
  ] } });
  const pad = raw.body.property.elements[0].property.columns[0].property.padding;
  assert.equal(pad.top.value, 4);
  assert.equal(pad.right.value, 8);
  assert.equal(pad.bottom.value, 4);
  assert.equal(pad.left.value, 8);
});

/* ---- column 定宽 width → widthValue ---- */

test('column_set: background_style=grey → var(--bg-float-overlay)（客户端 light 实色 #f5f6f7）', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [
      { tag: 'column_set', background_style: 'grey', columns: [
        { tag: 'column', elements: [{ tag: 'markdown', content: 'AI 贯穿始终' }] },
      ] },
    ] },
  });
  assert.match(html, /universal-card-column-set--bg/);
  assert.match(html, /background:var\(--bg-float-overlay\)/);
  assert.doesNotMatch(html, /background:#646a73/); // 不是正文色 grey→N600
  // 客户端 light token 表（feishu-web-dump/debugger/19ecdc88…js）：bg-float-overlay = rgb(245,246,247)
  // = #f5f6f7 实色（与 grey-50 同值）。早先按 JPEG 截图量到 (246,246,246) 改成中性叠色是误判：
  // 色度子采样把 #f5f6f7 压成了中性 246，真机实际仍是 N50。
  assert.match(ALL_CSS, /--bg-float-overlay:\s*#f5f6f7/);
  assert.match(ALL_CSS, /\.universal-card-root\.theme-dark\s*\{[^}]*--bg-float-overlay:\s*#373737/);
  // 真机 .universal-card-column-set--bg { padding:4px; border-radius:6px }
  assert.match(ALL_CSS, /\.universal-card-column-set--bg[^}]*padding:\s*4px/);
  assert.match(ALL_CSS, /\.universal-card-column-set--bg[^}]*border-radius:\s*6px/);
});

test('background_style=bg-white / white → 白底（真机 fallbackStyle 枚举）', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [
      { tag: 'interactive_container', background_style: 'bg-white', elements: [
        { tag: 'markdown', content: '省去模式选择，需求直达创作' },
      ] },
      { tag: 'column_set', background_style: 'grey', columns: [
        { tag: 'column', background_style: 'bg-white', elements: [{ tag: 'markdown', content: '应用开发模式' }] },
        { tag: 'column', background_style: 'white', elements: [{ tag: 'markdown', content: '统一完整能力开箱即用' }] },
      ] },
    ] },
  });
  assert.match(html, /background:var\(--bg-body\)/);
  assert.match(html, /background:var\(--static-white\)/);
  assert.doesNotMatch(html, /background:bg-white/);
});

test('DSL: note + text 子项经 adapter 仍渲染（text leaf 归一为 plain_text）', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{
      tag: 'note',
      elements: [{ tag: 'text', text: 'om · diagnostic probe 2' }],
    }] },
  });
  assert.match(html, /universal-card-note/);
  assert.match(html, /om · diagnostic probe 2/);
});

test('column: background_style 有色 → --bg 圆角，不自动加 padding', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [
      { tag: 'column_set', columns: [
        { tag: 'column', background_style: 'green-50', elements: [{ tag: 'markdown', content: 'KPI' }] },
      ] },
    ] },
  });
  assert.match(html, /universal-card-column--bg/);
  assert.match(ALL_CSS, /\.universal-card-column--bg[^}]*border-radius:\s*6px/);
  assert.doesNotMatch(ALL_CSS, /\.universal-card-column--bg[^}]*padding/);
});

test('column: width="120px" → widthValue 定宽', () => {
  const raw = dslToRaw({ body: { elements: [
    { tag: 'column_set', columns: [{ tag: 'column', width: '120px', elements: [] }] },
  ] } });
  const col = raw.body.property.elements[0].property.columns[0];
  assert.deepEqual(col.property.widthValue, { type: 'pixels', value: 120 });
  assert.equal(col.property.width, undefined);
});

/* ---- column_set horizontal_spacing 缺省（#30 纠正 #15）---- */

test('column_set: 未写 horizontal_spacing → 等价 "default" → column-gap:8px（对齐真机省略=8px）', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [
      { tag: 'column_set', flex_mode: 'bisect', columns: [
        { tag: 'column', elements: [{ tag: 'button', text: 'A', behaviors: [] }] },
        { tag: 'column', elements: [{ tag: 'button', text: 'B', behaviors: [] }] },
      ] },
    ] },
  });
  // 缺省即 default=8px，不是 0（#15 误把"样式解析后 ??0 兜底"当成 DSL 缺省）
  assert.match(html, /universal-card-column-set universal-card-column-set--bisect/);
  assert.match(html, /column-gap:\s*8px/);
  // 窄屏 bisect 的 calc 在样式表里，间距以内联 CSS 变量传给 calc()（真机同款 50% - gap/2）
  assert.match(html, /--universal-card-column-gap:8px/);
  assert.match(ALL_CSS, /calc\(50% - var\(--universal-card-column-gap, 8px\) \/ 2\)/);
});

test('column_set: 显式 horizontal_spacing="0px" → 列贴合 column-gap:0px', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [
      { tag: 'column_set', horizontal_spacing: '0px', flex_mode: 'bisect', columns: [
        { tag: 'column', elements: [{ tag: 'markdown', content: 'A' }] },
        { tag: 'column', elements: [{ tag: 'markdown', content: 'B' }] },
      ] },
    ] },
  });
  assert.match(html, /column-gap:\s*0px/);
  assert.match(html, /--universal-card-column-gap:0px/);
});

test('column_set: 显式 horizontal_spacing="default" → 8px（与缺省一致）', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [
      { tag: 'column_set', horizontal_spacing: 'default', columns: [
        { tag: 'column', elements: [{ tag: 'markdown', content: 'A' }] },
      ] },
    ] },
  });
  assert.match(html, /universal-card-column-set[^>]*style="[^"]*column-gap:\s*8px/);
});

/* ---- button behaviors → actions ---- */

test('button: behaviors[open_url] → 可点链接', () => {
  const html = renderDslToString({ body: { elements: [
    { tag: 'button', text: '打开', behaviors: [{ type: 'open_url', default_url: { url: 'https://x.cn' } }] },
  ] } });
  assert.match(html, /href="https:\/\/x\.cn"/);
  assert.match(html, /打开/);
});

// 对齐真机：正文图 margin 左右 20px，不能贴卡片边
test('img: margin 水平边距 → wrapper calc width', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'img',
    img_key: 'img_v3_test',
    margin: '8px 20px 0px 20px',
    scale_type: 'fit_horizontal',
    preview: true,
    corner_radius: '8px',
  }] } });
  assert.match(html, /class="universal-card-image"[^>]*margin:8px 20px 0px 20px/);
  assert.match(html, /class="universal-card-image"[^>]*width:calc\(100% - 40px\)/);
});

// 真机 img title：DSL 文本叶子在图片上方渲染标题（property.title 不做文本叶子转换就会漏掉）
test('img: DSL title → 图片上方标题', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'img',
    img_key: 'img_v3_title',
    scale_type: 'fit_horizontal',
    title: { tag: 'plain_text', content: '封面标题' },
  }] } }, { imageBaseURL: 'https://cdn.example.com/' });
  assert.match(html, /class="universal-card-image__title"[^>]*><span class="universal-card-text">封面标题<\/span>/);
});

// 官方 schema 的 img.title 是 BaseText（plain_text | lark_md），带 text_size / text_color / lines。
// 真机由服务端把扁平字段归一进 textStyle，plain_text 按 size 定字号、lark_md 走 markdown。
test('img: DSL title 支持 text_size / text_color / lines / lark_md', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'img',
    img_key: 'img_v3_title_plain',
    scale_type: 'fit_horizontal',
    title: { tag: 'plain_text', content: '小字标题', text_size: 'notation', text_color: 'grey', lines: 1 },
  }, {
    tag: 'img',
    img_key: 'img_v3_title_md',
    scale_type: 'fit_horizontal',
    title: { tag: 'lark_md', content: '**粗体** 标题', text_align: 'center', text_size: 'heading' },
  }] } }, { imageBaseURL: 'https://cdn.example.com/' });

  assert.match(html, /universal-card-text universal-card-text--grey" style="[^"]*font-size:12px/); // notation
  assert.match(html, /-webkit-line-clamp:1/);
  // lark_md：走 markdown 子树，对齐/字号由 markdown 容器生效
  // heading=16px → 引擎行高表 de(16)=24，再加消息卡片桌面端 +2 = 26
  assert.match(html, /universal-card-markdown" style="text-align:center;font-size:16px;line-height:26px/);
  assert.match(html, /universal-card-text--bold">粗体/);
});

// 对齐真机：video / fill 按钮 margin 左右 20px，不能贴卡片边
test('video: margin 水平边距 → calc width', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'video',
    file_key: 'file_v3_demo',
    cover: { img_key: 'img_v3_cover' },
    margin: '8px 20px 0px 20px',
  }] } });
  assert.match(html, /universal-card-video[^>]*margin:8px 20px 0px 20px/);
  assert.match(html, /universal-card-video[^>]*width:calc\(100% - 40px\)/);
});

test('button: margin 水平边距 + width=fill → calc width', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'button',
    text: '为妙卡投上关键一票',
    type: 'primary_filled',
    width: 'fill',
    margin: '12px 20px 0px 20px',
    behaviors: [{ type: 'open_url', default_url: { url: 'https://x.cn' } }],
  }] } });
  assert.match(html, /universal-card-button--block[^>]*margin:12px 20px 0px 20px/);
  assert.match(html, /universal-card-button--block[^>]*width:calc\(100% - 40px\)/);
});

/* ---- person → person_v1 ---- */

test('person → person_v1，user_id → userID', () => {
  const raw = dslToRaw({ body: { elements: [{ tag: 'person', user_id: 'ou_123', size: 'small' }] } });
  const p = raw.body.property.elements[0];
  assert.equal(p.tag, 'person_v1');
  assert.equal(p.property.userID, 'ou_123');
});

test('person style=capsule → style=capsule', () => {
  const raw = dslToRaw({ body: { elements: [{
    tag: 'person', user_id: 'ou_123', style: 'capsule', show_avatar: true, show_name: true,
  }] } });
  const p = raw.body.property.elements[0];
  assert.equal(p.property.style, 'capsule');
  assert.equal(p.property.pillShaped, undefined);
});

/* ---- 未知 tag 透传 + 温和跳过 ---- */

test('未知 tag 透传，不炸', () => {
  const html = renderDslToString({ body: { elements: [{ tag: 'brand_new_thing', foo: 1 }] } });
  assert.match(html, /universal-card-body/);
});

/* ---- parseMarkdown 直接单测：代码块 ---- */

test('parseMarkdown: 围栏代码块', () => {
  const els = parseMarkdown('```js\nconst a = 1;\nconst b = 2;\n```');
  const cb = els.find((e) => e.tag === 'code_block');
  assert.ok(cb, 'code_block 存在');
  assert.equal(cb.property.language, 'js');
  assert.equal(cb.property.contents.length, 2);
  assert.equal(cb.property.contents[0].contents[0].content, 'const a = 1;');
});

test('parseMarkdown: <at id=all> / <at id=ou_x>', () => {
  const els = parseMarkdown('<at id=all></at> 和 <at id=ou_x></at>');
  assert.ok(els.some((e) => e.tag === 'at_all'));
  assert.ok(els.some((e) => e.tag === 'at' && e.property.userID === 'ou_x'));
});

test('parseMarkdown: <person id> → person_v1 with attrs', () => {
  const els = parseMarkdown(
    "**销售顾问** <person id='on_abc' show_name=true show_avatar=true style='normal'></person>"
  );
  const p = els.find((e) => e.tag === 'person_v1');
  assert.ok(p, 'person_v1 存在');
  assert.equal(p.property.userID, 'on_abc');
  assert.equal(p.property.showName, true);
  assert.equal(p.property.showAvatar, true);
  assert.equal(p.property.avatarFollowFontSize, true); // 富文本内联：跟正文字号
  assert.equal(p.property.pillShaped, undefined); // style=normal 不设胶囊
  assert.ok(els.some((e) => e.property?.content === '销售顾问'));
});

test('parseMarkdown: <person style=capsule> → style=capsule', () => {
  const els = parseMarkdown("<person id=\"ou_x\" style='capsule' />");
  const p = els.find((e) => e.tag === 'person_v1');
  assert.ok(p);
  assert.equal(p.property.userID, 'ou_x');
  assert.equal(p.property.style, 'capsule');
});

test('parseMarkdown: <audio> → markdown_audio（未闭合开标签，对齐官方示例）', () => {
  const els = parseMarkdown(
    "听听：<audio file_key='file_v3_md' audio_id='1' show_time=true background_color='grey-200' fill_color='blue-800' fallback_url='https://open.feishu.cn/'>"
  );
  const a = els.find((e) => e.tag === 'markdown_audio');
  assert.ok(a, 'markdown_audio 存在');
  assert.equal(a.property.fileID, 'file_v3_md');
  assert.equal(a.property.audioID, '1');
  assert.equal(a.property.showTime, true);
  assert.equal(a.property.backgroundColor, 'grey-200');
  assert.equal(a.property.fillColor, 'blue-800');
  assert.deepEqual(a.property.url, { url: 'https://open.feishu.cn/' });
  assert.ok(els.some((e) => e.property?.content === '听听：'));
});

test('parseMarkdown: <audio></audio> 闭合形态', () => {
  const els = parseMarkdown("<audio file_key=\"file_v3_x\" show_time=false></audio>");
  const a = els.find((e) => e.tag === 'markdown_audio');
  assert.ok(a);
  assert.equal(a.property.fileID, 'file_v3_x');
  assert.equal(a.property.showTime, false);
});

test('DSL markdown 内嵌 <audio>：渲染 inline 胶囊且不把标签当地文本', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'markdown',
        text_size: 'notation',
        content:
          "听听这段：<audio file_key='file_v3_md' audio_id='1' show_time=true background_color='grey-200' fill_color='blue-800'></audio> 结束",
      }],
    },
  }, {
    resolveMedia: (p, kind) => (
      kind === 'audio' && p.fileID === 'file_v3_md' ? 'https://example.com/md.opus' : null
    ),
  });
  assert.match(html, /universal-card-audio__wrapper--inline/);
  assert.match(html, /<audio[^>]*src="https:\/\/example\.com\/md\.opus"/);
  assert.match(html, /data-icon="PlayFilled"/);
  assert.match(html, /--universal-card-audio-bg:#eff0f1/);
  assert.match(html, /--universal-card-audio-fill-color:#002f9e/);
  assert.match(html, /--universal-card-audio-icon-size:12px/); // notation → 12
  assert.doesNotMatch(html, /file_key=/); // 不再把标签字面量漏到 HTML
  assert.match(html, /听听这段：/);
  assert.match(html, /结束/);
});

test('parseMarkdown: <font color> 段落着色', () => {
  const els = parseMarkdown("普通<font color='red'>红字</font>");
  const red = els.find((e) => e.property?.content === '红字');
  assert.ok(red);
  assert.equal(red.property.textStyle.color, 'red');
});

test('markdown: escapeMarkdown 写入的 HTML 实体渲染时还原', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [{ tag: 'markdown', content: '2026&#45;11&#45;17 &#42;不是斜体&#42;' }],
    },
  });
  assert.match(html, /2026-11-17 \*不是斜体\*/);
  assert.doesNotMatch(html, /&#45;|&#42;/);
});

test('header 副标题: lark_md 里的 HTML 实体渲染时还原', () => {
  const html = renderDslToString({
    schema: '2.0',
    header: {
      subtitle: { tag: 'lark_md', content: '2026&#45;11&#45;17 这是一个标题的副标题。' },
    },
    body: { elements: [] },
  });
  assert.match(html, /2026-11-17 这是一个标题的副标题。/);
  assert.doesNotMatch(html, /&#45;/);
});

/* ---- 真实 DSL 语料（取自 feishu-raw-card-to-dsl 的 250+ 卡片对齐 fixture） ---- */
// 契约：真实公开 DSL 喂进 dslToRaw + 渲染，不炸，且正文文本如实出现在 HTML 里。

test('fixture live-bare-body: 真实通知卡渲染出正文/标题/图片', () => {
  const html = renderDslToString(loadFixture('dsl-live-bare-body.json'));
  assert.match(html, /universal-card-header--green/);
  assert.match(html, /关于配合发布会网络保障工作的通知/);
  assert.match(html, /温馨提示/);
  assert.match(html, /王鹏飞：13910630273/);
  assert.match(html, /C区行政运营/); // 段内链接文本
});

test('fixture grid-images: 多图 + 红色强调 + emoji 列表 渲染不炸', () => {
  const html = renderDslToString(loadFixture('dsl-grid-images.json'));
  assert.match(html, /universal-card-body/);
  assert.match(html, /团体总分第一名/);
  assert.match(html, /比武科目/);
  assert.match(html, /universal-card-hr/);
});

/* ---- header text_tag_list：标题右侧彩色标签 ---- */

const dslHeaderTags = {
  schema: '2.0',
  header: {
    template: 'blue',
    title: '标题',
    text_tag_list: [
      { tag: 'text_tag', text: { content: '多模态' }, color: 'blue' },
      { tag: 'text_tag', text: { content: '高性能' }, color: 'indigo' },
    ],
  },
  body: { elements: [{ tag: 'markdown', content: '正文' }] },
};

test('header: text_tag_list 渲染两个彩色标签', () => {
  const html = renderDslToString(dslHeaderTags);
  assert.match(html, /universal-card-header__tags/);   // 标签容器
  assert.match(html, /多模态/);
  assert.match(html, /高性能/);
  assert.match(html, /universal-card-text-tag--blue/);
  assert.match(html, /universal-card-text-tag--indigo/);
  // 标签底色走 --udtoken-tag-bg-*（半透明），不是 header 的 -100 实心底
  assert.match(html, /rgba\(20,\s*86,\s*240,\s*0\.2\)/);   // blue tag bg
  assert.match(html, /rgba\(91,\s*101,\s*245,\s*0\.2\)/);  // indigo tag bg
  // header 传 parentFontSize=16、不传 parentLineHeight：18px 高、10px 字、padding 0 4px，
  // 不做行内 top 补偿（交给 flex 居中）
  assert.match(html, /font-size:10px;font-weight:500[^>]*line-height:18px;height:18px/);
  assert.match(html, /padding:0 4px/);
  assert.doesNotMatch(html, /universal-card-text-tag--blue[^>]*vertical-align:top/);
});

test('header: icon 渲染到左侧 header__icon，并继承标题色', () => {
  const html = renderDslToString({
    schema: '2.0',
    header: {
      template: 'indigo',
      title: '带图标标题',
      icon: { tag: 'standard_icon', token: 'insert-chart_outlined' },
    },
    body: { elements: [{ tag: 'markdown', content: 'x' }] },
  });
  assert.match(html, /universal-card-header__icon/);
  assert.match(html, /ud-icon_insert-chart_outlined/);
  assert.match(html, /#4752e6/); // indigo 标题色注入到 icon
});

test('button: icon 渲染在文字前', () => {
  const html = renderDslToString({
    body: {
      elements: [{
        tag: 'button',
        type: 'primary_filled',
        text: { content: '接受邀请' },
        icon: { tag: 'standard_icon', token: 'done_outlined' },
        behaviors: [{ type: 'open_url', default_url: 'https://open.feishu.cn' }],
      }],
    },
  });
  assert.match(html, /universal-card-button__icon/);
  assert.match(html, /ud-icon_done_outlined/);
  assert.match(html, /接受邀请/);
});

/* ---- button size 分档：对齐引擎 ud__button 的 xs/sm/md/lg ---- */
test('button: size → 盒子高度 24/28/32/40 + 字号 12/12/14/16', () => {
  const html = renderDslToString({
    body: {
      elements: ['tiny', 'small', 'medium', 'large'].map((size) => ({
        tag: 'button',
        size,
        text: { content: size },
        behaviors: [{ type: 'open_url', default_url: 'https://open.feishu.cn' }],
      })),
    },
  });
  for (const size of ['tiny', 'small', 'medium', 'large']) {
    assert.match(html, new RegExp(`universal-card-button--${size}`));
  }
  // 高度 = padding + line-height + 上下描边（真机 height:auto 的实际取值）
  assert.match(ALL_CSS, /\.universal-card-button--tiny\s*\{[^}]*min-height: 24px[^}]*font-size: 12px[^}]*line-height: 20px/);
  assert.match(ALL_CSS, /\.universal-card-button--small\s*\{[^}]*min-height: 28px[^}]*font-size: 12px[^}]*line-height: 20px/);
  assert.match(ALL_CSS, /\.universal-card-button--large\s*\{[^}]*min-height: 40px[^}]*font-size: 16px[^}]*line-height: 24px/);
});

test('button: text 族参与 size 分档，但 padding/高度走 ud__button--text', () => {
  const html = renderDslToString({
    body: {
      elements: [{
        tag: 'button',
        type: 'text',
        size: 'small',
        text: { content: '取消我的选择' },
        behaviors: [{ type: 'open_url', default_url: 'https://open.feishu.cn' }],
      }],
    },
  });
  // 字号/行高来自 size 分档；撑满 + 左对齐
  assert.match(html, /universal-card-button--text/);
  assert.match(html, /universal-card-button--small/);
  assert.match(html, /universal-card-button--block/);
  // 真机 ud__button--text：固定 2px 4px、无最小宽度/高度、无描边
  assert.match(ALL_CSS, /\.universal-card-button--text,[^{]*\{[^}]*border: none[^}]*padding: 2px 4px/);
  assert.match(ALL_CSS, /\.universal-card-button--text,[^{]*\{[^}]*min-height: unset/);
  // 尺寸类的字号/行高对 text 族仍生效
  assert.match(ALL_CSS, /\.universal-card-button--small\s*\{[^}]*font-size: 12px[^}]*line-height: 20px/);
});

test('button: 未写 size 不产生尺寸类（基础样式即 medium）', () => {
  const html = renderDslToString({
    body: {
      elements: [{
        tag: 'button',
        text: { content: '默认' },
        behaviors: [{ type: 'open_url', default_url: 'https://open.feishu.cn' }],
      }],
    },
  });
  assert.doesNotMatch(html, /universal-card-button--(tiny|small|medium|large)/);
});

test('standard_icon: indigo 等 default_color_tokens 命名色生效', () => {
  const html = renderDslToString({
    body: {
      elements: [{
        tag: 'div',
        text: { content: ' ' },
        icon: { tag: 'standard_icon', token: 'data-sheet_outlined', color: 'indigo' },
      }],
    },
  });
  assert.match(html, /ud-icon_data-sheet_outlined/);
  assert.match(html, /#4752e6/); // indigo → I600
});

/* ---- emoji 短码 :KEY: → 雪碧图 ---- */

test('emoji: :Fire: 渲染成雪碧图类，字面消失', () => {
  const html = renderDslToString({
    body: { elements: [{ tag: 'markdown', content: '干得漂亮 :Fire:' }] },
  });
  assert.match(html, /larkw-emoji__img--emoji-fire/);
  assert.doesNotMatch(html, /:Fire:/); // 字面已被消费
});

test('emoji: 多个短码（含带版本名 :OK:→ok_v2）', () => {
  const html = renderDslToString({
    body: { elements: [{ tag: 'markdown', content: ':OK: :DONE: :Trophy:' }] },
  });
  assert.match(html, /larkw-emoji__img--emoji-ok_v2/);
  assert.match(html, /larkw-emoji__img--emoji-done/);
  assert.match(html, /larkw-emoji__img--emoji-trophy/);
});

test('emoji: 未知 key 保持字面（不成雪碧图）', () => {
  const html = renderDslToString({
    body: { elements: [{ tag: 'markdown', content: 'foo :NOTAREALKEY: bar' }] },
  });
  assert.match(html, /:NOTAREALKEY:/);
  assert.doesNotMatch(html, /larkw-emoji__img--emoji-/);
});

test('emoji: 未知 key 降级节点带 fallback 类（可恢复字号，不被 font-size:0 吞掉）', () => {
  const html = renderCardToString({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'markdown',
        property: { elements: [{ tag: 'emoji', property: { key: 'NOTAREALKEY' } }] },
      }],
    },
  });
  assert.match(html, /universal-card-emoji--fallback/);
});

test('emoji: 表情尺寸跟随所在 markdown 字号（size = 字号 × 1.6）', () => {
  const small = renderDslToString({
    body: { elements: [{ tag: 'markdown', content: ':DONE:', text_size: 'small' }] },
  });
  assert.match(small, /font-size:19\.2px/); // 12 × 1.6
  const normal = renderDslToString({
    body: { elements: [{ tag: 'markdown', content: ':DONE:' }] },
  });
  assert.match(normal, /font-size:22\.4px/); // 14 × 1.6
});

test('parseMarkdown: :Fire: → emoji 元素', () => {
  const els = parseMarkdown('a :Fire: b');
  assert.ok(els.some((e) => e.tag === 'emoji' && e.property.key === 'Fire'));
});

test('emoji 布局对齐真机：inline-block + vertical-align:top + inline atom 2px 间距', () => {
  assert.match(ALL_CSS, /\.universal-card-emoji \{[^}]*display: inline-block/);
  assert.match(ALL_CSS, /\.universal-card-emoji \{[^}]*font-size: 0/);
  assert.match(ALL_CSS, /\.universal-card-emoji \{[^}]*vertical-align: top/);
  assert.match(ALL_CSS, /\.universal-card-emoji \{[^}]*margin: 0 2px/);
  // 连续表情不叠加左间距
  assert.match(ALL_CSS, /\.universal-card-emoji \+ \.universal-card-emoji \{ margin-left: 0; \}/);
});

test('EMOJI_SPRITE_CSS: 含 CDN 背景图 + 宽度覆盖(ok_v2)', () => {
  assert.match(EMOJI_SPRITE_CSS, /30df9e9d35\.png/);
  assert.match(EMOJI_SPRITE_CSS, /emoji-ok_v2\{background-position:0 -7em;width:1\.08333em\}/);
});

/* ---- ALL_CSS 聚合导出：布局 + 图标字体 + emoji 一份 ---- */

test('ALL_CSS: 聚合了布局 + 图标字体 + emoji 三份样式', () => {
  assert.match(ALL_CSS, /universal-card-root/);              // 布局（styles.css）
  assert.match(ALL_CSS, /@font-face\{font-family:ud-icons/); // 图标字体（icon-font.css）
  assert.match(ALL_CSS, /emoji-fire\{background-position/);  // emoji 定位（emoji.css）
  assert.match(ALL_CSS, /30df9e9d35\.png/);                  // emoji CDN 雪碧图
});

test('feishuCardStyleTag: 返回含全部样式的 <style> 标签', () => {
  const tag = feishuCardStyleTag();
  assert.match(tag, /^<style data-feishu-card>/);
  assert.match(tag, /<\/style>$/);
  assert.match(tag, /universal-card-root/);
  assert.match(tag, /emoji-fire\{background-position/);
});

/* ---- chart 图表：挂载容器 + spec 透传 + 水合脚本 ---- */

const dslChart = {
  schema: '2.0',
  body: { elements: [
    {
      tag: 'chart',
      aspect_ratio: '16:9',
      chart_spec: {
        type: 'bar',
        data: [{ values: [{ month: '1月', sales: 203.5, type: '新能源' }] }],
        xField: 'month', yField: 'sales', seriesField: 'type', stack: true,
      },
    },
  ] },
};

test('chart: 渲染挂载容器 + aspect-ratio', () => {
  const html = renderDslToString(dslChart);
  assert.match(html, /universal-card-chart/);
  assert.match(html, /aspect-ratio:16 \/ 9/);
  assert.match(html, /universal-card-chart__vchart/);
});

test('chart: chart_spec 原样序列化进 data 属性', () => {
  const html = renderDslToString(dslChart);
  assert.match(html, new RegExp(CHART_SPEC_ATTR));
  // spec 里的字段被 JSON 序列化后（HTML 转义为 &quot;）出现在属性里
  assert.match(html, /&quot;type&quot;:&quot;bar&quot;/);
  assert.match(html, /&quot;stack&quot;:true/);
  assert.match(html, /新能源/);
});

test('chart: 缺 chart_spec → 占位框（不炸）', () => {
  const html = renderDslToString({ body: { elements: [{ tag: 'chart' }] } });
  assert.match(html, /universal-card-chart__placeholder/);
  assert.match(html, /\[图表\]/);
});

test('chart: hydrate 脚本/正文可用且含默认色板', () => {
  const tag = feishuChartHydrateScript();
  assert.match(tag, /^<script data-feishu-chart-hydrate>/);
  assert.match(tag, /<\/script>$/);
  const js = feishuChartHydrateJs();
  assert.match(js, /renderSync/);
  assert.match(js, /#4e83fd/);           // 默认色板（VChart light 主题首色）
  assert.match(js, /"top":12/);         // 真机主题内边距（不是 VChart 缺省 20）
  assert.match(js, /"bottom":0/);
  assert.match(js, new RegExp(CHART_SPEC_ATTR));
  assert.match(js, /setTimeout\(draw,250\)/); // async/defer CDN 未就绪时的退避重试
});

test('chart: renderFeishuChart 接受 UMD 命名空间（.VChart 挂构造器）', () => {
  let seen = null;
  function Ctor(spec, opts) { this.dom = opts.dom; seen = { spec, dom: opts.dom }; }
  Ctor.prototype.renderSync = function () { this.dom.__done = true; };
  const mount = { innerHTML: 'loading', __done: false };
  // 传 UMD 命名空间对象（构造器在 .VChart 上），而非裸构造器
  const inst = renderFeishuChart(mount, { type: 'bar', data: [] }, { VChart: Ctor });
  assert.ok(inst, '应成功构造实例');
  assert.equal(mount.__done, true);       // renderSync 被调用
  assert.equal(mount.innerHTML, '');      // 成功时清掉 loading 占位
  assert.equal(seen.spec.color[0], '#4e83fd'); // 注入默认色板（VChart light 主题首色）
  assert.deepEqual(seen.spec.padding, { top: 12, right: 12, left: 12, bottom: 0 }); // 真机主题内边距
});

test('chart: 显式 padding 不被覆盖（0 也算显式）', () => {
  let seen = null;
  function Ctor(spec, opts) { seen = { spec, dom: opts.dom }; }
  Ctor.prototype.renderSync = function () {};
  const mount = { innerHTML: 'loading' };
  renderFeishuChart(mount, { type: 'bar', data: [], padding: 0 }, Ctor);
  assert.equal(seen.spec.padding, 0);
  renderFeishuChart(mount, { type: 'bar', data: [], padding: { top: 4 } }, Ctor);
  assert.deepEqual(seen.spec.padding, { top: 4 });
});

/* ---- table 表格：语义 table + 列宽/对齐 + options 标签 + number 精度 ---- */

const dslTable = {
  schema: '2.0',
  body: { elements: [
    {
      tag: 'table',
      page_size: 5,
      row_height: 'middle',
      header_style: { background_style: 'grey', bold: true, text_align: 'center' },
      columns: [
        { name: 'rank', display_name: '排名', width: '60px', data_type: 'text', horizontal_align: 'center' },
        { name: 'brand', display_name: '厂商名称', width: 'auto', data_type: 'text', horizontal_align: 'left' },
        { name: 'sales', display_name: '销量', width: '120px', data_type: 'number', format: { precision: 1 }, horizontal_align: 'right' },
        { name: 'status', display_name: '主力阵营', width: '100px', data_type: 'options' },
      ],
      rows: [
        { rank: '1', brand: '比亚迪汽车', sales: 195.8, status: [{ text: '新能源', color: 'green' }] },
        { rank: '2', brand: '吉利汽车', sales: 98.5, status: [{ text: '混动', color: 'blue' }] },
      ],
    },
  ] },
};

test('table: 语义 table + 表头显示名 + 加粗背景', () => {
  const html = renderDslToString(dslTable);
  assert.match(html, /universal-card-table__table/);
  assert.match(html, /<thead/);
  assert.match(html, /排名/);
  assert.match(html, /厂商名称/);
  assert.match(html, /th-text--bold/);            // header_style.bold
  // grey 表头底 = token udtoken-table-bg-head（客户端 light #f2f3f5 = N100），不是 N50
  assert.match(html, /background-color:#f2f3f5/);
});

test('table: header_style.text_color / text_size / lines 落到表头文本', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{
      tag: 'table',
      header_style: { text_color: 'grey', text_size: 'heading', lines: 2 },
      columns: [{ name: 'a', display_name: '列A', data_type: 'text' }],
      rows: [{ a: 'x' }],
    }] },
  });
  const thText = html.match(/<span class="universal-card-table__th-text[^"]*" style="([^"]*)"/)?.[1] || '';
  // 真机把表头单元格当 PlainText：text_color=grey → N600，text_size=heading → 16px
  assert.match(thText, /color:#646a73/);
  assert.match(thText, /font-size:16px/);
  assert.match(thText, /-webkit-line-clamp:2/);
});

test('table: 列宽 + 对齐落到 col/单元格', () => {
  const html = renderDslToString(dslTable);
  // 官方列宽下限 80px：60px 被夹到 80px
  assert.match(html, /width:80px/);
  assert.match(html, /width:120px/);
  assert.match(html, /text-align:right/);   // sales 列右对齐
  assert.match(html, /text-align:center/);  // rank 列居中
});

test('table: header_style.text_align 不被列的 horizontal_align 覆盖', () => {
  // 真机：表头单元格是 headerStyle.textAlign 的 PlainText；列的 horizontalAlign 只作用于表体。
  // 之前表头写成 `column.horizontal_align || header_style.text_align`，
  // 每列都带 horizontal_align 的卡片（生成器默认形态）里 text_align 换值毫无效果。
  const mk = (align) => ({
    schema: '2.0',
    body: { elements: [{
      tag: 'table',
      header_style: { text_align: align },
      columns: [
        { name: 'a', display_name: 'AAA', horizontal_align: 'right' },
        { name: 'b', display_name: 'BBB', horizontal_align: 'left' },
      ],
      rows: [{ a: 'x', b: 'y' }],
    }] },
  });
  const thAligns = (align) =>
    (renderDslToString(mk(align)).match(/<th[^>]*text-align:(\w+)/g) || []).map((m) => m.split(':')[1]);
  assert.deepEqual(thAligns('left'), ['left', 'left']);
  assert.deepEqual(thAligns('center'), ['center', 'center']);
  assert.deepEqual(thAligns('right'), ['right', 'right']);
  // 表体仍按列 horizontal_align 走（不被 header_style 带跑）
  const html = renderDslToString(mk('center'));
  assert.match(html, /<td class="universal-card-table__td" style="text-align:right/);
  assert.match(html, /<td class="universal-card-table__td" style="text-align:left/);
});

test('table: 未给对齐时按 data_type 兜底（number→right，其余 left），表头同规则', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{
      tag: 'table',
      columns: [
        { name: 'a', display_name: 'AAA', data_type: 'text' },
        { name: 'n', display_name: 'NNN', data_type: 'number' },
      ],
      rows: [{ a: 'x', n: 1 }],
    }] },
  });
  const aligns = (re) => (html.match(re) || []);
  const th = aligns(/<th[^>]*text-align:(\w+)/g).map((m) => m.split(':')[1]);
  const td = aligns(/<td[^>]*text-align:(\w+)/g).map((m) => m.split(':')[1]);
  assert.deepEqual(th, ['left', 'right']);
  assert.deepEqual(td, ['left', 'right']);
});

test('table: number 精度 + 行数据', () => {
  const html = renderDslToString(dslTable);
  assert.match(html, /195\.8/);
  assert.match(html, /98\.5/);
  assert.match(html, /比亚迪汽车/);
});

test('renderDslToString: config.style.color cus-* backgrounds and text render as rgba', () => {
  const html = renderDslToString({
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
            { tag: 'markdown', content: "<font color='cus-accent'>**85%**</font>", text_align: 'center', text_size: 'heading' },
            { tag: 'markdown', content: "<font color='cus-text-1'>caption</font>", text_align: 'center', text_size: 'small' },
          ],
        }],
      }],
    },
  });
  assert.match(html, /background:rgba\(217,107,39,0\.08\)/);
  assert.match(html, /color:rgba\(217,107,39,1\)/);
  assert.match(html, /color:rgba\(110,115,125,1\)/);
  assert.match(html, /85%/);
  assert.match(html, /caption/);
});

test('renderDslToString: interactive_container + collapsible_panel cus-* backgrounds', () => {
  const html = renderDslToString({
    schema: '2.0',
    config: {
      style: {
        color: {
          'cus-canvas': { light_mode: 'rgba(250,249,245,1)', dark_mode: 'rgba(250,249,245,1)' },
          'cus-ink': { light_mode: 'rgba(20,20,19,1)', dark_mode: 'rgba(20,20,19,1)' },
          'cus-panel': { light_mode: 'rgba(245,244,237,1)', dark_mode: 'rgba(245,244,237,1)' },
          'cus-secondary': { light_mode: 'rgba(232,230,220,1)', dark_mode: 'rgba(232,230,220,1)' },
        },
      },
    },
    body: {
      elements: [
        {
          tag: 'interactive_container',
          background_style: 'cus-canvas',
          elements: [{
            tag: 'interactive_container',
            background_style: 'cus-ink',
            corner_radius: '999px',
            elements: [{ tag: 'markdown', content: 'tag' }],
          }],
        },
        {
          tag: 'collapsible_panel',
          background_color: 'cus-panel',
          border: { color: 'cus-secondary', corner_radius: '10px' },
          header: { title: { tag: 'plain_text', content: 'section' } },
          elements: [{ tag: 'markdown', content: 'detail' }],
        },
      ],
    },
  });
  assert.match(html, /background:rgba\(250,249,245,1\)/);
  assert.match(html, /background:rgba\(20,20,19,1\)/);
  assert.match(html, /background:rgba\(245,244,237,1\)/);
  assert.match(html, /border:1px solid rgba\(232,230,220,1\)/);
});

test('table: options 渲染成彩色标签', () => {
  const html = renderDslToString(dslTable);
  assert.match(html, /universal-card-text-tag--green/);
  assert.match(html, /新能源/);
  assert.match(html, /universal-card-text-tag--blue/);
  assert.match(html, /混动/);
});

test('table: page_size 分页（首页可见 + 其余行 hidden 留在 DOM）', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ rank: String(i + 1) }));
  const html = renderDslToString({ body: { elements: [{
    tag: 'table', page_size: 3,
    columns: [{ name: 'rank', display_name: '排名', data_type: 'text' }],
    rows,
  }] } });
  // 10 行都在 DOM（供运行期翻页），其中 7 行 hidden；翻页器给 1/4
  const tags = html.match(/<tr class="universal-card-table__row[^"]*"[^>]*>/g) || [];
  assert.equal(tags.length, 10);
  assert.equal(tags.filter((t) => t.includes('hidden')).length, 7);
  assert.match(html, /universal-card-table__pager-total">1\/4</);
});

test('table: page_size 越界按官方 [1,10] 夹紧', () => {
  const rows = Array.from({ length: 4 }, (_, i) => ({ rank: String(i + 1) }));
  const mk = (ps) => renderDslToString({ body: { elements: [{
    tag: 'table', page_size: ps,
    columns: [{ name: 'rank', display_name: '排名', data_type: 'text' }],
    rows,
  }] } });
  // 0 / 负数 → 1（仍有 4 页，不再“视为不限制”）
  assert.match(mk(0), /pager-total">1\/4</);
  assert.equal((mk(0).match(/<tr class="universal-card-table__row[^"]*"[^>]*hidden/g) || []).length, 3);
  assert.match(mk(-2), /pager-total">1\/4</);
  // 20 → 10
  const many = Array.from({ length: 12 }, (_, i) => ({ rank: String(i + 1) }));
  const html = renderDslToString({ body: { elements: [{
    tag: 'table', page_size: 20,
    columns: [{ name: 'rank', display_name: '排名', data_type: 'text' }],
    rows: many,
  }] } });
  assert.match(html, /pager-total">1\/2</);
});

test('table: number 精度越界不炸（夹紧 0..100）', () => {
  const mk = (precision) => renderDslToString({ body: { elements: [{
    tag: 'table',
    columns: [{ name: 'x', display_name: 'X', data_type: 'number', format: { precision } }],
    rows: [{ x: 3.14159 }],
  }] } });
  assert.doesNotThrow(() => mk(-1));    // 负数 → 夹到 0
  assert.doesNotThrow(() => mk(999));   // 越界 → 夹到 100
  assert.match(mk(-1), /universal-card-table__table/);
  assert.match(mk(2), /3\.14/);         // 正常精度仍生效
});

/* ---- table 文本截断：真机按行高裁行 + 省略号，列宽固定（不再靠换行/撑列） ---- */

const mkTable = (extra = {}, cols, rows) => renderDslToString({
  schema: '2.0',
  body: { elements: [{
    tag: 'table',
    columns: cols || [{ name: 'a', display_name: 'A', data_type: 'text' }],
    rows: rows || [{ a: '一段很长很长很长很长很长很长的文本' }],
    ...extra,
  }] },
});

test('table: 缺省行高 = low（td 32px / 内容 max-height 32px / 单行省略）', () => {
  // 客户端组件默认 rowHeightValue = {builtin_table_row_height, low}，
  // 行高换算 1 行 → 单元格文本 nowrap + ellipsis（之前缺省是 middle、且完全不截断）。
  const html = mkTable();
  assert.match(html, /<td class="universal-card-table__td" style="text-align:left;height:32px"/);
  assert.match(html, /max-height:32px/);
  assert.match(html, /class="universal-card-table__line-1"/);
});

test('table: row_height=middle/high → 2/3 行 -webkit-line-clamp', () => {
  const middle = mkTable({ row_height: 'middle' });
  assert.match(middle, /height:54px/);
  assert.match(middle, /class="universal-card-table__lines" style="-webkit-line-clamp:2"/);
  const high = mkTable({ row_height: 'high' });
  assert.match(high, /height:88px/);
  assert.match(high, /class="universal-card-table__lines" style="-webkit-line-clamp:3"/);
});

test('table: 自定义像素行高按客户端阈值换算行数（<54:1 <88:2 <110:3 <132:4 else 5）', () => {
  const clampOf = (rowHeight) => {
    const html = mkTable({ row_height: rowHeight });
    const m = html.match(/-webkit-line-clamp:(\d+)/);
    return m ? Number(m[1]) : 1; // 1 行走 nowrap 类，无内联 line-clamp
  };
  assert.equal(clampOf('48px'), 1);
  assert.equal(clampOf('54px'), 2);
  assert.equal(clampOf('87px'), 2);
  assert.equal(clampOf('88px'), 3);
  assert.equal(clampOf('120px'), 4);
  // 官方自定义行高上限 124px：140px 被夹到 124px（4 行）
  assert.equal(clampOf('140px'), 4);
});

test('table: row_height=auto 不截断，内容最大 124px 且可滚动（row_max_height 可覆盖）', () => {
  const auto = mkTable({ row_height: 'auto' });
  assert.match(auto, /universal-card-table__cell universal-card-table__cell--auto/);
  assert.match(auto, /max-height:124px/);
  // 表体不再包截断层（表头仍有自己的默认单行类，所以只看 max-height 之后的内容）
  const bodyCell = auto.match(/max-height:124px">([\s\S]*?)<\/td>/)?.[1] || '';
  assert.doesNotMatch(bodyCell, /universal-card-table__(line-1|lines)/);
  assert.doesNotMatch(auto, /height:32px/);
  assert.match(mkTable({ row_height: 'auto', row_max_height: '200px' }), /max-height:200px/);
});

test('table: 表头默认 1 行省略；header_style.lines 指定多行时多行截断', () => {
  const dflt = mkTable({}, [{ name: 'a', display_name: '很长的表头标题', data_type: 'text' }]);
  assert.match(dflt, /class="universal-card-table__th-text universal-card-table__th-text--bold universal-card-table__line-1"/);
  const two = mkTable({ header_style: { lines: 2 } });
  assert.match(two, /universal-card-table__th-text[^"]*" style="[^"]*-webkit-line-clamp:2/);
});

test('table: 列宽固定 + 自适应列最小 128px（不够时横向滚动）', () => {
  // 无列宽（2 列 auto）→ table min-width = 2*128
  const twoAuto = mkTable({}, [
    { name: 'a', display_name: 'A', data_type: 'text' },
    { name: 'b', display_name: 'B', data_type: 'text' },
  ], [{ a: 'x', b: 'y' }]);
  assert.match(twoAuto, /<table class="universal-card-table__table" style="min-width:256px"/);
  // 1 列 120px + 1 列 auto → 120 + 128
  const mixed = mkTable({}, [
    { name: 'a', display_name: 'A', data_type: 'text', width: '120px' },
    { name: 'b', display_name: 'B', data_type: 'text' },
  ], [{ a: 'x', b: 'y' }]);
  assert.match(mixed, /min-width:248px/);
  assert.match(mixed, /<col style="width:120px"><\/col><col><\/col>/);
});

test('table: 列宽全是固定值时表宽收紧到「列宽之和 + 每列 1px」（不再拉满整卡）', () => {
  const html = mkTable({}, [
    { name: 'a', display_name: 'A', data_type: 'text', width: '120px' },
    { name: 'b', display_name: 'B', data_type: 'text', width: '80px' },
  ], [{ a: 'x', b: 'y' }]);
  assert.match(html, /class="universal-card-table" style="width:min\(100%, calc\(200px \+ 0% \+ 2px\)\)"/);
  // 有百分比列时百分比落进 calc
  const pct = mkTable({}, [
    { name: 'a', display_name: 'A', data_type: 'text', width: '120px' },
    { name: 'b', display_name: 'B', data_type: 'text', width: '30%' },
  ], [{ a: 'x', b: 'y' }]);
  assert.match(pct, /calc\(120px \+ 30% \+ 2px\)/);
});

test('table: lark_md 单元格把行数写进 markdown.lines（markdown 不强制截断，不改原卡片）', () => {
  const mk = (dataType) => ({
    schema: '2.0',
    body: { elements: [{
      tag: 'table',
      columns: [{ name: 'b', display_name: 'B', data_type: dataType }],
      rows: [{ b: '**加粗** 很长的文本' }],
    }] },
  });
  const lark = mk('lark_md');
  const larkSnapshot = JSON.stringify(lark);
  const html = renderDslToString(lark);
  // markdown 的 children_wrapper 承担截断（真机：lark_md → property.lines = 行高行数）
  assert.match(html, /universal-card-markdown__children" style="display:-webkit-box;-webkit-line-clamp:1/);
  assert.equal(JSON.stringify(lark), larkSnapshot, '渲染不应回写 cells/markdown 属性');
  // dataType=markdown 客户端不写 lines（图片/图表类单元格不能被裁掉）
  const md = renderDslToString(mk('markdown'));
  assert.doesNotMatch(md, /universal-card-markdown__children" style="[^"]*-webkit-line-clamp/);
});

test('table: RAW rowHeightValue(pixels/extension) 与 rowMaxHeightValue 生效', () => {
  const px = renderDslToString({ body: { elements: [{
    tag: 'table',
    rowHeightValue: { type: 'pixels', value: 60 },
    columns: [{ name: 'a', dataType: 'text', displayName: 'A' }],
    rows: [{ a: { data: 'x' } }],
  }] } });
  assert.match(px, /height:60px/);
  assert.match(px, /-webkit-line-clamp:2/);
  const auto = renderDslToString({ body: { elements: [{
    tag: 'table',
    rowHeightValue: { type: 'builtin_table_row_height_extension', value: 'auto' },
    rowMaxHeightValue: { type: 'pixels', value: 180 },
    columns: [{ name: 'a', dataType: 'text', displayName: 'A' }],
    rows: [{ a: { data: 'x' } }],
  }] } });
  assert.match(auto, /universal-card-table__cell--auto/);
  assert.match(auto, /max-height:180px/);
});

/* ---- checker 勾选器 ---- */

test('checker: 基础渲染（未勾选 + 文本 + overall hover）', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'checker',
    name: 'check_pdi',
    checked: false,
    text: { tag: 'plain_text', content: 'PDI 通过', text_size: 'normal', text_color: 'default' },
    overall_checkable: true,
    checked_style: { show_strikethrough: true, opacity: 0.6 },
  }] } });
  assert.match(html, /universal-card-checker/);
  assert.match(html, /universal-card-checker--hover/);
  assert.match(html, /universal-card-checker--strike/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /PDI 通过/);
  assert.match(html, /--checker-checked-opacity:0\.6/);
  // 未勾选：不应带 checked 属性
  assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
});

test('checker: checked=true 时输出 checked 属性', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'checker',
    checked: true,
    text: '已完成',
    checked_style: { show_strikethrough: true, opacity: 0.5 },
  }] } });
  assert.match(html, /type="checkbox"[^>]*checked/);
  assert.match(html, /已完成/);
});

test('checker: button_area + on_hover 自动隐藏', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'checker',
    text: '待办',
    overall_checkable: false,
    button_area: {
      pc_display_rule: 'on_hover',
      buttons: [{
        tag: 'button',
        type: 'text',
        text: '详情',
        behaviors: [{ type: 'open_url', default_url: { url: 'https://feishu.cn' } }],
      }],
    },
  }] } });
  assert.match(html, /universal-card-checker__buttons--auto-hide/);
  assert.match(html, /universal-card-checker__button/);
  assert.match(html, /详情/);
  // overall_checkable=false 且 on_hover 按钮 → 仍有 --hover（对齐引擎）
  assert.match(html, /universal-card-checker--hover/);
});

test('checker: text 为 markdown 时解析 <text_tag>，不漏字面标签', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'checker',
    checked: true,
    text: {
      tag: 'markdown',
      content: "<text_tag color='green'>已完成</text_tag>  连续 3 天每日步数 ≥ 7,000",
      text_align: 'left',
      text_size: 'normal',
    },
    checked_style: { show_strikethrough: true, opacity: 0.55 },
  }] } });
  // 渲成彩色徽章，而不是转义后的 <text_tag> 字面量
  assert.match(html, /universal-card-text-tag--green/);
  assert.match(html, /已完成/);
  assert.match(html, /连续 3 天每日步数/);
  assert.doesNotMatch(html, /&lt;text_tag/);
  assert.doesNotMatch(html, /<text_tag/);
});

test('checker: text 为 lark_md 时同样解析 <text_tag>（飞书 checker 常用写法）', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'checker',
    checked: false,
    text: {
      tag: 'lark_md',
      content: "<text_tag color='turquoise'>进行中</text_tag>  每日饮水 ≥ 1,500ml，坚持 5 天",
      text_align: 'left',
      text_size: 'normal',
      text_color: 'default',
    },
  }] } });
  assert.match(html, /universal-card-text-tag--turquoise/);
  assert.match(html, /进行中/);
  assert.match(html, /每日饮水/);
  assert.doesNotMatch(html, /&lt;text_tag/);
  assert.doesNotMatch(html, /<text_tag/);
  // 真机：content 下包一层 .universal-card-text，行内保留 tag 后的双空格
  assert.match(html, /checker__content[^>]*>\s*<span class="universal-card-text"/);
  assert.match(html, /<\/span>\s*<span class="universal-card-text"[^>]*>  每日饮水/);
});

test('dslToRaw: checker.text markdown → property.elements', () => {
  const raw = dslToRaw({ body: { elements: [{
    tag: 'checker',
    text: {
      tag: 'markdown',
      content: "<text_tag color='turquoise'>进行中</text_tag> 喝水",
      text_size: 'normal',
    },
  }] } });
  const checker = raw.body?.property?.elements?.[0];
  const text = checker?.property?.text;
  assert.equal(text?.tag, 'markdown');
  assert.ok(Array.isArray(text?.property?.elements));
  assert.equal(text?.property?.elements?.[0]?.tag, 'text_tag');
  assert.equal(text?.property?.content, undefined);
});

test('dslToRaw: checker.text lark_md → 归一为 markdown + elements', () => {
  const raw = dslToRaw({ body: { elements: [{
    tag: 'checker',
    text: {
      tag: 'lark_md',
      content: "<text_tag color='grey'>待开始</text_tag> 运动",
    },
  }] } });
  const text = raw.body?.property?.elements?.[0]?.property?.text;
  assert.equal(text?.tag, 'markdown');
  assert.equal(text?.property?.elements?.[0]?.tag, 'text_tag');
  assert.equal(text?.property?.content, undefined);
});

test('text_tag: color=grey 非法，回退 blue（对齐飞书）', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'markdown',
    content: "<text_tag color='grey'>待开始</text_tag>",
  }] } });
  assert.match(html, /universal-card-text-tag--blue/);
  assert.match(html, /#1456f0/);
  assert.doesNotMatch(html, /universal-card-text-tag--grey/);
  assert.match(html, /待开始/);
});

test('text_tag: color=neutral 仍是灰标签', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'markdown',
    content: "<text_tag color='neutral'>中性</text_tag>",
  }] } });
  assert.match(html, /universal-card-text-tag--neutral/);
  assert.match(html, /#646a73/);
});

test('text_tag: 真机 18px 高 / 10px 字 + 行高补偿', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'markdown',
    content: "<text_tag color='blue'>标签</text_tag> 正文",
  }] } });
  // 真机 TextTag size-follow：height/line-height 18、font-size 10、padding 0 4；
  // 外层 vertical-align:top + top=(22-18)/2+.5
  assert.match(html, /font-size:10px;font-weight:500[^>]*line-height:18px;height:18px/);
  assert.match(html, /padding:0 4px/);
  assert.match(html, /vertical-align:top;top:2\.5px/);
  // 真机外层有 2px 左右外边距
  assert.match(ALL_CSS, /\.universal-card-text-tag\s*\{[^}]*margin:\s*0 2px/);
});

test('text_tag: 父字号 > 18 时高度跟随字号、水平 padding 扩到 ceil(fs/4)', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'markdown',
    content: "<text_tag color='blue'>标签</text_tag>",
    text_size: 'heading-0',
  }] } });
  // heading-0 = 30px → height 30、padding 0 8px
  assert.match(html, /line-height:30px;height:30px/);
  assert.match(html, /padding:0 8px/);
});

test('text_tag: note 内按 notation 12/20 计算，垂直偏移 1.5px', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'note',
    elements: [{ tag: 'markdown', content: "<text_tag color='green'>备注</text_tag> 文字" }],
  }] } });
  assert.match(html, /universal-card-text-tag--green[^>]*top:1\.5px/);
});

test('number_tag: 真机 16×16 圆形、中性底色、左右 3px 留白', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'markdown',
    content: '数字 <number_tag>1</number_tag> 标签',
  }] } });
  assert.match(html, /universal-card-number-tag[^"]*"><span class="universal-card-number-tag__content/);
  assert.match(html, /height:16px;width:16px[^>]*font-size:10px[^>]*border-radius:999px/);
  // 真机不用 text_tag 的蓝色板；底色/字色来自 CSS（N900 8% / 80%）
  assert.doesNotMatch(html, /universal-card-number-tag__content[^>]*background-color:rgba\(20, 86, 240/);
  assert.match(ALL_CSS, /\.universal-card-number-tag\s*\{[^}]*padding:\s*0 3px/);
  assert.match(ALL_CSS, /\.universal-card-number-tag__content\s*\{[^}]*rgba\(31, 35, 41, 0\.08\)/);
  assert.match(ALL_CSS, /\.universal-card-number-tag__content\s*\{[^}]*border-radius:\s*999px/);
});

test('hr: 上下间距按容器的 row-gap 抵扣，等价真机 margin collapse', () => {
  // 真机 body 是普通块容器：hr margin 16px 与容器间距 12px 折叠成 max=16px。
  // 渲染器用 flex + gap（不折叠），所以 margin 要扣掉 gap，避免变成 28px。
  assert.match(
    ALL_CSS,
    /\.universal-card-hr\s*\{[^}]*margin:\s*max\(0px,\s*16px - var\(--universal-card-row-gap/,
  );
  assert.match(ALL_CSS, /\.universal-card-body\s*\{[^}]*--universal-card-row-gap:\s*12px/);
  assert.match(ALL_CSS, /\.universal-card-markdown[^{]*\{[^}]*--universal-card-row-gap:\s*0px/);
  assert.match(ALL_CSS, /\.universal-card-hr:first-child\s*\{\s*margin-top:\s*0/);
  assert.match(ALL_CSS, /\.universal-card-hr:last-child\s*\{\s*margin-bottom:\s*0/);
});

test('hr: 显式 vertical_spacing 内联覆盖抵扣变量', () => {
  const html = renderDslToString({ body: {
    vertical_spacing: '20px',
    elements: [{ tag: 'hr' }],
  } });
  assert.match(html, /--universal-card-row-gap:20px/);
});

test('code_block: 编辑器存储的「内容行 + 独立 \\n entry」不产生空行', () => {
  const line = (content) => ({ contents: [{ content }] });
  const html = renderCardToString({ body: { elements: [{
    tag: 'markdown',
    property: {
      elements: [{
        tag: 'code_block',
        property: {
          language: 'json',
          contents: [
            line('{\n'), line('\n'),
            line('  "a": 1\n'), line('\n'),
            line('}\n'), line('\n'),
          ],
        },
      }],
    },
  }] } });
  const m = /<pre class="universal-card-markdown-code-block">([\s\S]*?)<\/pre>/.exec(html);
  assert.ok(m, 'code_block 渲染为 <pre>');
  assert.equal(m[1], '{\n  &quot;a&quot;: 1\n}');
});

test('code_block: 字号/行高/圆角对齐真机（14px / 22px / 8px）', () => {
  assert.match(
    ALL_CSS,
    /\.universal-card-markdown-code-block\s*\{[^}]*font-size:\s*14px[^}]*line-height:\s*22px/,
  );
  assert.match(ALL_CSS, /\.universal-card-markdown-code-block\s*\{[^}]*border-radius:\s*8px/);
});

test('link: B500 链接色，hover 不加下划线', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'markdown',
    content: '[飞书](https://feishu.cn)',
  }] } });
  assert.match(html, /universal-card-markdown-link/);
  assert.match(ALL_CSS, /\.universal-card-markdown-link\s*\{[^}]*color:\s*var\(--B500/);
  assert.doesNotMatch(ALL_CSS, /\.universal-card-markdown-link:hover\s*\{[^}]*text-decoration/);
  assert.doesNotMatch(ALL_CSS, /\.universal-card-markdown-link\s*\{[^}]*text-decoration:\s*underline/);
});

test('table: options 单对象（非数组）也渲染成标签', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'table',
    columns: [{ name: 's', display_name: 'S', data_type: 'options' }],
    rows: [{ s: { text: '在售', color: 'green' } }],
  }] } });
  assert.match(html, /universal-card-text-tag--green/);
  assert.match(html, /在售/);
  assert.doesNotMatch(html, /\[object Object\]/);
});

test('table: options 用表格专用色板（X100 实心底 + text-title 深色字 + 胶囊）', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'table',
    columns: [{ name: 's', display_name: 'S', data_type: 'options' }],
    rows: [{ s: [{ text: '在售', color: 'green' }] }],
  }] } });
  // fallbackStyle.text_tag.color.green_table = { bg_color: G100, font_color: text-title(N900) }
  assert.match(html, /background-color:#d0f5ce;color:#1f2329/);
  assert.match(html, /height:20px/);       // Tag size-small 骨架
  // .universal-card-text-tag__tag--table 覆盖成 14px/600
  assert.match(html, /font-size:14px/);
  assert.match(html, /font-weight:600/);
  assert.match(html, /padding:0 6px/);
  assert.match(html, /border-radius:999px/); // shape=round
  // 不应再落回正文 text_tag 的半透明绿 + 绿字
  assert.doesNotMatch(html, /rgba\(53, 189, 75, 0\.2\)/);
});

test('table: options 省略 color 默认 blue；violet/indigo 无 _table 变体回退普通蓝', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'table',
    columns: [{ name: 's', display_name: 'S', data_type: 'options' }],
    rows: [
      { s: { text: '默认' } },
      { s: { text: '紫', color: 'violet' } },
    ],
  }] } });
  // 默认 blue 走 blue_table：B100 实心底 + N900 字
  assert.match(html, /background-color:#e0e9ff;color:#1f2329[^>]*>默认/);
  // violet_table 在客户端 fallbackStyle 里不存在 → 回退普通蓝色 text_tag
  assert.match(html, /background-color:rgba\(20, 86, 240, 0\.2\);color:#1456f0[^>]*>紫/);
});

test('table: options 单个字符串 / 文本节点（编辑器直出）也能出标签文案', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'table',
    columns: [{ name: 's', display_name: 'S', data_type: 'options' }],
    rows: [
      { s: '单个标签' },
      { s: [{ text: { tag: 'plain_text', property: { content: '节点文案' } }, color: 'red' }] },
    ],
  }] } });
  assert.match(html, /universal-card-table__tags[^>]*><span[^>]*>单个标签</);
  assert.match(html, />节点文案</);
  assert.doesNotMatch(html, /\[object Object\]/);
});

test('table: lark_md 列解析 <font>/** 加粗（DSL 字符串）', () => {
  const html = renderDslToString({ body: { elements: [{
    tag: 'table',
    columns: [
      { name: 'metric', display_name: '指标', data_type: 'text' },
      { name: 'delta', display_name: '变化', data_type: 'lark_md' },
    ],
    rows: [
      { metric: '客单价', delta: "<font color='green'>**▲ +1.2%**</font>" },
    ],
  }] } });
  assert.match(html, /▲ \+1\.2%/);
  assert.match(html, /universal-card-text--bold/);
  // 绿色字色：引擎 default_color_tokens.green=G600 → color:var(--G600)
  assert.match(html, /color:var\(--G600\)/i);
  assert.doesNotMatch(html, /\[object Object\]/);
  assert.doesNotMatch(html, /&lt;font/);
});

test('table: RAW lark_md 单元格（{data: markdown 元素}）正确渲染', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        tag: 'body',
        property: {
          elements: [{
            tag: 'table',
            property: {
              columns: [
                { name: 'delta', displayName: '变化', dataType: 'lark_md' },
              ],
              rows: [{
                delta: {
                  data: {
                    tag: 'markdown',
                    property: {
                      elements: [{
                        tag: 'plain_text',
                        property: {
                          content: '▲ +1.2%',
                          textStyle: { attributes: ['bold'], color: 'green' },
                        },
                      }],
                      originTag: 'lark_md',
                    },
                  },
                },
              }],
            },
          }],
        },
      },
    },
  });
  assert.match(html, /▲ \+1\.2%/);
  assert.doesNotMatch(html, /\[object Object\]/);
});

test('dslToRaw: table lark_md 单元格字符串 → {data: markdown 元素}', () => {
  const raw = dslToRaw({
    body: { elements: [{
      tag: 'table',
      columns: [{ name: 'delta', display_name: '变化', data_type: 'lark_md' }],
      rows: [{ delta: "<font color='green'>**▲ +1.2%**</font>" }],
    }] },
  });
  const table = raw.body?.property?.elements?.[0];
  assert.equal(table?.tag, 'table');
  const cell = (table?.property?.rows)?.[0]?.delta;
  assert.ok(cell && typeof cell === 'object' && 'data' in cell);
  assert.equal(cell.data.tag, 'markdown');
  assert.ok(Array.isArray(cell.data.property?.elements));
  assert.ok(cell.data.property.elements.length > 0);
});
/* ---- table + chart 端到端：整卡（.card 外壳里的 dsl）渲染不炸 ---- */

test('e2e: 乘用车报告卡（chart + table + markdown）整卡渲染', () => {
  const html = renderDslToString({
    schema: '2.0',
    header: { template: 'blue', title: '2026乘用车回顾' },
    body: { elements: [
      { tag: 'markdown', content: '### 核心综述' },
      dslChart.body.elements[0],
      { tag: 'hr' },
      dslTable.body.elements[0],
    ] },
  });
  assert.match(html, /universal-card-header--blue/);
  assert.match(html, /核心综述/);
  assert.match(html, /universal-card-chart/);
  assert.match(html, /universal-card-table__table/);
  assert.match(html, /比亚迪汽车/);
});

test('avatar / collapse_divider / fallback_text / picker_date 可渲染', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [
        { tag: 'avatar', user_id: 'ou_demo', size: 'medium' },
        {
          tag: 'picker_date',
          initial_date: '2026-09-01',
          placeholder: { tag: 'plain_text', content: '选日期' },
          behaviors: [{ type: 'callback', value: {} }],
        },
        {
          tag: 'fallback_text',
          text: { tag: 'plain_text', content: '兜底文案' },
        },
        {
          tag: 'collapsible_panel',
          header: { title: { tag: 'plain_text', content: '面板' } },
          elements: [
            { tag: 'collapse_divider' },
            { tag: 'markdown', content: '内容' },
          ],
        },
      ],
    },
  });
  assert.match(html, /universal-card-avatar/);
  assert.match(html, /universal-card-input--static/);
  assert.match(html, /兜底文案/);
  assert.match(html, /universal-card-collapse-divider/);
  assert.match(html, /universal-card-collapsible-panel/);
});

/* ---- interactive_container 布局字段（direction / align / spacing）---- */

function icStyle(ic) {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{ tag: 'interactive_container', width: '48px', height: '48px', elements: [{ tag: 'markdown', content: 'x' }], ...ic }] },
  });
  const m = html.match(/class="universal-card-interactive-container(?: [^"]*)?"[^>]*style="([^"]*)"/);
  assert.ok(m, 'interactive_container 应输出内联 style');
  return m[1];
}

test('interactive_container: direction=vertical 时 vertical_align→justify、horizontal_align→align', () => {
  const style = icStyle({ direction: 'vertical', vertical_align: 'center', horizontal_align: 'right' });
  assert.match(style, /justify-content:center/);
  assert.match(style, /align-items:flex-end/);
  // 纵向主轴不需要显式 flex-direction（CSS 默认 column）
  assert.equal(/flex-direction:\s*row/.test(style), false);
});

test('interactive_container: direction=horizontal 时两个 align 的 flex 轴交换', () => {
  const style = icStyle({ direction: 'horizontal', vertical_align: 'center', horizontal_align: 'right' });
  assert.match(style, /flex-direction:row/);
  // 主轴横向：horizontal_align 走 justify，vertical_align 走 align
  assert.match(style, /justify-content:flex-end/);
  assert.match(style, /align-items:center/);
});

test('interactive_container: horizontal_spacing→column-gap、vertical_spacing→row-gap', () => {
  const style = icStyle({ horizontal_spacing: '12px', vertical_spacing: '6px' });
  assert.match(style, /column-gap:12px/);
  assert.match(style, /row-gap:6px/);
});

test('interactive_container: 未写 align 时不输出 justify/align（交给 CSS 默认）', () => {
  const style = icStyle({});
  assert.equal(/justify-content/.test(style), false);
  assert.equal(/align-items/.test(style), false);
  assert.equal(/column-gap/.test(style), false);
  assert.equal(/row-gap/.test(style), false);
});

/* ---- interactive_container 宽度（真机 useSize）----
   widthValue 是唯一真值来源：
     builtin_interactive_container_width:auto → width:auto（贴内容宽，胶囊标签靠它）
                                      :fill → width:100%
     缺省                                     → width:100%（真机 element-shell 默认撑满）
     pixels                                   → width:Npx（定宽图标框） */

function icWidthStyle(ic) {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{ tag: 'interactive_container', elements: [{ tag: 'markdown', content: 'x' }], ...ic }] },
  });
  const m = html.match(/class="universal-card-interactive-container(?: [^"]*)?"[^>]*style="([^"]*)"/);
  assert.ok(m, 'interactive_container 应输出内联 style');
  return m[1];
}

test('interactive_container: width 缺省 → 100%（真机 element-shell 默认撑满）', () => {
  assert.match(icWidthStyle({}), /(?:^|;)width:100%/);
});

test('interactive_container: width=fill → 100%，width=auto → auto', () => {
  assert.match(icWidthStyle({ width: 'fill' }), /(?:^|;)width:100%/);
  assert.match(icWidthStyle({ width: 'auto' }), /(?:^|;)width:auto/);
});

test('interactive_container: RAW widthValue 四种子形态', () => {
  const raw = (widthValue) => renderCardToString({
    json_card: {
      schema: '2.0',
      body: { tag: 'body', property: { elements: [{
        tag: 'interactive_container',
        property: { elements: [{ tag: 'markdown', property: { elements: [{ tag: 'plain_text', property: { content: 'x' } }] } }], ...(widthValue ? { widthValue } : {}) },
      }] } },
    },
  });
  const styleOf = (html) => html.match(/class="universal-card-interactive-container(?: [^"]*)?"[^>]*style="([^"]*)"/)[1];
  // 缺省：真机 useSize 返回 default() → 100%
  assert.match(styleOf(raw(undefined)), /(?:^|;)width:100%/);
  assert.match(styleOf(raw({ type: 'builtin_interactive_container_width', value: 'fill' })), /(?:^|;)width:100%/);
  assert.match(styleOf(raw({ type: 'builtin_interactive_container_width', value: 'auto' })), /(?:^|;)width:auto/);
  assert.match(styleOf(raw({ type: 'pixels', value: 48 })), /(?:^|;)width:48px/);
});

test('interactive_container: direction=horizontal 挂 --row（横排不参与子元素撑满）', () => {
  assert.match(icWidthStyle({ direction: 'horizontal' }), /flex-direction:row/);
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{ tag: 'interactive_container', direction: 'horizontal', elements: [{ tag: 'markdown', content: 'x' }] }] },
  });
  assert.match(html, /universal-card-interactive-container--row/);
});

/* ---- column 布局字段（direction / align / spacing）----
  真机把 column / column_set / interactive_container 的对齐都交给同一个 qr()：
  isRow = direction==='horizontal'，horizontal_align 走主轴侧、vertical_align 走交叉轴侧。
  此前 column 写死 flex-direction:column，只把 vertical_align 塞给 justify-content，
  horizontal_align 与 direction 完全没人读 → 列内水平对齐在预览里点也不动。 */

function columnStyle(col) {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{ tag: 'column_set', columns: [{ tag: 'column', elements: [{ tag: 'markdown', content: 'x' }], ...col }] }] },
  });
  const m = html.match(/class="universal-card-column(?: [^"]*)?"[^>]*style="([^"]*)"/);
  assert.ok(m, 'column 应输出内联 style');
  return m[1];
}

test('column: 缺省纵向——vertical_align→justify、horizontal_align→align', () => {
  const style = columnStyle({ vertical_align: 'center', horizontal_align: 'right' });
  assert.match(style, /flex-direction:column/);
  assert.match(style, /justify-content:center/);
  assert.match(style, /align-items:flex-end/);
});

test('column: horizontal_align 不再被忽略（真机 g=vertical 时是 align-items）', () => {
  assert.match(columnStyle({ horizontal_align: 'left' }), /align-items:flex-start/);
  assert.match(columnStyle({ horizontal_align: 'center' }), /align-items:center/);
  assert.match(columnStyle({ horizontal_align: 'right' }), /align-items:flex-end/);
});

test('column: direction=horizontal 时 flex-direction:row 且两个 align 换轴', () => {
  const style = columnStyle({ direction: 'horizontal', horizontal_align: 'right', vertical_align: 'center' });
  assert.match(style, /flex-direction:row/);
  assert.match(style, /justify-content:flex-end/);
  assert.match(style, /align-items:center/);
});

test('column: RAW camelCase align 字段同样生效', () => {
  const style = columnStyle({ horizontalAlign: 'center', verticalAlign: 'bottom' });
  assert.match(style, /align-items:center/);
  assert.match(style, /justify-content:flex-end/);
});

test('column: horizontal_spacing→column-gap（只在显式给值时输出）', () => {
  assert.match(columnStyle({ horizontal_spacing: '12px' }), /column-gap:12px/);
  assert.equal(/column-gap/.test(columnStyle({})), false);
});

test('column: 未写 align 时不输出 justify/align（交给 CSS 默认）', () => {
  const style = columnStyle({});
  assert.equal(/justify-content/.test(style), false);
  assert.equal(/align-items/.test(style), false);
});

/* ---- column 宽度四种子形态（真机 Kn()）---- */

test('column: 未写 width 时不输出宽度（真机默认 auto 贴内容宽，不是等分满行）', () => {
  const style = columnStyle({});
  assert.equal(/width:/.test(style), false);
  assert.equal(/flex-grow/.test(style), false);
  assert.equal(/flex-basis/.test(style), false);
});

test('column: width="weighted" → flex-basis:0 + flex-grow:weight', () => {
  const style = columnStyle({ width: 'weighted', weight: 2 });
  assert.match(style, /flex-basis:0/);
  assert.match(style, /flex-grow:2/);
});

test('column: width="auto" → width:auto，不参与分配空间', () => {
  const style = columnStyle({ width: 'auto' });
  assert.match(style, /width:auto/);
  assert.equal(/flex-grow/.test(style), false);
  assert.equal(/flex-basis/.test(style), false);
});

test('column_set: vertical_align 被忽略（真机 disableVerticalConfig）', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{
      tag: 'column_set', vertical_align: 'center',
      columns: [{ tag: 'column', elements: [{ tag: 'markdown', content: 'x' }] }],
    }] },
  });
  const m = html.match(/class="universal-card-column-set"[^>]*style="([^"]*)"/);
  assert.ok(m, 'column_set 应输出内联 style');
  assert.equal(/align-items:center/.test(m[1]), false);
  assert.match(m[1], /align-items:stretch/);
});

/* ---- overflow 折叠按钮组 ---- */

test('overflow: 不再被静默丢弃，输出「…」触发器', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{ tag: 'overflow', options: [
      { text: { tag: 'plain_text', content: '按钮 4' }, value: 'button_4' },
    ] }] },
  });
  // 此前该 tag 未注册 → renderElement 返回 null，整块消失
  assert.match(html, /universal-card-overflow/);
  assert.match(html, /ud-icon_more_outlined/);
});

test('overflow: 静态预览不输出菜单（无交互能力）', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{ tag: 'overflow', options: [
      { text: { tag: 'plain_text', content: '按钮 4' }, value: 'button_4' },
    ] }] },
  });
  assert.equal(html.includes('universal-card-overflow__menu'), false);
  assert.equal(html.includes('<details'), false);
});

test('overflow: interactive 输出菜单项文案与跳转', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{ tag: 'overflow', options: [
      { text: { tag: 'plain_text', content: '按钮 4' }, value: 'button_4' },
      { text: { tag: 'plain_text', content: '按钮 5' }, value: 'button_5', multi_url: { url: 'https://feishu.cn' } },
    ] }] },
  }, { interactive: true });
  assert.match(html, /<details[^>]*class="universal-card-overflow"/);
  assert.match(html, />按钮 4</);
  assert.match(html, /<a[^>]*href="https:\/\/feishu\.cn"[^>]*>按钮 5</);
});

/* ---- interactive_container 边框语义 ---- */

function icBorder(ic) {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{ tag: 'interactive_container', elements: [{ tag: 'markdown', content: 'x' }], ...ic }] },
  });
  const m = html.match(/class="universal-card-interactive-container(?: [^"]*)?"[^>]*style="([^"]*)"/);
  return m ? m[1] : '';
}

test('interactive_container: has_border=true 时 border_color 生效', () => {
  // grey 作为描边色走 interactive_container.border_color token 表 → N350（--line-border-component），
  // 不是正文灰 N600（resolveColor('grey') 会给出 #646a73，描边深一档）
  assert.match(icBorder({ has_border: true, border_color: 'grey' }), /border:1px solid var\(--line-border-component\)/);
});

test('interactive_container: border_color 带档位时仍走色阶（grey-350 → N350）', () => {
  assert.match(icBorder({ has_border: true, border_color: 'grey-350' }), /border:1px solid #d0d3d6/);
});

test('interactive_container: has_border=false 时 border_color 不生效', () => {
  // 官方语义：border_color 仅在 has_border 为 true 时生效
  assert.equal(/border:/.test(icBorder({ has_border: false, border_color: 'grey' })), false);
});

test('interactive_container: 只写 border_color 不画边框', () => {
  assert.equal(/border:/.test(icBorder({ border_color: 'grey' })), false);
});

test('interactive_container: has_border=true 无 border_color 走默认边框类', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: { elements: [{ tag: 'interactive_container', has_border: true, elements: [{ tag: 'markdown', content: 'x' }] }] },
  });
  assert.match(html, /universal-card-interactive-container--bordered/);
});

/* ---- markdown 前缀图标（icon）---- */

function mdHtml(icon, extra = {}) {
  return renderDslToString({
    schema: '2.0',
    body: { elements: [{ tag: 'markdown', content: '文本', icon, ...extra }] },
  });
}

test('markdown: 输出 standard_icon 前缀图标（此前整块丢弃）', () => {
  const html = mdHtml({ tag: 'standard_icon', token: 'chat_outlined', color: 'orange' });
  assert.match(html, /universal-card-markdown__icon/);
  assert.match(html, /ud-icon_chat_outlined/);
  assert.match(html, /color:#c25705/);
});

test('markdown: 图标默认尺寸走真机 j(字号)，不是 1:1 跟随字号', () => {
  // 引擎 j()：≤16 → 字号+2；>16 → 1.15 倍取偶。14px 正文 → 16px 图标。
  for (const [size, px] of [['small', 14], ['normal', 16], ['heading', 18]]) {
    const html = mdHtml({ tag: 'standard_icon', token: 'chat_outlined' }, { text_size: size });
    assert.match(html, new RegExp(`ud-icon_chat_outlined" style="font-size:${px}px`), `${size} 应为 ${px}px`);
  }
});

test('markdown: 图标 wrapper 与正文行高一致，右侧间距 8px（对齐真机）', () => {
  const html = mdHtml({ tag: 'standard_icon', token: 'chat_outlined' }, { text_size: 'normal' });
  // text_size normal → lineHeight 22+2=24
  assert.match(html, /universal-card-markdown__icon_wrapper" style="height:24px"/);
  assert.match(ALL_CSS, /\.universal-card-markdown__icon_wrapper\s*\{[^}]*margin-right:\s*8px/);
});

test('markdown: 首元素是 heading 时按 heading 档给图标尺寸并与标题对齐', () => {
  // 引擎 Aa(level)：heading1 图标 22px；wrapper 高度/上边距取标题行高/marginTop。
  const html = mdHtml({ tag: 'standard_icon', token: 'chat_outlined' }, {});
  const withHeading = renderDslToString({
    schema: '2.0',
    body: { elements: [{
      tag: 'markdown',
      content: '# 标题\n正文',
      icon: { tag: 'standard_icon', token: 'chat_outlined' },
    }] },
  });
  assert.match(withHeading, /universal-card-markdown__icon_wrapper" style="height:28px;margin-top:10px"/);
  assert.match(withHeading, /ud-icon_chat_outlined" style="font-size:22px/);
  // 无 heading 时仍是正文档
  assert.match(html, /ud-icon_chat_outlined" style="font-size:16px/);
});

test('markdown: 显式 size 覆盖字号跟随（支持宽高两值）', () => {
  const html = mdHtml({ tag: 'standard_icon', token: 'chat_outlined', size: '20px' });
  assert.match(html, /ud-icon_chat_outlined" style="font-size:20px/);
  const rect = mdHtml({ tag: 'standard_icon', token: 'chat_outlined', size: '10px 12px' });
  assert.match(rect, /ud-icon_chat_outlined" style="font-size:10px;width:10px;height:12px/);
});

test('markdown: custom_icon 用 img_key 出 <img>，默认尺寸同 standard_icon', () => {
  const html = mdHtml({ tag: 'custom_icon', img_key: 'img_v2_abc' });
  assert.match(html, /universal-card-markdown__icon/);
  assert.match(html, /<img[^>]*src="img_v2_abc"/);
  assert.match(html, /width:16px;height:16px/);
});

test('markdown: 无 icon 时不输出图标容器', () => {
  const html = mdHtml(undefined);
  assert.equal(html.includes('universal-card-markdown__icon'), false);
});

test('config.width_mode 经 DSL → RAW 透传到根节点', () => {
  const make = (widthMode) => ({
    schema: '2.0',
    ...(widthMode ? { config: { width_mode: widthMode } } : {}),
    body: { elements: [{ tag: 'markdown', content: 'x' }] },
  });
  assert.match(renderDslToString(make('compact')), /universal-card-root--width-compact/);
  assert.match(renderDslToString(make('fill')), /universal-card-root--width-fill/);
  assert.match(renderDslToString(make(undefined)), /universal-card-root--width-default/);
});
