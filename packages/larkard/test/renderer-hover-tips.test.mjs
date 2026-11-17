/**
 * hover_tips / disabled_tips 统一渲染测试（node --test）。
 * 飞书 RAW 用 hoverTips / disabledTips（部分文本叶子保留 snake_case），公开 DSL 用 hover_tips /
 * disabled_tips；渲染器统一转成根节点的原生 title。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCardToString, renderDslToString } from '../dist/renderer/index.js';

const dslTip = (content) => ({ tag: 'plain_text', content });
const rawTip = (content) => ({ tag: 'plain_text', property: { content } });

const body = (elements) => ({ schema: '2.0', body: { elements } });
const rawBody = (elements) => ({
  json_card: { schema: '2.0', body: { tag: 'body', property: { elements } } },
});

/* ---- button ---- */

test('button: DSL hover_tips → title', () => {
  const html = renderDslToString(body([{
    tag: 'button',
    text: '打开',
    hover_tips: dslTip('悬浮提示'),
    behaviors: [{ type: 'open_url', default_url: { url: 'https://x.cn' } }],
  }]));
  assert.match(html, /<a[^>]*title="悬浮提示"/);
});

test('button: 禁用时只显示 disabled_tips，不回退 hover_tips', () => {
  const html = renderDslToString(body([{
    tag: 'button',
    text: '打开',
    disabled: true,
    hover_tips: dslTip('不应出现'),
    disabled_tips: dslTip('禁用提示'),
  }]));
  assert.match(html, /<span[^>]*title="禁用提示"/);
  assert.doesNotMatch(html, /不应出现/);
});

test('button: RAW hoverTips / disabledTips 均生效', () => {
  const enabled = renderCardToString(rawBody([{
    tag: 'button',
    property: {
      text: rawTip('打开'),
      hoverTips: rawTip('RAW 悬浮提示'),
      behaviors: [{ type: 'open_url', action: { url: 'https://x.cn' } }],
    },
  }]));
  assert.match(enabled, /title="RAW 悬浮提示"/);

  const disabled = renderCardToString(rawBody([{
    tag: 'button',
    property: {
      text: rawTip('打开'),
      disabled: true,
      hoverTips: rawTip('不应出现'),
      disabledTips: rawTip('RAW 禁用提示'),
    },
  }]));
  assert.match(disabled, /title="RAW 禁用提示"/);
  assert.doesNotMatch(disabled, /不应出现/);
});

/* ---- video ---- */

test('video: hover_tips 同时支持封面壳与原生 <video>', () => {
  const dsl = body([{
    tag: 'video',
    file_key: 'file_v3_demo',
    hover_tips: dslTip('视频提示'),
  }]);
  const shell = renderDslToString(dsl);
  assert.match(shell, /class="universal-card-video"[^>]*title="视频提示"/);

  const playable = renderDslToString(dsl, {
    resolveMedia: (p, kind) => (kind === 'video' && p.fileID === 'file_v3_demo'
      ? 'https://cdn.example.com/demo.mp4'
      : null),
  });
  assert.match(playable, /<video[^>]*title="视频提示"/);
});

/* ---- interactive_container ---- */

test('interactive_container: RAW hoverTips → title', () => {
  const html = renderCardToString(rawBody([{
    tag: 'interactive_container',
    property: {
      hoverTips: rawTip('容器提示'),
      elements: [{ tag: 'markdown', property: { elements: [rawTip('内容')] } }],
    },
  }]));
  assert.match(html, /universal-card-interactive-container[^"]*"[^>]*title="容器提示"/);
});

test('interactive_container: 禁用时展示 disabled_tips', () => {
  const html = renderCardToString(rawBody([{
    tag: 'interactive_container',
    property: {
      disabled: true,
      hoverTips: rawTip('不应出现'),
      disabled_tips: rawTip('容器禁用提示'),
      elements: [],
    },
  }]));
  assert.match(html, /universal-card-interactive-container--disabled[^>]*title="容器禁用提示"/);
  assert.doesNotMatch(html, /不应出现/);
});

/* ---- checker ---- */

test('checker: hover_tips / disabled_tips 落在勾选器根节点', () => {
  const enabled = renderDslToString(body([{
    tag: 'checker',
    text: '待办',
    hover_tips: dslTip('勾选提示'),
  }]));
  assert.match(enabled, /<label[^>]*title="勾选提示"/);

  const disabled = renderDslToString(body([{
    tag: 'checker',
    text: '待办',
    disabled: true,
    hover_tips: dslTip('不应出现'),
    disabled_tips: dslTip('勾选禁用提示'),
  }]));
  assert.match(disabled, /<div[^>]*title="勾选禁用提示"/);
  assert.doesNotMatch(disabled, /不应出现/);
});

/* ---- select_img ---- */

test('select_img: 选项 hover_tips / disabled_tips → item title', () => {
  const enabled = renderDslToString(body([{
    tag: 'select_img',
    options: [{ img_key: 'img_v3_a', value: 'a', hover_tips: dslTip('选项提示') }],
  }]));
  assert.match(enabled, /universal-card-select-img__item[^>]*title="选项提示"/);

  const disabled = renderDslToString(body([{
    tag: 'select_img',
    disabled: true,
    disabled_tips: dslTip('组件禁用提示'),
    options: [{
      img_key: 'img_v3_a',
      value: 'a',
      hover_tips: dslTip('不应出现'),
      disabled_tips: dslTip('选项禁用提示'),
    }],
  }]));
  assert.match(disabled, /universal-card-select-img__item--disabled[^>]*title="选项禁用提示"/);
  assert.doesNotMatch(disabled, /不应出现/);
});
