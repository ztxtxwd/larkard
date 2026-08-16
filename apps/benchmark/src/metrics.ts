/** 结果聚合：从单题结果计算模型级指标与总分。 */
import type { ModelReport, TaskResult } from './types.js';

const OBJECTIVE_WEIGHT = 0.4;
const SUBJECTIVE_WEIGHT = 0.6;

export function aggregate(results: TaskResult[]): ModelReport {
  const objective = results.filter((r): r is Extract<TaskResult, { kind: 'objective' }> => r.kind === 'objective');
  const subjective = results.filter((r): r is Extract<TaskResult, { kind: 'subjective' }> => r.kind === 'subjective');

  const objectiveByCategory: ModelReport['objectiveByCategory'] = {};
  for (const r of objective) {
    const slot = (objectiveByCategory[r.category] ??= { correct: 0, total: 0 });
    slot.total++;
    if (r.correct) slot.correct++;
  }
  const objectiveAccuracy = objective.length > 0 ? objective.filter((r) => r.correct).length / objective.length : null;

  let subjectiveDims: ModelReport['subjectiveDims'] = null;
  const subjectiveByDifficulty: ModelReport['subjectiveByDifficulty'] = {};
  let compilePassRate: number | null = null;

  if (subjective.length > 0) {
    const mean = (fn: (r: (typeof subjective)[number]) => number) =>
      subjective.reduce((s, r) => s + fn(r), 0) / subjective.length;
    subjectiveDims = {
      jsonParse: mean((r) => r.score.jsonParse),
      schema: mean((r) => r.score.schema),
      lint: mean((r) => r.score.lint),
      compile: mean((r) => r.score.compile),
      similarity: mean((r) => r.score.similarity),
      total: mean((r) => r.score.total),
    };
    for (const r of subjective) {
      const slot = (subjectiveByDifficulty[r.difficulty] ??= { total: 0, count: 0 });
      slot.total++;
      slot.count += r.score.total;
    }
    compilePassRate = subjective.filter((r) => r.score.compiled).length / subjective.length;
  }

  let overallScore: number | null = null;
  if (objectiveAccuracy !== null && subjectiveDims !== null) {
    overallScore = OBJECTIVE_WEIGHT * objectiveAccuracy + SUBJECTIVE_WEIGHT * subjectiveDims.total;
  } else if (objectiveAccuracy !== null) {
    overallScore = objectiveAccuracy;
  } else if (subjectiveDims !== null) {
    overallScore = subjectiveDims.total;
  }

  const round4 = (n: number) => Math.round(n * 10000) / 10000;
  return {
    model: '',
    objectiveAccuracy: objectiveAccuracy === null ? null : round4(objectiveAccuracy),
    objectiveByCategory,
    subjectiveDims:
      subjectiveDims === null
        ? null
        : {
            jsonParse: round4(subjectiveDims.jsonParse),
            schema: round4(subjectiveDims.schema),
            lint: round4(subjectiveDims.lint),
            compile: round4(subjectiveDims.compile),
            similarity: round4(subjectiveDims.similarity),
            total: round4(subjectiveDims.total),
          },
    compilePassRate: compilePassRate === null ? null : round4(compilePassRate),
    subjectiveByDifficulty,
    overallScore: overallScore === null ? null : round4(overallScore),
    taskCount: results.length,
    selfEval: null,
  };
}
