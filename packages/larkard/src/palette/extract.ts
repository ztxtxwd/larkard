/**
 * 从图片像素里提取一组“可用的”主色，而不是直接拿 k-means 的原始簇。
 *
 * 步骤全部是确定性的：
 * 1. 按 alpha 过滤并按块做面积平均降采样；
 * 2. sRGB → OKLab；
 * 3. 加权中位切分（median cut），切到最多 maxColors 个簇；
 * 4. 合并感知上几乎相同的簇；
 * 5. 输出权重、中性色、两个强调色色相和若干统计指标。
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

export interface PaletteCluster {
  rgba: Rgba;
  oklch: Oklch;
  /** 0..1，像素权重占比。 */
  weight: number;
}

export interface ImagePalette {
  version: 1;
  polarity: 'light' | 'dark';
  clusters: PaletteCluster[];
  /** 图片的中性色（底色/灰阶倾向）。 */
  neutral: Oklch;
  /**
   * 强调色色相，最多 2 个。
   *
   * 优先高彩度、面积够的簇；整张图都很淡（例如暗背景上的香槟金车身）时，
   * 退化为一个“相对最彩”的色相提示。调用方不能假设 accents 里的彩度都
   * 达到 `ACCENT_MIN_CHROMA`。
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

const DEFAULT_MAX_COLORS = 12;
const DEFAULT_MAX_EDGE = 192;
const DEFAULT_ALPHA_THRESHOLD = 128;
const MERGE_DELTA_E = 0.025;
const ACCENT_MIN_CHROMA = 0.045;
const ACCENT_MIN_WEIGHT = 0.008;
/**
 * 低到这个程度的彩度人眼几乎看不出色相。照片暗部 / 白平衡常见的
 * 0.004~0.008 色偏不能拿来给整张卡染色，否则灰石头会变成紫卡片。
 */
export const ACHROMATIC_CHROMA = 0.01;
/**
 * 没有高彩度强调色时，从“相对最彩”的簇里找一个色相提示。
 * 香槟金车身这类 c≈0.01 的主体色够不到 `ACCENT_MIN_CHROMA`，但它的色相
 * 仍然比暗部色偏可信；用它总比用全局中性色的噪声色相好。
 */
const SUBTLE_ACCENT_MIN_CHROMA = 0.008;
const SUBTLE_ACCENT_MIN_WEIGHT = 0.01;
/** 中性色本身已经可见时，只有和它明显不同色相的低彩度簇才算强调色。 */
const SUBTLE_ACCENT_HUE_DISTANCE = 25;

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

function medianLightness(clusters: readonly PaletteCluster[]): number {
  const sorted = [...clusters].sort((a, b) => a.oklch.l - b.oklch.l || b.weight - a.weight);
  let cumulative = 0;
  for (const cluster of sorted) {
    cumulative += cluster.weight;
    if (cumulative >= 0.5) return cluster.oklch.l;
  }
  return sorted.length > 0 ? sorted[sorted.length - 1]!.oklch.l : 0.5;
}

/**
 * 挑强调色色相。
 *
 * 优先高彩度、面积够的簇（最多 2 个、色相至少差 30°）。一个都没有时，退而求
 * 其次：找相对中性色明显更彩、面积不小的簇，只取最彩的一个；如果中性色
 * 本身已经有可见色偏，还要求色相明显不同，避免把白平衡噪声当成强调色。
 * 这条兜底专门处理“画面主体有点颜色、但整体很灰”的照片——不兜底的话，
 * 合成阶段只能拿中性色的噪声色相，整张卡就会染上一层看不见的色偏。
 */
function pickAccentHues(
  clusters: readonly PaletteCluster[],
  neutral: Oklch,
): Oklch[] {
  const strong = clusters
    .filter((cluster) => cluster.oklch.c >= ACCENT_MIN_CHROMA && cluster.weight >= ACCENT_MIN_WEIGHT)
    .sort((a, b) =>
      b.weight * b.oklch.c - a.weight * a.oklch.c
      || b.oklch.c - a.oklch.c
      || a.oklch.h - b.oklch.h)
    .reduce<PaletteCluster[]>((picked, cluster) => {
      if (picked.length >= 2) return picked;
      if (picked.some((item) => hueDistance(item.oklch.h, cluster.oklch.h) < 30)) return picked;
      picked.push(cluster);
      return picked;
    }, [])
    .map((cluster) => cluster.oklch);
  if (strong.length > 0) return strong;

  const minChroma = Math.max(SUBTLE_ACCENT_MIN_CHROMA, neutral.c * 1.5);
  const subtle = clusters
    .filter((cluster) => cluster.weight >= SUBTLE_ACCENT_MIN_WEIGHT)
    .filter((cluster) => cluster.oklch.c >= minChroma)
    // 中性色自己有可见色偏时，只有明显换色相的簇才算强调色；否则同色相只是
    // 噪声/白平衡，不能把它当成另一种颜色。
    .filter((cluster) => neutral.c < ACHROMATIC_CHROMA
      || hueDistance(cluster.oklch.h, neutral.h) >= SUBTLE_ACCENT_HUE_DISTANCE)
    .sort((a, b) =>
      b.oklch.c - a.oklch.c
      || b.weight - a.weight
      || b.oklch.l - a.oklch.l
      || a.oklch.h - b.oklch.h)[0];

  return subtle ? [subtle.oklch] : [];
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
  let clusters: PaletteCluster[] = boxes
    .map((box) => {
      const mean = weightedMean(samples, box.indices);
      const rgba = oklabToRgba(mean.ok);
      return {
        rgba,
        oklch: oklabToOklch(mean.ok),
        weight: totalWeight > 0 ? mean.weight / totalWeight : 0,
      };
    })
    .filter((cluster) => cluster.weight > 0);

  // 合并感知上几乎相同的簇，避免一张灰底照片里出现五个灰。
  clusters.sort(compareClusters);
  const merged: PaletteCluster[] = [];
  for (const cluster of clusters) {
    const existing = merged.find((item) => deltaE(item.rgba, cluster.rgba) < MERGE_DELTA_E);
    if (!existing) {
      merged.push({ ...cluster });
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
    }
  }

  const sum = merged.reduce((value, cluster) => value + cluster.weight, 0);
  if (sum > 0) {
    for (const cluster of merged) cluster.weight /= sum;
  }
  merged.sort(compareClusters);
  clusters = merged.slice(0, maxColors);

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
  const accents = pickAccentHues(clusters, neutral);

  const medianL = medianLightness(clusters);
  return {
    version: 1,
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

function compareClusters(a: PaletteCluster, b: PaletteCluster): number {
  return b.weight - a.weight
    || b.oklch.l - a.oklch.l
    || b.oklch.c - a.oklch.c
    || a.oklch.h - b.oklch.h;
}
