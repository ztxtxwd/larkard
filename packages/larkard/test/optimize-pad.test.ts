import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  equalizeInteractiveContainerHeights,
  equalizeInteractiveContainerHeightsByPadding,
} from '../src/optimize/index.js';
import type { JsonObject } from '../src/optimize/types.js';

const ZWSP = '​';
const IDEOGRAPHIC_SPACE = '　';

function markdown(content: string, size?: string, margin?: string): JsonObject {
  return {
    tag: 'markdown',
    content,
    ...(size ? { text_size: size } : {}),
    ...(margin ? { margin } : {}),
  };
}

/**
 * 用户截图里的「接入只要 3 步」：第三列多了一串数字，桌面 600 宽下三列
 * 自然高度是 104/104/148，窄屏 360 下是 126/148/214。
 */
function threeStepsCard(): JsonObject {
  const container = (children: JsonObject[]): JsonObject => ({
    tag: 'interactive_container',
    width: 'fill',
    padding: '10px 10px 10px 10px',
    has_border: true,
    corner_radius: '12px',
    vertical_spacing: '3px',
    elements: children,
  });
  return {
    schema: '2.0',
    body: {
      elements: [
        {
          tag: 'column_set',
          flex_mode: 'trisect',
          horizontal_spacing: '10px',
          margin: '12px 20px 20px 20px',
          columns: [
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [container([
                markdown('01', 'heading-4'),
                markdown('安装插件', 'normal'),
                markdown('安装「蝉妈妈」插件。', 'notation', '2px 2px 2px 2px'),
              ])],
            },
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [container([
                markdown('02', 'heading-4'),
                markdown('登录授权', 'normal'),
                markdown('用蝉妈妈账号登录授权。', 'notation', '2px 2px 2px 2px'),
              ])],
            },
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [container([
                markdown('03', 'heading-4'),
                markdown('直接提问', 'normal'),
                markdown(
                  '说清品类和商品。\n23523465236423465346346 3463463',
                  'notation',
                  '2px 2px 2px 2px',
                ),
              ])],
            },
          ],
        },
      ],
    },
  };
}

function containersOf(card: JsonObject): JsonObject[] {
  const body = card.body as JsonObject;
  const columnSet = (body.elements as JsonObject[])[0]!;
  return (columnSet.columns as JsonObject[]).map(
    (column) => (column.elements as JsonObject[])[0]!,
  );
}

function heightsOf(card: JsonObject): unknown[] {
  return containersOf(card).map((container) => container.height);
}

/** 容器里以 ofc_hfill_ 开头的填充元素。 */
function fillersOf(card: JsonObject): JsonObject[] {
  return containersOf(card).flatMap((container) =>
    (container.elements as JsonObject[]).filter(
      (el) => typeof el.element_id === 'string' && el.element_id.startsWith('ofc_hfill_'),
    ));
}

function fillerChars(element: JsonObject): number {
  const chars = Array.from(String(element.content ?? ''));
  if (chars[0] === ZWSP) chars.shift();
  return chars.length;
}

test('补字符：600/360 两个参考宽度精确等高，且不写 height', () => {
  const result = equalizeInteractiveContainerHeightsByPadding(threeStepsCard(), {
    widths: [600, 360],
    overwriteFixedHeight: true,
  });

  assert.equal(result.groups.length, 1);
  assert.deepEqual(result.groups[0]!.targets, [148, 214]);
  assert.deepEqual(
    result.groups[0]!.containers.map((container) => container.estimates),
    [[104, 126], [104, 148], [148, 214]],
  );
  assert.deepEqual(
    result.groups[0]!.containers.map((container) => container.fillerChars),
    [16, 15, 0],
  );
  assert.deepEqual(
    result.groups[0]!.containers.map((container) => container.errors),
    [[0, 0], [0, 0], [0, 0]],
  );

  // 不再写 height，旧高度也会被清掉。
  assert.deepEqual(heightsOf(result.card), [undefined, undefined, undefined]);

  const fillers = fillersOf(result.card);
  assert.equal(fillers.length, 2);
  assert.deepEqual(fillers.map(fillerChars), [16, 15]);
  for (const filler of fillers) {
    assert.equal(filler.tag, 'markdown');
    assert.equal(filler.text_size, 'notation');
    assert.equal(filler.margin, '-3px 0px 0px 0px');
    assert.match(String(filler.element_id), /^ofc_hfill_\d+$/);
    assert.ok(String(filler.content).startsWith(ZWSP));
    assert.ok(String(filler.content).slice(1).split('').every((ch) => ch === IDEOGRAPHIC_SPACE));
  }
});

