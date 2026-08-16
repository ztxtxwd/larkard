/**
 * 基础冒烟测试（node --test）。针对构建产物 dist/index.js。
 *   npm run build && npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderCardToString, renderCardToStringAsync, fetchCardMessage,
  arrayBufferToBase64, registerComponent, h, renderDslToString,
} from '../dist/index.js';

const card = {
  json_card: {
    schema: '2.0',
    header: { tag: 'card_header', property: { template: 'green',
      title: { tag: 'plain_text', property: { content: '标题' } } } },
    body: { tag: 'body', property: { elements: [
      { tag: 'markdown', property: { textAlign: 'center', elements: [
        { tag: 'plain_text', property: { content: '正文', textStyle: { attributes: ['bold'], color: 'green' } } },
      ] } },
      { tag: 'hr', property: {} },
    ] } },
  },
};

test('renders header with template color', () => {
  const html = renderCardToString(card);
  assert.match(html, /universal-card-header--green/);
  assert.match(html, /#d0f5ce/); // green header bg
  assert.match(html, /标题/);
});

test('named color green = #1a7526, bold applied, center align', () => {
  const html = renderCardToString(card);
  assert.match(html, /#1a7526/);
  assert.match(html, /font-weight:600/);
  assert.match(html, /text-align:center/);
});

test('hr renders', () => {
  const html = renderCardToString(card);
  assert.match(html, /universal-card-hr/);
});

// 真机 RAW：DSL text_size 被归一进 textStyle.size / platformSize，不再保留 text_size 字段。
// 回归：notation 必须落到 12px，不能回退成正文 14px。
test('RAW markdown textStyle.size=notation → 12px', () => {
  const html = renderCardToString({
    json_card: {
      body: {
        tag: 'body',
        property: {
          elements: [{
            tag: 'markdown',
            property: {
              elements: [{
                tag: 'plain_text',
                property: {
                  content: '还差 18,800 步即可达成本周目标，加油！',
                  textStyle: { color: 'grey' },
                },
              }],
              textAlign: 'left',
              textStyle: {
                attributes: [],
                platformSize: { mobile: 'notation', pc: 'notation' },
                size: 'notation',
              },
            },
          }],
        },
      },
    },
  });
  assert.match(html, /还差 18,800 步即可达成本周目标，加油！/);
  assert.match(html, /font-size:12px/);
  assert.match(html, /line-height:20px/);
});

test('DSL text_size=notation 与 RAW textStyle.size 字号一致', () => {
  const dslHtml = renderDslToString({
    schema: '2.0',
    body: {
      direction: 'vertical',
      elements: [{
        tag: 'markdown',
        content: "<font color='grey'>还差 18,800 步即可达成本周目标，加油！</font>",
        text_align: 'left',
        text_size: 'notation',
      }],
    },
  });
  const rawHtml = renderCardToString({
    json_card: {
      body: {
        tag: 'body',
        property: {
          elements: [{
            tag: 'markdown',
            property: {
              elements: [{
                tag: 'plain_text',
                property: {
                  content: '还差 18,800 步即可达成本周目标，加油！',
                  textStyle: { color: 'grey' },
                },
              }],
              textStyle: { size: 'notation', platformSize: { pc: 'notation', mobile: 'notation' } },
            },
          }],
        },
      },
    },
  });
  assert.match(dslHtml, /font-size:12px/);
  assert.match(rawHtml, /font-size:12px/);
});

test('header bg image injected as base64', () => {
  const html = renderCardToString(card);
  assert.match(html, /data:image\/png;base64,/);
});

test('unknown tag is skipped gracefully', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: {
    elements: [{ tag: 'totally_unknown', property: {} }],
  } } } });
  assert.match(html, /universal-card-body/);
});

test('custom component can be registered', () => {
  registerComponent('my_badge', (el) => h('span', { className: 'badge' }, el.property?.content || ''));
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: {
    elements: [{ tag: 'my_badge', property: { content: 'NEW' } }],
  } } } });
  assert.match(html, /class="badge">NEW</);
});

test('img with resolveImage returning null does not crash (renders placeholder)', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: {
    elements: [{ tag: 'img', property: { imageID: '33', alt: '' } }],
  } } } }, { resolveImage: () => null });
  assert.match(html, /universal-card-body/);
  assert.match(html, /universal-card-image__placeholder/);
});

test('button: markdown text flattened to plain text (no rich formatting / no <br>)', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'button', property: {
      type: 'default',
      actions: [{ type: 'open_url', action: { url: 'https://x.com/a' } }],
      text: { tag: 'markdown', property: { elements: [
        { tag: 'plain_text', property: { content: '🍲 火锅 ' } },
        // text_tag 徽章：只取内层文字
        { tag: 'text_tag', property: { color: 'green', text: { tag: 'plain_text', property: { content: '⭐ 推荐' } } } },
        { tag: 'br', property: {} },
        { tag: 'plain_text', property: { content: '热闹', textStyle: { attributes: ['bold'], color: 'grey' } } },
      ] } },
    } },
  ] } } } });
  // 全部文字平铺成一行纯文本，无换行/格式标签
  assert.match(html, /🍲 火锅 ⭐ 推荐 热闹/);
  assert.match(html, /href="https:\/\/x\.com\/a"/);  // open_url 链接保留
  // 按钮内不应出现富文本结构：无 markdown 容器、无 <br>、无 text_tag、无加粗
  const btn = html.match(/<a class="universal-card-button[\s\S]*?<\/a>/)[0];
  assert.doesNotMatch(btn, /universal-card-markdown/);
  assert.doesNotMatch(btn, /<br>/);
  assert.doesNotMatch(btn, /text-tag/);
  assert.doesNotMatch(btn, /font-weight/);
});

test('button: non-link action (no url) renders as static, non-clickable span', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    // form_submit / action_request：无 URL，预览里不可交互
    { tag: 'button', property: { type: 'primary', actionType: 'form_submit',
      actions: [{ type: 'action_request', action: { actionID: 'act_x' } }],
      text: { tag: 'plain_text', property: { content: '提交' } } } },
  ] } } } });
  // 保留按钮外观但不可点：是 span.--static，不是 <a>/<button>
  assert.match(html, /<span[^>]*universal-card-button--static[^>]*>提交<\/span>/);
  assert.doesNotMatch(html, /<a[^>]*universal-card-button/);
  assert.doesNotMatch(html, /<button[^>]*universal-card-button/);
});

test('form: passthrough container renders inner elements (button inside is not dropped)', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'form', property: { name: 'f1', elements: [
      { tag: 'input', property: { placeholder: '请输入餐厅' } },
      { tag: 'button', property: { type: 'primary', actionType: 'form_submit',
        actions: [{ type: 'action_request', action: { actionID: 'a' } }],
        text: { tag: 'plain_text', property: { content: '提交' } } } },
    ] } },
  ] } } } });
  // 表单内的输入框 + 提交按钮都要在（之前整块被跳过而丢失）
  assert.match(html, /universal-card-input--static/);
  assert.match(html, /请输入餐厅/);
  assert.match(html, /<span[^>]*universal-card-button--static[^>]*>提交<\/span>/);
});

test('button: open_url action stays a clickable <a> link', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'button', property: { type: 'default', actionType: 'multi',
      actions: [{ type: 'open_url', action: { url: 'https://example.com/submit/custom' } }],
      text: { tag: 'plain_text', property: { content: '提交' } } } },
  ] } } } });
  assert.match(html, /<a[^>]*universal-card-button[^>]*href="https:\/\/example\.com\/submit\/custom"/);
  assert.doesNotMatch(html, /button--static/);
});

test('RAW: body without tag still renders (tag defaulted to "body")', () => {
  // 真实 RAW 卡片的 body 常无 tag，直接 { elements: [...] }；
  // 之前 renderElement 因 !el.tag 直接丢弃整个 body，只剩标题。
  const html = renderCardToString({ json_card: {
    header: { tag: 'card_header', property: { template: 'green',
      title: { tag: 'plain_text', property: { content: '标题' } } } },
    body: { elements: [
      { tag: 'markdown', property: { elements: [
        { tag: 'plain_text', property: { content: '正文还在' } },
      ] } },
    ] },
  } });
  assert.match(html, /universal-card-body/);
  assert.match(html, /正文还在/);
});

test('RAW: div renders single content from property.text (markdown)', () => {
  // 真实 RAW 的 div 把内容挂在 property.text（单个 markdown），而非 property.elements。
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'div', property: { text: { tag: 'markdown', property: { elements: [
      { tag: 'plain_text', property: { content: 'div 内的文字' } },
    ] } } } },
  ] } } } });
  assert.match(html, /universal-card-div/);
  assert.match(html, /div 内的文字/);
});

// ---- 异步渲染（自动拉图）：用注入的 mock fetch，无需联网 ----

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG 魔数
const PNG_B64 = arrayBufferToBase64(PNG_BYTES.buffer);

/** 造一个 mock fetch：消息接口返回带 json_card+json_attachment 的 content；资源接口返回 PNG 字节 */
function makeMockFetch({ onResource } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/resources/')) {
      if (onResource) onResource(url);
      return {
        ok: true,
        headers: { get: (h2) => (h2.toLowerCase() === 'content-type' ? 'image/png' : null) },
        arrayBuffer: async () => PNG_BYTES.buffer,
      };
    }
    // 消息接口：json_card 是双重编码的字符串
    const jsonCard = JSON.stringify({
      schema: '2.0',
      body: { tag: 'body', property: { elements: [
        { tag: 'img', property: { imageID: '19', alt: '' } },
      ] } },
    });
    const content = JSON.stringify({
      json_card: jsonCard,
      json_attachment: { images: { 19: { origin_key: 'img_v3_fake' } } },
    });
    return {
      ok: true,
      json: async () => ({ code: 0, data: { items: [{ message_id: 'om_test', body: { content } }] } }),
    };
  };
  return { fetchImpl, calls };
}

