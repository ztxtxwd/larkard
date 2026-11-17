/**
 * 补字符等高（不写死高度）。
 *
 * `height` 只接受 `auto` 或固定 px，同一张卡要在桌面和窄屏同时贴合，固定高度
 * 必然在一边留白或在另一边裁字。这里换一种思路：给矮的容器追加一段**不可见的
 * 可换行字符**，让它的内容自然撑到和最高列一样高。
 *
 * - 填充字符默认 `U+3000`（表意空格）：宽度 1em、不可见、可以在字与字之间换行；
 * - 内容以 `U+200B` 开头，避免整行被 markdown 当成空白行裁掉；
 * - 填充物是独立的 markdown 元素，`element_id` 以 `ofc_hfill_` 开头，重复运行
 *   时会先删掉旧填充再按当前内容重新计算；
 * - 每个参考宽度下，填充行数 = `ceil(chars / floor(内容宽 / 字宽))`，因此列越窄
 *   自动折出越多行。以 `widths[0]`（默认桌面）为主、其余宽度尽量贴合。
 *
 * 量化误差：填充按整行折行，和正文的折行阈值不一定重合。两个参考宽度可以精确
 * 对齐，中间宽度最多差 1 行（约一个字号的 line-height）。宁可有 1 行参差，也
 * 不写一个在桌面留下大片空白的固定高度。
 */
import { isRecord } from './box.js';
import { equalizeInteractiveContainerHeights, normalizeWidths } from './equalize.js';
import { containerRowGap } from './measure.js';
import {
  defaultMeasureText,
  lineHeightForFontSize,
  TEXT_SIZE_PX,
} from './text-metrics.js';
import type {
  JsonObject,
  PadHeightsOptions,
  PadHeightsResult,
  PaddedContainer,
  PaddedGroup,
  PaddingChange,
  Path,
  SkippedGroup,
} from './types.js';

/** 表意空格：全角、不可见、可按字换行。 */
const DEFAULT_FILLER_CHAR = '　';
/** 撑行用的字号：12px / 行高 22px，和大多数说明文字一致。 */
const DEFAULT_FILLER_TEXT_SIZE = 'notation';
/** 填充元素的 `element_id` 前缀；重复运行时据此识别并删除旧填充。 */
const DEFAULT_FILLER_ID_PREFIX = 'ofc_hfill_';
/** 单个容器最多补 600 个字符（约 50 行 @ 12px），超过就整组跳过。 */
const DEFAULT_MAX_FILLER_CHARS = 600;
/** 零宽空格：只负责让整行不被当成空白行。 */
const ZERO_WIDTH_SPACE = '​';

function cloneCard<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readAt(root: JsonObject, path: Path): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (Array.isArray(current)) current = current[Number(segment)];
    else if (isRecord(current)) current = current[segment as string];
    else return undefined;
  }
  return current;
}

/** 旧填充内容的字符数（去掉开头的零宽空格）。 */
function fillerCharsOf(content: unknown): number {
  if (typeof content !== 'string' || !content) return 0;
  const chars = Array.from(content);
  if (chars[0] === ZERO_WIDTH_SPACE) chars.shift();
  return chars.length;
}

/**
 * 删除卡片里所有旧填充元素。返回「容器对象 → 旧填充字符数」，
 * 用于 changes.from；WeakMap 的 key 是带 `elements` 数组的那个对象。
 */
function stripFillers(root: JsonObject, prefix: string): WeakMap<object, number> {
  const previous = new WeakMap<object, number>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!isRecord(value)) return;
    if (Array.isArray(value.elements)) {
      const kept: unknown[] = [];
      for (const el of value.elements) {
        if (
          isRecord(el)
          && typeof el.element_id === 'string'
          && el.element_id.startsWith(prefix)
        ) {
          previous.set(value, (previous.get(value) ?? 0) + fillerCharsOf(el.content));
          continue;
        }
        kept.push(el);
      }
      if (kept.length !== value.elements.length) value.elements = kept;
      kept.forEach(walk);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'elements') continue;
      walk(child);
    }
  };
  walk(root);
  return previous;
}

