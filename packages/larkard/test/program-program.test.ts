import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compileProgram, createSimulator, escapeMarkdown, loadProgram, renderProgram, RenderError, type JsonObject } from '../src/program/index.js';

type Element = Record<string, any>;
const elements = (card: JsonObject) => (card.body as { elements: Element[] }).elements;

function card(body: unknown[], state: JsonObject = {}, actions: JsonObject = {}, extra: JsonObject = {}): JsonObject {
  return { ...extra, body: { elements: body }, $state: state, $actions: actions } as JsonObject;
}

describe('interpolation', () => {
  it('escapes values inside markdown but not in plain text', () => {
    const program = loadProgram(
      card(
        [
          { tag: 'markdown', content: '标题：{{ title }}' },
          { tag: 'markdown', content: '原样：{{{ title }}}' },
          { tag: 'markdown', content: '{{ at(uid) }} 请处理' },
          { tag: 'div', text: { tag: 'plain_text', content: '{{ title }}' } },
          { tag: 'div', text: { tag: 'lark_md', content: '{{ title }}' } },
        ],
        { title: '**粗体**', uid: 'ou_abc' },
      ),
    );
    const els = elements(renderProgram(program, program.initialState, { rev: 0 }).card);
    assert.equal(els[0]!.content, '标题：&#42;&#42;粗体&#42;&#42;');
    assert.equal(els[1]!.content, '原样：**粗体**');
    assert.equal(els[2]!.content, '<at id=ou_abc></at> 请处理');
    assert.equal(els[3]!.text.content, '**粗体**');
    assert.equal(els[4]!.text.content, '&#42;&#42;粗体&#42;&#42;');
  });

  it('escapes every special character exactly once', () => {
    assert.equal(escapeMarkdown('**a**#&<b>'), '&#42;&#42;a&#42;&#42;&#35;&amp;&#60;b&#62;');
    assert.equal(escapeMarkdown('[x](y) - _z_'), '&#91;x&#93;&#40;y&#41; &#45; &#95;z&#95;');
  });

  it('keeps the value type for a whole-string expression', () => {
    const program = loadProgram(card([{ tag: 'button', disabled: '{{ n > 1 }}', width: '{{ w }}' }], { n: 2, w: null }));
    const button = elements(renderProgram(program, program.initialState, { rev: 0 }).card)[0]!;
    assert.equal(button.disabled, true);
    assert.equal(button.width, null);
  });

  it('accepts $if written with or without braces', () => {
    const program = loadProgram(
      card([
        { tag: 'markdown', content: 'a', $if: '{{ show }}' },
        { tag: 'markdown', content: 'b', $if: '!show' },
      ], { show: true }),
    );
    assert.deepEqual(elements(renderProgram(program, program.initialState, { rev: 0 }).card).map((el) => el.content), ['a']);
  });

  it('never leaks render results back into the compiled template', () => {
    const program = loadProgram(card([{ tag: 'markdown', content: 'static' }]));
    const first = renderProgram(program, {}, { rev: 0 }).card;
    elements(first).push({ tag: 'hr' });
    assert.equal(elements(renderProgram(program, {}, { rev: 0 }).card).length, 1);
  });
});