test('async: messageId + token fetches message and inlines image as data URI', async () => {
  const { fetchImpl } = makeMockFetch();
  const html = await renderCardToStringAsync('om_test', { accessToken: 't-xxx', fetch: fetchImpl });
  assert.match(html, /universal-card-body/);
  assert.match(html, new RegExp(`<img[^>]+src="data:image/png;base64,${PNG_B64}"`));
  assert.doesNotMatch(html, /universal-card-image__placeholder/);
});

test('async: card object + token + json_attachment inlines image', async () => {
  const { fetchImpl } = makeMockFetch();
  const input = {
    json_card: { body: { tag: 'body', property: { elements: [
      { tag: 'img', property: { imageID: '19', alt: '' } },
    ] } } },
    json_attachment: { images: { 19: { origin_key: 'img_v3_fake' } } },
    messageId: 'om_test',
  };
  const html = await renderCardToStringAsync(input, { accessToken: 't-xxx', fetch: fetchImpl });
  assert.match(html, /src="data:image\/png;base64,/);
});

test('async: card object WITHOUT token renders placeholder (no fetch)', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true, arrayBuffer: async () => PNG_BYTES.buffer, headers: { get: () => 'image/png' } }; };
  const input = {
    json_card: { body: { tag: 'body', property: { elements: [
      { tag: 'img', property: { imageID: '19', alt: '' } },
    ] } } },
    json_attachment: { images: { 19: { origin_key: 'img_v3_fake' } } },
  };
  const html = await renderCardToStringAsync(input, { fetch: fetchImpl }); // 无 accessToken
  assert.match(html, /universal-card-image__placeholder/);
  assert.equal(called, false, '无 token 时不应发起任何图片请求');
});

