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

export interface DivProps extends CommonProps {
  text?: string;
  markdown?: boolean;
  icon?: string | { tag?: 'standard_icon'; token: string; color?: string };
  width?: string;
  textSize?: string;
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

export interface ImageProps extends CommonProps {
  imgKey: string;
  alt: string;
  title?: string;
  scaleType?: 'crop_center' | 'crop_top' | 'fit_horizontal';
  size?: string;
  cornerRadius?: string;
  preview?: boolean;
  transparent?: boolean;
}

export interface ImgCombinationProps extends CommonProps {
  mode: 'double' | 'triple' | 'bisect' | 'trisect';
  images: Array<string | { imgKey: string }>;
  transparent?: boolean;
  cornerRadius?: string;
}

export interface PersonProps extends CommonProps {
  userId: string;
  size?: 'extra_small' | 'small' | 'medium' | 'large';
  showAvatar?: boolean;
  showName?: boolean;
  style?: 'normal' | 'capsule';
  notation?: string;
}

export interface PersonListProps extends CommonProps {
  persons: Array<string | { id: string }>;
  showName?: boolean;
  showAvatar?: boolean;
  size?: 'extra_small' | 'small' | 'medium' | 'large' | 'extra_large';
  mode?: 'name' | 'avatar' | 'nameAvatar';
  style?: 'normal' | 'notation';
  lines?: number;
  dropInvalidUserId?: boolean;
  icon?: string;
}

export interface ChartProps extends CommonProps {
  spec: Record<string, unknown>;
  aspectRatio?: '1:1' | '2:1' | '4:3' | '16:9';
  colorTheme?: 'brand' | 'rainbow' | 'complementary' | 'converse' | 'primary';
  preview?: boolean;
  height?: string;
}

export interface TableColumnProp {
  name: string;
  displayName?: string;
  dataType?: 'text' | 'lark_md' | 'options' | 'number' | 'persons' | 'date' | 'markdown';
  width?: string;
  verticalAlign?: 'top' | 'center' | 'bottom';
  horizontalAlign?: 'left' | 'center' | 'right';
  format?: Record<string, unknown>;
  dateFormat?: string;
}

export interface TableProps extends CommonProps {
  columns: TableColumnProp[];
  rows: Array<Record<string, unknown>>;
  pageSize?: number;
  rowHeight?: string;
  rowMaxHeight?: string;
  freezeFirstColumn?: boolean;
  headerStyle?: {
    textAlign?: 'left' | 'center' | 'right';
    textSize?: 'normal' | 'heading';
    backgroundStyle?: 'none' | 'grey';
    textColor?: 'default' | 'grey';
    bold?: boolean;
    lines?: number;
  };
}

export interface MediaFallbackProp {
  drop?: boolean;
  text?: string;
}

export interface AudioProps extends CommonProps {
  fileKey: string;
  audioId?: string;
  disabled?: boolean;
  disabledTips?: string;
  showProgressBar?: boolean;
  showTime?: boolean;
  timeDisplay?: 'default' | 'both';
  timePosition?: 'end' | 'start' | 'both_sides';
  style?: 'normal' | 'flat' | 'speak';
  width?: string;
  padding?: string;
  fallback?: 'drop' | string;
}

export interface VideoProps extends CommonProps {
  fileKey: string;
  cover?: string | { imgKey?: string };
  enableDownload?: boolean;
  showTime?: boolean;
  hoverTips?: string;
  fallback?: 'drop' | string;
}

export interface InteractiveContainerProps extends CommonProps {
  children?: VNodeChild;
  action?: ActionInput;
  value?: Record<string, unknown>;
  url?: string;
  width?: string;
  height?: string;
  direction?: 'vertical' | 'horizontal';
  padding?: string;
  backgroundStyle?: string;
  hasBorder?: boolean;
  borderColor?: string;
  cornerRadius?: string;
  disabled?: boolean;
  disabledTips?: string;
  hoverTips?: string;
}

export interface CollapsiblePanelProps extends CommonProps {
  title: string;
  titleMarkdown?: boolean;
  expanded?: boolean;
  icon?: string;
  iconPosition?: 'left' | 'right' | 'follow_text';
  iconExpandedAngle?: -180 | -90 | 90 | 180;
  backgroundColor?: string;
  headerBackgroundColor?: string;
  borderColor?: string;
  cornerRadius?: string;
  padding?: string;
  direction?: 'vertical' | 'horizontal';
  children?: VNodeChild;
}

export interface CollapseDividerProps extends CommonProps {}

/** 备注容器（note）：带边距的底部/正文备注块。 */
export interface NoteProps extends CommonProps {
  children?: VNodeChild;
  /** 是否为底部备注（isFooter），转发为 is_footer。 */
  isFooter?: boolean;
}

/** 引用块（blockquote）：内部按 renderElements 渲染子元素列表。 */
export interface BlockquoteProps extends CommonProps {
  children?: VNodeChild;
}

export interface AvatarProps extends CommonProps {
  userId: string;
  size?: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'custom';
  customSize?: number;
}

export interface FallbackTextProps extends CommonProps {
  text: string;
  markdown?: boolean;
  name?: string;
  action?: ActionInput;
  value?: Record<string, unknown>;
}

export interface OverflowOptionProp {
  text: string;
  value?: string;
  url?: string;
  pcUrl?: string;
  iosUrl?: string;
  androidUrl?: string;
}

export interface OverflowProps extends CommonProps {
  text?: string;
  options: OverflowOptionProp[];
  name?: string;
  action?: ActionInput;
  value?: Record<string, unknown>;
  disabled?: boolean;
  width?: string;
}

export interface MultiSelectProps extends CommonProps {
  name: string;
  options: Array<{ label?: string; text?: string; value: string }>;
  placeholder?: string;
  selectedValues?: string[];
  action?: ActionInput;
  value?: Record<string, unknown>;
  required?: boolean;
  disabled?: boolean;
  width?: string;
}

export interface SelectPersonProps extends CommonProps {
  name?: string;
  /** 省略则不限制候选范围。 */
  options?: Array<string | { value?: string }>;
  placeholder?: string;
  initialOption?: string;
  action?: ActionInput;
  value?: string | Record<string, unknown>;
  required?: boolean;
  disabled?: boolean;
  width?: string;
}

export interface MultiSelectPersonProps extends CommonProps {
  name: string;
  options?: Array<string | { value?: string }>;
  placeholder?: string;
  selectedValues?: string[];
  action?: ActionInput;
  value?: Record<string, unknown>;
  required?: boolean;
  disabled?: boolean;
  width?: string;
}

export interface DatePickerProps extends CommonProps {
  name?: string;
  initialDate?: string;
  placeholder?: string;
  action?: ActionInput;
  value?: Record<string, unknown>;
  required?: boolean;
  disabled?: boolean;
  width?: string;
}

export interface TimePickerProps extends CommonProps {
  name?: string;
  /** HH:mm */
  initialTime?: string;
  placeholder?: string;
  action?: ActionInput;
  value?: Record<string, unknown>;
  required?: boolean;
  disabled?: boolean;
  width?: string;
}

export interface DateTimePickerProps extends CommonProps {
  name?: string;
  /** yyyy-MM-dd HH:mm */
  initialDatetime?: string;
  placeholder?: string;
  action?: ActionInput;
  value?: Record<string, unknown>;
  required?: boolean;
  disabled?: boolean;
  width?: string;
}

export interface SelectImgOptionProp {
  imgKey: string;
  value?: string;
  disabled?: boolean;
}

export interface SelectImgProps extends CommonProps {
  options: SelectImgOptionProp[];
  name?: string;
  multiSelect?: boolean;
  layout?: 'stretch' | 'bisect' | 'trisect';
  style?: 'default' | 'laser';
  aspectRatio?: '1:1' | '16:9' | '4:3';
  selectedValues?: string[];
  action?: ActionInput;
  value?: Record<string, unknown>;
  required?: boolean;
  disabled?: boolean;
  width?: string;
  canPreview?: boolean;
}

export interface CheckerProps extends CommonProps {
  name?: string;
  checked?: boolean;
  text?: string;
  markdown?: boolean;
  overallCheckable?: boolean;
  showStrikethrough?: boolean;
  opacity?: number;
  action?: ActionInput;
  value?: Record<string, unknown>;
  disabled?: boolean;
  hoverTips?: string;
  /** 右侧按钮，最多 3 个。 */
  buttons?: VNodeChild;
}