describe('loops', () => {
  const todo = card(
    [
      {
        tag: 'column_set',
        $for: 'item in items',
        $key: 'item.id',
        element_id: 'row',
        columns: [
          { tag: 'column', elements: [{ tag: 'markdown', content: '{{ item.text }}' }] },
          {
            tag: 'column',
            elements: [
              {
                tag: 'button',
                element_id: 'delete_button_long',
                text: { tag: 'plain_text', content: '删除' },
                $on: { action: 'remove', args: { id: '{{ item.id }}' } },
              },
            ],
          },
        ],
      },
    ],
    { items: [{ id: 'a', text: '买菜' }, { id: 'b', text: '做饭' }] },
    { remove: [{ remove: 'items', where: 'x => x.id == $args.id' }] },
  );

  it('gives every looped element a unique, stable, valid element_id', () => {
    const sim = createSimulator(todo);
    const ids = sim.interactions().map((i) => i.element_id!);
    assert.equal(new Set(ids).size, 2);
    for (const id of ids) assert.match(id, /^[A-Za-z][A-Za-z0-9_]{0,19}$/);

    const bId = sim.interactions()[1]!.element_id!;
    sim.click({ elementId: sim.interactions()[0]!.element_id! }, 'ou_x');
    assert.deepEqual(sim.state.items, [{ id: 'b', text: '做饭' }]);
    assert.equal(sim.interactions()[0]!.element_id, bId, '按 key 而不是下标生成，删掉前一项后 id 不变');
  });

  it('passes loop variables to actions through args', () => {
    const sim = createSimulator(todo);
    assert.deepEqual(sim.interactions().map((i) => i.args), [{ id: 'a' }, { id: 'b' }]);
  });

  it('iterates objects as (value, key)', () => {
    const program = loadProgram(
      card([{ tag: 'markdown', $for: '(count, name) in votes', content: '{{ name }}：{{ count }}' }], { votes: { A: 2, B: 0 } }),
    );
    assert.deepEqual(elements(renderProgram(program, program.initialState, { rev: 0 }).card).map((el) => el.content), ['A：2', 'B：0']);
  });

  it('reports duplicate element_id', () => {
    const program = loadProgram(card([{ tag: 'hr', element_id: 'x' }, { tag: 'hr', element_id: 'x' }]));
    assert.throws(() => renderProgram(program, {}, { rev: 0 }), RenderError);
  });
});

describe('actions', () => {
  it('collects form input', () => {
    const sim = createSimulator(
      card(
        [
          {
            tag: 'form',
            name: 'f',
            elements: [
              { tag: 'input', name: 'title' },
              { tag: 'button', form_action_type: 'submit', text: { tag: 'plain_text', content: '添加' }, $on: 'add' },
            ],
          },
          { tag: 'markdown', $for: 't in todos', content: '- {{ t.title }}（{{ t.by }}）' },
        ],
        { todos: [] },
        {
          add: [
            { assert: 'trim($form.title ?? "") != ""', toast: '请填写内容' },
            { push: 'todos', value: '{ title: trim($form.title), by: $user.open_id }' },
          ],
        },
      ),
    );
    assert.equal(sim.click('添加', 'ou_a', { form: { title: '  ' } }).toast?.content, '请填写内容');
    sim.click('添加', 'ou_a', { form: { title: ' 写周报 ' } });
    assert.deepEqual(sim.state.todos, [{ title: '写周报', by: 'ou_a' }]);
    assert.equal(elements(sim.card)[1]!.content, '- 写周报（ou&#95;a）', '模板里的字面量照写，只转义插值');
  });

  it('writes into nested paths, creating missing objects', () => {
    const sim = createSimulator(
      card(
        [
          { tag: 'button', $for: 'opt in options', text: { tag: 'plain_text', content: '{{ opt }}' }, $on: { action: 'vote', args: '{{ opt }}' } },
        ],
        { options: ['A', 'B'], votes: {}, total: 0 },
        {
          vote: [
            { push: 'votes[$args]', value: '$user.open_id', unique: true },
            { inc: 'total' },
          ],
        },
      ),
    );
    sim.click('A', 'ou_1');
    sim.click('A', 'ou_2');
    sim.click('B', 'ou_1');
    assert.deepEqual(sim.state.votes, { A: ['ou_1', 'ou_2'], B: ['ou_1'] });
    assert.equal(sim.state.total, 3);
  });

  it('rolls back everything when a later step fails', () => {
    const sim = createSimulator(
      card(
        [{ tag: 'button', text: { tag: 'plain_text', content: 'go' }, $on: 'go' }],
        { list: [], n: 1 },
        { go: [{ push: 'list', value: '1' }, { set: 'n', value: 'n - "x"' }] },
      ),
    );
    const result = sim.click('go', 'ou_a');
    assert.equal(result.ok, false);
    assert.match(result.error!, /第 2 步（set）/);
    assert.deepEqual(sim.state, { list: [], n: 1 });
    assert.equal(sim.rev, 0);
  });

  it('refuses to store functions', () => {
    const sim = createSimulator(
      card([{ tag: 'button', text: { tag: 'plain_text', content: 'go' }, $on: 'go' }], { f: null }, { go: [{ set: 'f', value: 'x => x' }] }),
    );
    assert.match(sim.click('go', 'ou_a').error!, /函数不能存进状态/);
  });

  it('reports no change when the state is the same', () => {
    const sim = createSimulator(
      card([{ tag: 'button', text: { tag: 'plain_text', content: 'go' }, $on: 'go' }], { n: 1 }, { go: [{ set: 'n', value: '1' }] }),
    );
    assert.equal(sim.click('go', 'ou_a').changed, false);
    assert.equal(sim.rev, 0);
  });
});