test('async: messageId WITHOUT token throws', async () => {
  await assert.rejects(
    () => fetchCardMessage('om_test', {}),
    /accessToken/,
  );
});

test('async: only references images actually used by img elements (skips orphan attachment keys)', async () => {
  const resourceUrls = [];
  const { fetchImpl } = makeMockFetch({ onResource: (u) => resourceUrls.push(u) });
  // 卡片只引用 imageID 19；附件表里还有个废弃的 38，不应被拉取
  const input = {
    json_card: { body: { tag: 'body', property: { elements: [
      { tag: 'img', property: { imageID: '19', alt: '' } },
    ] } } },
    json_attachment: { images: { 19: { origin_key: 'img_v3_used' }, 38: { origin_key: 'img_v3_orphan' } } },
    messageId: 'om_test',
  };
  await renderCardToStringAsync(input, { accessToken: 't-xxx', fetch: fetchImpl });
  assert.equal(resourceUrls.length, 1, '应只拉取被引用的那张图');
  assert.match(resourceUrls[0], /img_v3_used/);
});

test('a component returning a node with null props does not crash the tree', () => {
  // Regression: a node whose `props` is null (built as a literal, not via h())
  // must not throw Object.keys(null) and take down the whole render.
  registerComponent('bad_props', () => ({ tag: 'span', props: null, children: ['x'] }));
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: {
    elements: [
      { tag: 'bad_props', property: {} },
      { tag: 'markdown', property: { elements: [
        { tag: 'plain_text', property: { content: '正文还在' } },
      ] } },
    ],
  } } } });
  assert.match(html, /<span>x<\/span>/);
  assert.match(html, /正文还在/);
});

