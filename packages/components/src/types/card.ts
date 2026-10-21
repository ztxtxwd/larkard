/** 本包序列化出的飞书卡片 JSON 2.0 结构（组件库会用到的子集）。 */

export interface PlainTextObject {
  tag: 'plain_text';
  content: string;
}

export interface LarkMdObject {
  tag: 'lark_md';
  content: string;
}

export type TextObject = PlainTextObject | LarkMdObject;

export interface StandardIconObject {
  tag: 'standard_icon';
  token: string;
  color?: string;
  /** 图标尺寸，如 "10px 10px"；官方 icon 对象字段 */
  size?: string;
}

export interface CustomIconObject {
  tag: 'custom_icon';
  img_key: string;
  size?: string;
}

export type IconObject = StandardIconObject | CustomIconObject;

export interface OpenUrlBehavior {
  type: 'open_url';
  default_url: string;
  android_url?: string;
  ios_url?: string;
  pc_url?: string;
}

/**
 * 请求服务端动作。开放平台发消息（im/v1/messages）只接受 type = callback；
 * action_request 是客户端内部枚举，写进卡片 JSON 会返回 200621 unknown behavior type。
 */
export interface CallbackBehavior {
  type: 'callback';
  value: Record<string, unknown>;
}

/** @deprecated 与 CallbackBehavior 相同。发出去的类型必须是 callback。 */
export type ActionRequestBehavior = CallbackBehavior;

export type FeishuBehavior = OpenUrlBehavior | CallbackBehavior;

export interface FeishuButton {
  tag: 'button';
  text?: PlainTextObject;
  type?: string;
  size?: string;
  width?: string;
  disabled?: boolean;
  name?: string;
  icon?: IconObject;
  form_action_type?: 'submit' | 'reset';
  element_id?: string;
  margin?: string;
  /** 回传对象。函数 action 会写入 `__action_id` / `__params`。 */
  value?: Record<string, unknown>;
  behaviors?: FeishuBehavior[];
}

export interface FeishuDiv {
  tag: 'div';
  text?: TextObject;
  element_id?: string;
  margin?: string;
}

export interface FeishuMarkdown {
  tag: 'markdown';
  content: string;
  text_align?: 'left' | 'center' | 'right';
  text_size?: string;
  icon?: IconObject;
  element_id?: string;
  margin?: string;
}

export interface FeishuHr {
  tag: 'hr';
  element_id?: string;
  margin?: string;
}

export interface FeishuColumn {
  tag: 'column';
  width?: string;
  weight?: number;
  elements?: FeishuElement[];
  element_id?: string;
  margin?: string;
  vertical_align?: 'top' | 'center' | 'bottom';
  padding?: string;
  direction?: 'vertical' | 'horizontal';
  vertical_spacing?: string;
  background_style?: string;
}

export interface FeishuColumnSet {
  tag: 'column_set';
  columns: FeishuColumn[];
  flex_mode?: 'none' | 'stretch' | 'flow' | 'bisect' | 'trisect';
  horizontal_spacing?: string;
  horizontal_align?: 'left' | 'center' | 'right';
  background_style?: string;
  element_id?: string;
  margin?: string;
}

export interface FeishuInput {
  tag: 'input';
  name?: string;
  placeholder?: PlainTextObject;
  default_value?: string;
  label?: PlainTextObject;
  required?: boolean;
  disabled?: boolean;
  input_type?: 'text' | 'multiline_text' | 'password';
  max_length?: number;
  width?: string;
  element_id?: string;
  margin?: string;
  value?: Record<string, unknown>;
}

export interface FeishuSelectOption {
  text: PlainTextObject;
  value: string;
}

export interface FeishuSelect {
  tag: 'select_static';
  name?: string;
  placeholder?: PlainTextObject;
  options?: FeishuSelectOption[];
  initial_option?: string;
  required?: boolean;
  disabled?: boolean;
  width?: string;
  element_id?: string;
  margin?: string;
  value?: Record<string, unknown>;
  behaviors?: FeishuBehavior[];
}

export interface FeishuForm {
  tag: 'form';
  name: string;
  elements: FeishuElement[];
  element_id?: string;
  margin?: string;
  padding?: string;
  direction?: 'vertical' | 'horizontal';
  vertical_align?: 'top' | 'center' | 'bottom';
  horizontal_spacing?: string;
}

/** JSON 2.0 其余正文元素。字段与官方组件文档对齐，按 tag 区分。 */
export interface FeishuAnyElement {
  tag: string;
  [key: string]: unknown;
}

export type FeishuElement =
  | FeishuDiv
  | FeishuMarkdown
  | FeishuHr
  | FeishuButton
  | FeishuColumn
  | FeishuColumnSet
  | FeishuForm
  | FeishuInput
  | FeishuSelect
  | FeishuAnyElement;

export type HeaderTemplate =
  | 'blue'
  | 'wathet'
  | 'turquoise'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'carmine'
  | 'violet'
  | 'purple'
  | 'indigo'
  | 'grey'
  | 'default';

export interface FeishuTextTag {
  tag: 'text_tag';
  text: PlainTextObject;
  color?: string;
}

export interface FeishuHeader {
  title: PlainTextObject;
  subtitle?: PlainTextObject;
  template?: HeaderTemplate;
  icon?: IconObject;
  padding?: string;
  text_tag_list?: FeishuTextTag[];
}

export interface CardConfig {
  update_multi?: boolean;
  width_mode?: 'default' | 'compact' | 'fill';
  enable_forward?: boolean;
  enable_forward_interaction?: boolean;
  streaming_mode?: boolean;
  locales?: string[];
  summary?: { content?: string; i18n_content?: Record<string, string> };
  style?: {
    color?: Record<string, { light_mode?: string; dark_mode?: string }>;
  };
}

export interface FeishuCardJson {
  schema: '2.0';
  config?: CardConfig;
  header?: FeishuHeader;
  body?: {
    elements: FeishuElement[];
    direction?: 'vertical' | 'horizontal';
    padding?: string;
    vertical_spacing?: string;
    horizontal_align?: 'left' | 'center' | 'right';
  };
}
