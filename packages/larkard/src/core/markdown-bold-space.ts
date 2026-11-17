/**
 * Markdown 加粗 `**` 紧贴空格的检测。
 *
 * 强调语法要求分隔符内侧紧跟非空白字符：`** 标题**` / `**标题 **`
 * 都不会加粗，客户端会把 `**` 按字面渲染出来。模型生成卡片时经常在星号内侧
 * 多打一个空格，这属于「Schema 合法、但渲染达不到意图」的问题，
 * 所以放在 linter 而不是 validator。
 *
 * 判定按 CommonMark 的 flanking 规则做简化版状态机：
 * - 还没进入加粗：遇到后跟空白的 `**` → 开星号贴空，记一处；
 * - 已在加粗内：遇到前面贴空白的 `**` → 收星号贴空，记一处。
 * 星号外侧的空格是合法的（`**标题** 正文`），不报。
 */

export interface BoldSpaceIssue {
  /** 出问题的星号串在原文中的下标 */
  index: number;
  /** 截取的上下文片段，用于提示 */
  sample: string;
}

const SAMPLE_RADIUS = 12;

function isWhitespace(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch);
}

/** 星号串是否被反斜杠转义（前面连续反斜杠为奇数个） */
function isEscaped(text: string, index: number): boolean {
  let count = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) count += 1;
  return count % 2 === 1;
}

/** 用等长空白遮掉行内代码与代码块，避免把代码示例里的星号当成加粗 */
function maskCodeSpans(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
}

export function findBoldSpaceIssues(text: string): BoldSpaceIssue[] {
  const masked = maskCodeSpans(text);
  const issues: BoldSpaceIssue[] = [];
  let inBold = false;
  let i = 0;

  while (i < masked.length) {
    if (masked[i] !== '*') {
      i += 1;
      continue;
    }
    let end = i;
    while (end < masked.length && masked[end] === '*') end += 1;
    const runLength = end - i;

    // 单星号是斜体 / 列表标记 / 字面量，不在本规则范围内
    if (runLength < 2 || isEscaped(masked, i)) {
      i = end;
      continue;
    }

    const spaceBefore = isWhitespace(i > 0 ? text[i - 1] : undefined);
    const spaceAfter = isWhitespace(end < masked.length ? text[end] : undefined);

    let broken = false;
    if (!inBold) {
      if (spaceAfter) broken = true;
      // 无论是否报错都按「作者想开启加粗」处理，避免同一处错误在收星号上再报一次
      inBold = true;
    } else {
      if (spaceBefore) broken = true;
      inBold = false;
    }

    if (broken) {
      const from = Math.max(0, i - SAMPLE_RADIUS);
      const to = Math.min(text.length, end + SAMPLE_RADIUS);
      issues.push({
        index: i,
        sample: text.slice(from, to).replace(/\r?\n/g, '\\n'),
      });
    }
    i = end;
  }

  return issues;
}
