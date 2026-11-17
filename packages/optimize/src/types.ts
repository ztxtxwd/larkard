/** 公开 DSL 的普通 JSON 对象。优化器只处理 JSON，不引入 Zod / 渲染器依赖。 */
export type JsonObject = Record<string, unknown>;

/** 卡片内的 JSON 路径（与 `@open-feishu-card/check` 的 JSON Pointer 可互相换算）。 */
export type Path = Array<string | number>;

/**
 * 文字宽度测量。
 *
 * 默认实现是内置的硬编码字宽表（CJK 1em、ASCII 按 Arial 度量、再留一点字体差异余量），
 * 不依赖 DOM。浏览器端可以传入 `canvas.measureText` 的包装，拿到当前设备字体的精确值。
 */
export type MeasureText = (text: string, fontSize: number, bold: boolean) => number;

export interface EqualizeHeightsOptions {
  /**
   * 参考卡片宽度（px，含卡片 1px 描边，对应渲染器 `.universal-card-root` 的
   * `max-width: 600px`）。默认 600。
   *
   * 等高的固定高度对宽度敏感：卡片变窄后文字会多折行，按宽卡算出的高度会把
   * 最后一行裁掉。需要覆盖手机等窄屏时，用 `widths` 一次传多个宽度，优化器会
   * 取每个容器在所有宽度下的最大预测值（宁可有留白，也不裁字）。
   */
  cardWidth?: number;
  /** 多个参考宽度；给了就覆盖 `cardWidth`。 */
  widths?: readonly number[];
  /** 在最终统一高度上再加的安全余量（px），默认 0。 */
  safety?: number;
  /** 统一高度的下限（px）。内容需要更高时以内容为准。 */
  minHeight?: number;
  /**
   * 统一高度的上限（px）。自然高度超过上限时跳过该组，而不是强行裁字。
   */
  maxHeight?: number;
  /**
   * 各列预测高度本来就相同（差值 < 1px）时是否跳过，默认 `true`。
   * 跳过可以避免给本来能自适应的卡片钉死高度。
   */
  skipWhenEqual?: boolean;
  /**
   * 是否覆盖容器上已有的 `height`，默认 `false`。
   *
   * 默认跳过已写死高度的容器（可能是用户故意固定的图标底座）。如果这张卡
   * 之前跑过本优化、内容又改过，旧高度会让预测被跳过；这时传 `true` 重新按
   * 内容预测并覆盖。
   */
  overwriteFixedHeight?: boolean;
  /** 自定义文字测量；不传用内置字宽表。 */
  measureText?: MeasureText;
}

export interface EqualizedContainer {
  path: Path;
  /** 各参考宽度下的自然高度（不含 `safety`）。 */
  estimates: number[];
  /** 各参考宽度下容器内容区宽度（扣掉 padding 与描边），与 `estimates` 对齐。 */
  innerWidths: number[];
  /** 所有参考宽度里的最大自然高度。 */
  naturalHeight: number;
}

export interface EqualizedGroup {
  path: Path;
  /** 实际写入所有容器的 `height`（px 字符串，已取整并加 safety）。 */
  height: number;
  containers: EqualizedContainer[];
}

export type SkipReason =
  /** 少于 2 列，没有等高对齐的意义。 */
  | 'too-few-columns'
  /** columns 里混入了非 column 的节点。 */
  | 'non-column-child'
  /** 有列不是 weighted / 固定 px 宽（auto 宽度算不出来）。 */
  | 'auto-column-width'
  /** 列或容器是横向排列，子项宽度不是简单等分。 */
  | 'parallel-layout'
  /** 每列必须恰好一个顶层 interactive_container。 */
  | 'container-count'
  /** 目标容器已经写死了高度。 */
  | 'container-fixed-height'
  /** 目标容器没有子元素（真机直接不渲染）。 */
  | 'container-empty'
  /** 目标容器的宽度是 auto，或算出来非正。 */
  | 'container-width'
  /** 目标容器里有本优化器不会测量的组件。 */
  | 'unsupported-child'
  /** 各列预测高度本来就相同，无需钉死高度。 */
  | 'already-equal'
  /** 自然高度超过 `maxHeight`。 */
  | 'height-over-limit'
  /** 列间距 / margin 会把可用宽度吃成非正数。 */
  | 'width-overflow'
  /** 补字符模式找不到可用的填充方案（字宽异常或超出 `maxFillerChars`）。 */
  | 'filler-unavailable';

export interface SkippedGroup {
  path: Path;
  reason: SkipReason;
  /** 具体卡在哪：组件 tag、列下标或超出上限的高度。 */
  detail?: string;
}

export interface HeightChange {
  path: Path;
  from: unknown;
  to: string;
}

export interface EqualizeResult {
  /** 优化后的新卡片；入参不会被修改。 */
  card: JsonObject;
  /** 本次实际使用的参考宽度，顺序与 `containers[].estimates` 对齐。 */
  widths: number[];
  groups: EqualizedGroup[];
  skipped: SkippedGroup[];
  changes: HeightChange[];
}

