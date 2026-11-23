/**
 * 从图片像素里提取一组“可用的”主色，而不是直接拿 k-means 的原始簇。
 *
 * 步骤全部是确定性的：
 * 1. 按 alpha 过滤并按块做面积平均降采样；
 * 2. sRGB → OKLab；
 * 3. 加权中位切分（median cut），切到最多 maxColors 个簇；
 * 4. 合并感知上几乎相同的簇；
 * 5. 每个簇同时计算面积均值色和高彩度代表色（vivid）；
 * 6. 按色相分组、综合打分选强调色；
 * 7. 输出权重、中性色、强调色和若干统计指标。
 *
 * 不依赖 DOM 和随机数，输入同样的 RGBA 像素一定得到同样的结果。
 */

import {
  deltaE,
  hueDistance,
  oklabToRgba,
  rgbaToOklab,
  type Oklab,
  type Oklch,
  type Rgba,
} from './color.js';

export interface PixelData {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface ExtractOptions {
  /** 最多保留多少个色簇，默认 12。 */
  maxColors?: number;
  /** 降采样后的最长边，默认 192。 */
  maxEdge?: number;
  /** 低于这个 alpha 的像素直接忽略，默认 128。 */
  alphaThreshold?: number;
}

export interface ClusterColor {
  rgba: Rgba;
  oklch: Oklch;
  /** 0..1，像素权重占比。 */
  weight: number;
}

export interface PaletteCluster extends ClusterColor {
  /**
   * 簇内高彩度代表色。只用于强调色选择和彩度封顶，不参与中性色/面积统计。
   * 均匀簇里通常和均值相同；混合簇里保留被均值稀释的真实鲜艳度。
   */
  vivid: ClusterColor;
}

export interface ImagePalette {
  version: 2;
  polarity: 'light' | 'dark';
  clusters: PaletteCluster[];
  /** 图片的中性色（底色/灰阶倾向）。 */
  neutral: Oklch;
  /**
   * 强调色，最多 2 个。
   *
   * `C` 来自簇内 `vivid` 代表色（保留被面积均值稀释的鲜艳度），`H/L` 来自
   * 所属色相组面积最大的簇；低彩度主体色也会参与分组打分。调用方不能假设
   * accents 的彩度一定很高。
   */
  accents: Oklch[];
  metrics: {
    medianL: number;
    meanChroma: number;
    hueSpread: number;
  };
}

interface Sample {
  rgba: Rgba;
  ok: Oklab;
  weight: number;
}

interface Box {
  indices: number[];
  weight: number;
  min: Oklab;
  max: Oklab;
  /** 已经切不动了：保留权重参与最终均值，但不再参与选盒。 */
  locked?: boolean;
}

/** 合并/归一化阶段的簇，保留样本索引以便合并后重新计算 vivid。 */
interface WorkingCluster {
  indices: number[];
  rgba: Rgba;
  oklch: Oklch;
  /** 绝对样本权重，归一化前使用。 */
  weight: number;
}

const DEFAULT_MAX_COLORS = 12;
const DEFAULT_MAX_EDGE = 192;
const DEFAULT_ALPHA_THRESHOLD = 128;
const MERGE_DELTA_E = 0.025;
/**
 * 低到这个程度的彩度人眼几乎看不出色相。照片暗部 / 白平衡常见的
 * 0.004~0.008 色偏不能拿来给整张卡染色，否则灰石头会变成紫卡片。
 */
export const ACHROMATIC_CHROMA = 0.01;
/** 强调色候选：低彩度主体色也参与打分，不再用 0.045 的硬阈值。 */
const ACCENT_CANDIDATE_MIN_CHROMA = 0.004;
const ACCENT_CANDIDATE_MIN_WEIGHT = 0.001;
/** 色相组可见性：总面积不足不参与强调色，避免噪声。 */
const ACCENT_GROUP_MIN_WEIGHT = 0.008;
/** 同一个色相组内相邻簇的最大色相间隔。 */
const ACCENT_GROUP_HUE = 30;
/** 组得分 = 面积^0.5 × 彩度^1.1 × 明度窗口；让彩度比面积更有话语权。 */
const ACCENT_WEIGHT_EXPONENT = 0.5;
const ACCENT_CHROMA_EXPONENT = 1.1;
/** 每个簇取彩度最高的几个样本做 vivid，避免单个噪点。 */
const VIVID_TOP_SAMPLES = 5;
/** vivid 样本权重至少占簇权重的比例，过滤极小反光。 */
const VIVID_MIN_WEIGHT_RATIO = 0.005;
/** vivid 彩度至少比均值高 10% 才采用，避免抖动。 */
const VIVID_MIN_GAIN = 1.1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function samplePixels(
  pixels: PixelData,
  maxEdge: number,
  alphaThreshold: number,
): Sample[] {
  const { data, width, height } = pixels;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('图片尺寸无效');
  }
  if (data.length < width * height * 4) {
    throw new Error('像素数据长度和尺寸不一致');
  }

