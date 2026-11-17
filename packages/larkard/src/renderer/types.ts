/**
 * 渲染器类型。
 *
 * RAW 模型（CardElement / JsonCard / TextStyle 等）来自 adapter，避免两份
 * 定义漂移；这里只保留渲染上下文、选项与 VNode 类型。
 */
import type {
  BoxSpacing,
  CardElement,
  ElementProperty,
  HeaderTemplate,
  JsonCard,
  LinkURL,
  ListItem,
  NamedColor,
  SizeName,
  TableColumn,
  TableHeaderStyle,
  TextAlign,
  TextAttribute,
  TextStyle,
} from '../adapter/index.js';

export type {
  BoxSpacing,
  CardElement,
  ElementProperty,
  HeaderTemplate,
  JsonCard,
  LinkURL,
  ListItem,
  NamedColor,
  SizeName,
  TableColumn,
  TableHeaderStyle,
  TextAlign,
  TextAttribute,
  TextStyle,
};

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
  /**
   * 浏览器端按需注入图标字体 / emoji 雪碧 CSS。SSR 不设置，由调用方自行引入
   * `larkard/renderer/assets` 的 ALL_CSS 或 CSS 文件。
   */
  injectAssets?: (asset: 'icons' | 'emoji') => void;
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
   * 人员表（open_id -> { content 姓名, avatar_key / avatar_url 头像 }）。
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
  /**
   * 交互预览。默认关闭：回调按钮是不可点的 span，输入框是静态占位。
   * 打开后，回调按钮变成带 data-feishu-action 的 button，输入框/下拉框变成真实表单控件。
   * 宿主监听这些控件，自己把点击发回卡片服务。
   *
   * #23/D13 —— 宿主上报契约（静态渲染器不替宿主发请求）：
   * 飞书客户端点击后组装 event_type="card.action.client_msg" 事件，并经
   * im.v2.PutActionRequest（PUT_ACTION_V2，service id 2199）上报，信封必须自带：
   *   - messageId / actionId / traceId（宿主从消息上下文取）
   *   - form_value（表单控件当前值，key=字段 name）
   *   - client_channel / value（来自 data-feishu-action 上的 action 原文）
   * 若宿主直接复用 data-feishu-action 里的 action 原文上报，会缺上述信封字段，
   * 须自行补齐 PUT_ACTION_V2 信封后再发。
   */
  interactive?: boolean;
}

/**
 * 人员信息：person_v1 / person_list / at 元素只带 ID，姓名与头像 key 在这里。
 * 取自飞书消息 content 的 json_attachment.persons（按 open_id「ou_...」索引）；
 * fetchCardMessage 还会把信封 mentions 与 at_users 合并进来（含 @_user_N 别名键）。
 * avatar_key 是公开可访问的头像图 key（无需鉴权，见 PERSON_AVATAR_BASE）；
 * 本地预览也可用 avatar_url（含 data URI）直接给头像地址。
 */
export interface PersonInfo {
  person_id?: string;
  /** 显示名 */
  content?: string;
  type?: number;
  /** 头像图 key（形如 v3_00te_...），拼 avatarBaseURL 取图 */
  avatar_key?: string;
  /**
   * 直接可用的头像 URL（含 data URI）。
   * 本地预览虚拟用户没有飞书 avatar_key 时用这个；优先级低于 resolvePersonAvatar，高于 avatar_key。
   */
  avatar_url?: string;
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
  textMetrics?: { fontSize: number; lineHeight: number; sizeKey?: string };
  /**
   * column_set 注入给子 column 的分栏模式（#17/D7）。真机只在窄屏（卡片容器 ≤320px，
   * 即客户端 isWide 为 false）才用它覆盖列宽：stretch → 每列 100% 堆叠、
   * bisect / trisect → calc 等分、flow → 内容宽；宽屏时 flexMode 等同 none，列宽照常。
   * 内置 column 的覆盖已改由 CSS 类 + @container 完成（见 styles.css），
   * 这里保留模式信息供自定义组件使用。
   */
  columnSet?: { flexMode?: string; gap: number };
  /**
   * body 顶部 padding（#18/D8）：header 存在且模板为 default/disabled/空时，
   * 客户端把 body paddingTop 从 12 改为 8。由 index.ts 在渲染 body 前注入。
   */
  bodyPaddingTop?: number;
  /**
   * 是否处于 form 容器内。真机 select_img 仅在表单内显示选中态 checkbox/radio，
   * 表单外只是可点击的图片选项。form 渲染子元素时注入，不改变外部 ctx。
   */
  inForm?: boolean;
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
