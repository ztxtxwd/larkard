import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, parsePatch, pointerTokens, PatchError } from '../src/index.js';

const card = () => ({
  schema: '2.0',
  config: { update_multi: true },
  body: {
    elements: [
      { tag: 'markdown', content: 'hi' },
      { tag: 'hr' },
    ],
  },
});

const errorOf = (fn: () => unknown): PatchError => {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof PatchError, `应该是 PatchError，实际 ${String(error)}`);
    return error;
  }
  throw new Error('期望抛错，但没有');
};

/* ---------------- parse ---------------- */

test('parsePatch：接受数组与 JSON 字符串', () => {
  const ops = [{ op: 'replace', path: '/body/elements/0/content', value: 'hey' }];
  assert.deepEqual(parsePatch(ops), ops);
  assert.deepEqual(parsePatch(JSON.stringify(ops)), ops);
});

test('parsePatch：空补丁默认报错，allowEmpty 放行', () => {
  assert.equal(errorOf(() => parsePatch([])).code, 'empty-patch');
  assert.deepEqual(parsePatch([], { allowEmpty: true }), []);
});

test('parsePatch：非数组 / 坏 JSON', () => {
  assert.equal(errorOf(() => parsePatch({ op: 'add' })).code, 'invalid-patch');
  assert.equal(errorOf(() => parsePatch('{oops')).code, 'invalid-patch');
});

test('parsePatch：未知 op / path 不是字符串 / 缺 value 或 from', () => {
  assert.equal(errorOf(() => parsePatch([{ op: 'merge', path: '/a' }])).code, 'invalid-operation');
  assert.equal(errorOf(() => parsePatch([{ op: 'add', path: 1, value: 1 }])).code, 'invalid-operation');
  assert.equal(errorOf(() => parsePatch([{ op: 'add', path: '/a' }])).code, 'invalid-operation');
  assert.equal(errorOf(() => parsePatch([{ op: 'move', path: '/a' }])).code, 'invalid-operation');
  // value 可以是 null / false，只看键是否存在
  assert.doesNotThrow(() => parsePatch([{ op: 'add', path: '/a', value: null }]));
});

test('parsePatch：JSON Pointer 语法在解析期就查', () => {
  assert.equal(errorOf(() => parsePatch([{ op: 'remove', path: 'a' }])).code, 'invalid-path');
  assert.equal(errorOf(() => parsePatch([{ op: 'remove', path: '/a~2' }])).code, 'invalid-path');
  // 空串 path 合法（整份文档）
  assert.doesNotThrow(() => parsePatch([{ op: 'test', path: '', value: {} }]));
});

test('pointerTokens：~1 → /、~0 → ~', () => {
  assert.deepEqual(pointerTokens('/a~1b~0c'), ['a/b~c']);
  assert.deepEqual(pointerTokens(''), []);
  assert.deepEqual(pointerTokens('/body/elements/0'), ['body', 'elements', '0']);
});

/* ---------------- apply ---------------- */

test('applyPatch：add 对象成员 / 数组插入 / - 追加', () => {
  const ops = parsePatch([
    { op: 'add', path: '/header', value: { title: 'x' } },
    { op: 'add', path: '/body/elements/1', value: { tag: 'hr' } },
    { op: 'add', path: '/body/elements/-', value: { tag: 'note', content: 'tail' } },
  ]);
  const out = applyPatch(card(), ops);
  assert.deepEqual((out as any).header, { title: 'x' });
  assert.equal((out as any).body.elements.length, 4);
  assert.equal((out as any).body.elements[1].tag, 'hr');
  assert.equal((out as any).body.elements[3].tag, 'note');
});

test('applyPatch：remove / replace', () => {
  const out = applyPatch(
    card(),
    parsePatch([
      { op: 'replace', path: '/body/elements/0/content', value: 'hey' },
      { op: 'remove', path: '/body/elements/1' },
    ]),
  ) as any;
  assert.equal(out.body.elements[0].content, 'hey');
  assert.equal(out.body.elements.length, 1);
});

test('applyPatch：copy / move', () => {
  const out = applyPatch(
    { list: [{ id: 'a' }, { id: 'b' }] },
    parsePatch([
      { op: 'copy', from: '/list/0', path: '/list/-' },
      { op: 'move', from: '/list/0', path: '/list/2' },
    ]),
  ) as any;
  // copy: [a,b,a] → move 0→2: [b,a,a]
  assert.deepEqual(out.list.map((x: any) => x.id), ['b', 'a', 'a']);
});