  const block = Math.max(1, Math.ceil(Math.max(width, height) / maxEdge));
  const samples: Sample[] = [];

  for (let top = 0; top < height; top += block) {
    for (let left = 0; left < width; left += block) {
      let r = 0;
      let g = 0;
      let b = 0;
      let weight = 0;
      const bottom = Math.min(height, top + block);
      const right = Math.min(width, left + block);

      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const offset = (y * width + x) * 4;
          const alpha = data[offset + 3] ?? 0;
          if (alpha < alphaThreshold) continue;
          const w = alpha / 255;
          r += (data[offset] ?? 0) * w;
          g += (data[offset + 1] ?? 0) * w;
          b += (data[offset + 2] ?? 0) * w;
          weight += w;
        }
      }

      if (weight <= 0) continue;
      const rgba: Rgba = {
        r: Math.round(r / weight),
        g: Math.round(g / weight),
        b: Math.round(b / weight),
        a: 1,
      };
      samples.push({ rgba, ok: rgbaToOklab(rgba), weight });
    }
  }

  if (samples.length === 0) {
    throw new Error('图片没有可用的不透明像素');
  }
  return samples;
}

function boxStats(samples: readonly Sample[], indices: readonly number[]): Box {
  let minL = Infinity;
  let minA = Infinity;
  let minB = Infinity;
  let maxL = -Infinity;
  let maxA = -Infinity;
  let maxB = -Infinity;
  let weight = 0;

  for (const index of indices) {
    const sample = samples[index]!;
    const { l, a, b } = sample.ok;
    minL = Math.min(minL, l);
    minA = Math.min(minA, a);
    minB = Math.min(minB, b);
    maxL = Math.max(maxL, l);
    maxA = Math.max(maxA, a);
    maxB = Math.max(maxB, b);
    weight += sample.weight;
  }

  return {
    indices: [...indices],
    weight,
    min: { l: minL, a: minA, b: minB },
    max: { l: maxL, a: maxA, b: maxB },
  };
}

function boxScore(box: Box): number {
  const range = Math.max(
    box.max.l - box.min.l,
    box.max.a - box.min.a,
    box.max.b - box.min.b,
  );
  if (range < 1e-6) return 0;
  return box.weight * range;
}

function splitBox(samples: readonly Sample[], box: Box): [Box, Box] | null {
  const ranges: Array<['l' | 'a' | 'b', number]> = [
    ['l', box.max.l - box.min.l],
    ['a', box.max.a - box.min.a],
    ['b', box.max.b - box.min.b],
  ];
  const axisOrder = { l: 0, a: 1, b: 2 } as const;
  ranges.sort((x, y) => y[1] - x[1] || axisOrder[x[0]] - axisOrder[y[0]]);
  const axis = ranges[0]![0];

  const sorted = [...box.indices].sort((x, y) => {
    const diff = samples[x]!.ok[axis] - samples[y]!.ok[axis];
    return diff !== 0 ? diff : x - y;
  });

  const total = box.weight;
  let cumulative = 0;
  let split = 0;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    cumulative += samples[sorted[i]!]!.weight;
    if (cumulative >= total / 2) {
      split = i + 1;
      break;
    }
  }
  // 权重全压在同一个色值上时上一步可能停在 0；退回按数量对半分。
  if (split <= 0 || split >= sorted.length) split = Math.floor(sorted.length / 2);
  if (split <= 0 || split >= sorted.length) return null;

  return [
    boxStats(samples, sorted.slice(0, split)),
    boxStats(samples, sorted.slice(split)),
  ];
}

