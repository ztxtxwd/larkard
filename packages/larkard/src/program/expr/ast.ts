import type { Json } from './values.js';

export type Expr =
  | { type: 'literal'; value: Json; pos: number }
  | { type: 'ident'; name: string; pos: number }
  | { type: 'array'; items: Expr[]; pos: number }
  | { type: 'object'; entries: Array<{ key: string; value: Expr }>; pos: number }
  | { type: 'member'; object: Expr; property: Expr; pos: number }
  | { type: 'call'; name: string; args: Expr[]; pos: number }
  | { type: 'unary'; op: '!' | '-' | '+'; arg: Expr; pos: number }
  | { type: 'binary'; op: BinaryOp; left: Expr; right: Expr; pos: number }
  | { type: 'logical'; op: '&&' | '||' | '??'; left: Expr; right: Expr; pos: number }
  | { type: 'conditional'; test: Expr; consequent: Expr; alternate: Expr; pos: number }
  | { type: 'lambda'; params: string[]; body: Expr; pos: number };

export type BinaryOp = '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=';

/** 遍历表达式里的所有节点（先序）。 */
export function visitExpr(expr: Expr, visit: (node: Expr) => void): void {
  visit(expr);
  switch (expr.type) {
    case 'array':
      expr.items.forEach((item) => visitExpr(item, visit));
      break;
    case 'object':
      expr.entries.forEach((entry) => visitExpr(entry.value, visit));
      break;
    case 'member':
      visitExpr(expr.object, visit);
      visitExpr(expr.property, visit);
      break;
    case 'call':
      expr.args.forEach((arg) => visitExpr(arg, visit));
      break;
    case 'unary':
      visitExpr(expr.arg, visit);
      break;
    case 'binary':
    case 'logical':
      visitExpr(expr.left, visit);
      visitExpr(expr.right, visit);
      break;
    case 'conditional':
      visitExpr(expr.test, visit);
      visitExpr(expr.consequent, visit);
      visitExpr(expr.alternate, visit);
      break;
    case 'lambda':
      visitExpr(expr.body, visit);
      break;
  }
}