test('applyPatch：test 通过放行，不通过报 test-failed', () => {
  assert.doesNotThrow(() =>
    applyPatch(
      card(),
      parsePatch([{ op: 'test', path: '/body/elements/0/tag', value: 'markdown' }]),
    ),
  );
  const err = errorOf(() =>
    applyPatch(card(), parsePatch([{ op: 'test', path: '/body/elements/0/tag', value: 'div' }])),
  );
  assert.equal(err.code, 'test-failed');
  assert.equal(err.index, 0);
  assert.equal(err.path, '/body/elements/0/tag');
});

test('applyPatch：路径不存在 / 父级不存在 / 下标越界', () => {
  // 父级在数组里越界：报 index-invalid 并带上数组长度，比笼统的「父级不存在」更有用
  assert.equal(
    errorOf(() => applyPatch(card(), parsePatch([{ op: 'replace', path: '/body/elements/5/tag', value: 'x' }])))
      .code,
    'index-invalid',
  );
  assert.equal(
    errorOf(() => applyPatch(card(), parsePatch([{ op: 'replace', path: '/body/nope/tag', value: 'x' }])))
      .code,
    'parent-not-found',
  );
  assert.equal(
    errorOf(() => applyPatch(card(), parsePatch([{ op: 'replace', path: '/body/elements/5', value: {} }])))
      .code,
    'index-invalid',
  );
  assert.equal(
    errorOf(() => applyPatch(card(), parsePatch([{ op: 'remove', path: '/body/nope' }]))).code,
    'path-not-found',
  );
  assert.equal(
    errorOf(() => applyPatch(card(), parsePatch([{ op: 'add', path: '/body/elements/x', value: 1 }])))
      .code,
    'index-invalid',
  );
  // `-` 只在 add 里合法
  assert.equal(
    errorOf(() => applyPatch(card(), parsePatch([{ op: 'replace', path: '/body/elements/-', value: 1 }])))
      .code,
    'index-invalid',
  );
});

test('applyPatch：move 不能把节点移进自己的子节点', () => {
  const err = errorOf(() =>
    applyPatch(card(), parsePatch([{ op: 'move', from: '/body', path: '/body/elements/0' }])),
  );
  assert.equal(err.code, 'invalid-path');
});

test('applyPatch：path 为空时替换整份文档，remove 整份文档被拒', () => {
  const out = applyPatch(card(), parsePatch([{ op: 'replace', path: '', value: { schema: '2.0' } }]));
  assert.deepEqual(out, { schema: '2.0' });
  assert.equal(
    errorOf(() => applyPatch(card(), parsePatch([{ op: 'remove', path: '' }]))).code,
    'invalid-path',
  );
});

test('applyPatch：不修改入参（成功与失败都一样）', () => {
  const input = card();
  const snapshot = structuredClone(input);
  applyPatch(input, parsePatch([{ op: 'replace', path: '/body/elements/0/content', value: 'hey' }]));
  assert.deepEqual(input, snapshot);

  errorOf(() =>
    applyPatch(
      input,
      parsePatch([
        { op: 'replace', path: '/body/elements/0/content', value: 'hey' },
        { op: 'remove', path: '/body/nope' },
      ]),
    ),
  );
  assert.deepEqual(input, snapshot, '失败时也必须保持原样');
});

test('applyPatch：键名里的 / 与 ~ 用 ~1 / ~0 转义', () => {
  const doc = { 'a/b': { 'c~d': 1 } };
  const out = applyPatch(doc, parsePatch([{ op: 'replace', path: '/a~1b/c~0d', value: 2 }]));
  assert.deepEqual(out, { 'a/b': { 'c~d': 2 } });
});

test('错误信息带操作序号与路径，可直接给人/模型看', () => {
  const err = errorOf(() =>
    applyPatch(
      card(),
      parsePatch([
        { op: 'replace', path: '/body/elements/0/content', value: 'ok' },
        { op: 'replace', path: '/body/elements/9/content', value: 'boom' },
      ]),
    ),
  );
  assert.equal(err.index, 1);
  assert.match(err.message, /^第 2 个操作（replace \/body\/elements\/9\/content）/);
  assert.match(err.message, /下标越界|不存在/);
});