// ---- 图标 standard_icon / ud_icon ----

const iconCard = (property) => ({
  json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'standard_icon', property },
  ] } } },
});

test('icon: renders <i> with ud-icon_<token> class and size/color', () => {
  const html = renderCardToString(iconCard({ token: 'warning_outlined', color: 'red', size: 'large2' }));
  assert.match(html, /class="universal-card-icon ud-icon_warning_outlined"/);
  assert.match(html, /font-size:18px/); // large2 -> 18
  assert.match(html, /color:#e22e28/);  // red
});

test('icon: ud_icon tag shares the same renderer', () => {
  const html = renderCardToString({
    json_card: { body: { tag: 'body', property: { elements: [
      { tag: 'ud_icon', property: { token: 'info_outlined', color: 'blue' } },
    ] } } },
  });
  assert.match(html, /ud-icon_info_outlined/);
  assert.match(html, /color:#336df4/); // blue
});

test('icon: default size 16px when size missing/unknown', () => {
  const html = renderCardToString(iconCard({ token: 'add_outlined' }));
  assert.match(html, /font-size:16px/);
});

test('icon: _colorful token does NOT get a color override', () => {
  const html = renderCardToString(iconCard({ token: 'activity_colorful', color: 'red' }));
  assert.match(html, /ud-icon_activity_colorful/);
  assert.doesNotMatch(html, /color:#e22e28/); // 彩色图标自带色，不覆盖
});

test('icon: no/unknown named color → no color (inherits currentColor)', () => {
  const html = renderCardToString(iconCard({ token: 'add_outlined' }));
  assert.doesNotMatch(html, /color:#/);
});

test('icon: direct hex color passes through', () => {
  const html = renderCardToString(iconCard({ token: 'add_outlined', color: '#123456' }));
  assert.match(html, /color:#123456/);
});

test('icon: missing token → skipped, no crash', () => {
  const html = renderCardToString(iconCard({ color: 'red' }));
  assert.doesNotMatch(html, /ud-icon_/);
});

test('icon: ICON_CODEPOINTS maps warning_outlined to fa0c', async () => {
  const { ICON_CODEPOINTS } = await import('../dist/index.js');
  assert.equal(ICON_CODEPOINTS.warning_outlined, 'fa0c');
});

test('icon: ud_icon color/size nested under property.style is honored', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'ud_icon', property: { token: 'warning_outlined', style: { color: 'red', size: 'large3' } } },
  ] } } } });
  assert.match(html, /ud-icon_warning_outlined/);
  assert.match(html, /font-size:20px/); // large3 -> 20
  assert.match(html, /color:#e22e28/);  // red（取自 style.color）
});

