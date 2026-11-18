/**
 * 飞书 Universal Card「RAW」格式的类型定义。
 * RAW = 飞书服务端归一化后下发的渲染数据（card.raw.json 里的 json_card）。
 *
 * 这是仓库内唯一一份 RAW 类型；renderer 直接从这里导入，不再维护副本。
 */

/** 文本样式属性 */
export type TextAttribute = 'bold' | 'italic' | 'strikethrough';

/** 命名颜色（飞书 12 色板 + 中性色） */
export type NamedColor =
  | 'blue' | 'wathet' | 'turquoise' | 'green' | 'yellow' | 'orange'
  | 'red' | 'carmine' | 'violet' | 'purple' | 'indigo' | 'grey' | 'neutral'
  | 'lime' | 'sunflower';

/** header 模板色 */
export type HeaderTemplate = NamedColor | 'default';

/** 对齐方式 */
export type TextAlign = 'left' | 'center' | 'right';

/** 字号枚举名（含 markdown text_size / RAW textStyle.size 全量） */
export type SizeName =
  | 'x-small' | 'small' | 'normal' | 'medium' | 'large'
  | 'x-large' | 'xx-large' | 'xxx-large' | 'xxxx-large'
  | 'notation' | 'heading'
  | 'heading-0' | 'heading-1' | 'heading-2' | 'heading-3' | 'heading-4';

/** 文本样式 */
export interface TextStyle {
  attributes?: TextAttribute[];
  color?: NamedColor | string;
  size?: SizeName | string;
  platformSize?: { pc?: SizeName | string; mobile?: SizeName | string };
  /** 自定义字色（RAW 的 customColor；snake_case 为兼容部分宿主） */
  customColor?: { lightMode?: string; darkMode?: string; light_mode?: string; dark_mode?: string };
  custom_color?: { lightMode?: string; darkMode?: string; light_mode?: string; dark_mode?: string };
}

/**
 * 通用元素：{ tag, id, property }。
 * property 的具体形状随 tag 不同，这里用宽松索引；常见字段单独标注。
 */
export interface CardElement {
  tag: string;
  id?: string;
  property?: ElementProperty;
  /** 降级渲染：引擎渲不出该元素时改渲 fallback（如 person_list 取不到人员数据时的纯文本姓名） */
  fallback?: CardElement;
}

/** 元素 property（并集：不同 tag 用到不同子集） */
export interface ElementProperty {
  /** 子元素（markdown / body / div / column / heading / blockquote 等） */
  elements?: CardElement[];
  /** 纯文本内容（plain_text / link / code_span 等） */
  content?: string;
  /** 文本样式 */
  textStyle?: TextStyle;
  /** 段落对齐 */
  textAlign?: TextAlign;
  originTag?: string;

  // ---- card_header ----
  template?: HeaderTemplate;
  /** 标题（header.title / img.title）：文本元素；RAW 形如 {tag, property:{content}} */
  title?: CardElement;
  subtitle?: CardElement;
  /** 标题右侧的彩色标签（每项 text_tag 元素）。DSL 用 snake_case，兼容 camelCase */
  text_tag_list?: CardElement[];
  textTagList?: CardElement[];

  // ---- column_set ----
  columns?: CardElement[];
  horizontal_spacing?: number | string;
  horizontal_align?: 'left' | 'center' | 'right';
  flex_mode?: string;

  // ---- column ----
  width?: 'weighted' | 'auto' | number | string;
  weight?: number;
  vertical_align?: 'top' | 'center' | 'bottom';
  vertical_spacing?: number | string;

  // ---- column_set / column（RAW 用 camelCase；保留 snake_case 兼容）----
  widthValue?: { type?: string; value?: number | string };
  horizontalSpacingValue?: { type?: string; value?: number | string };
  verticalSpacingValue?: { type?: string; value?: number | string };
  horizontalAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'center' | 'bottom';
  flexMode?: string;

  // ---- 容器通用：背景 / 内外边距（column / interactive_container / column_set）----
  backgroundStyle?: string;
  padding?: BoxSpacing;
  margin?: BoxSpacing;

  // ---- 悬浮提示（button / checker / interactive_container / select_img / video）----
  /** DSL 公开字段；RAW 通常已归一为 hoverTips */
  hover_tips?: CardElement;
  hoverTips?: CardElement;
  /** 禁用时的悬浮提示 */
  disabled_tips?: CardElement;
  disabledTips?: CardElement;

  // ---- interactive_container ----
  hasBorder?: boolean;