/** 一行能放下的填充字符数。 */
function charsPerLine(innerWidth: number, charWidth: number): number {
  return Math.max(1, Math.floor(innerWidth / charWidth));
}

/** 给定字符数，预测各宽度下的填充行数。 */
function fillerLinesAt(
  chars: number,
  innerWidths: readonly number[],
  charWidth: number,
): number[] {
  if (chars <= 0) return innerWidths.map(() => 0);
  return innerWidths.map((innerWidth) =>
    Math.ceil(chars / charsPerLine(innerWidth, charWidth)));
}

/**
 * 在调用方给的参考宽度之间补采样，避免只对齐两个端点、中间宽度差一行。
 * 步长 10px；端点原样保留，返回按宽度升序（重复宽度只留一个）。
 */
function withIntermediateWidths(requested: readonly number[]): number[] {
  const min = Math.min(...requested);
  const max = Math.max(...requested);
  const all = new Set<number>(requested);
  if (max - min >= 20) {
    for (let width = min + 10; width < max; width += 10) {
      all.add(width);
    }
  }
  return [...all].sort((a, b) => a - b);
}

interface FillerPlan {
  chars: number;
  lines: number[];
  heights: number[];
  errors: number[];
}

/**
 * 选一个填充字符数：优先贴合 `primaryIndex`（调用方传入的第一个参考宽度，
 * 通常是桌面），再最小化所有采样宽度的最大误差 / 误差项数 / 误差和，最后取
 * 更短的填充。
 */
function planFiller(
  deficits: readonly number[],
  innerWidths: readonly number[],
  lineHeight: number,
  charWidth: number,
  maxChars: number,
  primaryIndex: number,
): FillerPlan | undefined {
  if (!(charWidth > 0) || innerWidths.length === 0) return undefined;
  if (deficits.every((deficit) => deficit <= 0.5)) {
    return {
      chars: 0,
      lines: innerWidths.map(() => 0),
      heights: innerWidths.map(() => 0),
      errors: deficits.map((deficit) => (deficit === 0 ? 0 : -deficit)),
    };
  }
  const maxDeficit = Math.max(...deficits);
  const maxLines = Math.max(0, Math.ceil(maxDeficit / lineHeight)) + 1;
  const maxPerLine = Math.max(...innerWidths.map((w) => charsPerLine(w, charWidth)));
  const limit = Math.min(maxChars, maxLines * maxPerLine + maxPerLine);
  if (limit <= 0) return undefined;

  let best: FillerPlan | undefined;
  let bestScore: [number, number, number, number, number] | undefined;
  for (let chars = 0; chars <= limit; chars++) {
    const lines = fillerLinesAt(chars, innerWidths, charWidth);
    const heights = lines.map((n) => n * lineHeight);
    const errors = heights.map((height, index) => height - deficits[index]!);
    const primary = Math.abs(errors[primaryIndex] ?? 0);
    const max = Math.max(...errors.map((error) => Math.abs(error)));
    const bad = errors.filter((error) => Math.abs(error) > 0.5).length;
    const sum = errors.reduce((total, error) => total + Math.abs(error), 0);
    const score: [number, number, number, number, number] =
      [primary, max, bad, sum, chars];
    if (!bestScore || isBetterScore(score, bestScore)) {
      bestScore = score;
      best = { chars, lines, heights, errors };
    }
  }
  return best;
}

function isBetterScore(
  a: [number, number, number, number, number],
  b: [number, number, number, number, number],
): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! < b[i]! - 1e-9) return true;
    if (a[i]! > b[i]! + 1e-9) return false;
  }
  return false;
}

