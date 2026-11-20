/**
 * RAW `code_block.property.contents` → 展示用的行数组。
 *
 * 编辑器把同一段代码存成过三种形态（都来自 im.message.get 的 RAW）：
 *
 *   1. 一行一个 outer entry，段内容里没有换行符：
 *        [{contents:[{content:"line one"}]}, {contents:[{content:"line two"}]}]
 *   2. 整个代码块塞进一个 entry，用显式 "\n" 段分行：
 *        [{contents:[{content:"npm run build\n"}]}]
 *   3. 编辑器存储形态：每个内容行自带结尾 "\n"，后面再跟一个只含 "\n" 的
 *      entry 表示换行（例如「{\n」+「\n」+「  \"mcpServers\": {\n」+ …）。
 *
 * 形态 3 如果直接按 outer entry 行数渲染（或 join("\n")），每行之间都会多出
 * 空行；真机把这种单独的 "\n" entry 当成换行标记，不占一行。这里统一归一：
 * 去掉内容行结尾的换行符，丢弃紧跟在「已带换行」的内容行之后的纯 "\n" entry，
 * 其余内容按行返回。
 */
export function codeBlockLines(contents: unknown): string[] {
  if (!Array.isArray(contents)) return [];

  const rawLines = contents.map((line) => {
    if (!line || typeof line !== "object") return "";
    const segments = (line as { contents?: unknown }).contents;
    if (!Array.isArray(segments)) return "";
    let text = "";
    for (const segment of segments) {
      if (
        segment
        && typeof segment === "object"
        && typeof (segment as { content?: unknown }).content === "string"
      ) {
        text += (segment as { content: string }).content;
      }
    }
    return text;
  });

  const lines: string[] = [];
  let prevEndedWithNewline = false;

  for (const raw of rawLines) {
    const trimmed = raw.replace(/\n+$/, "");
    const trailing = raw.length - trimmed.length;

    // 形态 3 的换行标记：内容行已经带了 "\n"，这个纯 "\n" entry 不再算一行。
    if (trimmed === "" && raw === "\n" && prevEndedWithNewline) {
      prevEndedWithNewline = false;
      continue;
    }

    lines.push(trimmed);
    // 一个结尾 "\n" 只是行终止符；多出来的才是作者写的空行。
    for (let i = 1; i < trailing; i++) lines.push("");
    prevEndedWithNewline = trailing > 0;
  }

  // 编辑器常在末尾补一个换行；不要让它变成代码块底部的空行。
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}
