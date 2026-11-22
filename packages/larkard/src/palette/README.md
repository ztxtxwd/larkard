# recolor：图片取色 → 卡片换色

核心文件不依赖 React、DOM 或具体应用；只有 `browser.ts` 负责浏览器图片解码。
公开入口是 `larkard/palette` 和 `larkard/palette/browser`。

## 流程

```
card ──materializeCardColors()──▶ 物化后的 card        materialize.ts
        ├─ 官方枚举/字面量 → cus-* token（背景 / 文字 / 描边）
        └─ 非 danger、非 form 按钮 → interactive_container
                           │
File/URL ──browser.ts──▶ PixelData
                           │
                           ▼
              extractImagePalette()        extract.ts
                           │ ImagePalette（簇 + 中性色 + 强调色）
                           ▼
              deriveThemePalette()         synthesize.ts
                           │ ThemePalette（token → light/dark）
                           ▼
              applyThemePalette()           apply.ts
                           │ 只改 config.style.color 的值
                           ▼
              remapEnumColors()            enums.ts
                           │ icon / text_tag / header.template 等
                           │ 只能走官方枚举的字段 → 最接近的枚举
                           ▼
                      新 card + report
```

## 文件

| 文件 | 职责 |
| --- | --- |
| `color.ts` | sRGB ↔ OKLab/OKLCH、WCAG 对比度、`ensureContrast` |
| `extract.ts` | 加权中位切分 + 合并近似色 + 挑强调色 |
| `materialize.ts` | 物化官方颜色 + 按钮转交互容器 |
| `official.ts` | 官方枚举 → light/dark 颜色对、最接近枚举查找 |
| `roles.ts` | 读 `config.style.color`，按名字 + 使用位置推断 token 角色 |
| `synthesize.ts` | 保留原卡明暗关系，把图片色相/彩度套到 token 上 |
| `apply.ts` | 克隆卡片并写回 token 值 |
| `enums.ts` | 把枚举-only 字段回写成最接近目标色的官方枚举 |
| `browser.ts` | `createImageBitmap` + Canvas 降采样到 RGBA |
| `index.ts` | 任务级入口 `recolorCardWithImage()` |

## 关键约定

- **不直接替换主色**：先读原卡的表面/文字/强调角色和等价类，再按相对明暗关系
  映射图片色板。这样不会把三列高亮映射成同一个颜色，也不会把文字对比度改坏。
- **只改写值**：`background_style`、`border_color`、`<font color>` 等引用保持
  不变；渲染/发送时由 larkard adapter 按 registry 解析。
- **确定性**：没有随机数、没有模型；排序都有稳定的次级键。同一份像素 + 同一张卡
  输出完全一致。
- **支持任意卡**：不再要求卡里已经有自定义色。支持自定义色的字段会先物化成
  `cus-*`；只能走官方枚举的字段回写成最接近的枚举；非 danger、非 form 按钮转成
  可自定义底色的 `interactive_container`。
- **近中性图片**：中性色彩度低于 `ACHROMATIC_CHROMA`（0.01）时，不拿它的色相给
  整张卡染色（照片暗部常见 0.004~0.008 的色偏，人眼看不出来）；没有高彩度
  强调色时，从相对最彩的簇里取一个色相提示（例如暗背景上的香槟金车身）。
  强调色块的彩度按图片强调色封顶，不继承源卡的高饱和彩度，避免“淡图配焦橙色”。
- **保护语义色**：名字/用途判断不出的 token 保持原色，并在 `warnings` 里说明。
- **暗色**：源卡 light/dark 相同时输出也相同（custom-visual 的约定）；不同时
  分别生成两套并各自跑对比度修复。

## 已知边界

- **form 内按钮**不能转成交互容器（会丢 submit/reset 语义），**danger 系列**按钮
  保留语义红，不做换色；这两类走官方枚举，不参与图片配色。
- 按钮转交互容器后，文字会统一成居中单行 markdown；原按钮的多行/富文本按钮文案
  会被压成纯文本（按钮 schema 本身也只允许 plain_text）。
- 图表 `chart_spec` 的颜色属于数据语义，暂不参与换色。
- 官方红/绿等 `<font>` 文字和 `text_tag` 目前也会跟随图片强调色；如果业务强依赖
  状态语义色，后续需要再加一层语义保护名单。
- 描边目前默认相对 canvas 派生；如果卡片在深层背景里单独用了描边 token，后续可以
  把父背景也记进 `TokenUsage`。
- 图片解码结果可能受浏览器/解码器影响；算法本身确定，但跨端严格复现时建议把
  提取出的 `ImagePalette` 存下来，而不是每次重新解码。
