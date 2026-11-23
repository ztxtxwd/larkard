import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { findInteraction, type JsonObject } from '../src/program/index.js';
import { renderDslToString } from '../src/renderer/index.js';
import {
  buildPreviewActionEvent,
  createProgramPreview,
  createVirtualUser,
  virtualUserToActionUser,
} from '../src/program/preview/index.js';

const signup = JSON.parse(
  readFileSync(new URL('./fixtures/program-signup.card.json', import.meta.url), 'utf8'),
) as JsonObject;

type Element = Record<string, any>;
const elements = (card: JsonObject) => (card.body as { elements: Element[] }).elements;

const USERS = [
  { name: '阿明', open_id: 'ou_ming', user_id: 'u_ming', union_id: 'on_ming' },
  { name: '小林', open_id: 'ou_lin', user_id: 'u_lin', union_id: 'on_lin' },
];

describe('多用户预览：一张卡、共享状态', () => {
  it('默认创建一个虚拟用户并渲染初始状态', () => {
    const preview = createProgramPreview(signup);
    assert.equal(preview.users.length, 1);
    assert.equal(preview.activeUser.name, '阿明');
    assert.match(preview.activeUser.open_id, /^ou_/);
    assert.equal(preview.rev, 0);
    assert.equal(elements(preview.card)[0]!.content, '已报名 **0** / 3 人');
  });

  it('多个用户点击同一张卡，状态累加而不是各看各的', () => {
    const preview = createProgramPreview(signup, { users: USERS });
    assert.equal(preview.activeUser.open_id, 'ou_ming');

    const first = preview.click('报名参与');
    assert.equal(first.ok, true);
    assert.deepEqual(preview.state.participants, ['ou_ming']);
    assert.equal(preview.rev, 1);
    assert.equal(elements(preview.card)[0]!.content, '已报名 **1** / 3 人');

    // 切换身份只换后续点击的 $user，不重置也不生成第二张卡。
    const beforeSwitch = preview.card;
    assert.equal(preview.selectUser('ou_lin'), true);
    assert.equal(preview.card, beforeSwitch);
    assert.deepEqual(preview.state.participants, ['ou_ming']);

    preview.click('报名参与');
    assert.deepEqual(preview.state.participants, ['ou_ming', 'ou_lin']);
    assert.equal(preview.rev, 2);
    const list = elements(preview.card).find((el) => el.tag === 'person_list')!;
    assert.deepEqual(list.persons, [{ id: 'ou_ming' }, { id: 'ou_lin' }]);
  });

  it('同一用户重复点击会被动作拒绝，状态和 rev 都不动', () => {
    const preview = createProgramPreview(signup, { users: USERS });
    preview.click('报名参与');
    const again = preview.click('报名参与');
    assert.equal(again.ok, false);
    assert.equal(again.rejected, true);
    assert.deepEqual(again.toast, { type: 'warning', content: '你已经报过名了' });
    assert.deepEqual(preview.state.participants, ['ou_ming']);
    assert.equal(preview.rev, 1);
  });

  it('clickAs 以指定用户点击，但不会切换当前身份', () => {
    const preview = createProgramPreview(signup, { users: USERS });
    preview.clickAs('ou_lin', '报名参与');
    assert.deepEqual(preview.state.participants, ['ou_lin']);
    assert.equal(preview.activeUser.open_id, 'ou_ming');
  });

  it('reset 回到初始状态，保留用户和当前身份', () => {
    const preview = createProgramPreview(signup, { users: USERS });
    preview.selectUser('ou_lin');
    preview.click('报名参与');
    preview.addUser({ name: '小陈' });
    const count = preview.users.length;

    preview.reset();
    assert.deepEqual(preview.state, { title: '周五羽毛球', limit: 3, participants: [] });
    assert.equal(preview.rev, 0);
    assert.equal(preview.users.length, count);
    assert.equal(preview.activeUser.open_id, 'ou_lin');
  });

  it('订阅者能区分卡片、用户和身份变化', () => {
    const preview = createProgramPreview(signup, { users: USERS });
    const seen: string[] = [];
    const unsubscribe = preview.subscribe((_, change) => seen.push(change));
    preview.click('报名参与');
    preview.selectUser('ou_lin');
    preview.addUser();
    preview.reset();
    unsubscribe();
    preview.click('报名参与');
    assert.deepEqual(seen, ['card', 'active-user', 'users', 'reset']);
  });
});

