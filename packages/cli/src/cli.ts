#!/usr/bin/env node
/**
 * open-feishu-card CLI
 *
 * 用法：
 *   open-feishu-card lint <file...>      校验（Schema + 最佳实践）
 *   open-feishu-card validate <file...>  仅 Schema 校验
 *   open-feishu-card clean <file> [--out <file>] [--check]  剥离非标属性并写回
 *   open-feishu-card format <file>       格式化（2 空格 JSON）
 *   open-feishu-card build <file> [--out <file>]  编译为渲染器 RAW JSON
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from '@open-feishu-card/parser';
import { validateAst } from '@open-feishu-card/validator';
import { lintAst } from '@open-feishu-card/linter';
import { sanitize, compile } from '@open-feishu-card/compiler';

interface Args {
  command: string;
  files: string[];
  out?: string;
  check?: boolean;
}

function parseArgs(argv: string[]): Args {
  const [command, ...rest] = argv;
  const files: string[] = [];
  const args: Args = { command: command ?? '', files };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--out') args.out = rest[++i];
    else if (a === '--check') args.check = true;
    else files.push(a);
  }
  return args;
}

function fmtPos(p: { line: number; column: number }): string {
  return `${p.line}:${p.column}`;
}

function loadSource(file: string): string {
  return readFileSync(file, 'utf8');
}

function cmdLint(files: string[], schemaOnly: boolean): number {
  let hasError = false;
  for (const file of files) {
    const src = loadSource(file);
    const parsed = parse(src);
    const vdiags = validateAst(parsed);
    const { ast } = parsed;
    const ldiags = schemaOnly ? [] : lintAst(ast);
    const all = [
      ...vdiags.map((d) => ({ sev: d.severity, line: d.range.start.line, col: d.range.start.column, msg: d.message })),
      ...ldiags.map((d) => ({ sev: d.severity, line: d.range.start.line, col: d.range.start.column, msg: `[${d.rule}] ${d.message}` })),
    ].sort((a, b) => a.line - b.line || a.col - b.col);
    for (const d of all) {
      const tag = d.sev === 'error' ? 'error' : d.sev === 'warning' ? 'warn' : 'info';
      console.error(`${file}:${fmtPos({ line: d.line, column: d.col })}  ${tag}  ${d.msg}`);
      if (d.sev === 'error') hasError = true;
    }
    console.error(`✔ ${file}: ${all.filter((d) => d.sev === 'error').length} errors, ${all.length} diagnostics`);
  }
  return hasError ? 1 : 0;
}

function cmdClean(file: string, out?: string, check?: boolean): number {
  const src = loadSource(file);
  const { data } = parse(src);
  const { card, stripped } = sanitize(data, { mode: 'strip' });
  if (check) {
    if (stripped.length > 0) {
      console.error(`${file}: 发现 ${stripped.length} 个非标属性:`);
      for (const p of stripped) console.error(`  - ${p}`);
      return 1;
    }
    console.error(`${file}: 干净，无非标属性`);
    return 0;
  }
  const target = out ?? file;
  writeFileSync(target, JSON.stringify(card, null, 2) + '\n');
  console.error(`已净化 ${stripped.length} 个非标属性 → ${target}`);
  for (const p of stripped) console.error(`  - 剥离 ${p}`);
  return 0;
}

function cmdFormat(file: string, out?: string): number {
  const { data, errors } = parse(loadSource(file));
  if (errors.length) {
    for (const e of errors) console.error(`${file}:${fmtPos(e.range.start)}  error  ${e.message}`);
    return 1;
  }
  const target = out ?? file;
  writeFileSync(target, JSON.stringify(data, null, 2) + '\n');
  console.error(`已格式化 → ${target}`);
  return 0;
}

function cmdBuild(file: string, out?: string): number {
  const { data, errors } = parse(loadSource(file));
  if (errors.length) {
    for (const e of errors) console.error(`${file}:${fmtPos(e.range.start)}  error  ${e.message}`);
    return 1;
  }
  const { raw } = compile(data);
  if (out) {
    writeFileSync(out, JSON.stringify(raw, null, 2) + '\n');
    console.error(`已编译 RAW → ${out}`);
  } else {
    console.log(JSON.stringify(raw, null, 2));
  }
  return 0;
}

export function run(argv: string[] = process.argv.slice(2)): number {
  const { command, files, out, check } = parseArgs(argv);
  if (!command || files.length === 0) {
    console.error('用法: open-feishu-card <lint|validate|clean|format|build> <file...> [--out file] [--check]');
    return 2;
  }
  switch (command) {
    case 'lint':
      return cmdLint(files, false);
    case 'validate':
      return cmdLint(files, true);
    case 'clean':
      return cmdClean(files[0], out, check);
    case 'format':
      return cmdFormat(files[0], out);
    case 'build':
      return cmdBuild(files[0], out);
    default:
      console.error(`未知命令: ${command}`);
      return 2;
  }
}

// 直接执行时（非测试引入）
if (process.argv[1] && process.argv[1].endsWith('cli.js')) {
  process.exit(run());
}