test('div: leading icon (property.udIcon || icon) renders once with text', () => {
  // RAW 真实形态：div 把前置图标挂在 property.icon(standard_icon) + property.udIcon(ud_icon)，
  // 二者同一图标，引擎取 udIcon || icon 只渲一次；文本在 property.text。
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'div', property: {
      icon: { tag: 'standard_icon', property: { token: 'warning_outlined', color: 'red' } },
      udIcon: { tag: 'ud_icon', property: { token: 'warning_outlined', style: { color: 'red' } } },
      text: { tag: 'markdown', property: { elements: [
        { tag: 'plain_text', property: { content: '风险提示' } },
      ] } },
    } },
  ] } } } });
  assert.match(html, /universal-card-div--with-icon/);
  assert.match(html, /universal-card-div__icon_wrapper/);
  assert.match(html, /风险提示/);
  // 同一图标只渲染一次（udIcon 优先，icon 不再重复出图）
  assert.equal((html.match(/ud-icon_warning_outlined/g) || []).length, 1);
});

test('div: icon-less div still renders normally', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'div', property: { text: { tag: 'markdown', property: { elements: [
      { tag: 'plain_text', property: { content: '普通 div' } },
    ] } } } },
  ] } } } });
  assert.match(html, /universal-card-div/);
  assert.doesNotMatch(html, /div--with-icon/);
  assert.match(html, /普通 div/);
});

// ---- 人员 person_v1 / person_list ----

// person 元素只带 ID；姓名/头像 key 在 json_attachment.persons（按 open_id 索引）。
const personCard = (elements) => ({
  json_card: { body: { tag: 'body', property: { elements } } },
  json_attachment: { persons: {
    ou_a: { content: '刘广宇', avatar_key: 'v3_00ig_abc' },
    ou_b: { content: '徐明洋', avatar_key: 'v3_00te_def' },
    ou_noavatar: { content: '李于冬' }, // 有名字无头像 key
  } },
});

test('person_v1: renders avatar (public key) + name from json_attachment.persons', () => {
  const html = renderCardToString(personCard([
    { tag: 'person_v1', property: { userID: 'ou_a', showAvatar: true, showName: true, size: 'small' } },
  ]));
  assert.match(html, /universal-card-person\b/);
  assert.match(html, /universal-card-person__content/);
  assert.match(html, /刘广宇/);
  // 头像走公开 static-resource；类名对齐真机 internal-avatar
  assert.match(html, /<img[^>]+universal-card-person__internal-avatar[^>]+src="[^"]*v3_00ig_abc[^"]*"/);
  assert.match(html, /static-resource\/v1\//);
});

test('person_v1: avatar size — small normal=24px；capsule=20px（lineHeight-4）', () => {
  const normal = renderCardToString(personCard([
    { tag: 'person_v1', property: { userID: 'ou_a', size: 'small', showAvatar: true, showName: true } },
  ]));
  assert.match(normal, /width:24px/);
  assert.match(normal, /height:24px/);

  const capsule = renderCardToString(personCard([
    { tag: 'person_v1', property: {
      userID: 'ou_a', size: 'small', showAvatar: true, showName: true, pillShaped: true,
    } },
  ]));
  assert.match(capsule, /universal-card-person--capsule/);
  assert.match(capsule, /width:20px/);
  assert.match(capsule, /height:20px/);
});

test('person_v1: name with no avatar_key → initial placeholder circle (no <img>)', () => {
  const html = renderCardToString(personCard([
    { tag: 'person_v1', property: { userID: 'ou_noavatar', showAvatar: true, showName: true } },
  ]));
  assert.match(html, /universal-card-person__avatar--placeholder/);
  assert.match(html, /李于冬/);
  // 占位首字「李」，不应有头像 <img>
  assert.doesNotMatch(html, /<img[^>]+person__internal-avatar/);
});

test('person_v1: only ID available (persons map missing) → fallback avatar + 赵天雄', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'person_v1', property: { userID: 'ou_fee541fd4a7377392026510149c17ad1', showAvatar: true, showName: true } },
  ] } } } }); // 无 json_attachment.persons
  assert.match(html, /universal-card-person\b/);
  assert.match(html, /赵天雄/);
  assert.match(html, /v3_0013s_f2d0e8ac-9d05-4aef-8f14-7486b1db129g/);
  assert.doesNotMatch(html, /universal-card-person__avatar--placeholder/);
});

