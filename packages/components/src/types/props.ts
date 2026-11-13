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
  /** body.direction */
  bodyDirection?: 'vertical' | 'horizontal';
  /** body.padding */
  bodyPadding?: string;
  /** body.vertical_spacing */
  bodyVerticalSpacing?: string;
  /** body.horizontal_align */
  bodyHorizontalAlign?: 'left' | 'center' | 'right';
  children?: VNodeChild;
}

export interface HeaderTextTag {
  text: string;
  color?: string;
}

/**
 * 图标输入：token 字符串，或标准/自定义 icon 对象。
 * `size` 是官方 icon 对象字段（如 "10px 10px"），必须原样透传——
 * 折叠面板箭头、markdown 前缀图标都依赖它，丢掉会回落 16px。
 */
export type IconInput =
  | string
  | { tag?: 'standard_icon'; token: string; color?: string; size?: string }
  | { tag: 'custom_icon'; img_key: string; size?: string };

export interface HeaderProps {
  title: string;
  subtitle?: string;
  /** 图标 token，或已经是飞书 icon 对象。 */
  icon?: IconInput;
  theme?: HeaderTemplate;
  padding?: string;
  /** header.text_tag_list */
  textTagList?: HeaderTextTag[];
}

export interface DivProps extends CommonProps {
  text?: string;
  markdown?: boolean;
  icon?: IconInput;
  width?: string;
  textSize?: string;
  children?: VNodeChild;
}

export interface MarkdownProps extends CommonProps {
  content?: string;
  textAlign?: 'left' | 'center' | 'right';
  textSize?: string;
  icon?: IconInput;
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
  /** 按钮左侧图标。 */
  icon?: string | { tag?: 'standard_icon'; token: string; color?: string } | { tag: 'custom_icon'; img_key: string };
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
  horizontalAlign?: 'left' | 'center' | 'right';
  padding?: string;
  direction?: 'vertical' | 'horizontal';
  horizontalSpacing?: string;
  verticalSpacing?: string;
  backgroundStyle?: string;
  children?: VNodeChild;
}

/** 分栏（column_set）。注意：真机 column_set 没有垂直对齐（网页版引擎里走
 *  disableVerticalConfig），所以这里也不提供 verticalAlign——列内容垂直居中请写到
 *  每个 Column 的 verticalAlign 上。 */
export interface ColumnSetProps extends CommonProps {
  flexMode?: 'none' | 'stretch' | 'flow' | 'bisect' | 'trisect';
  horizontalSpacing?: string;
  horizontalAlign?: 'left' | 'center' | 'right';
  backgroundStyle?: string;
  children?: VNodeChild;
}

export interface FormProps extends CommonProps {
  name: string;
  /** 表单级 action。提交按钮自己没写 action 时继承这份绑定。 */
  action?: ActionInput;
  value?: Record<string, unknown>;
  direction?: 'vertical' | 'horizontal';
  verticalAlign?: 'top' | 'center' | 'bottom';
  horizontalSpacing?: string;
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
  /** 选项前缀图标（官方 options[].icon） */
  icon?: IconInput;
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
  /** 边框样式：default（带边框）/ text（无边框） */
  type?: 'default' | 'text';
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

export interface ImgCombinationImageProp {
  imgKey: string;
  imgId?: string;
  transparent?: boolean;
}

export interface ImgCombinationProps extends CommonProps {
  mode: 'double' | 'triple' | 'bisect' | 'trisect';
  images: Array<string | ImgCombinationImageProp>;
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
  /** 容器内子组件水平对齐 */
  horizontalAlign?: 'left' | 'center' | 'right';
  /** 容器内子组件垂直对齐 */
  verticalAlign?: 'top' | 'center' | 'bottom';
  /** 容器内子组件水平间距：small/medium/large/extra_large 或 "Npx" */
  horizontalSpacing?: string;
  /** 容器内子组件垂直间距：small/medium/large/extra_large 或 "Npx" */
  verticalSpacing?: string;
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
  /** 展开态标题文案；不写时沿用 title（官方 header.expanded_title） */
  expandedTitle?: string;
  expanded?: boolean;
  icon?: IconInput;
  iconPosition?: 'left' | 'right' | 'follow_text';
  iconExpandedAngle?: -180 | -90 | 90 | 180;
  backgroundColor?: string;
  headerBackgroundColor?: string;
  /** 标题区宽度（header.width）：fill / auto / auto_when_fold */
  headerWidth?: 'fill' | 'auto' | 'auto_when_fold';
  /** 标题区内垂直对齐（header.vertical_align） */
  headerVerticalAlign?: 'top' | 'center' | 'bottom';
  /** 标题区位置（header.position）：top 在内容上方（默认）/ bottom 在内容下方 */
  headerPosition?: 'top' | 'bottom';
  borderColor?: string;
  cornerRadius?: string;
  /** 面板内边距（collapsible_panel.padding） */
  padding?: string;
  /** 标题区内边距（header.padding），与面板 padding 是不同字段 */
  headerPadding?: string;
  direction?: 'vertical' | 'horizontal';
  /** 面板内水平对齐（collapsible_panel.horizontal_align） */
  horizontalAlign?: 'left' | 'center' | 'right';
  /** 面板内垂直对齐（collapsible_panel.vertical_align） */
  verticalAlign?: 'top' | 'center' | 'bottom';
  /** 面板内水平间距（collapsible_panel.horizontal_spacing） */
  horizontalSpacing?: string;
  /** 面板内垂直间距（collapsible_panel.vertical_spacing） */
  verticalSpacing?: string;
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
  imgId?: string;
  value?: string;
  disabled?: boolean;
  disabledTips?: string;
  hoverTips?: string;
  transparent?: boolean;
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
  disabledTips?: string;
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
