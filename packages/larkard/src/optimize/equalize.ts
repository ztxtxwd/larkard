/**
 * 分栏内的交互容器等高。
 *
 * 真机 interactive_container 的 `heightValue` 只认 pixels：height 为 auto 时完全由
 * 内容撑开，同一 column_set 里一列多一行字，这一列就比别的列高一截，卡片会显得
 * 「参差不齐」。这里在发送前把同一分栏各列的唯一 interactive_container 预测高度
 * 取最大值，写进每列的 `height: "Npx"`，让真机把它们拉成同一高度。
 *
 * 约束：
 * - 只处理公开 DSL（`body.elements` → `column_set` → `column` → `interactive_container`）；
 * - 每列必须恰好一个顶层 interactive_container，且还没写死高度；
 * - 列宽必须都是 weighted / 固定 px，auto 宽度算不出来就整组跳过；
 * - 容器里只测量 markdown / plain_text / div / img / button / hr 和嵌套的
 *   interactive_container；图片没有显式 `size` 时，需要调用方用 `measureImage`
 *   提供原始宽高比。图表、表格、音视频等拿不准的组件仍然整组跳过。
 *
 * 宽度敏感：固定高度在窄卡上可能不够。`widths` 可以传多个参考宽度（例如
 * `[600, 360]`），优化器取每个容器在所有宽度下的最大预测值，宁可留白不裁字。
 */
import {
  hasBackground,
  hasFixedHeight,
  horizontalSpacingPx,
  isHorizontal,
  isRecord,
  parseBox,
  type Box,
} from './box.js';
import {
  columnSetPadding,
  containerInnerWidth,
  containerOuterWidth,
  measureInteractiveContainer,
  type MeasureEnv,
} from './measure.js';
import { defaultMeasureText } from '../content/metrics.js';
import type {
  EqualizeHeightsOptions,
  EqualizeResult,
  EqualizedContainer,
  EqualizedGroup,
  HeightChange,
  JsonObject,
  Path,
  SkippedGroup,
  SkipReason,
} from './types.js';

/** 渲染器 `.universal-card-root { max-width: 600px }`。 */
const DEFAULT_CARD_WIDTH = 600;
/** 渲染器 `.universal-card-body { padding: 12px }`。 */
const DEFAULT_BODY_PADDING = 12;

interface ColumnBox {
  contentWidth: number;
}

interface GroupMeasurement {
  path: Path;
  containerPaths: Path[];
  heights: number[];
  innerWidths: number[];
}

interface Skip {
  path: Path;
  reason: SkipReason;
  detail?: string;
}

interface ScanResult {
  groups: Map<string, GroupMeasurement>;
  skipped: Map<string, Skip>;
}

interface ResolvedColumns {
  boxes: ColumnBox[];
}

function keyOf(path: Path): string {
  return JSON.stringify(path);
}

function cloneCard<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getParent(root: JsonObject, path: Path): JsonObject | unknown[] | undefined {
  let current: unknown = root;
  for (const seg of path.slice(0, -1)) {
    if (Array.isArray(current)) {
      current = current[Number(seg)];
    } else if (isRecord(current)) {
      current = current[seg as string];
    } else {
      return undefined;
    }
  }
  return isRecord(current) || Array.isArray(current) ? current : undefined;
}

function readAt(root: JsonObject, path: Path): unknown {
  const parent = getParent(root, path);
  if (!parent) return undefined;
  const last = path[path.length - 1]!;
  return Array.isArray(parent) ? parent[Number(last)] : parent[last as string];
}

function writeAt(root: JsonObject, path: Path, value: unknown): boolean {
  const parent = getParent(root, path);
  if (!parent) return false;
  const last = path[path.length - 1]!;
  if (Array.isArray(parent)) {
    parent[Number(last)] = value;
    return true;
  }
  parent[last as string] = value;
  return true;
}

function pathOf(base: Path, ...segments: Array<string | number>): Path {
  return [...base, ...segments];
}

/** column 的宽度形态：weighted 或固定 px；auto / 无法识别的值都算失败。 */
type ColumnWidth =
  | { kind: 'weighted'; weight: number }
  | { kind: 'fixed'; px: number };

function columnWidthOf(column: JsonObject): ColumnWidth | undefined {
  const raw = column.width;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { kind: 'fixed', px: Math.min(600, Math.max(16, raw)) };
  }
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  if (text === 'weighted') {
    const weight = Number(column.weight);
    return { kind: 'weighted', weight: Number.isFinite(weight) && weight > 0 ? weight : 1 };
  }
  const px = /^(\d+(?:\.\d+)?)px$/i.exec(text);
  if (px) {
    // 真机只认 [16,600] 的 px；越界按 auto，算不出来。
    const value = Number(px[1]);
    if (value < 16 || value > 600) return undefined;
    return { kind: 'fixed', px: value };
  }
  return undefined;
}