describe('虚拟用户', () => {
  it('创建时补全随机 ID 和首字头像', () => {
    const user = createVirtualUser({ name: '小陈' });
    assert.equal(user.name, '小陈');
    assert.match(user.open_id, /^ou_[0-9a-f]{12}$/);
    assert.match(user.user_id!, /^u_[0-9a-f]{12}$/);
    assert.match(user.union_id!, /^on_[0-9a-f]{12}$/);
    assert.match(user.avatar_url!, /^data:image\/svg\+xml,/);
    assert.match(decodeURIComponent(user.avatar_url!), /小/);
    assert.deepEqual(virtualUserToActionUser(user), {
      open_id: user.open_id,
      user_id: user.user_id,
      union_id: user.union_id,
    });
  });

  it('显式字段原样保留（测试和固定身份用）', () => {
    const user = createVirtualUser({
      name: '固定用户',
      open_id: 'ou_fixed',
      user_id: 'u_fixed',
      union_id: 'on_fixed',
      avatar_url: 'https://example.com/a.png',
      color: '#123456',
    });
    assert.deepEqual(user, {
      name: '固定用户',
      open_id: 'ou_fixed',
      user_id: 'u_fixed',
      union_id: 'on_fixed',
      avatar_url: 'https://example.com/a.png',
      color: '123456',
    });
  });

  it('新建优先使用没出现过的候选名字；用尽后编号', () => {
    const preview = createProgramPreview(signup);
    const names = new Set([preview.activeUser.name]);
    for (let i = 0; i < 11; i += 1) names.add(preview.addUser().name);
    assert.equal(names.size, 12);
    const extra = preview.addUser();
    assert.match(extra.name, /^用户\d+$/);
  });

  it('可以创建、选择、移除；至少保留一人', () => {
    const preview = createProgramPreview(signup, { users: USERS });
    const created = preview.addUser({ name: '小周' }, { select: true });
    assert.equal(preview.activeUser.open_id, created.open_id);
    assert.equal(preview.users.length, 3);

    assert.equal(preview.selectUser('ou_ming'), true);
    assert.equal(preview.selectUser('ou_missing'), false);
    assert.equal(preview.removeUser('ou_ming'), true);
    assert.equal(preview.activeUser.open_id, 'ou_lin', '删掉当前用户后自动切到第一个');
    assert.equal(preview.removeUser('ou_lin'), true);
    assert.equal(preview.removeUser(created.open_id), false, '最后一人不能删');
    assert.equal(preview.users.length, 1);
  });

  it('重复的 open_id 直接报错', () => {
    assert.throws(
      () => createProgramPreview(signup, {
        users: [{ name: 'A', open_id: 'ou_same' }, { name: 'B', open_id: 'ou_same' }],
      }),
      /open_id 重复/,
    );
  });
});

describe('事件拼装', () => {
  it('把回调 value 和控件状态映射成 ActionEvent', () => {
    const event = buildPreviewActionEvent(
      { action: 'join', args: { id: 'x' }, rev: 3 },
      { open_id: 'ou_a', user_id: 'u_a' },
      {
        form: { title: '周报' },
        input: 'abc',
        option: 'A',
        options: ['A', 'B'],
        checked: true,
        now: 123,
      },
    );
    assert.deepEqual(event, {
      action: 'join',
      user: { open_id: 'ou_a', user_id: 'u_a' },
      args: { id: 'x' },
      rev: 3,
      form: { title: '周报' },
      input: 'abc',
      option: 'A',
      options: ['A', 'B'],
      checked: true,
      now: 123,
    });
  });

  it('没有的控件字段不会出现在事件里', () => {
    const event = buildPreviewActionEvent({ action: 'join' }, { open_id: 'ou_a' });
    assert.deepEqual(event, { action: 'join', user: { open_id: 'ou_a' } });
  });

  it('findInteraction 已导出，可复用同一套点击匹配', () => {
    const preview = createProgramPreview(signup, { users: USERS });
    const interaction = findInteraction(preview.card, '报名参与');
    assert.equal(interaction.action, 'join');
    assert.equal(interaction.rev, 0);
  });

  it('dispatch 可以直接使用不是虚拟用户的真实身份', () => {
    const preview = createProgramPreview(signup, { users: USERS });
    preview.dispatch({
      action: 'join',
      user: { open_id: 'ou_real', union_id: 'on_real' },
    });
    assert.deepEqual(preview.state.participants, ['ou_real']);
  });
});

describe('renderer 交互标记', () => {
  const interactiveCard = {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'checker',
          text: { tag: 'plain_text', content: '同意' },
          behaviors: [{ type: 'callback', value: { __a: 'toggle' } }],
        },
        {
          tag: 'interactive_container',
          elements: [{ tag: 'markdown', content: '点我' }],
          behaviors: [{ type: 'callback', value: { __a: 'tap' } }],
        },
      ],
    },
  };

  it('interactive 模式下 checker / interactive_container 带回调属性', () => {
    const html = renderDslToString(interactiveCard, { interactive: true });
    assert.match(html, /data-feishu-tag="checker"/);
    assert.match(html, /data-feishu-tag="interactive_container"/);
    assert.match(html, /data-feishu-action="[^"]*__a[^"]*"/);
  });

  it('静态渲染保持不可点（不输出回调属性）', () => {
    const html = renderDslToString(interactiveCard);
    assert.doesNotMatch(html, /data-feishu-action/);
    assert.doesNotMatch(html, /data-feishu-tag/);
  });
});
