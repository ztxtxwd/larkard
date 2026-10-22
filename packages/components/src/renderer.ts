import { serializeActionValue, type ActionInput } from './action.js';
import { tryRenderExtra } from './render-extra.js';
import { FRAGMENT, VNODE, isVNode, type VNode, type VNodeChild } from './types/vnode.js';
import type {
  CallbackBehavior,
  CustomIconObject,
  FeishuBehavior,
  FeishuButton,
  FeishuCardJson,
  FeishuColumn,
  FeishuElement,
  FeishuHeader,
  IconObject,
  PlainTextObject,
  StandardIconObject,
  TextObject,
} from './types/card.js';
import type {
  ButtonProps,
  CardProps,
  ColumnProps,
  ColumnSetProps,
  DivProps,
  FormProps,
  HeaderProps,
  HrProps,
  InputProps,
  MarkdownProps,
  PlainTextProps,
  SelectProps,
} from './types/props.js';

const MAX_UNWRAP = 32;

interface InheritedAction {
  action?: ActionInput;
  value?: Record<string, unknown>;
}

function compact<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) delete obj[key];
  }
  return obj;
}

function unwrap(node: VNode): VNode {
  let current = node;
  for (let depth = 0; depth < MAX_UNWRAP; depth += 1) {
    if (typeof current.type !== 'function') return current;
    const next = current.type(current.props);
    if (next == null) {
      throw new Error('组件返回了空节点，无法写入卡片 JSON');
    }
    if (Array.isArray(next)) {
      return {
        [VNODE]: true,
        type: FRAGMENT,
        props: { children: next },
        key: current.key,
      };
    }
    if (!isVNode(next)) throw new Error('组件必须返回 VNode');
    current = next;
  }
  throw new Error('组件展开层数过深');
}

/** 展开 Fragment 与函数组件，得到文本或宿主 VNode。 */
function expand(children: VNodeChild): Array<string | number | VNode> {
  const out: Array<string | number | VNode> = [];
  const walk = (value: VNodeChild): void => {
    if (value === null || value === undefined || typeof value === 'boolean') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      out.push(value);
      return;
    }
    if (!isVNode(value)) throw new Error('无法渲染的子节点');
    const host = unwrap(value);
    if (host.type === FRAGMENT) {
      walk((host.props as { children?: VNodeChild }).children);
      return;
    }
    if (typeof host.type !== 'string') throw new Error('无法渲染的子节点');
    out.push(host);
  };
  walk(children);
  return out;
}

function textOf(children: VNodeChild): string {
  let out = '';
  for (const item of expand(children)) {
    if (typeof item === 'string' || typeof item === 'number') {
      out += String(item);
      continue;
    }
    if (item.type === 'plain_text' || item.type === 'markdown') {
      const props = item.props as { content?: string; children?: VNodeChild };
      if (props.content) out += props.content;
      if (props.children !== undefined) out += textOf(props.children);
    }
  }
  return out;
}

function plain(content: string): PlainTextObject {
  return { tag: 'plain_text', content };
}

function textObject(content: string, markdown?: boolean): TextObject {
  return markdown ? { tag: 'lark_md', content } : { tag: 'plain_text', content };
}

function normalizeIcon(icon: HeaderProps['icon']): IconObject | undefined {
  if (icon === undefined) return undefined;
  if (typeof icon === 'string') return { tag: 'standard_icon', token: icon };
  // size 必须透传：折叠面板箭头 "10px 10px"、markdown 前缀图标都靠它，
  // 丢掉会回落到渲染器默认 16px，和真机大小对不上。
  if ('img_key' in icon) {
    return compact({ tag: 'custom_icon', img_key: icon.img_key, size: icon.size }) as CustomIconObject;
  }
  return compact({
    tag: 'standard_icon',
    token: icon.token,
    color: icon.color,
    size: icon.size,
  }) as StandardIconObject;
}

function withElementId(props: { elementId?: string; margin?: string }): {
  element_id?: string;
  margin?: string;
} {
  return compact({
    element_id: props.elementId,
    margin: props.margin,
  });
}

function behaviorsFor(
  value: Record<string, unknown> | undefined,
  url: string | undefined,
): FeishuBehavior[] | undefined {
  const list: FeishuBehavior[] = [];
  if (url) list.push({ type: 'open_url', default_url: url });
  if (value && Object.keys(value).length > 0) {
    const callback: CallbackBehavior = { type: 'callback', value };
    list.push(callback);
  }
  return list.length > 0 ? list : undefined;
}

