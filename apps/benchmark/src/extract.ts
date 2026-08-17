/** 从模型回复中提取结构化答案：选项字母、填空、是否、卡片 JSON。 */

/**
 * 提取单选答案字母（A-D）。优先匹配 "答案是 B" / "选 C" / "answer: D" 等
 * 显式作答模式，退化为第一个独立的 A-D 字母。
 */
export function extractOption(reply: string): string | null {
  const explicit =
    /(?:答案|应该?选|选择|正确[的选项是]*|answer)\s*(?:是|:|：|为)?\s*[* _`(#【[]*([A-Da-d])/i.exec(
      reply,
    );
  if (explicit) return explicit[1].toUpperCase();
  const standalone = /(?:^|[^\p{L}\p{N}])([A-Da-d])(?=$|[^\p{L}\p{N}])/u.exec(reply);
  if (standalone) return standalone[1].toUpperCase();
  return null;
}

/**
 * 提取填空答案。优先「答案是 xxx」；否则取首个代码片段 / 独立标识符。
 */
export function extractFill(reply: string): string | null {
  const explicit =
    /(?:答案|正确[答案是]*|应?该?填|填写|answer)\s*(?:是|:|：|为)?\s*[* _`「『【(\[]*(\S+?)(?=[，。；;！!？?\s」』】)\]]|$)/i.exec(
      reply,
    );
  if (explicit) return stripFillToken(explicit[1]);

  const code = /`([^`\n]+)`/.exec(reply);
  if (code) return stripFillToken(code[1]);

  const ident = /(?:^|\n)\s*([A-Za-z_][\w.]{0,63}|[0-9]+(?:\.[0-9]+)?|-?[0-9]+)\s*(?:$|\n|[。．.，,；;])/.exec(
    reply.trim(),
  );
  if (ident) return stripFillToken(ident[1]);

  return null;
}

/** 提取是否题：是/否、true/false、Y/N。 */
export function extractBool(reply: string): string | null {
  const explicit =
    /(?:答案|正确[答案是]*|判断|answer)\s*(?:是|:|：|为)?\s*[* _`]*((?:是|否|true|false|yes|no|y|n))\b/i.exec(
      reply,
    );
  if (explicit) return normalizeBoolToken(explicit[1]);

  const standalone = /(?:^|[^\p{L}\p{N}])(是|否|true|false|yes|no)(?=$|[^\p{L}\p{N}])/iu.exec(reply);
  if (standalone) return normalizeBoolToken(standalone[1]);

  return null;
}

export function normalizeFillAnswer(s: string): string {
  return stripFillToken(s).toLowerCase();
}

export function normalizeBoolToken(s: string): '是' | '否' | null {
  const t = s.trim().toLowerCase();
  if (t === '是' || t === 'true' || t === 'yes' || t === 'y') return '是';
  if (t === '否' || t === 'false' || t === 'no' || t === 'n') return '否';
  return null;
}

function stripFillToken(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`「『【(\[]+|["'`」』】)\]]+$/g, '')
    .replace(/[。．.，,；;！!？?]+$/g, '')
    .trim();
}

/**
 * 从回复中提取 JSON 对象文本。
 * 优先 ```json / ``` 围栏内的对象；围栏内若嵌套 markdown 代码块（如 content
 * 含 ```），不能用非贪婪匹配到第一个 ```，改用括号配平截取完整对象。
 * 无围栏时对全文做括号配平。
 */
export function extractJsonText(reply: string): string | null {
  const jsonFence = /```(?:json|JSON)\b[^\n]*\n?/.exec(reply);
  if (jsonFence) {
    const from = reply.slice(jsonFence.index! + jsonFence[0].length);
    const obj = balancedObject(from);
    if (obj !== null) return obj;
  }

  const generic = /```[^\n]*\n?\s*\{/.exec(reply);
  if (generic) {
    const braceAt = reply.indexOf('{', generic.index!);
    if (braceAt !== -1) {
      const obj = balancedObject(reply.slice(braceAt));
      if (obj !== null) return obj;
    }
  }

  return balancedObject(reply);
}

/** 从任意文本中括号配平截取第一个完整顶层 JSON 对象。 */
export function balancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
