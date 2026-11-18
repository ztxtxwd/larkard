/**
 * 浏览器侧图片解码：File / URL → RGBA 像素。
 *
 * 只做“把图变成 PixelData”这一件事；取色和换色都在纯函数里。降采样到长边
 * 192 左右，既够取色，又不会让大图解码卡住主线程。
 */

import { extractImagePalette, type PixelData } from './extract.js';
import { recolorCardWithImage, type RecolorOptions, type RecolorResult } from './index.js';

export type { RecolorResult } from './index.js';

export interface DecodeOptions {
  /** 降采样后的最长边，默认 192。 */
  maxEdge?: number;
}

/** 只用于取色，不需要原图；太大的文件先拦下来，避免解码把手机内存打满。 */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

function targetSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function drawToPixels(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxEdge: number,
): PixelData {
  const size = targetSize(width, height, maxEdge);
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(size.width, size.height)
    : Object.assign(document.createElement('canvas'), size);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器不支持 2D 画布，无法读取图片像素');

  context.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in context) context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, size.width, size.height);
  const data = context.getImageData(0, 0, size.width, size.height);
  return { data: data.data, width: size.width, height: size.height };
}

/** File/Blob → 像素。 */
export async function pixelsFromFile(file: Blob, options: DecodeOptions = {}): Promise<PixelData> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('图片太大（超过 20 MB），请先压缩后再试');
  }
  if (typeof createImageBitmap !== 'function') {
    throw new Error('当前浏览器不支持 createImageBitmap，无法读取图片');
  }
  const bitmap = await createImageBitmap(file);
  try {
    return drawToPixels(bitmap, bitmap.width, bitmap.height, options.maxEdge ?? 192);
  } finally {
    bitmap.close();
  }
}

/** 同源图片 URL（如 `/api/plus/media/key/...`）→ 像素。 */
export async function pixelsFromUrl(url: string, options: DecodeOptions = {}): Promise<PixelData> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`读取图片失败（${response.status}）`);
  return pixelsFromFile(await response.blob(), options);
}

/**
 * 一步到位：选一张图，换一张卡。浏览器端入口。
 */
export async function recolorCardFromFile(
  card: unknown,
  file: Blob,
  options: RecolorOptions & DecodeOptions = {},
): Promise<RecolorResult> {
  const pixels = await pixelsFromFile(file, options);
  return recolorCardWithImage(card, pixels, options);
}

/** 用卡片里已有图片（同源代理地址 / 本地预览地址）取色。 */
export async function recolorCardFromUrl(
  card: unknown,
  url: string,
  options: RecolorOptions & DecodeOptions = {},
): Promise<RecolorResult> {
  const pixels = await pixelsFromUrl(url, options);
  return recolorCardWithImage(card, pixels, options);
}

export { extractImagePalette };