  // ---- img ----
  imageID?: string;
  /** DSL 公开字段；dslToRaw 常原样留在 property（未改名为 imageID） */
  img_key?: string;
  origin_key?: string;
  src?: string;
  url?: string | LinkURL;
  img_url?: string;
  /** RAW 里 alt 常为 plain_text 元素而非字符串 */
  alt?: CardElement | string;
  scale_type?: string;
  scaleType?: string;
  mode?: string;
  corner_radius?: number | string;

  // ---- video / audio ----
  // RAW：fileID（file_v3_...）；DSL：file_key。封面 coverImageID（常直接是 img_v3_...）。
  /** 媒体文件 key（视频/音频） */
  fileID?: string;
  file_key?: string;
  /** 视频封面图 key / 局部 imageID */
  coverImageID?: string;
  image_key?: string;
  cover_image_key?: string;
  /** 公开 DSL 官方封面形态 cover: { img_key }；部分 RAW 嵌套 imageID / image_id 等 */
  cover?: string | {
    img_key?: string;
    imageID?: string;
    image_id?: string;
    cover_image_id?: string;
    coverImageId?: string;
  };
  /** 是否显示时长（视频角标 / 音频时间） */
  showTime?: boolean;
  show_time?: boolean;
  /** 视频是否允许下载（透传，预览期仅影响 controlslist） */
  enableDownload?: boolean;
  enable_download?: boolean;
  /** 音频实例 id（卡片更新时保持播放状态） */
  audioID?: string;
  audio_id?: string;
  /** 是否显示进度条（音频） */
  showProgressBar?: boolean;
  show_progress_bar?: boolean;

  // ---- button ----
  type?: string;
  text?: CardElement;
  disabled?: boolean;
  behaviors?: Array<{ default_url?: { url?: string } }>;

  // ---- action ----
  actions?: CardElement[];
  layout?: string;

  // ---- at / person_v1 ----
  userID?: string;

  // ---- person_v1 / person_list ----
  // 人员组件：渲染头像 + 姓名。元素自身只带 ID，姓名/头像在 json_attachment.persons 里按
  // userID / persons[].id 反查。showAvatar/showName 控制显隐；
  // person_v1 size 走 PERSON_SINGLE_SIZE，person_list size 走 PERSON_LIST_SIZE。
  /** person_list：人员引用列表（每项 { id, type }），id 即 persons 表的 key（ou_...） */
  persons?: Array<{ id?: string; type?: string }>;
  /** 展示头像（person_v1 默认 true；person_list 按真值，与 showName 组合出四态） */
  showAvatar?: boolean;
  /** 展示姓名（person_v1 默认 true；person_list 按真值） */
  showName?: boolean;
  /** 胶囊样式（DSL style:"capsule" 会转成此字段） */
  pillShaped?: boolean;

  // ---- link ----（RAW 里 url 可能是对象 { pcURL, url, ... }）
  multiURL?: LinkURL;

  // ---- text_tag / number_tag ----
  color?: NamedColor | string;
  tagStyle?: NamedColor | string;
  backgroundColor?: string;
  /** 数字角标数字颜色（公开 DSL 为 font_color；RAW camelCase） */
  fontColor?: string;

  // ---- local_datetime ----
  /** Unix 毫秒时间戳（公开 DSL 为 millisecond） */
  milliseconds?: number | string;
  /** 时间展示格式枚举（公开 DSL 为 format_type） */
  formatType?: string;
  /** 点击时间跳转的链接 */
  link?: string;

  // ---- heading ----
  level?: number;

  // ---- list ----
  items?: ListItem[];

  // ---- code_block ----
  contents?: Array<{ contents?: Array<{ content?: string }> }>;
  language?: string;

  // ---- emoji ----
  key?: string;
  code?: string;
  emoji_type?: string;

  // ---- standard_icon / ud_icon ----
  /** 图标名，形如 "warning_outlined"，拼成 class="ud-icon_<token>" */
  token?: string;
  // size 复用上方 SizeName 字段位，但图标取值是 small/large1..4 另一套枚举，
  // 运行期按字符串查 ICON_SIZE_MAP；color 复用 NamedColor|string 字段。
  // ud_icon 形态把 color/size 收进 property.style（对象）；person 胶囊等把 style
  // 作为字符串枚举（'capsule'/'normal'）写入——与 adapter ElementProperty.style 对齐为联合类型。
  style?: string | { color?: string; size?: string; [key: string]: unknown };

  // ---- div 前置图标 ----（同一图标的两种形态，引擎取 udIcon || icon）
  // link 的 icon 在公开语法里只是图标 token 字符串，因此并集兼容 string。
  icon?: CardElement | string;
  udIcon?: CardElement;
  // ---- card_header 图标回退 ----（#20/D10：udIcon(token) → avatar(imageID)→Img Tiny）
  avatar?: CardElement;