function renderButton(props: ButtonProps, inherited?: InheritedAction): FeishuButton {
  const takesFormAction =
    props.action === undefined && (props.submit === true || props.formActionType === 'submit');
  const action = props.action ?? (takesFormAction ? inherited?.action : undefined);
  const userValue = props.value ?? (takesFormAction ? inherited?.value : undefined);
  const value = serializeActionValue(action, userValue);
  const formActionType = props.formActionType ?? (props.submit ? 'submit' : undefined);
  return compact({
    tag: 'button',
    text: plain(props.text ?? textOf(props.children)),
    type: props.type,
    size: props.size,
    width: props.width,
    disabled: props.disabled,
    name: props.name,
    icon: normalizeIcon(props.icon),
    form_action_type: formActionType,
    ...withElementId(props),
    value,
    behaviors: behaviorsFor(value, props.url),
  }) as FeishuButton;
}

function renderDiv(props: DivProps): FeishuElement {
  const fromChildren = textOf(props.children);
  const content = props.text ?? (fromChildren || undefined);
  return compact({
    tag: 'div',
    text: content !== undefined ? textObject(content, props.markdown) : undefined,
    width: props.width,
    text_size: props.textSize,
    icon: typeof props.icon === 'string' ? { tag: 'standard_icon', token: props.icon } : props.icon,
    ...withElementId(props),
  }) as FeishuElement;
}

function renderMarkdown(props: MarkdownProps): FeishuElement {
  return compact({
    tag: 'markdown',
    content: props.content ?? textOf(props.children),
    text_align: props.textAlign,
    text_size: props.textSize,
    icon: normalizeIcon(props.icon),
    ...withElementId(props),
  }) as FeishuElement;
}

function renderPlainText(props: PlainTextProps): FeishuElement {
  return compact({
    tag: 'div',
    text: plain(props.content ?? textOf(props.children)),
    ...withElementId(props),
  }) as FeishuElement;
}

function renderHeader(props: HeaderProps, fallbackTheme?: FeishuHeader['template']): FeishuHeader {
  if (!props.title) throw new Error('Header 需要 title');
  const textTagList = props.textTagList?.map((tag) =>
    compact({
      tag: 'text_tag' as const,
      text: plain(tag.text),
      color: tag.color,
    }),
  );
  return compact({
    title: plain(props.title),
    subtitle: props.subtitle ? plain(props.subtitle) : undefined,
    template: props.theme ?? fallbackTheme,
    icon: normalizeIcon(props.icon),
    padding: props.padding,
    text_tag_list: textTagList && textTagList.length > 0 ? textTagList : undefined,
  }) as FeishuHeader;
}

function renderColumn(props: ColumnProps, inherited?: InheritedAction): FeishuColumn {
  return compact({
    tag: 'column',
    width: props.width,
    weight: props.weight,
    vertical_align: props.verticalAlign,
    horizontal_align: props.horizontalAlign,
    padding: props.padding,
    direction: props.direction,
    horizontal_spacing: props.horizontalSpacing,
    vertical_spacing: props.verticalSpacing,
    background_style: props.backgroundStyle,
    ...withElementId(props),
    elements: renderElements(props.children, inherited),
  }) as FeishuColumn;
}

function renderInput(props: InputProps): FeishuElement {
  return compact({
    tag: 'input',
    name: props.name,
    placeholder: props.placeholder ? plain(props.placeholder) : undefined,
    default_value: props.defaultValue ?? props.value,
    label: props.label ? plain(props.label) : undefined,
    required: props.required,
    disabled: props.disabled,
    input_type: props.inputType,
    max_length: props.maxLength,
    width: props.width,
    ...withElementId(props),
  }) as FeishuElement;
}

function renderSelect(props: SelectProps): FeishuElement {
  const objectValue = typeof props.value === 'object' ? props.value : undefined;
  const callbackValue =
    props.action !== undefined || objectValue !== undefined
      ? serializeActionValue(props.action, objectValue)
      : undefined;
  const initial = props.initialOption ?? (typeof props.value === 'string' ? props.value : undefined);
  return compact({
    tag: 'select_static',
    name: props.name,
    // 边框样式：default 带边框 / text 无边框；官方字段名就是 type
    type: props.type,
    placeholder: props.placeholder ? plain(props.placeholder) : undefined,
    options: props.options.map((option) =>
      compact({
        text: plain(option.label ?? option.text ?? option.value),
        value: option.value,
        // 选项前缀图标：standard_icon / custom_icon，官方 options[].icon
        icon: normalizeIcon(option.icon),
      }),
    ),
    initial_option: initial,
    required: props.required,
    disabled: props.disabled,
    width: props.width,
    ...withElementId(props),
    value: callbackValue,
    behaviors: behaviorsFor(callbackValue, undefined),
  }) as FeishuElement;
}