function weightedMean(samples: readonly Sample[], indices: readonly number[]): { ok: Oklab; weight: number } {
  let l = 0;
  let a = 0;
  let b = 0;
  let weight = 0;
  for (const index of indices) {
    const sample = samples[index]!;
    l += sample.ok.l * sample.weight;
    a += sample.ok.a * sample.weight;
    b += sample.ok.b * sample.weight;
    weight += sample.weight;
  }
  if (weight <= 0) return { ok: { l: 0, a: 0, b: 0 }, weight: 0 };
  return { ok: { l: l / weight, a: a / weight, b: b / weight }, weight };
}

function oklabToOklch(ok: Oklab): Oklch {
  const c = Math.hypot(ok.a, ok.b);
  const h = c < 1e-7 ? 0 : ((Math.atan2(ok.b, ok.a) * 180) / Math.PI + 360) % 360;
  return { l: ok.l, c, h };
}

function chromaOf(ok: Oklab): number {
  return Math.hypot(ok.a, ok.b);
}

/**
 * 计算簇内高彩度代表色。
 *
 * 面积均值会把“鲜艳主体 + 过渡色”中和成脏灰；这里在簇内取彩度最高的几个
 * 样本再做加权平均，只用于强调色选择。三个保护条件：
 *
 * 1. 最多取 `VIVID_TOP_SAMPLES` 个样本，且必须占簇权重的
 *    `VIVID_MIN_WEIGHT_RATIO`，避免单个噪点/极小反光；
 * 2. vivid 彩度必须比均值高 `VIVID_MIN_GAIN`，否则视为同一颜色，退回均值；
 * 3. 均匀簇自然退回均值，不改变原有行为。
 */
function vividRepresentative(
  samples: readonly Sample[],
  indices: readonly number[],
  mean: { ok: Oklab; weight: number },
  totalWeight: number,
): ClusterColor {
  const meanOklch = oklabToOklch(mean.ok);
  const fallback = (): ClusterColor => ({
    rgba: oklabToRgba(mean.ok),
    oklch: meanOklch,
    weight: totalWeight > 0 ? mean.weight / totalWeight : 0,
  });

  if (indices.length <= 1 || mean.weight <= 0) return fallback();

  const sorted = [...indices].sort((x, y) => {
    const cx = chromaOf(samples[x]!.ok);
    const cy = chromaOf(samples[y]!.ok);
    return cy - cx || samples[y]!.weight - samples[x]!.weight || x - y;
  });
  const picked = sorted.slice(0, Math.min(VIVID_TOP_SAMPLES, sorted.length));
  const pickedWeight = picked.reduce((sum, index) => sum + samples[index]!.weight, 0);
  if (pickedWeight < mean.weight * VIVID_MIN_WEIGHT_RATIO) return fallback();

  const vivid = weightedMean(samples, picked);
  const vividOklch = oklabToOklch(vivid.ok);
  if (vividOklch.c < meanOklch.c * VIVID_MIN_GAIN) return fallback();

  return {
    rgba: oklabToRgba(vivid.ok),
    oklch: vividOklch,
    weight: totalWeight > 0 ? vivid.weight / totalWeight : 0,
  };
}

function medianLightness(clusters: readonly PaletteCluster[]): number {
  const sorted = [...clusters].sort((a, b) => a.oklch.l - b.oklch.l || b.weight - a.weight);
  let cumulative = 0;
  for (const cluster of sorted) {
    cumulative += cluster.weight;
    if (cumulative >= 0.5) return cluster.oklch.l;
  }
  return sorted.length > 0 ? sorted[sorted.length - 1]!.oklch.l : 0.5;
}

/** 宽明度窗口：中间调略占优，但不把深色品牌色排除在强调色之外。 */
function accentLightnessWindow(l: number): number {
  return 0.7 + 0.3 * (1 - Math.min(1, Math.abs(l - 0.6) / 0.6));
}

/**
 * 组内面积最大的簇决定色相；面积相同再比彩度/明度，保持确定性。
 *
 * 不取组内最彩的簇：香槟金的高光比车漆暗部更彩，但面积更大的车漆才代表
 * 主体，否则整张卡会被一小块偏红反光带偏。
 */
function representativeOf(group: readonly PaletteCluster[]): PaletteCluster {
  return [...group].sort((a, b) =>
    b.weight - a.weight
    || b.vivid.oklch.c - a.vivid.oklch.c
    || b.vivid.oklch.l - a.vivid.oklch.l
    || a.vivid.oklch.h - b.vivid.oklch.h)[0]!;
}

interface AccentGroupScore {
  hue: number;
  lightness: number;
  chroma: number;
  weight: number;
  score: number;
}