test('补完字符后，再用固定高度优化器测量：两个宽度都等高', () => {
  const result = equalizeInteractiveContainerHeightsByPadding(threeStepsCard(), {
    widths: [600, 360],
    overwriteFixedHeight: true,
  });
  for (const [width, expected] of [[600, 148], [360, 214]] as const) {
    const measured = equalizeInteractiveContainerHeights(result.card, {
      widths: [width],
      skipWhenEqual: false,
    });
    assert.deepEqual(
      measured.groups[0]!.containers.map((container) => container.naturalHeight),
      [expected, expected, expected],
    );
  }
});

test('重复运行幂等：旧填充被替换，不会叠加', () => {
  const first = equalizeInteractiveContainerHeightsByPadding(threeStepsCard(), {
    widths: [600, 360],
    overwriteFixedHeight: true,
  });
  const second = equalizeInteractiveContainerHeightsByPadding(first.card, {
    widths: [600, 360],
    overwriteFixedHeight: true,
  });

  assert.deepEqual(second.card, first.card);
  assert.equal(fillersOf(second.card).length, 2);
  assert.deepEqual(
    second.groups[0]!.containers.map((container) => container.fillerChars),
    [16, 15, 0],
  );
  assert.deepEqual(
    second.changes.map((change) => [change.from, change.to]),
    [[16, 16], [15, 15]],
  );
});

test('只补字符，不改可见内容', () => {
  const original = threeStepsCard();
  const result = equalizeInteractiveContainerHeightsByPadding(original, {
    widths: [600, 360],
    overwriteFixedHeight: true,
  });
  const visible = (card: JsonObject): unknown[] => containersOf(card).map((container) =>
    (container.elements as JsonObject[]).filter(
      (el) => !(typeof el.element_id === 'string' && el.element_id.startsWith('ofc_hfill_')),
    ));
  assert.deepEqual(visible(result.card), visible(original));
});

test('容器已有固定高度：默认跳过；overwriteFixedHeight 会清掉高度再补字符', () => {
  const card = threeStepsCard();
  for (const container of containersOf(card)) container.height = '214px';

  const skipped = equalizeInteractiveContainerHeightsByPadding(card, {
    widths: [600, 360],
  });
  assert.equal(skipped.groups.length, 0);
  assert.equal(skipped.skipped[0]!.reason, 'container-fixed-height');

  const overwritten = equalizeInteractiveContainerHeightsByPadding(card, {
    widths: [600, 360],
    overwriteFixedHeight: true,
  });
  assert.equal(overwritten.groups.length, 1);
  assert.deepEqual(heightsOf(overwritten.card), [undefined, undefined, undefined]);
  assert.deepEqual(
    overwritten.groups[0]!.containers.map((container) => container.fillerChars),
    [16, 15, 0],
  );
});

test('本来就等高：默认跳过，skipWhenEqual:false 时给出零填充分组', () => {
  const equalCard = threeStepsCard();
  const third = containersOf(equalCard)[2]!;
  (third.elements as JsonObject[])[2]!.content = '说清品类和商品。';

  const skipped = equalizeInteractiveContainerHeightsByPadding(equalCard, {
    widths: [600],
  });
  assert.equal(skipped.groups.length, 0);
  assert.equal(skipped.skipped[0]!.reason, 'already-equal');
  assert.equal(fillersOf(skipped.card).length, 0);

  const kept = equalizeInteractiveContainerHeightsByPadding(equalCard, {
    widths: [600],
    skipWhenEqual: false,
  });
  assert.equal(kept.groups.length, 1);
  assert.deepEqual(
    kept.groups[0]!.containers.map((container) => container.fillerChars),
    [0, 0, 0],
  );
});

test('容器里有拿不准的组件：整组跳过', () => {
  const card = threeStepsCard();
  (containersOf(card)[0]!.elements as JsonObject[]).push({ tag: 'chart', chart_spec: {} });
  const result = equalizeInteractiveContainerHeightsByPadding(card, {
    widths: [600, 360],
  });
  assert.equal(result.groups.length, 0);
  assert.equal(result.skipped[0]!.reason, 'unsupported-child');
});

test('目标高度超过 maxHeight：跳过', () => {
  const result = equalizeInteractiveContainerHeightsByPadding(threeStepsCard(), {
    widths: [600, 360],
    maxHeight: 200,
  });
  assert.equal(result.groups.length, 0);
  assert.equal(result.skipped[0]!.reason, 'height-over-limit');
});

