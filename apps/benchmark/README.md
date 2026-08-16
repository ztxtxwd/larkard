# @open-feishu-card/benchmark

评测大模型在飞书卡片（Feishu/Lark Card JSON 2.0）生成上的能力。完全复用 monorepo 工具链（parser / validator / linter / compiler / renderer）做自动判分，无需人工打分。

## 题型

- **客观题**（42 道）：单选，考察对卡片结构、组件、交互、易错点的理解，按分类统计准确率。
- **主观题**（16 道，easy / medium / hard）：给出自然语言需求，模型真实生成卡片 JSON，五维度自动判分：

| 维度 | 权重 | 实现 |
| --- | --- | --- |
| JSON 可解析 | 20% | `@open-feishu-card/parser` |
| Schema 合法 | 30% | `@open-feishu-card/validator` |
| 最佳实践 | 15% | `@open-feishu-card/linter` |
| 编译通过（pass@1） | 20% | `@open-feishu-card/compiler` |
| 结构相似度 | 15% | 有 golden 时组件 tag 序列 F1；否则 `@open-feishu-card/renderer` 渲染检查 |

**总分 = 客观准确率 × 40% + 主观总分 × 60%**

## 快速开始

```bash
pnpm build

# 离线演示（无需 API Key，使用预置假回复验证全流程）
node apps/benchmark/dist/cli.js run --dry-run --out /tmp/bench-demo

# 真实评测：从 models.json 按 name 加载被测对象
TOKENFLUX_API_KEY=sk-xxx node apps/benchmark/dist/cli.js run --model gemini-3.7-flash --out results

# 跑名录里全部对象
TOKENFLUX_API_KEY=sk-xxx node apps/benchmark/dist/cli.js run --config apps/benchmark/models.json --out results

# 一次性配置（未写入名录时）
OPENAI_API_KEY=sk-xxx node apps/benchmark/dist/cli.js run \
  --model deepseek-chat --base-url https://api.deepseek.com/v1 --out results

# 汇总报告（results/ 下生成 report.json + REPORT.md）
node apps/benchmark/dist/cli.js report --results results
```

## 命令

| 命令 | 说明 |
| --- | --- |
| `run` | 跑题。`--model` 按 `models.json` 的 name 查找；`--config` 指定名录文件（不传 `--model` 则跑全部）；`--tasks objective\|subjective\|all`；`--concurrency`（默认 4）；`--temperature`（默认 0）；`--no-cache` 强制重跑；`--dry-run` 离线演示 |
| `report` | 汇总 `--results` 目录（默认 `results/`）生成排行榜 |
| `list` | 列出题库与被测对象名录 |

每个被测对象是一条完整配置，写在 `models.json`：`name`、`model`、`baseUrl`、`apiKey`、`extra`、`promptHint`。同一上游模型可以有未优化版和优化版——用不同 `name` 各存一条；优化版把针对该模型知识缺口的短提示写在 `promptHint`，跑题时拼到系统提示词末尾。`extra` 仍只表示请求体厂商参数（例如关思考）。`apiKey` / `baseUrl` 支持 `${ENV_VAR}` 占位。

```json
{
  "models": [
    {
      "name": "gemini-3.7-flash",
      "model": "google/gemini-3.7-flash-tiered",
      "baseUrl": "https://tokenflux.dev/v1",
      "apiKey": "${TOKENFLUX_API_KEY}"
    },
    {
      "name": "gemini-3.7-flash-hinted",
      "model": "google/gemini-3.7-flash-tiered",
      "baseUrl": "https://tokenflux.dev/v1",
      "apiKey": "${TOKENFLUX_API_KEY}",
      "promptHint": "交互组件（button 等）必须带 behaviors 数组。"
    }
  ]
}
```

## 结果缓存与续跑

跑题结束后会把成绩单交给**同一个被测模型**写「模型自评」（做得好/不好、已掌握/未掌握），写入 `self-eval.json` 并出现在 `REPORT.md`。自评不是评分依据；`report` 命令会读取已有自评。

## 题库

位于 `datasets/`：`objective.json` 与 `subjective/S*.json`（含 `golden/` 参考卡片）。主观题的参考卡片全部通过本仓库 validator 的 schema 校验，可直接作为判分基线。扩充题库只需追加同格式 JSON 文件。

## 测试

```bash
pnpm test   # 判分器、提取器、题库完整性（含 golden 合法性）均为离线测试
```
