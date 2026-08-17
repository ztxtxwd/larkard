/** 统一的作答指令提示词。 */

export const OBJECTIVE_SYSTEM_PROMPT = `你正在参加一个关于飞书卡片（Feishu/Lark Card JSON 2.0）的领域知识探针。
题型可能是单选、填空或是否判断。只考飞书卡片官方约定，不要用通用前端/其它 IM 卡片习惯臆测。

作答格式：
- 单选：先写「答案是 X。」再一句话理由。示例：答案是 B。<理由>
- 填空：先写「答案是 <精确字符串>。」再一句话理由。tag/字段名/枚举值请原样写出，不要加引号外的解释。
- 是否：先写「答案是 是。」或「答案是 否。」再一句话理由。`;

export const SUBJECTIVE_SYSTEM_PROMPT = `你是一个飞书卡片（Feishu/Lark Card JSON）生成器。
用户会给出需求，请你输出一张符合飞书卡片 JSON 2.0 结构的卡片。

要求：
1. 根对象必须包含 "schema": "2.0"，正文放在 "body": { "elements": [...] }；
2. 只使用飞书卡片 JSON 2.0 真实的组件标签（如 markdown、button、img、column_set、hr、form、input、select_static、chart、table、div 等），不要臆造组件或属性；不要使用 2.0 已废弃的 note（备注效果用 div + text_size:notation + text_color:grey）；
3. 交互：表单外的 button/select 等必须用 behaviors（[{type:"open_url",...}] 或 [{type:"callback",value:{...}}]），不要用 1.0 的 multi_url 或按钮顶层 value；进入 form 后的交互组件与 submit/reset 可不写 behaviors（交互随表单提交）；
4. 不要臆造 img_key / open_id 等资源 ID，图片使用示例值 "img_v2_demo-key"，人员使用示例 open_id "ou_demo123"；
5. header 使用 { "title": { "tag": "plain_text", "content": "..." }, "template": "blue" } 这类标准结构；
6. 只输出一个 JSON 代码块，不要输出任何其他解释文字。`;

export function objectiveUserPrompt(
  question: string,
  options?: string[],
  format: 'mcq' | 'fill' | 'bool' = 'mcq',
): string {
  if (format === 'fill') {
    return `【填空】${question}\n\n请给出精确字符串答案（tag / 字段名 / 枚举值 / 数字等）。`;
  }
  if (format === 'bool') {
    return `【是否】${question}\n\n请回答「是」或「否」。`;
  }
  const opts = options ?? [];
  const lines = opts.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`);
  return `【单选】${question}\n\n${lines.join('\n')}`;
}

/** 把被测对象的提示优化拼到系统提示词末尾；没有则原样返回。 */
export function composeSystemPrompt(base: string, promptHint?: string): string {
  const hint = promptHint?.trim();
  if (!hint) return base;
  return `${base}\n\n${hint}`;
}

export const SELF_EVAL_SYSTEM_PROMPT = `你刚刚完成了一场飞书卡片（Feishu/Lark Card JSON 2.0）能力评测。
下面是工具链自动判分后的成绩单，含客观题对错、正确答案，以及主观题的 schema / 编译结果。

请只根据成绩单做自评：不要编造成绩单上没有的题目，不要把「看了成绩单才知道」说成「我本来就会」。
区分两类问题：领域知识不足（用错 tag、套用 HTML/通用前端概念），和个别枚举/数字记错。

用中文输出 Markdown，使用以下四级标题（不要包代码围栏）：

#### 做得好
#### 做得不好
#### 已掌握的知识
#### 尚未掌握的知识
#### 总评`;
