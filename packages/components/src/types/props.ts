import type { CardConfig, HeaderTemplate } from './card.js';
import type { ActionInput } from '../action.js';
import type { VNodeChild } from './vnode.js';

export interface CommonProps {
  elementId?: string;
  margin?: string;
  key?: string | number;
}

export interface CardProps extends CommonProps {
  headerTheme?: HeaderTemplate;
  config?: CardConfig;
  children?: VNodeChild;
}

export interface HeaderProps {
  title: string;
  subtitle?: string;
  /** 图标 token，或已经是飞书 icon 对象。 */
  icon?: string | { tag?: 'standard_icon'; token: string; color?: string } | { tag: 'custom_icon'; img_key: string };
  theme?: HeaderTemplate;
  padding?: string;
}

export interface FieldProp {
  text: string;
  /** 为 true 时 text 用 lark_md，否则 plain_text。 */
  markdown?: boolean;
  isShort?: boolean;
}

export interface DivProps extends CommonProps {
  text?: string;
  markdown?: boolean;
  fields?: FieldProp[];
  extra?: VNodeChild;
  children?: VNodeChild;
}

export interface MarkdownProps extends CommonProps {
  content?: string;
  textAlign?: 'left' | 'center' | 'right';
  textSize?: string;
  children?: VNodeChild;
}

export interface PlainTextProps extends CommonProps {
  content?: string;
  children?: VNodeChild;
}

export type ButtonType =
  | 'default'
  | 'primary'
  | 'danger'
  | 'text'
  | 'primary_text'
  | 'danger_text'
  | 'primary_filled'
  | 'danger_filled'
  | 'laser';

export interface ButtonProps extends CommonProps {
  type?: ButtonType;
  /** 具名函数、registerAction / bindAction 的结果，或 `{ id, params }`。 */
  action?: ActionInput;
  /** 原生回传对象。与 action 同时存在时合并，协议字段以 action 为准。 */
  value?: Record<string, unknown>;
  disabled?: boolean;
  /** 跳转地址，序列化为 behaviors.open_url。 */
  url?: string;
  text?: string;
  size?: 'tiny' | 'small' | 'medium' | 'large';
  width?: string;
  name?: string;
  /** 表单内提交/重置。 */
  formActionType?: 'submit' | 'reset';
  submit?: boolean;
  children?: VNodeChild;
}

export interface ActionGroupProps extends CommonProps {
  layout?: 'bisected' | 'trisection' | 'flow';
  children?: VNodeChild;
}

export interface HrProps extends CommonProps {}

export interface ColumnProps extends CommonProps {
  width?: 'auto' | 'weighted' | (string & {});
  weight?: number;
  verticalAlign?: 'top' | 'center' | 'bottom';
  padding?: string;
  children?: VNodeChild;
}

export interface ColumnSetProps extends CommonProps {
  flexMode?: 'none' | 'stretch' | 'flow' | 'bisect' | 'trisect';
  horizontalSpacing?: string;
  children?: VNodeChild;
}

export interface FormProps extends CommonProps {
  name: string;
  /** 表单级 action。提交按钮自己没写 action 时继承这份绑定。 */
  action?: ActionInput;
  value?: Record<string, unknown>;
  direction?: 'vertical' | 'horizontal';
  padding?: string;
  children?: VNodeChild;
}

export interface InputProps extends CommonProps {
  name: string;
  placeholder?: string;
  /** 展示用初值，写入 default_value。 */
  value?: string;
  defaultValue?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  inputType?: 'text' | 'multiline_text' | 'password';
  maxLength?: number;
  width?: string;
}

export interface SelectOptionProp {
  label?: string;
  text?: string;
  value: string;
}

export interface SelectProps extends CommonProps {
  name: string;
  options: SelectOptionProp[];
  placeholder?: string;
  initialOption?: string;
  /** 字符串时视为初始选中值。 */
  value?: string | Record<string, unknown>;
  action?: ActionInput;
  required?: boolean;
  disabled?: boolean;
  width?: string;
}
