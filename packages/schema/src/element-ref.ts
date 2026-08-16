import type { ZodType } from 'zod';

/**
 * 递归 ElementSchema 的延迟绑定。
 * 容器组件通过本模块引用 Element，避免循环依赖在模块初始化时炸掉。
 */
let elementSchema: ZodType | undefined;

/** 由 element.ts 在定义完成后注册 */
export function registerElementSchema(schema: ZodType): void {
  elementSchema = schema;
}

/** 供 z.lazy(() => getElementSchema()) 使用 */
export function getElementSchema(): ZodType {
  if (!elementSchema) {
    throw new Error('ElementSchema 尚未注册，请确认已导入 src/element.ts');
  }
  return elementSchema;
}
