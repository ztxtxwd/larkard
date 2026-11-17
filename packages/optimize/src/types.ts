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
   * `max-width: 605px`）。默认 605。
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
  | 'width-overflow';

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