/**
 * 挑强调色色相。
 *
 * 不再用“彩度 ≥ 0.045 才算强调色”的硬阈值，而是先按色相分组，再综合打分：
 *
 * 1. 所有带可见色相的簇都是候选（`ACCENT_CANDIDATE_MIN_CHROMA`），
 *    相邻色相 < 30° 的簇归为同一片颜色；
 * 2. 组得分 = 面积^0.5 × 彩度^1.1 × 明度窗口。彩度的指数更高，让“面积小
 *    但鲜艳”的主体有机会胜出，但面积仍作为保底；
 * 3. 组内最大彩度必须达到 `ACHROMATIC_CHROMA`，且总面积达到
 *    `ACCENT_GROUP_MIN_WEIGHT` 才算可见颜色，避免灰图被噪声染色；
 * 4. 组色相取组内面积最大的簇，兼顾高光（小、更彩）和暗部（大、较灰）：
 *    香槟金车身最终落在车漆的色相附近，而不是某个反光点。
 *
 * 最多返回 2 个色相至少差 30° 的强调色。
 */
function pickAccentHues(clusters: readonly PaletteCluster[]): Oklch[] {
  const candidates = clusters
    .filter((cluster) => cluster.vivid.oklch.c >= ACCENT_CANDIDATE_MIN_CHROMA
      && cluster.weight >= ACCENT_CANDIDATE_MIN_WEIGHT)
    .sort((a, b) =>
      a.vivid.oklch.h - b.vivid.oklch.h
      || b.weight - a.weight
      || b.vivid.oklch.c - a.vivid.oklch.c
      || a.vivid.oklch.l - b.vivid.oklch.l);
  if (candidates.length === 0) return [];

  // 在最大色相空隙处断开，避免 0°/360° 跨圈把红和品红错误合并。
  let start = 0;
  let largestGap = -1;
  for (let i = 0; i < candidates.length; i += 1) {
    const next = candidates[(i + 1) % candidates.length]!;
    const gap = hueDistance(candidates[i]!.vivid.oklch.h, next.vivid.oklch.h);
    if (gap > largestGap) {
      largestGap = gap;
      start = (i + 1) % candidates.length;
    }
  }
  const ordered = [...candidates.slice(start), ...candidates.slice(0, start)];

  const groups: PaletteCluster[][] = [];
  for (const cluster of ordered) {
    const group = groups[groups.length - 1];
    const previous = group?.[group.length - 1];
    if (group && previous
      && hueDistance(previous.vivid.oklch.h, cluster.vivid.oklch.h) < ACCENT_GROUP_HUE) {
      group.push(cluster);
    } else {
      groups.push([cluster]);
    }
  }

  const scored: AccentGroupScore[] = [];
  for (const group of groups) {
    const weight = group.reduce((sum, cluster) => sum + cluster.weight, 0);
    const maxChroma = Math.max(...group.map((cluster) => cluster.vivid.oklch.c));
    if (maxChroma < ACHROMATIC_CHROMA || weight < ACCENT_GROUP_MIN_WEIGHT) continue;

    const representative = representativeOf(group);
    const hue = representative.vivid.oklch.h;
    const lightness = representative.vivid.oklch.l;
    const score = weight ** ACCENT_WEIGHT_EXPONENT
      * maxChroma ** ACCENT_CHROMA_EXPONENT
      * accentLightnessWindow(lightness);
    scored.push({ hue, lightness, chroma: maxChroma, weight, score });
  }

  scored.sort((a, b) =>
    b.score - a.score
    || b.chroma - a.chroma
    || b.weight - a.weight
    || a.hue - b.hue);

  const picked: AccentGroupScore[] = [];
  for (const group of scored) {
    if (picked.length >= 2) break;
    if (picked.some((item) => hueDistance(item.hue, group.hue) < ACCENT_GROUP_HUE)) continue;
    picked.push(group);
  }

  return picked.map((group) => ({ l: group.lightness, c: group.chroma, h: group.hue }));
}

/**
 * 提取图片调色板。纯函数，不读 DOM、不用随机数。
 */
