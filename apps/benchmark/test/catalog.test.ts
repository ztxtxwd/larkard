import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  applyCliOverrides,
  expandEnvVars,
  findSubject,
  loadCatalog,
  resolveRunModels,
} from '../src/catalog.js';

const fixture = join(import.meta.dirname, 'fixtures', 'catalog.json');

test('名录：同 model 可有未优化 / 提示优化 / extra 变体', () => {
  const catalog = loadCatalog(fixture);
  const thinker = findSubject(catalog, 'thinker');
  const hinted = findSubject(catalog, 'thinker-hinted');
  const noThink = findSubject(catalog, 'no-think');
  assert.equal(thinker?.model, 'vendor/think-model');
  assert.equal(thinker?.promptHint, undefined);
  assert.equal(thinker?.extra, undefined);
  assert.equal(hinted?.model, 'vendor/think-model');
  assert.equal(hinted?.promptHint, 'button 必须带 behaviors 数组。');
  assert.deepEqual(noThink?.extra, { enable_thinking: false });
  assert.equal(findSubject(catalog, 'vendor/think-model')?.name, 'thinker');
});

test('expandEnvVars 展开 apiKey/baseUrl 占位，不改 extra', () => {
  const catalog = loadCatalog(fixture);
  const thinker = findSubject(catalog, 'thinker');
  assert.ok(thinker);
  const expanded = expandEnvVars(thinker, { BENCH_KEY: 'sk-from-env' });
  assert.equal(expanded.apiKey, 'sk-from-env');
  assert.equal(expanded.extra, undefined);
  assert.equal(expandEnvVars(thinker, {}).apiKey, undefined);
});

test('CLI 覆盖 baseUrl/apiKey，resolveRunModels 按 name 过滤', () => {
  const catalog = loadCatalog(fixture);
  const thinker = findSubject(catalog, 'thinker');
  assert.ok(thinker);
  const over = applyCliOverrides(thinker, { baseUrl: 'https://override.test/v1' });
  assert.equal(over.baseUrl, 'https://override.test/v1');
  assert.equal(over.apiKey, '${BENCH_KEY}');

  const picked = resolveRunModels({ config: fixture, model: 'no-think' });
  assert.equal(picked.length, 1);
  assert.equal(picked[0].name, 'no-think');

  const all = resolveRunModels({ config: fixture });
  assert.equal(all.length, 3);
});

test('未知 name 且无一次性参数时抛错', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-catalog-'));
  writeFileSync(join(dir, 'empty.json'), JSON.stringify({ models: [] }));
  assert.throws(
    () => resolveRunModels({ config: join(dir, 'empty.json'), model: 'missing' }),
    /未在 .* 中找到被测对象 "missing"/,
  );
});
