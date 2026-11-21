import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ExprError } from '../src/program/errors.js';
import { Budget, evaluate } from '../src/program/expr/evaluate.js';
import { parseExpr, parseForSpec } from '../src/program/expr/parser.js';
import { Env, RawMarkdown, type Value } from '../src/program/expr/values.js';

function run(src: string, vars: Record<string, Value> = {}, budget = 100_000): Value {
  return evaluate(parseExpr(src), new Env(new Map(Object.entries(vars))), { budget: new Budget(budget) });
}

describe('operators', () => {
  it('follows JS precedence and associativity', () => {
    assert.equal(run('1 + 2 * 3'), 7);
    assert.equal(run('(1 + 2) * 3'), 9);
    assert.equal(run('10 - 3 - 2'), 5);
    assert.equal(run('-2 * 3'), -6);
    assert.equal(run('a ? 1 : b ? 2 : 3', { a: false, b: true }), 2);
    assert.equal(run('1 < 2 && 2 < 3'), true);
  });

  it('returns operands from && || ?? like JS', () => {
    assert.equal(run('a || "默认"', { a: '' }), '默认');
    assert.equal(run('a && a.name', { a: { name: 'x' } }), 'x');
    assert.equal(run('a ?? 0', { a: null }), 0);
    assert.equal(run('a ?? 0', { a: false }), false);
  });

  it('compares by value, and === is the same as ==', () => {
    assert.equal(run('[1, {a: 2}] == [1, {a: 2}]'), true);
    assert.equal(run('a === "x"', { a: 'x' }), true);
    assert.equal(run('a !== b', { a: { k: 1 }, b: { k: 1 } }), false);
  });

  it('concatenates strings and rejects nonsense arithmetic', () => {
    assert.equal(run('"第" + n + "位"', { n: 3 }), '第3位');
    assert.throws(() => run('a - 1', { a: 'x' }), ExprError);
    assert.throws(() => run('1 / 0'), /除数不能为 0/);
  });
});

describe('member access', () => {
  it('is null-safe and supports length / negative index', () => {
    assert.equal(run('a.b.c', { a: null }), null);
    assert.equal(run('a.missing', { a: {} }), null);
    assert.equal(run('list.length', { list: [1, 2, 3] }), 3);
    assert.equal(run('list[-1]', { list: [1, 2, 3] }), 3);
    assert.equal(run('m[k]', { m: { x: 1 }, k: 'x' }), 1);
    assert.equal(run('a?.b', { a: { b: 2 } }), 2);
  });

  it('refuses prototype keys', () => {
    assert.throws(() => run('a.__proto__', { a: {} }), /不能访问属性/);
    assert.throws(() => run('a["constructor"]', { a: {} }), /不能访问属性/);
  });
});

describe('builtins', () => {
  it('accepts JS method style and Math.*', () => {
    assert.equal(run('list.includes("b")', { list: ['a', 'b'] }), true);
    assert.equal(run('name.toUpperCase()', { name: 'ab' }), 'AB');
    assert.equal(run('Math.max(1, 5, 3)'), 5);
    assert.equal(run('list.join("、")', { list: ['a', 'b'] }), 'a、b');
  });

  it('runs lambdas', () => {
    const items = [{ n: 3, done: true }, { n: 1, done: false }, { n: 2, done: true }];
    assert.deepEqual(run('map(filter(items, x => x.done), x => x.n)', { items }), [3, 2]);
    assert.equal(run('count(items, x => x.done)', { items }), 2);
    assert.equal(run('sum(items, x => x.n)', { items }), 6);
    assert.deepEqual(run('map(sort(items, x => x.n), x => x.n)', { items }), [1, 2, 3]);
    assert.deepEqual(run('map(sort(items, (a, b) => b.n - a.n), x => x.n)', { items }), [3, 2, 1]);
    assert.deepEqual(run('find(items, x => x.n == 2)', { items }), { n: 2, done: true });
    assert.equal(run('findIndex(items, x => x.n == 9)', { items }), -1);
  });

  it('builds mention markup that survives markdown escaping', () => {
    const at = run('at(id)', { id: 'ou_abc' });
    assert.ok(at instanceof RawMarkdown);
    assert.equal(at.text, '<at id=ou_abc></at>');
    assert.throws(() => run('person(id)', { id: 'ou_x"><b>' }), /不是合法的用户 ID/);
  });

  it('formats dates in a time zone', () => {
    assert.equal(run('date(0, "YYYY-MM-DD HH:mm")'), '1970-01-01 08:00');
    assert.equal(run('date(0, "HH:mm", "UTC")'), '00:00');
  });

  it('reports unknown functions', () => {
    assert.throws(() => run('nope(1)'), /没有内置函数 nope/);
  });
});

describe('safety', () => {
  it('stops runaway computation', () => {
    assert.throws(() => run('map(range(1000), i => map(range(1000), j => i * j))', {}, 50_000), /计算量超出上限/);
  });

  it('explains assignment attempts', () => {
    assert.throws(() => parseExpr('a = 1'), /不能赋值/);
  });

  it('reports syntax errors with a position', () => {
    try {
      parseExpr('len(list');
      assert.fail('should throw');
    } catch (err) {
      assert.ok(err instanceof ExprError);
      assert.equal(typeof err.pos, 'number');
    }
  });
});

describe('$for spec', () => {
  it('parses item / index forms', () => {
    assert.equal(parseForSpec('id in participants').item, 'id');
    const spec = parseForSpec('(opt, i) in options');
    assert.equal(spec.item, 'opt');
    assert.equal(spec.index, 'i');
    assert.throws(() => parseForSpec('participants'), /\$for 的写法/);
  });
});
