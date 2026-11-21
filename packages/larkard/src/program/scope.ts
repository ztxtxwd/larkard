import type { Expr } from './expr/ast.js';
import { BUILTIN_NAMES } from './expr/builtins.js';

/** 静态检查时某处表达式可用的名字。 */
export interface ScopeRules {
  /** 状态字段、循环变量、let 变量等普通名字 */
  names: ReadonlySet<string>;
  /** 允许的 $ 上下文变量；null 表示此处不能用任何 $ 变量 */
  context: ReadonlySet<string> | null;
  /** 不能用 $ 变量时给出的原因 */
  contextDenied?: string;
}

/** 找出表达式里的未定义变量与未知函数，返回问题描述。 */
export function checkExpr(expr: Expr, rules: ScopeRules): string[] {
  const problems: string[] = [];
  const walk = (node: Expr, locals: ReadonlySet<string>): void => {
    switch (node.type) {
      case 'literal':
        return;
      case 'ident': {
        const { name } = node;
        if (locals.has(name) || rules.names.has(name)) return;
        if (name.startsWith('$')) {
          if (rules.context === null) {
            problems.push(`这里不能使用 ${name}${rules.contextDenied ? `：${rules.contextDenied}` : ''}`);
          } else if (!rules.context.has(name)) {
            problems.push(`未知的上下文变量 ${name}，可用的有 ${[...rules.context].join(', ')}`);
          }
          return;
        }
        problems.push(`未定义的变量 ${name}`);
        return;
      }
      case 'array':
        node.items.forEach((item) => walk(item, locals));
        return;
      case 'object':
        node.entries.forEach((entry) => walk(entry.value, locals));
        return;
      case 'member':
        walk(node.object, locals);
        walk(node.property, locals);
        return;
      case 'call':
        if (!BUILTIN_NAMES.has(node.name)) problems.push(`没有内置函数 ${node.name}`);
        node.args.forEach((arg) => walk(arg, locals));
        return;
      case 'unary':
        walk(node.arg, locals);
        return;
      case 'binary':
      case 'logical':
        walk(node.left, locals);
        walk(node.right, locals);
        return;
      case 'conditional':
        walk(node.test, locals);
        walk(node.consequent, locals);
        walk(node.alternate, locals);
        return;
      case 'lambda':
        walk(node.body, new Set([...locals, ...node.params]));
        return;
    }
  };
  walk(expr, new Set());
  return [...new Set(problems)];
}