export function extractImagePalette(
  pixels: PixelData,
  options: ExtractOptions = {},
): ImagePalette {
  const maxColors = Math.max(2, options.maxColors ?? DEFAULT_MAX_COLORS);
  const maxEdge = Math.max(16, options.maxEdge ?? DEFAULT_MAX_EDGE);
  const alphaThreshold = clamp(options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD, 0, 255);

  const samples = samplePixels(pixels, maxEdge, alphaThreshold);
  let boxes: Box[] = [boxStats(samples, samples.map((_, index) => index))];

  while (boxes.length < maxColors) {
    let bestIndex = -1;
    let bestScore = 0;
    for (let i = 0; i < boxes.length; i += 1) {
      const box = boxes[i]!;
      if (box.locked) continue;
      const score = boxScore(box);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) break;
    const box = boxes[bestIndex]!;
    const pair = splitBox(samples, box);
    if (!pair) {
      box.locked = true;
      continue;
    }
    boxes = [...boxes.slice(0, bestIndex), ...boxes.slice(bestIndex + 1), ...pair];
  }

  const totalWeight = boxes.reduce((sum, box) => sum + box.weight, 0);
  const working: WorkingCluster[] = boxes
    .map((box) => {
      const mean = weightedMean(samples, box.indices);
      return {
        indices: box.indices,
        rgba: oklabToRgba(mean.ok),
        oklch: oklabToOklch(mean.ok),
        weight: mean.weight,
      };
    })
    .filter((cluster) => cluster.weight > 0);

  // 合并感知上几乎相同的簇，避免一张灰底照片里出现五个灰。
  // 保留样本索引，合并后再从完整簇成员里计算 vivid。
  working.sort(compareClusters);
  const merged: WorkingCluster[] = [];
  for (const cluster of working) {
    const existing = merged.find((item) => deltaE(item.rgba, cluster.rgba) < MERGE_DELTA_E);
    if (!existing) {
      merged.push({ ...cluster, indices: [...cluster.indices] });
      continue;
    }
    const total = existing.weight + cluster.weight;
    if (total > 0) {
      const a = rgbaToOklab(existing.rgba);
      const b = rgbaToOklab(cluster.rgba);
      const t = cluster.weight / total;
      const ok = {
        l: a.l + (b.l - a.l) * t,
        a: a.a + (b.a - a.a) * t,
        b: a.b + (b.b - a.b) * t,
      };
      existing.rgba = oklabToRgba(ok);
      existing.oklch = oklabToOklch(ok);
      existing.weight = total;
      for (const index of cluster.indices) existing.indices.push(index);
    }
  }

  const mergedWeight = merged.reduce((value, cluster) => value + cluster.weight, 0);
  if (mergedWeight > 0) {
    for (const cluster of merged) cluster.weight /= mergedWeight;
  }
  merged.sort(compareClusters);

  const clusters: PaletteCluster[] = merged.slice(0, maxColors).map((cluster) => ({
    rgba: cluster.rgba,
    oklch: cluster.oklch,
    weight: cluster.weight,
    vivid: vividRepresentative(
      samples,
      cluster.indices,
      { ok: rgbaToOklab(cluster.rgba), weight: cluster.weight * mergedWeight },
      totalWeight,
    ),
  }));

  const neutrals = clusters.filter((cluster) => cluster.oklch.c < 0.04);
  const neutralSource = neutrals.length > 0 ? neutrals : clusters;
  const neutralWeight = neutralSource.reduce((value, cluster) => value + cluster.weight, 0);
  const neutralLab = neutralSource.reduce(
    (acc, cluster) => {
      const ok = rgbaToOklab(cluster.rgba);
      const weight = neutralWeight > 0 ? cluster.weight / neutralWeight : 1 / neutralSource.length;
      return {
        l: acc.l + ok.l * weight,
        a: acc.a + ok.a * weight,
        b: acc.b + ok.b * weight,
      };
    },
    { l: 0, a: 0, b: 0 },
  );
  const neutral = oklabToOklch(neutralLab);
  const accents = pickAccentHues(clusters);

  const medianL = medianLightness(clusters);
  return {
    version: 2,
    polarity: medianL < 0.5 ? 'dark' : 'light',
    clusters,
    neutral,
    accents,
    metrics: {
      medianL,
      meanChroma: clusters.reduce((value, cluster) => value + cluster.oklch.c * cluster.weight, 0),
      hueSpread: accents.length >= 2 ? hueDistance(accents[0]!.h, accents[1]!.h) : 0,
    },
  };
}

function compareClusters(a: ClusterColor, b: ClusterColor): number {
  return b.weight - a.weight
    || b.oklch.l - a.oklch.l
    || b.oklch.c - a.oklch.c
    || a.oklch.h - b.oklch.h;
}
