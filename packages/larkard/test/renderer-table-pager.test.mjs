/**
 * 表格翻页（table pagination）：静态输出 + SSR 水合脚本。
 * 对齐真机 antd Table：pageSize 缺省 5、hideOnSinglePage、只显示「当前/总页数 + 上下页」。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { renderCardToString, renderDslToString } from '../dist/renderer/index.js';
import {
  hydrateFeishuTablePagers,
  feishuTablePagerHydrateScript,
  feishuTablePagerHydrateJs,
} from '../dist/renderer/browser.js';

const mkTable = (rowCount, extra = {}) => ({
  schema: '2.0',
  body: { elements: [{
    tag: 'table',
    columns: [{ name: 'rank', display_name: '排名', data_type: 'text' }],
    rows: Array.from({ length: rowCount }, (_, i) => ({ rank: String(i + 1) })),
    ...extra,
  }] },
});

const rowTags = (html) => html.match(/<tr class="universal-card-table__row[^"]*"[^>]*>/g) || [];

test('table: 未写 page_size 按真机缺省 5 行/页', () => {
  const html = renderDslToString(mkTable(6));
  assert.equal(rowTags(html).length, 6);
  assert.equal(rowTags(html).filter((t) => t.includes('hidden')).length, 1);
  assert.match(html, /universal-card-table__pager/);
  assert.match(html, /universal-card-table__pager-total">1\/2</);
});

test('table: 单页（rows <= pageSize）不渲染翻页器（hideOnSinglePage）', () => {
  const html = renderDslToString(mkTable(5));
  assert.equal(html.includes('universal-card-table__pager'), false);
  assert.equal(rowTags(html).filter((t) => t.includes('hidden')).length, 0);
});

test('table: 翻页器只出「总数 + 上一页 + 下一页」，首页时上一页 disabled', () => {
  const html = renderDslToString(mkTable(12, { page_size: 5 }));
  assert.match(html, /pager-total">1\/3</);
  const prev = /<button([^>]*data-feishu-table-dir="-1"[^>]*)>/.exec(html);
  const next = /<button([^>]*data-feishu-table-dir="1"[^>]*)>/.exec(html);
  assert.ok(prev && next);
  assert.match(prev[1], /\bdisabled=""/);
  assert.equal(/\bdisabled/.test(next[1]), false);
  // 图标走 ud 图标字体，与真机 LeftOutlined / RightOutlined 同 token
  assert.match(html, /ud-icon_left_outlined/);
  assert.match(html, /ud-icon_right_outlined/);
  // 真机卡片隐藏数字页码
  assert.equal(html.includes('pager-item'), false);
});

test('table: page_size 按官方 [1,10] 夹紧', () => {
  // 0 / 负数 → 1 行/页（4 页）
  for (const ps of [0, -3]) {
    const html = renderDslToString(mkTable(4, { page_size: ps }));
    assert.match(html, /pager-total">1\/4</, `page_size=${ps}`);
    assert.equal(rowTags(html).filter((t) => t.includes('hidden')).length, 3);
  }
  // 99 → 10 行/页（4 行仍然单页）
  const big = renderDslToString(mkTable(4, { page_size: 99 }));
  assert.equal(big.includes('universal-card-table__pager'), false);
});

test('table: RAW camelCase pageSize 同样驱动分页', () => {
  const raw = {
    json_card: {
      body: { tag: 'body', property: { elements: [{
        tag: 'table',
        property: {
          pageSize: 2,
          columns: [{ name: 'rank', displayName: '排名', dataType: 'text' }],
          rows: Array.from({ length: 5 }, (_, i) => ({ rank: { data: String(i + 1) } })),
        },
      }] } },
    },
  };
  const html = renderCardToString(raw);
  assert.match(html, /pager-total">1\/3</);
  assert.equal(rowTags(html).filter((t) => t.includes('hidden')).length, 3);
});

test('table-pager: hydrate 在无 DOM 环境返回 0（不抛错）', () => {
  assert.equal(hydrateFeishuTablePagers(null), 0);
});

test('table-pager: SSR 脚本自包含（绑定器 + DOM ready 扫描）', () => {
  const js = feishuTablePagerHydrateJs();
  assert.match(js, /data-feishu-table-pager/);
  assert.match(js, /data-feishu-table-page/);
  assert.match(js, /hidden/);
  assert.match(js, /DOMContentLoaded/);
  const tag = feishuTablePagerHydrateScript();
  assert.match(tag, /^<script data-feishu-table-pager-hydrate>/);
  assert.match(tag, /<\/script>$/);
});
