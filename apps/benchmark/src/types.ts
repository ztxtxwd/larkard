/** 题库与结果的共享类型定义。 */

// ---------- 客观题 ----------

export interface ObjectiveTask {
  id: string;
  category: string;
  question: string;
  options: string[];
  /** 正确选项字母，如 "B" */
  answer: string;
  explanation: string;
}

// ---------- 主观题 ----------

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface SubjectiveTask {
  id: string;
  difficulty: Difficulty;
  /** 自然语言生成需求 */
  prompt: string;
  /** 参考卡片文件名（相对 datasets/subjective/golden/），可选 */
  golden?: string;
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
  response: string;
  extracted: string | null;
  correct: boolean;
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
  objectiveAccuracy: number | null;
  objectiveByCategory: Record<string, { correct: number; total: number }>;
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