  // ---- chart ----
  // 图表：chart_spec 直接就是 VChart 规格（type/data/xField/yField/seriesField/stack/legends…）。
  // 渲染器输出一个挂载容器（带 data-feishu-chart-spec），运行期由 hydrate 脚本 + VChart 画进 canvas。
  /** VChart 规格对象（原样透传给 VChart 构造） */
  chart_spec?: Record<string, unknown>;
  chartSpec?: Record<string, unknown>;
  /**
   * 宽高比，形如 "16:9"（决定容器 aspect-ratio）。
   * 缺省且 height 为 auto 时按飞书默认 "16:9"；height 为像素值时此字段失效。
   */
  aspect_ratio?: string;
  aspectRatio?: string;
  /**
   * 图表高度。飞书 JSON 2.0：`auto`（默认，按宽高比计算）或 `[1,999]px`（固定高度，此时忽略 aspect_ratio）。
   * RAW 形态也可能是 heightValue: { type:'pixels', value:number }。
   */
  height?: string;
  heightValue?: { type?: string; value?: number | string };

  // ---- table ----
  // 表格：columns（复用上方 column_set 的 columns 字段位）定义列
  // （name/display_name/width/data_type/horizontal_align/format），rows 是 { <列name>: 值 } 数组。
  // data_type=options 时值为 [{text,color}]，渲染成彩色标签。
  /** 行数据：每行是 { 列name: 值 } */
  rows?: Array<Record<string, unknown>>;
  /** 表头样式 */
  header_style?: TableHeaderStyle;
  headerStyle?: TableHeaderStyle;
  /** 行高枚举 low/middle/high（对应 32/54/88px），或自定义像素值（'48px' / 48） */
  row_height?: string;
  rowHeight?: string;
  /** 自动行高（row_height=auto）时的最大高度：'124px' / 124 */
  row_max_height?: string;
  rowMaxHeight?: string;
  /** RAW 行高对象：{type:'builtin_table_row_height'|'builtin_table_row_height_extension'|'pixels', value} */
  rowHeightValue?: { type?: string; value?: number | string };
  /** RAW 自动行高上限：{type:'pixels', value} */
  rowMaxHeightValue?: { type?: string; value?: number | string };
  /** 每页行数（预览里仅用于「显示前 N 行」，不做真实分页控件） */
  page_size?: number;
  pageSize?: number;
  /** 冻结首列（预览里不做横向滚动，仅保留字段兼容透传） */
  freeze_first_column?: boolean;

  /** 其它未显式声明的字段 */
  [key: string]: unknown;
}

/** 表格列定义 */
export interface TableColumn {
  /** 列 key，对应每行数据的字段名 */
  name: string;
  /** 表头显示名（缺省/空时与真机一致展示 "--"） */
  display_name?: string;
  /** 列宽："auto" / "120px" / "25%" / 数字 */
  width?: string | number;
  /** 单元格数据类型：text / number / options / markdown / lark_md / persons / date */
  data_type?: string;
  /** 单元格水平对齐 */
  horizontal_align?: 'left' | 'center' | 'right';
  /** 单元格垂直对齐（缺省 center） */
  vertical_align?: 'top' | 'center' | 'bottom';
  /** date 类型的展示格式（YYYY/MM/DD HH:mm 等占位符） */
  date_format?: string;
  /** number 类型的格式 */
  format?: { precision?: number; symbol?: string; separator?: boolean };
}

/** 表头样式 */
export interface TableHeaderStyle {
  text_align?: 'left' | 'center' | 'right';
  text_size?: string;
  background_style?: string;
  text_color?: string;
  bold?: boolean;
  /** 最大行数。缺省 1；'full_displayed' 表示不限行数 */
  lines?: number | string;
  /** RAW 形态：{type:'int_number',value:N} / {type:'builtin_table_header_lines',value:'full_displayed'} */
  linesValue?: { type?: string; value?: number | string };
}

/** RAW 的内/外边距：四向 { type:'pixels', value } */
export interface BoxSpacing {
  top?: { type?: string; value?: number };
  right?: { type?: string; value?: number };
  bottom?: { type?: string; value?: number };
  left?: { type?: string; value?: number };
}

/** 链接地址：可为直链字符串，或多端地址对象 */
export interface LinkURL {
  url?: string;
  pcURL?: string;
  iosURL?: string;
  androidURL?: string;
  harmonyURL?: string;
}

/** 列表项 */
export interface ListItem {
  type?: 'ul' | 'ol' | string;
  ordered?: boolean;
  level?: number;
  order?: number;
  elements?: CardElement[];
}

/** 卡片根对象（json_card） */
export interface JsonCard {
  schema?: string;
  header?: CardElement;
  body?: CardElement;
  newBody?: CardElement;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}
