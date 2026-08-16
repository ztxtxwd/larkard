/** 客观题判分：提取选项字母并比对标准答案。 */
import { extractOption } from './extract.js';
import type { ObjectiveResult, ObjectiveTask } from './types.js';

export function gradeObjective(task: ObjectiveTask, response: string): ObjectiveResult {
  const extracted = extractOption(response);
  return {
    kind: 'objective',
    taskId: task.id,
    category: task.category,
    response,
    extracted,
    correct: extracted === task.answer,
  };
}