/**
 * column_set 的各列内容宽度。
 *
 * 宽屏时客户端直接忽略 flex_mode，列宽按 width / weight 计算：
 * - weighted：`flex-basis:0; flex-grow:weight`，先扣掉列间距、列 margin、固定列；
 * - px：固定宽度，超过整行时浏览器会按比例压缩（这里直接判失败，避免预测偏窄）。
 */
function resolveColumnBoxes(
  columnSet: JsonObject,
  availableWidth: number,
): ResolvedColumns | SkipReason {
  const columns = columnSet.columns;
  if (!Array.isArray(columns) || columns.length < 2) return 'too-few-columns';
  const margin = parseBox(columnSet.margin);
  const padding = columnSetPadding(columnSet);
  if (!margin || !padding) return 'auto-column-width';
  const inner = availableWidth - margin.left - margin.right - padding.left - padding.right;
  if (inner <= 0) return 'width-overflow';

  const gap = horizontalSpacingPx(columnSet.horizontal_spacing ?? columnSet.horizontalSpacing);
  const totalGap = gap * (columns.length - 1);
  let fixedSum = 0;
  let weightSum = 0;
  let marginSum = 0;
  const widths: ColumnWidth[] = [];
  const boxes: Array<{ padding: Box; margin: Box }> = [];

  for (const raw of columns) {
    if (!isRecord(raw) || raw.tag !== 'column') return 'non-column-child';
    const width = columnWidthOf(raw);
    if (!width) return 'auto-column-width';
    const colMargin = parseBox(raw.margin);
    const colPadding = parseBox(raw.padding);
    if (!colMargin || !colPadding) return 'auto-column-width';
    widths.push(width);
    boxes.push({ padding: colPadding, margin: colMargin });
    marginSum += colMargin.left + colMargin.right;
    if (width.kind === 'fixed') fixedSum += width.px;
    else weightSum += width.weight;
  }

  const free = inner - totalGap - marginSum - fixedSum;
  if (free < 0) return 'width-overflow';
  if (weightSum > 0 && free <= 0) return 'width-overflow';

  const contentWidths = widths.map((width, index) => {
    const box = boxes[index]!;
    const outer = width.kind === 'fixed'
      ? width.px
      : (free * width.weight) / weightSum;
    return outer - box.padding.left - box.padding.right;
  });
  if (contentWidths.some((width) => width <= 0)) return 'width-overflow';
  return { boxes: contentWidths.map((contentWidth) => ({ contentWidth })) };
}

function containerPathsOf(column: JsonObject, base: Path): Path[] {
  const elements = Array.isArray(column.elements) ? column.elements : [];
  const paths: Path[] = [];
  elements.forEach((el, index) => {
    if (isRecord(el) && el.tag === 'interactive_container') {
      paths.push([...base, 'elements', index]);
    }
  });
  return paths;
}

/**
 * 测量一个 column_set 组。返回失败原因时 group 不参与等高，但仍可能向下递归
 * 找嵌套组（由调用方决定）。
 */
function measureGroup(
  columnSet: JsonObject,
  availableWidth: number,
  path: Path,
  env: MeasureEnv,
  overwriteFixedHeight: boolean,
): { group?: GroupMeasurement; skip?: Skip; columns?: ResolvedColumns } {
  const rawColumns = Array.isArray(columnSet.columns) ? columnSet.columns : [];
  // 只关心「至少两列、且列里出现交互容器」的分栏；普通 KPI 分栏不要进 skipped 干扰调用方。
  const relevant = rawColumns.length >= 2 && rawColumns.some((column) =>
    isRecord(column)
    && Array.isArray(column.elements)
    && column.elements.some((el) => isRecord(el) && el.tag === 'interactive_container'),
  );

  const resolved = resolveColumnBoxes(columnSet, availableWidth);
  if (typeof resolved === 'string') {
    return relevant ? { skip: { path, reason: resolved } } : {};
  }
  if (!relevant) return { columns: resolved };
  const columns = columnSet.columns as JsonObject[];
  const containerPaths: Path[] = [];
  const heights: number[] = [];
  const innerWidths: number[] = [];

  for (let index = 0; index < columns.length; index++) {
    const column = columns[index]!;
    if (isHorizontal(column)) {
      return {
        skip: { path, reason: 'parallel-layout', detail: `column[${index}]` },
        columns: resolved,
      };
    }
    const columnPath = pathOf(path, 'columns', index);
    const paths = containerPathsOf(column, columnPath);
    if (paths.length !== 1) {
      return {
        skip: { path, reason: 'container-count', detail: `column[${index}]=${paths.length}` },
        columns: resolved,
      };
    }
    const container = (column.elements as unknown[])[
      (paths[0]![paths[0]!.length - 1] as number)
    ];
    if (!isRecord(container)) {
      return { skip: { path, reason: 'container-count' }, columns: resolved };
    }
    if (!overwriteFixedHeight && hasFixedHeight(container)) {
      return {
        skip: { path, reason: 'container-fixed-height', detail: `column[${index}]` },
        columns: resolved,
      };
    }
    if (isHorizontal(container)) {
      return {
        skip: { path, reason: 'parallel-layout', detail: `column[${index}]` },
        columns: resolved,
      };
    }
    const outerWidth = containerOuterWidth(container, resolved.boxes[index]!.contentWidth);
    if (outerWidth == null) {
      return {
        skip: { path, reason: 'container-width', detail: `column[${index}]` },
        columns: resolved,
      };
    }
    const measured = measureInteractiveContainer(container, outerWidth, env);
    if (measured.height == null) {
      const reason: SkipReason = measured.detail === 'empty'
        ? 'container-empty'
        : measured.detail === 'width-overflow'
          ? 'container-width'
          : 'unsupported-child';
      return {
        skip: { path, reason, detail: measured.detail ? `column[${index}]:${measured.detail}` : undefined },
        columns: resolved,
      };
    }
    containerPaths.push(paths[0]!);
    heights.push(measured.height);
    innerWidths.push(measured.innerWidth!);
  }

  return { group: { path, containerPaths, heights, innerWidths }, columns: resolved };
}