test('person_v1: showName=false hides name; showAvatar=false hides avatar', () => {
  const noName = renderCardToString(personCard([
    { tag: 'person_v1', property: { userID: 'ou_a', showAvatar: true, showName: false } },
  ]));
  assert.doesNotMatch(noName, /universal-card-person__name/);
  assert.match(noName, /person__internal-avatar|person__avatar-wrapper/);

  const noAvatar = renderCardToString(personCard([
    { tag: 'person_v1', property: { userID: 'ou_a', showAvatar: false, showName: true } },
  ]));
  assert.doesNotMatch(noAvatar, /person__internal-avatar|person__avatar-wrapper/);
  assert.match(noAvatar, /刘广宇/);
});

test('person_list: combine 模式每人一组 avatar-name', () => {
  const html = renderCardToString(personCard([
    { tag: 'person_list', property: { showAvatar: true, showName: true, size: 'small',
      persons: [ { id: 'ou_a', type: 'user' }, { id: 'ou_b', type: 'user' } ] } },
  ]));
  assert.match(html, /universal-card-person-list/);
  assert.match(html, /person-list__content--combine/);
  assert.match(html, /刘广宇/);
  assert.match(html, /徐明洋/);
  assert.equal((html.match(/person-list__avatar-name/g) || []).length, 2);
});

test('person_list: no person resolvable → avatar-name 降级为 赵天雄（忽略纯文本 fallback）', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'person_list', fallback: { tag: 'markdown', property: { elements: [
      { tag: 'plain_text', property: { content: '徐明洋, 李于冬, 刘青磊, 任传喜' } },
    ] } },
    property: { showAvatar: true, showName: true, persons: [ { id: 'ou_x' }, { id: 'ou_y' } ] } },
  ] } } } }); // 无 persons 表；即使有 fallback 也走列表降级
  assert.match(html, /universal-card-person-list/);
  assert.equal((html.match(/person-list__avatar-name/g) || []).length, 2);
  assert.match(html, /赵天雄/);
  assert.match(html, /v3_0013s_f2d0e8ac-9d05-4aef-8f14-7486b1db129g/);
  assert.doesNotMatch(html, /徐明洋, 李于冬/);
});

test('person_list: no person resolvable and no element fallback → 赵天雄', () => {
  const html = renderCardToString({ json_card: { body: { tag: 'body', property: { elements: [
    { tag: 'person_list', property: { showAvatar: true, showName: true, size: 'small',
      persons: [ { id: 'ou_x' }, { id: 'ou_y' } ] } },
  ] } } } });
  assert.match(html, /universal-card-person-list/);
  assert.equal((html.match(/person-list__avatar-name/g) || []).length, 2);
  assert.match(html, /赵天雄/);
  assert.match(html, /v3_0013s_f2d0e8ac-9d05-4aef-8f14-7486b1db129g/);
});

