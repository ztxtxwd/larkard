/**
 * 卡片组件 tag 的规范清单。
 *
 * Schema 的判别联合仍是校验真源；这份清单是给编辑器补全、文档与工具使用的
 * 稳定枚举。`test/tags.test.ts` 会校验每个 tag 都能在 schema 源码里找到
 * 对应的 `z.literal(...)`，防止改名/删除后清单漂移。
 */
export const CARD_ELEMENT_TAGS = [
  'audio',
  'avatar',
  'button',
  'chart',
  'checker',
  'collapse_divider',
  'collapsible_panel',
  'column',
  'column_set',
  'date_picker',
  'div',
  'fallback_text',
  'form',
  'hr',
  'img',
  'img_combination',
  'input',
  'interactive_container',
  'markdown',
  'multi_select_person',
  'multi_select_static',
  'note',
  'overflow',
  'person',
  'person_list',
  'picker_datetime',
  'picker_time',
  'select_img',
  'select_person',
  'select_static',
  'table',
  'video',
] as const;

export type CardElementTag = (typeof CARD_ELEMENT_TAGS)[number];

/** 卡片根对象允许的顶层字段。 */
export const CARD_TOP_LEVEL_KEYS = ['schema', 'config', 'header', 'body'] as const;