function scanElements(
  elements: unknown[],
  availableWidth: number,
  path: Path,
  env: MeasureEnv,
  overwriteFixedHeight: boolean,
  result: ScanResult,
): void {
  elements.forEach((raw, index) => {
    if (!isRecord(raw) || typeof raw.tag !== 'string') return;
    const elementPath = pathOf(path, index);

    if (raw.tag === 'column_set') {
      const measured = measureGroup(raw, availableWidth, elementPath, env, overwriteFixedHeight);
      if (measured.group) result.groups.set(keyOf(elementPath), measured.group);
      if (measured.skip) result.skipped.set(keyOf(elementPath), measured.skip);

      // 继续向下找嵌套分栏。
      if (measured.columns) {
        const columns = Array.isArray(raw.columns) ? raw.columns : [];
        columns.forEach((column, columnIndex) => {
          if (!isRecord(column) || !Array.isArray(column.elements)) return;
          scanElements(
            column.elements,
            measured.columns!.boxes[columnIndex]!.contentWidth,
            pathOf(elementPath, 'columns', columnIndex, 'elements'),
            env,
            overwriteFixedHeight,
            result,
          );
        });
      }
      return;
    }

    if (raw.tag === 'interactive_container') {
      const outerWidth = containerOuterWidth(raw, availableWidth);
      if (outerWidth == null) return;
      const innerWidth = containerInnerWidth(raw, outerWidth);
      if (innerWidth == null || !Array.isArray(raw.elements)) return;
      scanElements(
        raw.elements,
        innerWidth,
        pathOf(elementPath, 'elements'),
        env,
        overwriteFixedHeight,
        result,
      );
      return;
    }

    // form 和 collapsible_panel 的可用宽度规则不同（表单有默认宽度、折叠面板有
    // content padding），不在这里递归，避免算错嵌套组的宽度。
  });
}

function scanCard(
  card: JsonObject,
  cardWidth: number,
  env: MeasureEnv,
  overwriteFixedHeight: boolean,
): ScanResult {
  const result: ScanResult = { groups: new Map(), skipped: new Map() };
  const body = isRecord(card.body) ? card.body : undefined;
  if (!body || !Array.isArray(body.elements)) return result;
  const padding = body.padding == null
    ? { top: DEFAULT_BODY_PADDING, right: DEFAULT_BODY_PADDING, bottom: DEFAULT_BODY_PADDING, left: DEFAULT_BODY_PADDING }
    : parseBox(body.padding);
  if (!padding) return result;

  // 根节点 1px 描边 × 2（box-sizing:border-box）。
  const bodyWidth = cardWidth - 2 - padding.left - padding.right;
  if (bodyWidth <= 0) return result;
  scanElements(
    body.elements as unknown[],
    bodyWidth,
    ['body', 'elements'],
    env,
    overwriteFixedHeight,
    result,
  );
  return result;
}

/** 多宽度扫描时，每个组在每个宽度下都要成功；否则整组跳过。 */
function mergeSkips(
  scans: ScanResult[],
  keys: string[],
): Map<string, Skip> {
  const merged = new Map<string, Skip>();
  for (const scan of scans) {
    for (const [key, skip] of scan.skipped) {
      if (!merged.has(key)) merged.set(key, skip);
    }
    for (const key of keys) {
      if (!scan.groups.has(key) && !merged.has(key)) {
        merged.set(key, { path: scan.skipped.get(key)?.path ?? [], reason: 'unsupported-child' });
      }
    }
  }
  return merged;
}