test('person_list: 仅名字模式为蓝色姓名 + 全角逗号；葫芦串带 hollow mask', () => {
  const names = renderCardToString(personCard([
    { tag: 'person_list', property: {
      showAvatar: false, showName: true, size: 'medium',
      persons: [ { id: 'ou_a' }, { id: 'ou_b' } ],
    } },
  ]));
  assert.match(names, /reaction-user--blue/);
  assert.match(names, /reaction-user__comma/);
  assert.match(names, /，/);
  assert.doesNotMatch(names, /person-list__avatar-name/);

  const group = renderCardToString(personCard([
    { tag: 'person_list', property: {
      showAvatar: true, showName: false, size: 'medium',
      persons: [ { id: 'ou_a' }, { id: 'ou_b' } ],
    } },
  ]));
  assert.match(group, /person-list__avatar-group/);
  assert.match(group, /data:image\/svg\+xml/);
});
test('person: custom resolvePersonAvatar + avatarBaseURL override the URL', () => {
  const html = renderCardToString(personCard([
    { tag: 'person_v1', property: { userID: 'ou_a', showAvatar: true } },
  ]), { resolvePersonAvatar: (p) => `https://cdn.example.com/${p.avatar_key}.png` });
  assert.match(html, /src="https:\/\/cdn\.example\.com\/v3_00ig_abc\.png"/);
});

test('markdown inline <person>: renders person chip (fallback when no persons map)', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'markdown',
        content: "**销售顾问** <person id='on_28a68b6129e9b170b2cd14c2b8ff3cda' show_name=true show_avatar=true style='normal'></person>",
      }],
    },
  });
  assert.match(html, /销售顾问/);
  assert.match(html, /universal-card-person\b/);
  assert.match(html, /赵天雄/);
  assert.match(html, /v3_0013s_f2d0e8ac-9d05-4aef-8f14-7486b1db129g/);
  assert.doesNotMatch(html, /&lt;person/);
});

test('markdown inline <person>: 跟随正文字号（14px / 头像 18px），不是独立组件 medium', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'markdown',
        content: "<person id='ou_a' show_name=true show_avatar=true></person>",
      }],
    },
  });
  // 跟正文 14：字号 14、行高 22、头像 18（PERSON_FOLLOW_FONT）
  assert.match(html, /font-size:14px/);
  assert.match(html, /line-height:22px/);
  assert.match(html, /width:18px/);
  assert.match(html, /height:18px/);
  // 不应落到独立 person 的 medium（字号 20 / 头像 30）
  assert.doesNotMatch(html, /font-size:20px/);
  assert.doesNotMatch(html, /width:30px/);
});

test('standalone person_v1 无 size 仍为 medium（不受 markdown 跟随影响）', () => {
  const html = renderCardToString({
    json_card: { body: { tag: 'body', property: { elements: [
      { tag: 'person_v1', property: { userID: 'ou_a', showAvatar: true, showName: true } },
    ] } } },
    json_attachment: { persons: { ou_a: { content: '刘广宇', avatar_key: 'v3_x' } } },
  });
  assert.match(html, /font-size:20px/);
  assert.match(html, /width:30px/);
});

test('markdown inline <at>: no persons map → @张三 (not @open_id)', () => {
  const html = renderDslToString({
    schema: '2.0',
    body: {
      elements: [{
        tag: 'markdown',
        content: "请 <at id=on_28a68b6129e9b170b2cd14c2b8ff3cda></at> 确认",
      }],
    },
  });
  assert.match(html, /universal-card-markdown-at/);
  assert.match(html, /@张三/);
  assert.doesNotMatch(html, /@on_28a68b/);
});

test('markdown inline <at>: resolves name from persons map when available', () => {
  const html = renderCardToString({
    json_card: { body: { tag: 'body', property: { elements: [
      { tag: 'at', property: { userID: 'ou_a' } },
    ] } } },
    json_attachment: { persons: { ou_a: { content: '刘广宇', avatar_key: 'v3_x' } } },
  });
  assert.match(html, /@刘广宇/);
  assert.doesNotMatch(html, /@张三/);
});
