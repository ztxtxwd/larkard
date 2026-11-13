/**
 * 飞书 Universal Card「RAW」格式的类型定义。
 * RAW = 飞书服务端归一化后下发的渲染数据（card.raw.json 里的 json_card）。
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

  // ---- interactive_container ----
  hoverTips?: CardElement;
  hasBorder?: boolean;

  // ---- img ----
  imageID?: string;
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
  /** 编辑器私有胶囊标记（已废弃：胶囊外形现由 style 字符串枚举 Normal/Capsule 直接驱动；保留仅作 raw→DSL 兼容丢弃） */
  pillShaped?: boolean;

  // ---- link ----（RAW 里 url 可能是对象 { pcURL, url, ... }）
  multiURL?: LinkURL;

  // ---- text_tag ----
  color?: NamedColor | string;
  tagStyle?: NamedColor | string;
  backgroundColor?: string;

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
  // ud_icon 形态把 color/size 收进 property.style（对象）；standard_icon 直接挂 property。
  // person_v1 的 style 是客户端字符串枚举（Normal/Capsule），直接透传——故 style 为联合类型。
  style?: string | { color?: string; size?: string; [key: string]: unknown };

  // ---- div 前置图标 ----（同一图标的两种形态，引擎取 udIcon || icon）
  icon?: CardElement;
  udIcon?: CardElement;

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
  /** 行高枚举 low/middle/high */
  row_height?: string;
  rowHeight?: string;
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
  /** 表头显示名（缺省用 name） */
  display_name?: string;
  /** 列宽："auto" / "120px" / 数字 */
  width?: string | number;
  /** 单元格数据类型：text / number / options / markdown / lark_md / persons / date… */
  data_type?: string;
  /** 单元格水平对齐 */
  horizontal_align?: 'left' | 'center' | 'right';
  /** number 类型的格式（precision 小数位） */
  format?: { precision?: number; symbol?: string; separator?: boolean };
}

