/**
 * table 组件参数完整性：官方 JSON 2.0 表格文档的字段逐项落地。
 * 文档：/feishu-cards/card-json-v2-components/content-components/table
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { renderCardToString, renderDslToString } from '../dist/renderer/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, '..', 'src', 'renderer', 'styles.css'), 'utf8');

const table = (columns, rows, extra = {}) => ({
  schema: '2.0',
  body: { elements: [{ tag: 'table', columns, rows, ...extra }] },
});

const one = (col, value, extra = {}) =>
  renderDslToString(table([{ name: 'x', display_name: 'X', ...col }], [{ x: value }], extra));

/* ---- 组件级参数 ---- */

test('table: header display_name 为空时与真机一致展示 "--"', () => {
  const html = renderDslToString(table([{ name: 'x', data_type: 'text' }], [{ x: 'a' }]));
  assert.match(html, /<span class="universal-card-table__th-text[^"]*"[^>]*>--<\/span>/);
});

test('table: element margin 生效（JSON 2.0 外边距）', () => {
  const html = renderDslToString(table(
    [{ name: 'x', display_name: 'X' }],
    [{ x: 'a' }],
    { margin: '8px 12px' },
  ));
  assert.match(html, /class="universal-card-table" style="margin:8px 12px 8px 12px;width:calc\(100% - 24px\)/);
});

test('table: freeze_first_column 输出 fixed-first（首列 sticky）', () => {
  const html = renderDslToString(table(
    [{ name: 'a', display_name: 'A' }, { name: 'b', display_name: 'B' }],
    [{ a: '1', b: '2' }],
    { freeze_first_column: true },
  ));
  assert.match(html, /class="universal-card-table universal-card-table--fixed-first"/);
  assert.match(CSS, /--fixed-first \.universal-card-table__th:first-child/);
  assert.match(CSS, /position: sticky/);
});

test('table: 列数超过 50 只渲染前 50 列', () => {
  const columns = Array.from({ length: 60 }, (_, i) => ({ name: `c${i}`, display_name: `C${i}` }));
  const row = Object.fromEntries(columns.map((c, i) => [c.name, String(i)]));
  const html = renderDslToString(table(columns, [row]));
  assert.equal((html.match(/<th class="universal-card-table__th"/g) || []).length, 50);
  assert.equal((html.match(/<col(?: |\/?>)/g) || []).length, 50);
});

test('table: 列宽按官方范围夹紧（px 80–600 / % 1–100）', () => {
  const html = renderDslToString(table([
    { name: 'a', display_name: 'A', width: '10px' },
    { name: 'b', display_name: 'B', width: '900px' },
    { name: 'c', display_name: 'C', width: '0%' },
    { name: 'd', display_name: 'D', width: '120%' },
  ], [{ a: '1', b: '2', c: '3', d: '4' }]));
  assert.match(html, /<col style="width:80px">/);
  assert.match(html, /<col style="width:600px">/);
  assert.match(html, /<col style="width:1%">/);
  assert.match(html, /<col style="width:100%">/);
});

test('table: vertical_align 落到单元格', () => {
  const html = renderDslToString(table([
    { name: 'top', display_name: 'T', vertical_align: 'top' },
    { name: 'bottom', display_name: 'B', vertical_align: 'bottom' },
  ], [{ top: 'a', bottom: 'b' }]));
  assert.match(html, /text-align:left;vertical-align:top/);
  assert.match(html, /text-align:left;vertical-align:bottom/);
});

test('table: row_max_height 按官方 [32,999] 夹紧', () => {
  const mk = (v) => renderDslToString(table([{ name: 'x', display_name: 'X' }], [{ x: 'a' }],
    { row_height: 'auto', row_max_height: v }));
  assert.match(mk('10px'), /max-height:32px/);
  assert.match(mk('2000px'), /max-height:999px/);
});

/* ---- data_type ---- */

test('table: text 空值 / 空字符串与真机一致展示 "--"', () => {
  const html = renderDslToString(table(
    [{ name: 'a', display_name: 'A' }, { name: 'b', display_name: 'B' }],
    [{ a: '', b: null }],
  ));
  assert.equal((html.match(/>--<\/div>/g) || []).length, 2);
});

test('table: number 支持 symbol / separator / precision(0–10)', () => {
  const html = one({ data_type: 'number', format: { symbol: '¥', precision: 2, separator: true } }, 1234567.891);
  assert.match(html, /¥1,234,567\.89/);
  // 无 separator 时不出逗号
  assert.match(one({ data_type: 'number', format: { precision: 1 } }, 1234.56), />1234\.6</);
  // precision 上限 10（不再夹到 100）
  assert.match(one({ data_type: 'number', format: { precision: 99 } }, 1.234567890123), />1\.2345678901</);
  // 已格式化字符串原样保留
  assert.match(one({ data_type: 'number' }, '1,234.50'), />1,234\.50</);
});

test('table: date 按 date_format 占位符格式化（本地时区）', () => {
  const ts = 1699341315000;
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  const expected = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const html = one({ data_type: 'date', date_format: 'YYYY/MM/DD HH:mm' }, ts);
  assert.match(html, new RegExp(expected.replace(/\//g, '\\/').replace(/:/g, ':')));
});

test('table: date 缺省按 RFC 3339（本地时区带偏移）', () => {
  const ts = 1606101072000;
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  const expected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T`;
  assert.match(one({ data_type: 'date' }, ts), new RegExp(expected));
});

test('table: RAW date 包装 { type:"timestamp", value, format } 也能格式化', () => {
  const html = renderDslToString(table(
    [{ name: 'd', display_name: 'D', data_type: 'date' }],
    [{ d: { type: 'timestamp', value: 1606101072000, format: 'YYYY/MM/DD' } }],
  ));
  const d = new Date(1606101072000);
  const pad = (n) => String(n).padStart(2, '0');
  assert.match(html, new RegExp(`${d.getFullYear()}\\/${pad(d.getMonth() + 1)}\\/${pad(d.getDate())}`));
});

test('table: markdown 单元格支持 ![](image)（RAW img，URL 走 src）', () => {
  const html = one({ data_type: 'markdown' }, '![logo](https://example.com/a.png)');
  assert.match(html, /<img[^>]+src="https:\/\/example\.com\/a\.png"/);
});

/* ---- RAW camelCase 参数投影 ---- */

test('table RAW: verticalAlign / dateFormat / rowMaxHeightValue 归一', () => {
  const html = renderCardToString({
    json_card: {
      body: { tag: 'body', property: { elements: [{
        tag: 'table',
        property: {
          columns: [
            { name: 'a', displayName: 'A', dataType: 'text', verticalAlign: 'top' },
            { name: 'd', displayName: 'D', dataType: 'date', dateFormat: 'YYYY/MM/DD' },
          ],
          rows: [{ a: { data: 'x' }, d: { data: { type: 'timestamp', value: 1606101072000, format: 'YYYY/MM/DD' } } }],
          rowHeightValue: { type: 'builtin_table_row_height_extension', value: 'auto' },
          rowMaxHeightValue: { type: 'pixels', value: 200 },
          freezeFirstColumn: true,
        },
      }] } },
    },
  });
  assert.match(html, /vertical-align:top/);
  assert.match(html, /universal-card-table--fixed-first/);
  assert.match(html, /max-height:200px/);
  const d = new Date(1606101072000);
  const pad = (n) => String(n).padStart(2, '0');
  assert.match(html, new RegExp(`${d.getFullYear()}\\/${pad(d.getMonth() + 1)}\\/${pad(d.getDate())}`));
});

/* ---- 翻页器外观（真机对账） ---- */

test('table pager: 单一边框包住表格+翻页器，分割线在翻页器顶部', () => {
  assert.match(CSS, /\.universal-card-table \{[\s\S]*?border: 1px solid var\(--line-divider-default/);
  assert.match(CSS, /\.universal-card-table__pager \{[\s\S]*?border-top: 1px solid var\(--line-divider-default/);
  // __scroll 不再自带边框（否则会变成双边框）
  const scrollRule = /\.universal-card-table__scroll \{([\s\S]*?)\}/.exec(CSS)?.[1] || '';
  assert.equal(/border:/.test(scrollRule), false);
});

test('table pager: 按钮无边框/底色，只有 hover 背景；箭头旋转 90°', () => {
  const btnRule = /\.universal-card-table__pager-btn \{([\s\S]*?)\}/.exec(CSS)?.[1] || '';
  assert.match(btnRule, /border: 0/);
  assert.match(btnRule, /background: transparent/);
  assert.match(CSS, /\.universal-card-table__pager-btn:hover:not\(:disabled\) \{[\s\S]*?background: var\(--bg-filler/);
  const html = renderDslToString(table(
    [{ name: 'x', display_name: 'X' }],
    Array.from({ length: 7 }, (_, i) => ({ x: String(i) })),
  ));
  assert.match(html, /ud-icon_left_outlined[^>]*transform:rotate\(90deg\)/);
  assert.match(html, /ud-icon_right_outlined[^>]*transform:rotate\(90deg\)/);
});

test('table pager: 每页最后一行去掉底边，分割线不会叠成 2px', () => {
  const html = renderDslToString(table(
    [{ name: 'x', display_name: 'X' }],
    Array.from({ length: 7 }, (_, i) => ({ x: String(i) })),
  ));
  const rows = html.match(/<tr class="universal-card-table__row[^"]*"[^>]*>/g) || [];
  // pageSize=5：第 5 行（索引 4）与第 7 行（数据集最后一行）是页尾
  assert.equal(rows.filter((r) => r.includes('--page-last')).length, 2);
  assert.match(rows[4], /page-last/);
  assert.match(rows[6], /page-last/);
  assert.match(CSS, /\.universal-card-table__row--page-last \.universal-card-table__td \{ border-bottom: none; \}/);
});

test('table: 宽表横向滚动条默认透明，hover 才显形（对齐真机）', () => {
  const scrollRule = /\.universal-card-table__scroll \{([\s\S]*?)\}/.exec(CSS)?.[1] || '';
  assert.match(scrollRule, /overflow-x: auto/);
  assert.match(scrollRule, /overflow-y: hidden/);
  const thumbRule = /\.universal-card-table__scroll::-webkit-scrollbar-thumb \{([\s\S]*?)\}/.exec(CSS)?.[1] || '';
  assert.match(thumbRule, /background: transparent/);
  assert.match(CSS, /\.universal-card-table__scroll:hover::-webkit-scrollbar-thumb \{[\s\S]*?background: var\(--N900-30/);
  assert.match(CSS, /::-webkit-scrollbar-button \{ display: none/);
  // Firefox 标准属性走 @supports，避免覆盖 WebKit 的细滚动条样式
  assert.match(CSS, /@supports \(-moz-appearance: none\)[\s\S]*?scrollbar-color: transparent transparent/);
});
