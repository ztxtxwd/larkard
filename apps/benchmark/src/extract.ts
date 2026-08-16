/** 从模型回复中提取结构化答案：选项字母、卡片 JSON。 */

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
 * 从回复中提取 JSON 对象文本：优先 ```json 围栏，其次 ``` 围栏，
 * 最后用括号配平从全文中截取第一个完整 JSON 对象。
 */
export function extractJsonText(reply: string): string | null {
  const fence = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/.exec(reply);
  if (fence) {
    const text = fence[1].trim();
    if (text.startsWith('{')) return text;
  }
  const balanced = balancedObject(reply);
  if (balanced !== null) return balanced;
  return null;
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