export function normalizeWidths(options: EqualizeHeightsOptions): number[] {
  const raw = options.widths && options.widths.length > 0
    ? options.widths
    : [options.cardWidth ?? DEFAULT_CARD_WIDTH];
  const widths = raw.filter((width) => Number.isFinite(width) && width > 0);
  return widths.length > 0 ? widths : [DEFAULT_CARD_WIDTH];
}

/**
 * 把同一分栏各列的唯一 interactive_container 拉成等高。
 *
 * @example
 * ```ts
 * const { card, groups, skipped } = equalizeInteractiveContainerHeights(dsl);
 * // 窄屏也要覆盖时：{ widths: [600, 360] }
 * ```
 */
export function equalizeInteractiveContainerHeights(
  input: JsonObject,
  options: EqualizeHeightsOptions = {},
): EqualizeResult {
  const card = cloneCard(input);
  const widths = normalizeWidths(options);
  const env: MeasureEnv = {
    measure: options.measureText ?? defaultMeasureText,
    ...(options.measureImage ? { imageSize: options.measureImage } : {}),
  };
  const overwriteFixedHeight = options.overwriteFixedHeight === true;
  // 每个宽度单独扫描：宽度会改变列宽与折行。
  const scans = widths.map((width) => scanCard(card, width, env, overwriteFixedHeight));

  // 取所有扫描里出现过的组；某个宽度下失败的组整组跳过。
  const allKeys = new Set<string>();
  for (const scan of scans) {
    for (const key of scan.groups.keys()) allKeys.add(key);
    for (const key of scan.skipped.keys()) allKeys.add(key);
  }
  const mergedSkips = mergeSkips(scans, [...allKeys]);

  const safety = Number.isFinite(options.safety) ? options.safety! : 0;
  const minHeight = Number.isFinite(options.minHeight) ? options.minHeight! : undefined;
  const maxHeight = Number.isFinite(options.maxHeight) ? options.maxHeight! : undefined;
  const skipWhenEqual = options.skipWhenEqual !== false;

  const groups: EqualizedGroup[] = [];
  const skipped: SkippedGroup[] = [];
  const changes: HeightChange[] = [];

  for (const key of allKeys) {
    const skip = mergedSkips.get(key);
    if (skip) {
      skipped.push(skip);
      continue;
    }
    const runs = scans.map((scan) => scan.groups.get(key)!);
    const paths = runs[0]!.containerPaths;
    if (runs.some((run) => run.containerPaths.length !== paths.length)) {
      skipped.push({ path: runs[0]!.path, reason: 'container-count' });
      continue;
    }

    // 每个容器的估计高度 = 各参考宽度下的最大值。
    const containers: EqualizedContainer[] = paths.map((containerPath, index) => {
      const estimates = runs.map((run) => run.heights[index]!);
      return {
        path: containerPath,
        estimates,
        innerWidths: runs.map((run) => run.innerWidths[index]!),
        naturalHeight: Math.max(...estimates),
      };
    });
    const naturalHeight = Math.max(...containers.map((container) => container.naturalHeight));

    const needsEqual = runs.some((run) => {
      const max = Math.max(...run.heights);
      const min = Math.min(...run.heights);
      return max - min >= 1;
    });
    if (skipWhenEqual && !needsEqual) {
      skipped.push({ path: runs[0]!.path, reason: 'already-equal' });
      continue;
    }
    if (maxHeight != null && naturalHeight > maxHeight) {
      skipped.push({
        path: runs[0]!.path,
        reason: 'height-over-limit',
        detail: `${Math.ceil(naturalHeight)}>${maxHeight}`,
      });
      continue;
    }

    let applied = Math.ceil(naturalHeight + safety);
    if (minHeight != null) applied = Math.max(applied, Math.ceil(minHeight));
    if (maxHeight != null) applied = Math.min(applied, Math.floor(maxHeight));
    if (!(applied > 0)) {
      skipped.push({ path: runs[0]!.path, reason: 'width-overflow' });
      continue;
    }

    const value = `${applied}px`;
    for (const container of containers) {
      const from = readAt(card, container.path);
      const el = isRecord(from) ? from : undefined;
      if (!el) continue;
      const previous = el.height;
      el.height = value;
      changes.push({ path: container.path, from: previous, to: value });
    }
    groups.push({
      path: runs[0]!.path,
      height: applied,
      containers,
    });
  }

  return { card, widths, groups, skipped, changes };
}
