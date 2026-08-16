import {
  FeishuEmojiTokenSchema,
  type FeishuEmojiToken,
} from './emoji-tokens.js';
import { type MarkdownCodeLanguage } from './code-language.js';
import {
  renderAnchorTag,
  renderAtTag,
  renderFontTag,
  renderInlineAudioTag,
  renderLinkTag,
  renderLocalDateTimeTag,
  renderNumberTag,
  renderPersonTag,
  renderTextTag,
  type MarkdownAnchorTag,
  type MarkdownAtTag,
  type MarkdownFontTag,
  type MarkdownInlineAudioTag,
  type MarkdownLinkTag,
  type MarkdownLocalDateTimeTag,
  type MarkdownNumberTag,
  type MarkdownPersonTag,
  type MarkdownTextTag,
} from './tags.js';

/**
 * 飞书卡片富文本内容构建器。
 * 拼接标准 Markdown 与飞书扩展 HTML 标签，最终得到 markdown 组件的 content 字符串。
 */
export class MarkdownContentBuilder {
  private readonly chunks: string[] = [];

  /** 追加原始片段（可为 Markdown 或已渲染标签） */
  raw(text: string): this {
    this.chunks.push(text);
    return this;
  }

  /** 追加纯文本 */
  text(value: string): this {
    return this.raw(value);
  }

  /** 硬换行（`\n`） */
  br(): this {
    return this.raw('\n');
  }

  /** HTML `<br>` / `<br/>` */
  htmlBr(selfClosing = true): this {
    return this.raw(selfClosing ? '<br/>' : '<br>');
  }

  /** 分割线 */
  hr(style: 'html' | 'md' = 'html'): this {
    return this.raw(style === 'html' ? '<hr>' : '---');
  }

  italic(text: string): this {
    return this.raw(`*${text}*`);
  }

  bold(text: string): this {
    return this.raw(`**${text}**`);
  }

  strike(text: string): this {
    return this.raw(`~~${text}~~`);
  }

  inlineCode(text: string): this {
    return this.raw(`\`${text}\``);
  }

  /** `#` ~ `######` 标题 */
  heading(level: 1 | 2 | 3 | 4 | 5 | 6, text: string): this {
    return this.raw(`${'#'.repeat(level)} ${text}`);
  }

  quote(text: string): this {
    return this.raw(`> ${text}`);
  }

  /** Markdown 文字链接 */
  mdLink(text: string, url: string): this {
    return this.raw(`[${text}](${url})`);
  }

  /** 可点击电话（仅移动端） */
  tel(text: string, phone: string): this {
    return this.raw(`[${text}](tel://${phone})`);
  }

  /** 图片：`![hover](img_key)` */
  image(imgKey: string, hoverText = ''): this {
    return this.raw(`![${hoverText}](${imgKey})`);
  }

  /** 飞书表情：`:DONE:`；key 为官方 emoji_type 枚举 */
  emoji(key: FeishuEmojiToken | `:${FeishuEmojiToken}:`): this {
    const token = FeishuEmojiTokenSchema.parse(
      key.startsWith(':') && key.endsWith(':') ? key.slice(1, -1) : key,
    );
    return this.raw(`:${token}:`);
  }

  /**
   * 代码块。language 官方声明大小写不敏感；未指定时为 Plain Text。
   */
  codeBlock(code: string, language?: MarkdownCodeLanguage | (string & {})): this {
    const lang = language ?? '';
    return this.raw(`\`\`\`${lang}\n${code}\n\`\`\``);
  }

  unorderedList(items: string[], indent = 0): this {
    const prefix = ' '.repeat(indent * 4);
    for (const item of items) {
      this.raw(`${prefix}- ${item}\n`);
    }
    return this;
  }

  orderedList(items: string[], indent = 0): this {
    const prefix = ' '.repeat(indent * 4);
    items.forEach((item, index) => {
      this.raw(`${prefix}${index + 1}. ${item}\n`);
    });
    return this;
  }

  /** Markdown 表格（除表头外客户端最多展示 5 行） */
  table(headers: string[], rows: string[][]): this {
    const escapeCell = (cell: string) => cell.replace(/\|/g, '\\|');
    const headerLine = `| ${headers.map(escapeCell).join(' | ')} |`;
    const sepLine = `| ${headers.map(() => '--------').join(' | ')} |`;
    this.raw(`${headerLine}\n${sepLine}\n`);
    for (const row of rows) {
      this.raw(`| ${row.map(escapeCell).join(' | ')} |\n`);
    }
    return this;
  }

  at(input: MarkdownAtTag): this {
    return this.raw(renderAtTag(input));
  }

  atAll(): this {
    return this.at({ id: 'all' });
  }

  person(input: MarkdownPersonTag): this {
    return this.raw(renderPersonTag(input));
  }

  link(input: MarkdownLinkTag): this {
    return this.raw(renderLinkTag(input));
  }

  textTag(input: MarkdownTextTag): this {
    return this.raw(renderTextTag(input));
  }

  numberTag(input: MarkdownNumberTag): this {
    return this.raw(renderNumberTag(input));
  }

  localDateTime(input: MarkdownLocalDateTimeTag = {}): this {
    return this.raw(renderLocalDateTimeTag(input));
  }

  font(input: MarkdownFontTag): this {
    return this.raw(renderFontTag(input));
  }

  anchor(input: MarkdownAnchorTag): this {
    return this.raw(renderAnchorTag(input));
  }

  audio(input: MarkdownInlineAudioTag): this {
    return this.raw(renderInlineAudioTag(input));
  }

  /** 生成最终 content 字符串 */
  build(): string {
    return this.chunks.join('');
  }

  toString(): string {
    return this.build();
  }
}

/** 快捷创建构建器 */
export function markdown(): MarkdownContentBuilder {
  return new MarkdownContentBuilder();
}
