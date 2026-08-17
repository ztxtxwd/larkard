/** 题库与结果的共享类型定义。 */

// ---------- 客观题 ----------

/** mcq=单选；fill=填空（tag/字段名/枚举）；bool=是否判断 */
export type ObjectiveFormat = 'mcq' | 'fill' | 'bool';

export interface ObjectiveTask {
  id: string;
  category: string;
  question: string;
  /** 缺省 mcq，兼容旧题 */
  format?: ObjectiveFormat;
  /** mcq 必填；fill/bool 可省略 */
  options?: string[];
  /**
   * mcq：正确选项字母如 "B"；
   * fill：规范答案（可另用 accept 列同义）；
   * bool：固定为 "是" 或 "否"。
   */
  answer: string;
  /** fill/bool 额外接受的写法（归一化后比对） */
  accept?: string[];
  explanation: string;
  /**
   * 飞书特有程度 1–5：越高越难靠通用 UI/Slack 经验蒙对。
   * 缺省 3。
   */
  specificity?: number;
  /**
   * 实战踩坑频率 1–5：越高加权越大。
   * 缺省 3。
   */
  frequency?: number;
}

// ---------- 主观题 ----------

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface SubjectiveTask {
  id: string;
  difficulty: Difficulty;
  /** 自然语言生成需求（通常描述官方 Demo 效果） */
  prompt: string;
  /** 参考卡片文件名（相对 datasets/subjective/golden/），优先用官方文档示例 */
  golden?: string;
  /** 官方文档路径，如 /feishu-cards/.../button */
  source?: string;
  /** 来源说明 */
  sourceNote?: string;
}

// ---------- 判分 ----------

export interface SubjectiveScore {
  /** 各维度得分 0~1 */
  jsonParse: number;
  schema: number;
  lint: number;
  compile: number;
  similarity: number;
  /** 加权总分 0~1 */
  total: number;
  /** 编译通过（pass@1） */
  compiled: boolean;
  details: {
    parseErrors: string[];
    schemaErrors: string[];
    lintIssues: string[];
    compileError?: string;
    tagSequence: string[];
    goldenTagSequence: string[];
    similarityBase: 'golden' | 'render';
  };
}

export interface ObjectiveResult {
  kind: 'objective';
  taskId: string;
  category: string;
  format: ObjectiveFormat;
  response: string;
  extracted: string | null;
  correct: boolean;
  /** specificity × frequency，用于加权准确率 */
  weight: number;
}

export interface SubjectiveResult {
  kind: 'subjective';
  taskId: string;
  difficulty: Difficulty;
  response: string;
  score: SubjectiveScore;
}

export type TaskResult = ObjectiveResult | SubjectiveResult;

// ---------- 模型配置 ----------

export interface ModelConfig {
  /** 被测对象展示名（结果目录名，须唯一） */
  name: string;
  /** OpenAI 兼容模型 ID */
  model: string;
  baseUrl?: string;
  apiKey?: string;
  /** 透传到 chat/completions 请求体的厂商字段。有无思考、如何关思考都写在这里，缺省不改请求。 */
  extra?: Record<string, unknown>;
  /**
   * 提示优化：针对该模型飞书卡片知识缺口的简短补丁，拼到系统提示词末尾。
   * 未优化版不写此字段；优化版用另一个 name 另存一条。
   */
  promptHint?: string;
}

export interface BenchmarkConfig {
  models: ModelConfig[];
}

// ---------- 汇总报告 ----------

export interface ModelReport {
  model: string;
  /**
   * 领域知识分：按 specificity×frequency 加权的客观题准确率。
   * 与主观生成分分开解读。
   */
  objectiveAccuracy: number | null;
  /** 未加权正确率（题数口径），便于对照 */
  objectiveRawAccuracy: number | null;
  objectiveByCategory: Record<string, { correct: number; total: number; weighted: number; weightSum: number }>;
  subjectiveDims: {
    jsonParse: number;
    schema: number;
    lint: number;
    compile: number;
    similarity: number;
    total: number;
  } | null;
  compilePassRate: number | null;
  subjectiveByDifficulty: Record<string, { total: number; count: number }>;
  overallScore: number | null;
  taskCount: number;
  /** 模型基于成绩单的自评 Markdown；未生成时为 null */
  selfEval: string | null;
}