describe('shared card', () => {
  const config = (cardJson: JsonObject) => (cardJson.config as JsonObject | undefined)?.update_multi;

  it('always renders a shared card', () => {
    const program = loadProgram(card([{ tag: 'hr' }]));
    assert.equal(config(renderProgram(program, {}, { rev: 0 }).card), true);
  });

  it('warns but still shares when the program asks for a private card', () => {
    const { program, diagnostics } = compileProgram(card([{ tag: 'hr' }], {}, {}, { config: { update_multi: false } }));
    assert.ok(diagnostics.some((d) => d.path === '/config/update_multi' && d.severity === 'warning'));
    assert.equal(config(renderProgram(program!, {}, { rev: 0 }).card), true);
  });

  it('writes the revision into the callback value', () => {
    const program = loadProgram(card([{ tag: 'button', text: { tag: 'plain_text', content: 'go' }, $on: 'go' }], {}, { go: [] }));
    const button = elements(renderProgram(program, {}, { rev: 7 }).card)[0]!;
    assert.equal(button.behaviors[0].value.__r, 7);
  });
});

describe('diagnostics for generated programs', () => {
  const broken = {
    body: {
      elements: [
        { tag: 'markdown', content: '你好 {{ $user.open_id }}' },
        { tag: 'markdown', content: '{{ titel }}' },
        { tag: 'button', $on: 'missing' },
        { tag: 'markdown', $else: true },
        { tag: 'markdown', content: '{{ lenght(items) }}' },
        { tag: 'markdown', content: '{{ len(items }}' },
      ],
      extra: { $for: 'x in items' },
    },
    $state: { title: 'x', items: [] },
    $actions: {
      a: [{ append: 'items' }],
      b: [{ set: 'foo', value: '1' }],
      c: [{ push: 'items', value: '$who' }],
    },
  };

  const { program, diagnostics } = compileProgram(broken);
  const find = (path: string, text: string) =>
    diagnostics.find((d) => d.path === path && d.message.includes(text));

  it('does not compile', () => {
    assert.equal(program, undefined);
  });

  it('points to the exact field with an actionable message', () => {
    assert.ok(find('/body/elements/0/content', '共享卡片对所有人显示同一个视图'));
    assert.ok(find('/body/elements/1/content', '未定义的变量 titel'));
    assert.ok(find('/body/elements/2/$on', '没有动作 missing'));
    assert.ok(find('/body/elements/3/$else', '不认识的指令 $else'));
    assert.ok(find('/body/elements/4/content', '没有内置函数 lenght'));
    assert.ok(find('/body/elements/5/content', '这里应为 , 或 )'));
    assert.ok(find('/body/extra/$for', '$for 只能用在数组里的对象上'));
    assert.ok(find('/$actions/a/0', '不认识的操作'));
    assert.ok(find('/$actions/b/0/set', '状态里没有字段 foo'));
    assert.ok(find('/$actions/c/0/value', '未知的上下文变量 $who'));
    assert.ok(diagnostics.some((d) => d.severity === 'warning' && d.path === '/$actions/a'));
  });

  it('requires $state', () => {
    const result = compileProgram({ body: { elements: [] } });
    assert.ok(result.diagnostics.some((d) => d.path === '/$state'));
  });
});
