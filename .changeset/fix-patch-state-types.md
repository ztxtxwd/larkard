---
"larkard": patch
---

修复 `larkard/patch` 与 `larkard/state` 子路径的类型入口：`exports` 原先指向不存在的 `dist/patch/index.d.ts` / `dist/state/index.d.ts`，而 `tsc` 实际把声明生成在 `dist/core/patch/index.d.ts` / `dist/core/state/index.d.ts`，导致下游 TypeScript 报 TS7016（隐式 any）。运行时入口不变。
