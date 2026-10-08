/** 轻量虚拟节点。JSX 工厂只建树，不碰飞书 JSON。 */

export const VNODE: unique symbol = Symbol.for('@open-feishu-card/components.vnode');

export const FRAGMENT: unique symbol = Symbol.for('@open-feishu-card/components.fragment');

export type VNodeChild =
  | VNode<any>
  | string
  | number
  | boolean
  | null
  | undefined
  | VNodeChild[];

export type Component<P extends object = any> = (
  props: P,
) => VNode<any> | VNode<any>[] | null;

/** 宿主标签、Fragment，或函数组件。`type` 用 any，避免 JSX 元素检查被 props 泛型卡死。 */
export type JsxType = string | Component<any> | typeof FRAGMENT;

export interface VNode<P = any> {
  readonly [VNODE]: true;
  type: any;
  props: P;
  key: string | number | null;
}

export function isVNode(value: unknown): value is VNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [VNODE]?: unknown })[VNODE] === true
  );
}
