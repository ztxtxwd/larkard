import { z } from 'zod';

/**
 * 交互组件 `behaviors` 的官方语义：
 * - 组件属性表对 button / select_* / date_picker 等标为必填；
 * - 表单容器示例中，进入 form 后交互推迟到 submit，这些组件可不写 behaviors。
 *
 * 因此：不在 form 内 → 必填；在 form 内（含 form 里的 column_set 等嵌套）→ 可选。
 *
 * @see https://open.feishu.cn/document/feishu-cards/card-json-v2-components/containers/form-container
 * @see https://open.feishu.cn/document/feishu-cards/configuring-card-interactions
 */

/** 表单外必须配置 behaviors 的组件 tag（属性表标「是」） */
export const BEHAVIORS_REQUIRED_OUTSIDE_FORM = new Set([
  'button',
  'select_static',
  'multi_select_static',
  'select_person',
  'multi_select_person',
  'date_picker',
  'picker_time',
  'picker_datetime',
  'select_img',
  'interactive_container',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasBehaviorsArray(el: Record<string, unknown>): boolean {
  return Array.isArray(el.behaviors);
}

/**
 * 遍历卡片树，按是否位于 form 内校验 behaviors。
 * 供 FeishuCardSchema.superRefine 使用。
 */
export function refineBehaviorsByFormContext(
  card: unknown,
  ctx: z.RefinementCtx,
): void {
  if (!isRecord(card)) return;
  const body = card.body;
  if (!isRecord(body)) return;
  const elements = body.elements;
  if (!Array.isArray(elements)) return;
  walkElements(elements, ['body', 'elements'], false, ctx);
}

function walkElements(
  elements: unknown[],
  path: (string | number)[],
  inForm: boolean,
  ctx: z.RefinementCtx,
): void {
  for (let i = 0; i < elements.length; i++) {
    walkNode(elements[i], [...path, i], inForm, ctx);
  }
}

function walkNode(
  node: unknown,
  path: (string | number)[],
  inForm: boolean,
  ctx: z.RefinementCtx,
): void {
  if (!isRecord(node)) return;
  const tag = node.tag;
  if (typeof tag !== 'string') return;

  if (tag === 'form') {
    if (Array.isArray(node.elements)) {
      walkElements(node.elements, [...path, 'elements'], true, ctx);
    }
    return;
  }

  if (
    BEHAVIORS_REQUIRED_OUTSIDE_FORM.has(tag) &&
    !inForm &&
    !hasBehaviorsArray(node)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'behaviors'],
      message:
        `组件 "${tag}" 在表单外必须配置 behaviors 数组（open_url / callback）；进入 form 后可省略（交互随 submit 提交）`,
    });
  }

  if (tag === 'column_set' && Array.isArray(node.columns)) {
    for (let c = 0; c < node.columns.length; c++) {
      const col = node.columns[c];
      if (!isRecord(col)) continue;
      if (Array.isArray(col.elements)) {
        walkElements(
          col.elements,
          [...path, 'columns', c, 'elements'],
          inForm,
          ctx,
        );
      }
    }
  }

  if (
    (tag === 'interactive_container' ||
      tag === 'collapsible_panel' ||
      tag === 'column') &&
    Array.isArray(node.elements)
  ) {
    walkElements(node.elements, [...path, 'elements'], inForm, ctx);
  }
}
