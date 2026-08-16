/**
 * 聚合样式：布局 + 图标字体 + emoji 雪碧，一份搞定。
 *
 * 面向 SSR / Node（renderCardToString*）——无 DOM 时渲染器无法自动注入样式，
 * 消费者需自行把 CSS 送进页面。此前要分别引 styles.css / icon-font.css / emoji.css
 * 三个文件，库每加一类资源消费者就得改一次；这里聚合成一份，页面级注入一次即可，
 * 以后库再加资源也不必改消费者代码。
 *
 * 浏览器端（renderCard，有 DOM）图标/emoji 仍会自动注入，无需用到这里。
 */
import { BASE_STYLES_CSS } from './base-styles';
import { ICON_FONT_CSS } from './icon-font';
import { EMOJI_SPRITE_CSS } from './emoji-data';

/** 全部卡片样式（布局 + 图标字体 @font-face/glyph + emoji 雪碧定位）拼成的一份字符串 */
export const ALL_CSS: string = `${BASE_STYLES_CSS}\n${ICON_FONT_CSS}\n${EMOJI_SPRITE_CSS}`;

/**
 * 便捷：返回可直接插进页面 <head> 的 <style> 标签（含全部卡片样式）。
 * 一页多张卡片时只需注入一次。
 */
export function feishuCardStyleTag(): string {
  return `<style data-feishu-card>${ALL_CSS}</style>`;
}
