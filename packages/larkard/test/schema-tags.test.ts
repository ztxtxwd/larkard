import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CARD_ELEMENT_TAGS } from '../src/schema/tags.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

test('每个组件 tag 都能在 schema 源码里找到 z.literal', () => {
  const source = sourceFiles(SRC).map((file) => readFileSync(file, 'utf8')).join('\n');
  const literals = new Set(
    [...source.matchAll(/literal\(['"]([a-z0-9_]+)['"]\)/g)].map((match) => match[1]),
  );
  const missing = CARD_ELEMENT_TAGS.filter((tag) => !literals.has(tag));
  assert.deepEqual(missing, [], `schema 源码里找不到这些 tag 的 literal：${missing.join(', ')}`);
});