/** 表头样式 */
export interface TableHeaderStyle {
  text_align?: 'left' | 'center' | 'right';
  text_size?: string;
  background_style?: string;
  text_color?: string;
  bold?: boolean;
  lines?: number;
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

/** 渲染器可接受的输入：json_card 本身，或带外层包装的 card.raw.json */
export type CardInput =
  | JsonCard
  | { json_card: JsonCard; [key: string]: unknown }
  | { card: { json_card: JsonCard }; [key: string]: unknown };

/** 渲染选项 */
export interface RenderOptions {
  /** 浏览器环境的 document（默认取全局 document） */
  document?: Document;
  /** 遇到未注册的 tag 时打印警告 */
  warnOnUnknownTag?: boolean;
  /** 自定义图片地址解析：返回最终 src */
  resolveImage?: (property: ElementProperty) => string | null | undefined;
  /** 图片地址前缀：最终 src = imageBaseURL + imageID */
  imageBaseURL?: string;
  /**
   * 自定义音视频地址解析：返回最终可播放 src。
   * 真机走鉴权下载；同步渲染无 token 时需 caller 注入，否则 video/audio 只出壳/封面。
   */
  resolveMedia?: (property: ElementProperty, kind: 'video' | 'audio') => string | null | undefined;
  /** 音视频地址前缀：最终 src = mediaBaseURL + fileID */
  mediaBaseURL?: string;
  /**
   * 人员表（open_id -> { content 姓名, avatar_key 头像 }）。
   * person_v1 / person_list 元素只带 ID，姓名/头像在此反查。
   * 异步渲染（renderCardToStringAsync）会自动从 json_attachment.persons 填入；
   * 同步渲染若想出名字/头像，需手动传入。缺省时人员降级为固定头像 +「赵天雄」。
   */
  persons?: Record<string, PersonInfo>;
  /**
   * 头像图地址前缀：最终 src = avatarBaseURL + avatar_key + avatarURLSuffix。
   * 飞书头像 key 公开可取（无需鉴权），默认走 PERSON_AVATAR_BASE。
   */
  avatarBaseURL?: string;
  /** 头像 URL 后缀（默认含 image_size/format 查询串，见 PERSON_AVATAR_SUFFIX） */
  avatarURLSuffix?: string;
  /** 自定义头像地址解析：入参为命中的 PersonInfo，返回最终 src（优先级最高） */
  resolvePersonAvatar?: (person: PersonInfo) => string | null | undefined;
}

/**
 * 人员信息：person_v1 / person_list / at 元素只带 ID，姓名与头像 key 在这里。
 * 取自飞书消息 content 的 json_attachment.persons（按 open_id「ou_...」索引）；
 * fetchCardMessage 还会把信封 mentions 与 at_users 合并进来（含 @_user_N 别名键）。
 * avatar_key 是公开可访问的头像图 key（无需鉴权，见 PERSON_AVATAR_BASE）。
 */
export interface PersonInfo {
  person_id?: string;
  /** 显示名 */
  content?: string;
  type?: number;
  /** 头像图 key（形如 v3_00te_...），拼 avatarBaseURL 取图 */
  avatar_key?: string;
}

/**
 * 消息信封上的 @ 提及（data.items[0].mentions），不在 body.content 内。
 * 带 `user_id_type=open_id` 拉取时 id 为 open_id（ou_...）。
 */
export interface MessageMention {
  /** 用户 ID（open_id / user_id，取决于请求的 user_id_type） */
  id: string;
  id_type?: string;
  /** 提及占位键，如 "@_user_1"（部分 RAW at.userID 用此键） */
  key?: string;
  /** 显示名 */
  name?: string;
  tenant_key?: string;
}

/**
 * json_attachment.at_users 单条：与信封 mentions 互补，供 @ 渲染补全姓名。
 * key / mention_key 形如 "@_user_1"。
 */
export interface AtUserInfo {
  content?: string;
  name?: string;
  person_id?: string;
  id?: string;
  open_id?: string;
  key?: string;
  mention_key?: string;
  avatar_key?: string;
}

/**
 * 消息附件表：把卡片里 img 元素的局部序号（property.imageID，如 "19"）
 * 映射到飞书图床真实 key（origin_key，形如 img_v3_...）。
 * 取自飞书消息 content 的 json_attachment 字段。
 *
 * - persons：人员姓名/头像（open_id → PersonInfo）
 * - at_users：content 内的 @ 用户表（仍在 attachment；信封 mentions 见 MessageMention）
 * - images / videos / audios：媒体资源索引
 */
export interface JsonAttachment {
  images?: Record<string, { origin_key?: string }>;
  /** 人员表：open_id（ou_...） -> { content 姓名, avatar_key 头像 } */
  persons?: Record<string, PersonInfo>;
  /**
   * @ 提及用户表（仍在 body.content.json_attachment 内）。
   * 可为 open_id / @_user_N 索引的对象，或数组。
   * fetchCardMessage 会把它与信封 mentions 一并合并进 persons。
   */
  at_users?: Record<string, AtUserInfo> | AtUserInfo[];
  /** 视频附件表：fileID -> { key }（真机仅索引，可播放 URL 仍需鉴权下载） */
  videos?: Record<string, { key?: string }>;
  /** 音频附件表：fileID -> { key } */
  audios?: Record<string, { key?: string }>;
}

/**
 * 异步渲染选项：在同步 RenderOptions 基础上，支持用 access token 自动拉取图片。
 * accessToken 为可选——传了就把卡片图片拉取并内联（data URI）；不传则渲染成占位图。
 */
export interface AsyncRenderOptions extends RenderOptions {
  /** 飞书 access token（去掉 "Bearer " 前缀）。可选：有则拉图内联，无则占位。 */
  accessToken?: string;
  /** 消息 ID（om_...）。当输入是卡片对象而非 messageId 时，用它拼接图片接口 URL。 */
  messageId?: string;
  /** 注入自定义 fetch（默认用全局 fetch）。便于浏览器走代理或单测注入 mock。 */
  fetch?: typeof fetch;
  /** 接口基址，默认 https://open.feishu.cn/open-apis/im/v1 */
  apiBaseURL?: string;
}

/**
 * 异步渲染的输入：
 * - 字符串 → 当作 messageId，渲染器先拉整条消息（需 accessToken）；
 * - 卡片对象 → 直接渲染；带 json_attachment + token + messageId 时内联图片。
 */
export type CardMessageInput =
  | string
  | CardInput
  | { json_card: JsonCard; json_attachment?: JsonAttachment; messageId?: string; [key: string]: unknown };

/** 渲染上下文（传给每个组件） */
export interface RenderContext {
  options: RenderOptions;
  kernel: {
    getComponent: (tag: string) => ComponentFn | null;
    renderElement: (el: CardElement | null | undefined, ctx: RenderContext) => VNode | null;
    renderElements: (arr: CardElement[] | undefined, ctx: RenderContext) => VNode[];
  };
  /**
   * markdown 父级注入的正文字号（飞书对内联 Person 设 avatarFollowFontSize）。
   * 有此字段时，person_v1 按正文字号缩放，而非独立组件的 size 枚举（默认 medium）。
   */
  textMetrics?: { fontSize: number; lineHeight: number };
}

/** 组件渲染函数 */
export type ComponentFn = (el: CardElement, ctx: RenderContext) => VNode | null;

/** 轻量虚拟节点 */
export interface VNode {
  tag: string;
  props: VNodeProps;
  children: VNodeChild[];
}

export interface VNodeProps {
  className?: string;
  style?: Record<string, string | number | null | undefined>;
  dangerouslySetInnerHTML?: { __html: string };
  [key: string]: unknown;
}

export type VNodeChild = VNode | string | null | false;