/** 补字符模式的选项：在 `EqualizeHeightsOptions` 上增加填充物配置。 */
export interface PadHeightsOptions extends EqualizeHeightsOptions {
  /**
   * 填充字符，默认 `U+3000`（表意空格）。必须不可见、宽度接近 1em、且允许
   * 在字符之间换行；内容会以 `U+200B` 开头，防止整行被 markdown 当空白行裁掉。
   */
  fillerChar?: string;
  /** 填充 markdown 的 `text_size`，默认 `notation`（12px / 行高 22px）。 */
  fillerTextSize?: string;
  /** 单个容器最多补多少个填充字符，默认 600；需要更多则整组跳过。 */
  maxFillerChars?: number;
  /** 填充元素的 `element_id` 前缀，默认 `ofc_hfill_`；用于重复运行时的识别与替换。 */
  fillerElementIdPrefix?: string;
}

export interface PaddedContainer {
  path: Path;
  /** 补字符前的自然高度，与 `widths` 对齐。 */
  estimates: number[];
  /** 各参考宽度下容器内容区宽度，与 `widths` 对齐。 */
  innerWidths: number[];
  /** 实际追加的填充字符数（不含开头的 `U+200B`）。 */
  fillerChars: number;
  /** 预测的填充行数，与 `widths` 对齐。 */
  fillerLines: number[];
  /** 预测的填充高度（px），与 `widths` 对齐。 */
  fillerHeights: number[];
  /** 填充后高度相对目标高度的误差（px），与 `widths` 对齐。 */
  errors: number[];
}

export interface PaddedGroup {
  path: Path;
  /** 各参考宽度下统一后的目标高度（含 `safety` / `minHeight`）。 */
  targets: number[];
  containers: PaddedContainer[];
}

export interface PaddingChange {
  path: Path;
  /** 上一次的填充字符数（没有则为 0）。 */
  from: number;
  /** 本次写入的填充字符数（0 表示移除旧填充、不新增）。 */
  to: number;
  /** 填充元素的 `element_id`。 */
  elementId: string;
}

export interface PadHeightsResult {
  /** 优化后的新卡片；入参不会被修改。 */
  card: JsonObject;
  /** 本次实际使用的参考宽度，顺序与 `containers[].estimates` 对齐。 */
  widths: number[];
  groups: PaddedGroup[];
  skipped: SkippedGroup[];
  changes: PaddingChange[];
}

/** 文本富文本化选项。 */
export interface UpgradeTextOptions {
  /**
   * 是否把 `tag: "plain_text"` 的文本对象升级为 `lark_md`，默认 `true`。
   *
   * 只处理 schema 允许 `plain_text | lark_md` 的文本位置：header 标题、div.text、
   * checker.text、fallback_text.text、collapsible_panel 标题。按钮、下拉选项、
   * 确认弹窗、tips、img.alt 等字段 schema 固定为 `plain_text`，不会被改写。
   *
   * div 里的 text 不受此开关影响：`convertDiv` 为 true 时会随组件一起升级。
   */
  convertPlainText?: boolean;
  /**
   * 是否把普通文本组件 `div` 升级为富文本组件 `markdown`，默认 `true`。
   *
   * `div.width` 不是 `fill` 时（`auto` / 固定 px）会跳过：`markdown` 组件没有
   * `width`，直接转换会改变布局。跳过的 div 其 text 也保持原样。
   *
   * 设为 false 时只按 `convertPlainText` 升级 div.text，组件本身仍是 div。
   */
  convertDiv?: boolean;
  /**
   * 把 plain_text 内容转成 Markdown 时是否转义特殊字符，默认 `true`。
   *
   * 使用官方文档给出的 HTML 实体转义（`* → &#42;`、`< → &#60;` 等），保证
   * 原本的纯文本按字面量展示。已有 `lark_md` 内容不会被转义。关闭后，文本里的
   * `**`、`<at>`、`:OK:` 等会被当成 Markdown 语法。
   */
  escape?: boolean;
}

export type TextUpgradeKind = 'plain-text-to-lark-md' | 'div-to-markdown';

export interface TextUpgradeChange {
  path: Path;
  kind: TextUpgradeKind;
  from: 'plain_text' | 'div';
  to: 'lark_md' | 'markdown';
  /** plain_text 内容是否实际发生了 Markdown 转义。 */
  escaped: boolean;
  /** 转换时改名的字段（如 div.text.text_color → markdown.font_color）。 */
  mapped?: Record<string, string>;
  /** 转换时丢弃或不再生效的字段。 */
  lost?: string[];
}

export type TextUpgradeSkipReason =
  /** div 没有可转换的 text 对象。 */
  | 'div-no-text'
  /** div.text.tag 不是 plain_text / lark_md。 */
  | 'div-text-tag'
  /** div.text.content 不是字符串。 */
  | 'div-content'
  /** div.width 不是 fill，markdown 组件的布局无法保持。 */
  | 'div-width'
  /** div / text 上有本转换不认识的字段，跳过以避免静默丢字段。 */
  | 'div-unknown-field';

export interface TextUpgradeSkip {
  path: Path;
  reason: TextUpgradeSkipReason;
  detail?: string;
}

export interface UpgradeTextResult {
  /** 升级后的新卡片；入参不会被修改。 */
  card: JsonObject;
  changes: TextUpgradeChange[];
  skipped: TextUpgradeSkip[];
}
