# @open-feishu-card/benchmark

评测大模型在飞书卡片（Feishu/Lark Card JSON 2.0）上的能力。完全复用 monorepo 工具链（parser / validator / linter / compiler / renderer）做自动判分，无需人工打分。

## 题型与分数解读

客观题与主观题测的是**两类能力**，不要混成「懂不懂飞书卡片」一个数：

| 轨道 | 测什么 | 题型 |
| --- | --- | --- |
| **领域知识探针**（客观题） | 飞书特有约定：tag 名、枚举、2.0 破坏性变更、表单 name、behaviors 字段等 | 填空 / 是否 / 单选 |
| **生成能力**（主观题） | 按官方组件/容器 Demo 场景写出可解析、合 schema、能编译的完整卡片 | 自然语言 → 卡片 JSON |

- **客观题**（45 道）：`specificity × frequency` **加权**准确率 = 领域知识分。
- **主观题**（13 道）：**参考答案来自官方文档示例**（`golden/official-*.json`），题干描述该 Demo 的效果；不手写业务场景卡。五维度判分：

| 维度 | 权重 | 实现 |
| --- | --- | --- |
| JSON 可解析 | 20% | `@open-feishu-card/parser` |
| Schema 合法 | 30% | `@open-feishu-card/validator` |
| 最佳实践 | 15% | `@open-feishu-card/linter` |
| 编译通过（pass@1） | 20% | `@open-feishu-card/compiler` |
| 结构相似度 | 15% | 与官方示例的组件 tag 序列 F1 |

**总分 = 领域知识加权准确率 × 40% + 主观总分 × 60%**（综合榜用；分析时请分开看两轨）

### 从官方文档刷新主观题 golden

先用飞书文档 MCP 拉取对应组件页，再运行：

```bash
pnpm exec tsx scripts/import-official-examples.ts
```

脚本从 `%LOCALAPPDATA%\Temp\feishu-doc-mcp` 缓存抽取示例 JSON，仅做 schema 兼容最小修补（如表单外补 `behaviors`、缺失 `img.alt`、未知 icon token），不改写官方结构与文案。

## 快速开始

```bash
pnpm build

# 离线演示（无需 API Key）
node apps/benchmark/dist/cli.js run --dry-run --out /tmp/bench-demo

# 真实评测
TOKENFLUX_API_KEY=sk-xxx node apps/benchmark/dist/cli.js run --model gemini-3.7-flash

node apps/benchmark/dist/cli.js report
```

## 命令

| 命令 | 说明 |
| --- | --- |
| `run` | 跑题。`--tasks objective\|subjective\|all`；`--no-cache` 强制重跑；`--dry-run` 离线演示 |
| `report` | 汇总 results 生成排行榜 |
| `list` | 列出题库与被测对象名录 |

被测对象写在 `models.json`（`name` / `model` / `baseUrl` / `apiKey` / `extra` / `promptHint`）。

## 题库

- `datasets/objective.json`：领域知识探针（`format` / `specificity` / `frequency`）
- `datasets/subjective/S*.json`：题干 + `source`（官方文档路径）+ `golden`
- `datasets/subjective/golden/official-*.json`：官方示例（经最小修补）

客观/主观题库升级后请对相应任务加 `--no-cache` 重跑。

## 测试

```bash
pnpm test
```
