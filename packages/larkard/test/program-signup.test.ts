import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createSimulator, eventFromCallback, findInteractions, type JsonObject } from '../src/program/index.js';

const signup = JSON.parse(readFileSync(new URL('./fixtures/program-signup.card.json', import.meta.url), 'utf8')) as JsonObject;

type Element = Record<string, any>;
const elements = (card: JsonObject) => (card.body as { elements: Element[] }).elements;

describe('报名卡：点击后把点击者追加到卡片上', () => {
  it('renders the initial card', () => {
    const sim = createSimulator(signup);
    const els = elements(sim.card);
    assert.equal(els[0]!.content, '已报名 **0** / 3 人');
    assert.equal(els.some((el) => el.tag === 'person_list'), false, '没人报名时不显示人员列表');
    assert.equal(els.find((el) => el.tag === 'button')!.disabled, false);
    assert.equal((sim.card.header as Element).subtitle.content, '报名中');
    assert.equal('$state' in sim.card || '$actions' in sim.card, false);
    assert.deepEqual(
      sim.interactions().map((i) => [i.text, i.action, i.rev]),
      [['报名参与', 'join', 0]],
    );
  });

  it('appends each clicker to the person list', () => {
    const sim = createSimulator(signup);
    const first = sim.click('报名参与', 'ou_alice');
    assert.equal(first.ok, true);
    assert.deepEqual(first.toast, { type: 'success', content: '报名成功，当前第 1 位' });
    sim.click('报名参与', 'ou_bob');

    assert.deepEqual(sim.state.participants, ['ou_alice', 'ou_bob']);
    assert.equal(sim.rev, 2);
    const list = elements(sim.card).find((el) => el.tag === 'person_list')!;
    assert.deepEqual(list.persons, [{ id: 'ou_alice' }, { id: 'ou_bob' }]);
    assert.equal(elements(sim.card)[0]!.content, '已报名 **2** / 3 人');
  });

  it('rejects a second join from the same user without touching state', () => {
    const sim = createSimulator(signup);
    sim.click('报名参与', 'ou_alice');
    const again = sim.click('报名参与', 'ou_alice');
    assert.equal(again.ok, false);
    assert.equal(again.rejected, true);
    assert.equal(again.changed, false);
    assert.deepEqual(again.toast, { type: 'warning', content: '你已经报过名了' });
    assert.equal(sim.rev, 1);
  });

  it('disables the button and greys the header once full', () => {
    const sim = createSimulator(signup);
    for (const user of ['ou_a', 'ou_b', 'ou_c']) sim.click('报名参与', user);
    const button = elements(sim.card).find((el) => el.tag === 'button')!;
    assert.equal(button.disabled, true);
    assert.equal((sim.card.header as Element).template, 'grey');
    assert.equal(sim.click('报名参与', 'ou_d').toast?.content, '名额已满');
  });

  it('lets users quit their own registration only', () => {
    const sim = createSimulator(signup);
    sim.click('报名参与', 'ou_alice');
    assert.equal(sim.click('取消报名', 'ou_bob').toast?.content, '你还没有报名');
    sim.click('取消报名', 'ou_alice');
    assert.deepEqual(sim.state.participants, []);
    assert.equal(elements(sim.card).some((el) => el.tag === 'person_list'), false);
  });

  it('dispatches a real Feishu card.action.trigger payload', () => {
    const sim = createSimulator(signup);
    const button = findInteractions(sim.card)[0]!;
    const card = sim.card as { body: { elements: Element[] } };
    const value = card.body.elements.find((el) => el.tag === 'button')!.behaviors[0].value;
    const event = eventFromCallback({
      operator: { open_id: 'ou_feishu', union_id: 'on_x' },
      token: 'c-xxx',
      action: { tag: 'button', value },
      context: { open_message_id: 'om_x', open_chat_id: 'oc_x' },
    });
    assert.ok(event);
    assert.equal(event.action, button.action);
    assert.equal(event.rev, 0);
    sim.dispatch(event);
    assert.deepEqual(sim.state.participants, ['ou_feishu']);
  });

  it('ignores callbacks that were not produced by this protocol', () => {
    assert.equal(eventFromCallback({ operator: { open_id: 'ou_x' }, action: { value: { key: 'v' } } }), null);
  });
});
