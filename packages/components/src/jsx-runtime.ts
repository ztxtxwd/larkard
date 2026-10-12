/**
 * 自定义 JSX 运行时。
 *
 * tsconfig:
 *   "jsx": "react-jsx",
 *   "jsxImportSource": "@open-feishu-card/components"
 *
 * 编译器会从 `@open-feishu-card/components/jsx-runtime` 导入 `jsx` / `jsxs`。
 */
import {
  FRAGMENT,
  VNODE,
  type Component,
  type JsxType,
  type VNode,
  type VNodeChild,
} from './types/vnode.js';

export { FRAGMENT, VNODE, isVNode } from './types/vnode.js';
export type { Component, JsxType, VNode, VNodeChild } from './types/vnode.js';

export type { CardConfig, FeishuCardJson, FeishuElement, HeaderTemplate } from './types/card.js';

function jsxImpl<P extends object>(
  type: JsxType | Component<P>,
  props: (P & { key?: string | number | null }) | null,
  key?: string | number | null,
): VNode<P> {
  const next: P & { key?: string | number | null } = props ? { ...props } : ({} as P);
  const propKey = next.key;
  if ('key' in next) delete next.key;
  return {
    [VNODE]: true,
    type,
    props: next,
    key: key ?? propKey ?? null,
  };
}

export function jsx<P extends object>(
  type: JsxType | Component<P>,
  props: P | null,
  key?: string | number,
): VNode<P> {
  return jsxImpl(type, props, key);
}

export const jsxs = jsx;

export function jsxDEV<P extends object>(
  type: JsxType | Component<P>,
  props: P | null,
  key: string | number | undefined,
  _isStaticChildren: boolean,
  _source?: { fileName: string; lineNumber: number; columnNumber?: number },
  _self?: unknown,
): VNode<P> {
  return jsxImpl(type, props, key);
}

export function Fragment(props: { children?: VNodeChild }): VNode<{ children?: VNodeChild }> {
  return jsxImpl(FRAGMENT, props, null);
}

/** 非 JSX 调用入口，语义与 `jsx` 相同。 */
export const h = jsx;

export function createElement<P extends object>(
  type: JsxType | Component<P>,
  props: P | null,
  ...children: VNodeChild[]
): VNode<P & { children?: VNodeChild }> {
  const merged = {
    ...(props ?? ({} as P)),
    children: children.length === 1 ? children[0] : children,
  } as P & { children?: VNodeChild };
  return jsx(type, merged);
}

export namespace JSX {
  export interface Element extends VNode<any> {}
  export interface ElementChildrenAttribute {
    children: {};
  }
  export interface IntrinsicElements {
    card: import('./types/props.js').CardProps;
    header: import('./types/props.js').HeaderProps;
    div: import('./types/props.js').DivProps;
    markdown: import('./types/props.js').MarkdownProps;
    plain_text: import('./types/props.js').PlainTextProps;
    button: import('./types/props.js').ButtonProps;
    hr: import('./types/props.js').HrProps;
    column_set: import('./types/props.js').ColumnSetProps;
    column: import('./types/props.js').ColumnProps;
    form: import('./types/props.js').FormProps;
    input: import('./types/props.js').InputProps;
    select_static: import('./types/props.js').SelectProps;
    img: import('./types/props.js').ImageProps;
    img_combination: import('./types/props.js').ImgCombinationProps;
    person: import('./types/props.js').PersonProps;
    person_list: import('./types/props.js').PersonListProps;
    chart: import('./types/props.js').ChartProps;
    table: import('./types/props.js').TableProps;
    audio: import('./types/props.js').AudioProps;
    video: import('./types/props.js').VideoProps;
    interactive_container: import('./types/props.js').InteractiveContainerProps;
    collapsible_panel: import('./types/props.js').CollapsiblePanelProps;
    collapse_divider: import('./types/props.js').CollapseDividerProps;
    note: import('./types/props.js').NoteProps;
    avatar: import('./types/props.js').AvatarProps;
    fallback_text: import('./types/props.js').FallbackTextProps;
    overflow: import('./types/props.js').OverflowProps;
    multi_select_static: import('./types/props.js').MultiSelectProps;
    select_person: import('./types/props.js').SelectPersonProps;
    multi_select_person: import('./types/props.js').MultiSelectPersonProps;
    date_picker: import('./types/props.js').DatePickerProps;
    picker_date: import('./types/props.js').DatePickerProps;
    picker_time: import('./types/props.js').TimePickerProps;
    picker_datetime: import('./types/props.js').DateTimePickerProps;
    select_img: import('./types/props.js').SelectImgProps;
    checker: import('./types/props.js').CheckerProps;
  }
}
