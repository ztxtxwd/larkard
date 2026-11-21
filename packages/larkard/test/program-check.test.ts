import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { checkCard } from '../src/index.js';
import { compileProgram, renderProgram, type JsonObject } from '../src/program/index.js';

const signup = JSON.parse(
  readFileSync(new URL('./fixtures/program-signup.card.json', import.meta.url), 'utf8'),
) as JsonObject;

describe('program cards and larkard checks', () => {
  it('renderProgram 的输出通过 checkCard', () => {
    const { program, diagnostics } = compileProgram(signup);
    assert.deepEqual(diagnostics.filter((d) => d.severity === 'error'), []);
    assert.ok(program);

    const { card } = renderProgram(program, program.initialState, { rev: 0 });
    const result = checkCard(card);
    assert.deepEqual(result.errors, []);
  });

  it('程序文档本身不应该直接喂给 checkCard', () => {
    // 模板里的交互组件用 $on，不是 behaviors；根上的 $state/$actions 也会被 schema strip。
    const result = checkCard(signup);
    assert.ok(result.errors.length > 0, '直接检查程序文档应当报错，提醒先 renderProgram');
  });
});