function readProps<P extends object>(node: VNode): P {
  return node.props as unknown as P;
}

function renderHost(node: VNode, inherited?: InheritedAction): FeishuElement {
  switch (node.type) {
    case 'div':
      return renderDiv(readProps<DivProps>(node));
    case 'markdown':
      return renderMarkdown(readProps<MarkdownProps>(node));
    case 'plain_text':
      return renderPlainText(readProps<PlainTextProps>(node));
    case 'button':
      return renderButton(readProps<ButtonProps>(node), inherited);
    case 'hr': {
      const props = readProps<HrProps>(node);
      return compact({ tag: 'hr', ...withElementId(props) }) as FeishuElement;
    }
    case 'column_set': {
      const props = readProps<ColumnSetProps>(node);
      const columns = expand(props.children).map((child) => {
        if (typeof child === 'string' || typeof child === 'number' || child.type !== 'column') {
          throw new Error('ColumnSet 的子节点必须是 Column');
        }
        return renderColumn(readProps<ColumnProps>(child), inherited);
      });
      return compact({
        tag: 'column_set',
        flex_mode: props.flexMode,
        horizontal_spacing: props.horizontalSpacing,
        horizontal_align: props.horizontalAlign,
        vertical_align: props.verticalAlign,
        background_style: props.backgroundStyle,
        ...withElementId(props),
        columns,
      }) as FeishuElement;
    }
    case 'column':
      return renderColumn(readProps<ColumnProps>(node), inherited);
    case 'form': {
      const props = readProps<FormProps>(node);
      const next: InheritedAction = { action: props.action, value: props.value };
      return compact({
        tag: 'form',
        name: props.name,
        padding: props.padding,
        direction: props.direction,
        vertical_align: props.verticalAlign,
        horizontal_spacing: props.horizontalSpacing,
        ...withElementId(props),
        elements: renderElements(props.children, next),
      }) as FeishuElement;
    }
    case 'input':
      return renderInput(readProps<InputProps>(node));
    case 'select_static':
      return renderSelect(readProps<SelectProps>(node));
    case 'header':
      throw new Error('Header 只能放在 Card 下，不能作为正文元素');
    case 'card':
      throw new Error('Card 不能嵌套');
    default: {
      if (typeof node.type === 'string') {
        const extra = tryRenderExtra(node.type, node.props as Record<string, unknown>, (children) =>
          renderElements(children, inherited),
        );
        if (extra) return extra;
      }
      throw new Error(`未知的卡片节点 <${String(node.type)}>`);
    }
  }
}

function renderElements(children: VNodeChild, inherited?: InheritedAction): FeishuElement[] {
  const out: FeishuElement[] = [];
  for (const child of expand(children)) {
    if (typeof child === 'string' || typeof child === 'number') {
      out.push({ tag: 'markdown', content: String(child) });
      continue;
    }
    out.push(renderHost(child, inherited));
  }
  return out;
}

/** 把 VNode 树递归序列化成飞书卡片 JSON 2.0。根节点必须是 Card。 */
export function renderToCard(element: VNode): FeishuCardJson {
  const host = unwrap(element);
  if (host.type !== 'card') throw new Error('renderToCard 的根节点必须是 <Card>');
  const props = host.props as CardProps;
  let header: FeishuHeader | undefined;
  const elements: FeishuElement[] = [];
  for (const child of expand(props.children)) {
    if (typeof child === 'string' || typeof child === 'number') {
      elements.push({ tag: 'markdown', content: String(child) });
      continue;
    }
    if (child.type === 'header') {
      if (header) throw new Error('Card 只能有一个 Header');
      header = renderHeader(readProps<HeaderProps>(child), props.headerTheme);
      continue;
    }
    elements.push(renderHost(child));
  }
  return compact({
    schema: '2.0',
    config: props.config,
    header,
    body:
      elements.length > 0
        ? compact({
            direction: props.bodyDirection,
            padding: props.bodyPadding,
            vertical_spacing: props.bodyVerticalSpacing,
            horizontal_align: props.bodyHorizontalAlign,
            elements,
          })
        : undefined,
  }) as FeishuCardJson;
}