test('自定义 fillerTextSize 不合法时报错', () => {
  assert.throws(
    () => equalizeInteractiveContainerHeightsByPadding(threeStepsCard(), {
      fillerTextSize: 'cus-0',
    }),
    /未知的 fillerTextSize/,
  );
});

/** 两列各一个交互容器，容器里「无 size 图片 + 一段说明」。 */
function imageColumnsCard(contents: [string, string]): JsonObject {
  const column = (content: string): JsonObject => ({
    tag: 'column',
    width: 'weighted',
    weight: 1,
    elements: [{
      tag: 'interactive_container',
      width: 'fill',
      padding: '10px 10px 10px 10px',
      elements: [
        { tag: 'img', img_key: 'img_test', scale_type: 'fit_horizontal' },
        markdown(content, 'notation'),
      ],
    }],
  });
  return {
    schema: '2.0',
    body: {
      elements: [{
        tag: 'column_set',
        columns: [column(contents[0]), column(contents[1])],
      }],
    },
  };
}

test('无 size 图片：measureImage 提供原始尺寸后按列宽折算高度并补字符', () => {
  const result = equalizeInteractiveContainerHeightsByPadding(
    imageColumnsCard(['短', '这是一段会折很多行的说明文字，用来把第二列撑高。']),
    {
      widths: [600],
      measureImage: () => ({ width: 480, height: 360 }),
    },
  );

  assert.equal(result.groups.length, 1);
  assert.equal(result.skipped.length, 0);
  assert.ok(result.groups[0]!.containers[0]!.fillerChars > 0);
  assert.equal(result.groups[0]!.containers[1]!.fillerChars, 0);

  // 没有 measureImage 时仍是不可测，整组跳过。
  const skipped = equalizeInteractiveContainerHeightsByPadding(
    imageColumnsCard(['短', '这是一段会折很多行的说明文字，用来把第二列撑高。']),
    { widths: [600] },
  );
  assert.equal(skipped.groups.length, 0);
  assert.equal(skipped.skipped[0]!.reason, 'unsupported-child');
});

test('嵌套 interactive_container 参与高度测量', () => {
  const nested = (content: string): JsonObject => ({
    tag: 'interactive_container',
    width: 'fill',
    padding: '10px 10px 10px 10px',
    elements: [{
      tag: 'interactive_container',
      width: 'fill',
      margin: '8px 0px 0px 0px',
      padding: '0px 0px 0px 0px',
      direction: 'horizontal',
      elements: [markdown(content, 'normal')],
    }],
  });
  const card: JsonObject = {
    schema: '2.0',
    body: {
      elements: [{
        tag: 'column_set',
        columns: [
          { tag: 'column', width: 'weighted', weight: 1, elements: [nested('短')] },
          {
            tag: 'column',
            width: 'weighted',
            weight: 1,
            elements: [nested('这是一段会折很多行的说明文字，用来把第二列撑高。')],
          },
        ],
      }],
    },
  };

  const result = equalizeInteractiveContainerHeightsByPadding(card, { widths: [600] });
  assert.equal(result.groups.length, 1);
  assert.equal(result.skipped.length, 0);
  assert.ok(result.groups[0]!.containers[0]!.fillerChars > 0);
});

test('preserveUnmeasuredFillers：测不出来的分组保留旧填充，默认仍然清理', () => {
  const card = imageColumnsCard(['短', '长文本']);
  const oldFiller = {
    tag: 'markdown',
    element_id: 'ofc_hfill_7',
    content: `${ZWSP}${IDEOGRAPHIC_SPACE.repeat(12)}`,
    text_size: 'notation',
  };
  const first = containersOf(card)[0]!;
  (first.elements as JsonObject[]).push(JSON.parse(JSON.stringify(oldFiller)));

  const cleaned = equalizeInteractiveContainerHeightsByPadding(card, { widths: [600] });
  assert.equal(cleaned.skipped[0]!.reason, 'unsupported-child');
  assert.equal(fillersOf(cleaned.card).length, 0);

  const preserved = equalizeInteractiveContainerHeightsByPadding(card, {
    widths: [600],
    preserveUnmeasuredFillers: true,
  });
  assert.equal(preserved.skipped[0]!.reason, 'unsupported-child');
  assert.deepEqual(fillersOf(preserved.card), [oldFiller]);
});