/**
 * 用不可见字符把同一分栏内的各列交互容器补到等高，不写 `height`。
 *
 * @example
 * ```ts
 * const { card, groups, skipped } = equalizeInteractiveContainerHeightsByPadding(dsl, {
 *   widths: [600, 360],
 *   overwriteFixedHeight: true, // 清掉旧 height 后再补字符
 * });
 * ```
 */
export function equalizeInteractiveContainerHeightsByPadding(
  input: JsonObject,
  options: PadHeightsOptions = {},
): PadHeightsResult {
  const fillerChar = options.fillerChar ?? DEFAULT_FILLER_CHAR;
  if (Array.from(fillerChar).length !== 1) {
    throw new Error('[optimize] fillerChar 必须是单个字符');
  }
  const fillerTextSize = options.fillerTextSize ?? DEFAULT_FILLER_TEXT_SIZE;
  const fillerFontSize = TEXT_SIZE_PX[fillerTextSize];
  if (fillerFontSize == null) {
    throw new Error(`[optimize] 未知的 fillerTextSize: ${fillerTextSize}`);
  }
  const fillerLineHeight = lineHeightForFontSize(fillerFontSize);
  const measure = options.measureText;
  const charWidth = (measure ?? defaultMeasureText)(fillerChar, fillerFontSize, false);
  const prefix = options.fillerElementIdPrefix ?? DEFAULT_FILLER_ID_PREFIX;
  if (prefix.length > 15) {
    throw new Error('[optimize] fillerElementIdPrefix 过长：element_id 最多 20 字符，前缀请控制在 15 字符内');
  }
  const maxChars = Number.isFinite(options.maxFillerChars)
    ? Math.max(0, Math.floor(options.maxFillerChars!))
    : DEFAULT_MAX_FILLER_CHARS;

  // 1) 先删掉上一轮的填充元素，按「没有填充」的状态重新测量。
  const card = cloneCard(input);
  const previous = stripFillers(card, prefix);

  // 2) 用「端点 + 中间采样」一起拟合填充长度；结果里只回报调用方要求的宽度。
  const requestedWidths = normalizeWidths(options);
  const fitWidths = withIntermediateWidths(requestedWidths);
  const requestedIndexes = requestedWidths.map((width) => fitWidths.indexOf(width));

  const measured = equalizeInteractiveContainerHeights(card, {
    cardWidth: options.cardWidth,
    widths: fitWidths,
    skipWhenEqual: false,
    overwriteFixedHeight: options.overwriteFixedHeight === true,
    measureText: options.measureText,
  });
  const skipped: SkippedGroup[] = [...measured.skipped];
  const groups: PaddedGroup[] = [];
  const changes: PaddingChange[] = [];
  let elementCounter = 0;

  const safety = Number.isFinite(options.safety) ? options.safety! : 0;
  const minHeight = Number.isFinite(options.minHeight) ? options.minHeight! : undefined;
  const maxHeight = Number.isFinite(options.maxHeight) ? options.maxHeight! : undefined;

  for (const group of measured.groups) {
    const estimates = group.containers.map((container) => container.estimates);
    const fitTargets = fitWidths.map((_, index) =>
      Math.max(...estimates.map((height) => height[index]!)));

    for (let index = 0; index < fitTargets.length; index++) {
      if (minHeight != null) fitTargets[index] = Math.max(fitTargets[index]!, minHeight);
      if (safety) fitTargets[index] = fitTargets[index]! + safety;
    }

    if (maxHeight != null && fitTargets.some((target) => target > maxHeight)) {
      skipped.push({
        path: group.path,
        reason: 'height-over-limit',
        detail: `${Math.ceil(Math.max(...fitTargets))}>${maxHeight}`,
      });
      continue;
    }

    const needsEqual = fitTargets.some((target, widthIndex) =>
      estimates.some((heights) => target - heights[widthIndex]! >= 1));
    if (options.skipWhenEqual !== false && !needsEqual) {
      skipped.push({ path: group.path, reason: 'already-equal' });
      continue;
    }

    const planned: Array<{
      path: Path;
      element: JsonObject;
      container: PaddedContainer;
      chars: number;
      fitEstimates: number[];
      fitHeights: number[];
      fitErrors: number[];
    }> = [];
    let failed = false;
    let publicTargets: number[] = [];

    for (let index = 0; index < group.containers.length; index++) {
      const source = group.containers[index]!;
      const element = readAt(card, source.path);
      if (!isRecord(element) || !Array.isArray(element.elements)) {
        failed = true;
        break;
      }
      const deficits = fitTargets.map((target, widthIndex) =>
        target - source.estimates[widthIndex]!);
      const plan = planFiller(
        deficits,
        source.innerWidths,
        fillerLineHeight,
        charWidth,
        maxChars,
        requestedIndexes[0]!,
      );
      if (!plan) {
        failed = true;
        break;
      }

      // 对外只回报调用方要求的宽度；填充长度本身是拿全量采样拟合的。
      const publicEstimates = requestedIndexes.map((widthIndex) =>
        source.estimates[widthIndex]!);
      const publicInnerWidths = requestedIndexes.map((widthIndex) =>
        source.innerWidths[widthIndex]!);
      publicTargets = requestedIndexes.map((widthIndex) => fitTargets[widthIndex]!);
      const publicLines = fillerLinesAt(plan.chars, publicInnerWidths, charWidth);
      const publicHeights = publicLines.map((lines) => lines * fillerLineHeight);
      const publicErrors = publicHeights.map((height, widthIndex) =>
        height - (publicTargets[widthIndex]! - publicEstimates[widthIndex]!));

      const container: PaddedContainer = {
        path: source.path,
        estimates: publicEstimates,
        innerWidths: publicInnerWidths,
        fillerChars: plan.chars,
        fillerLines: publicLines,
        fillerHeights: publicHeights,
        errors: publicErrors,
      };
      planned.push({
        path: source.path,
        element,
        container,
        chars: plan.chars,
        fitEstimates: source.estimates,
        fitHeights: plan.heights,
        fitErrors: plan.errors,
      });
    }

    if (failed) {
      skipped.push({ path: group.path, reason: 'filler-unavailable' });
      continue;
    }

    const maxError = Math.max(
      ...planned.flatMap(({ fitErrors }) => fitErrors.map((error) => Math.abs(error))),
    );
    const filledMax = Math.max(
      ...planned.flatMap(({ fitEstimates, fitHeights }) =>
        fitEstimates.map((height, index) => height + fitHeights[index]!)),
    );
    if (maxError > fillerLineHeight + 0.5 || (maxHeight != null && filledMax > maxHeight + 0.5)) {
      skipped.push({
        path: group.path,
        reason: 'filler-unavailable',
        detail: `max-error=${Math.round(maxError)}`,
      });
      continue;
    }

    for (const { path, element, chars } of planned) {
      const from = previous.get(element) ?? 0;
      if (options.overwriteFixedHeight === true && 'height' in element) {
        delete element.height;
      }
      if (chars > 0) {
        const elementId = `${prefix}${elementCounter++}`;
        const gap = containerRowGap(element);
        const filler: JsonObject = {
          tag: 'markdown',
          element_id: elementId,
          content: ZERO_WIDTH_SPACE + fillerChar.repeat(chars),
          text_size: fillerTextSize,
          ...(gap > 0 ? { margin: `-${gap}px 0px 0px 0px` } : {}),
        };
        (element.elements as unknown[]).push(filler);
        changes.push({ path, from, to: chars, elementId });
      } else if (from > 0) {
        changes.push({ path, from, to: 0, elementId: '' });
      }
    }

    groups.push({
      path: group.path,
      targets: publicTargets,
      containers: planned.map(({ container }) => container),
    });
  }

  return { card, widths: requestedWidths, groups, skipped, changes };
}
