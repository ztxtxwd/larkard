# 图片取色与卡片调色：当前算法

本文说明 `packages/larkard/src/palette` 现有实现：**给一张图片和一张飞书卡片，从图片里提取调色盘，再把卡片换成与图片气质一致的配色**。

一句话版本：

> 提取阶段把图片压成「少量色簇 + 一个中性色 + 最多两个强调色」；合成阶段不直接拿这些颜色去覆盖卡片，而是把图片的**色相/彩度**套到卡片原有的**明暗结构**上，并修复文字对比度。

---

## 0. 总览

算法分成两段，中间只通过一个数据对象 `ImagePalette` 传递：

```
图片 File/URL
   │  browser.ts：解码 + 降采样
   ▼
PixelData (RGBA)
   │  extract.ts：加权中位切分 + 合并 + vivid + 分组打分
   ▼
ImagePalette ──────────────────────────────┐
  clusters[]   面积排序的色簇              │
  neutral      中性色（灰阶倾向）           │
  accents[]    最多 2 个强调色色相          │
  polarity     light / dark                │
  metrics      medianL / meanChroma / ...  │
                                           │
卡片 JSON ─ materialize.ts：官方色/字面量 → cus-* token，按钮 → 交互容器
   │        roles.ts：读 config.style.color，按名字 + 使用位置推断角色
   ▼                                       ▼
CardColorInventory ────────────────▶ synthesize.ts：保留原卡明暗关系，套图片色相/彩度
                                           │
                                           ▼
                                     DerivedTheme（token → light/dark）
                                           │
                     ┌─────────────────────┴─────────────────────┐
                     ▼                                           ▼
              apply.ts：只改写 token 值                 enums.ts：枚举-only 字段
              （不动 background_style 等引用）          回写成最接近的官方枚举
                     └─────────────────────┬─────────────────────┘
                                           ▼
                                     新卡片 + 报告
```

关键约定：

- **图片只提供“色相和彩度意向”，卡片原有明暗关系才是骨架。** 所以三列高亮不会变成同一个颜色，文字也不会因为换底而失去对比。
- **确定性。** 没有随机数、没有模型、没有迭代收敛。所有排序都有稳定的次级键；同一份像素 + 同一张卡，输出完全一致。
- **只改值，不改引用。** `background_style`、`border_color`、`<font color>` 这些别名保持原样，渲染/发送时由 larkard adapter 按 registry 解析。

---

## 1. 图片解码与采样

### 1.1 浏览器解码（`browser.ts`）

- 输入 `File`/`Blob`，超过 **20 MB** 直接拒绝，避免大图解码耗尽内存。
- 用 `createImageBitmap` 解码，再由 Canvas 2D 绘制到降采样尺寸；优先 `OffscreenCanvas`。
- 目标最长边默认 **192 px**（`maxEdge`），保持宽高比。
- 读取 `getImageData` 得到 RGBA 字节，关闭 bitmap。

算法层（`extract.ts`）不依赖 DOM，输入就是 `PixelData`。这样同一套算法可以放在浏览器、Node 或测试里跑。

### 1.2 再采样：按块做 alpha 加权平均（`samplePixels`）

即使已经解码到 192 px，也不是逐像素参与切分。代码再按块聚合：

```text
block = max(1, ceil(max(width, height) / maxEdge))
```

对每个 `block × block` 的格子：

- 跳过 `alpha < alphaThreshold`（默认 128）的像素；
- 用 `w = alpha / 255` 对 R/G/B 加权求和；
- 格子的 `weight = Σw`，颜色取加权平均；
- 整个格子没有可用像素就丢弃。

于是每个样本是“一小块面积的平均色”，权重是“这块面积里不透明像素的多少”。半透明边缘、抗锯齿像素自然会被削弱。192 px 下最多约 3.7 万个样本，后续切分的成本可控。

### 1.3 色彩空间：OKLab / OKLCH

所有距离、切分、明度、彩度判断都在 OKLab/OKLCH 里做，不在 sRGB 里做。

- sRGB → 线性化 → OKLab（Björn Ottosson 的矩阵）；
- `L`：感知明度，0..1；
- `C = hypot(a, b)`：彩度，实际很少超过 0.37；
- `H = atan2(b, a)`：色相，0..360°。

这样做的好处：

- 切分维度上的“距离”接近人眼感知，不会把暗部蓝色和亮部黄色按 sRGB 数值切成奇怪的比例；
- 可以只改 `L` 保留色相/彩度来做对比度修复（`ensureContrast`）；
- 色相距离、彩度阈值可以有一套跨图片稳定的常量。

辅助函数（`color.ts`）：

| 函数 | 用途 |
| --- | --- |
| `rgbaToOklab` / `oklabToRgba` | 色彩空间转换，越界通道直接 clamp |
| `rgbaToOklch` / `oklchToRgba` | 极坐标形式 |
| `deltaE` | OKLab 空间欧氏距离，用于“感知上是否几乎同色” |
| `hueDistance` | 环形色相距离，处理 0°/360° |
| `relativeLuminance` / `contrastRatio` | WCAG 2.x 相对亮度与对比度 |
| `ensureContrast` | 固定色相/彩度，只调 L，把前景色推到目标对比度 |
| `compositeOver` | 半透明前景合成到背景，计算真实可读对比度 |

---

## 2. 提取 `ImagePalette`（`extract.ts`）

### 2.1 加权中位切分（weighted median cut）

从“所有样本一个盒子”开始，反复把最有“切分价值”的盒子一分为二，直到得到最多 `maxColors`（默认 **12**）个盒子。

**选哪个盒子切：**

```text
score = box.weight × max(rangeL, rangeA, rangeB)
```

- `weight` 是盒子内像素权重和，大面积的区域优先；
- 三个通道里的最大跨度代表“颜色有多分散”，颜色越分散越值得切；
- 跨度小于 `1e-6` 的盒子分数为 0，切不动，标记 `locked`，不再参与选择。

**沿哪条轴切：**

取 OKLab 三通道里跨度最大的轴；跨度相同时按 `L → a → b` 固定顺序，保证确定性。

**切在哪里：**

把盒子内样本按该轴排序，沿累计权重找到**加权中位点**（累计权重首次 ≥ 总权重一半的位置）。如果权重全压在同一个色值上导致找不到合法切点，退回按样本数量对半分；再失败就锁定该盒子。

**每个盒子输出什么：**

盒子内所有样本在 OKLab 里做加权平均，再转回 RGBA 作为簇的**面积均值色**。权重归一化为 0..1 的占比。合并完成后，每个簇还会额外计算一个 `vivid` 代表色（见 2.2），用于强调色选择。

> 为什么不用 k-means：k-means 需要初始化和迭代，结果依赖随机种子，且容易把大面积平坦区域切碎。中位切分是确定性的，面积权重天然保留大色块，适合“从照片里找主色”而不是“分割颜色空间”。

### 2.2 合并感知上几乎相同的簇

切分结束后，按稳定顺序排序：

```text
weight ↓ → L ↓ → C ↓ → hue ↑
```

依次检查每个簇与已保留簇的 `deltaE`。小于 **0.025** 就视为同一种颜色，合并到先保留的簇里：

- 权重相加；
- 颜色按权重在 OKLab 中线性插值；
- 样本索引一起合并，最后再从完整簇成员里计算 `vivid`；
- 重新归一化权重，并截断到 `maxColors` 个。

避免“一张灰底照片里出现五个灰”。

**`vivid`：簇内高彩度代表色**

面积均值会把“鲜艳主体 + 过渡色”中和成脏灰。每个簇额外计算一个 `vivid`：

- 取簇内彩度最高的最多 **5 个样本**做加权平均；
- 这 5 个样本的权重必须至少占簇权重的 **0.5%**，否则视为噪点/极小反光，退回均值；
- `vivid` 彩度必须比均值高 **10%**，否则视为同一颜色，退回均值。

`vivid` 只用于强调色选择和彩度封顶；`neutral`、面积权重、预览主色仍然使用均值。

### 2.3 中性色

从所有簇里挑出 `C < 0.04` 的“近中性簇”，按权重求 OKLab 平均，得到 `neutral`。如果图片里没有近中性簇（比如纯高饱和插画），则用全部簇求平均兜底。

`neutral` 表达的是图片的“底色/灰阶倾向”，后续用来决定卡片的表面和文字往哪个色相偏。

### 2.4 强调色：按色相分组后综合打分（`pickAccentHues`）

强调色的核心是**色相**，对象里同时保留 `L/C`：合成阶段用 `h` 决定往哪个颜色偏，用 `C` 决定彩度上限。调用方不能假设 `accents` 里的彩度一定很高。

不再有两级硬阈值。所有带可见色相的簇先按色相分组，再用综合分数排序。

**候选与分组：**

- 候选簇：`vivid.C >= 0.004` 且面积 `weight >= 0.001`；
- 按 `vivid.H` 升序排列，在**最大色相空隙**处旋转起点，避免 0°/360° 跨圈把两片颜色错误合并；
- 相邻色相距离 < **30°** 的簇归为同一“色相组”。

**组得分：**

```text
score = groupWeight^0.5 × maxChroma^1.1 × lightnessWindow
```

- `groupWeight`：组内簇的面积权重和；
- `maxChroma`：组内簇 `vivid.C` 的最大值；
- `lightnessWindow`：以 `L=0.6` 为中心的宽窗口，范围 0.7~1.0，不把深色品牌色排除在外。

面积开方、彩度指数更高，意味着“面积小但鲜艳”的主体可以胜出，但面积仍作为保底。这里不再有 0.045 的硬阈值。

**可见性门：**

- 组内 `maxChroma >= ACHROMATIC_CHROMA`（**0.01**）；
- 组总面积 `>= ACCENT_GROUP_MIN_WEIGHT`（**0.008**，即 0.8%）。

两者都满足才参与排序；灰图没有可见色相，仍然不会凭空产生强调色。

**组代表色：**

- 色相/明度取组内**面积最大的簇**的 `vivid`；
- 彩度取组内 `vivid.C` 的最大值，保留最鲜艳的那一档。

不取组内最彩簇的色相：香槟金高光（`h≈38°`，面积小、更彩）比车漆暗部（`h≈66°`，面积大）更彩，但面积更大的车漆才代表主体，否则整张卡会被一小块偏红反光带偏。

**选几个：**

按得分从高到低取，最多 **2 个**；第二个必须与第一个色相距离 ≥ 30°。返回结果可能只有一个，也可能为空。

### 2.5 极性、指标与结构

```ts
interface PaletteCluster {
  rgba: Rgba;
  oklch: Oklch;
  weight: number;        // 面积权重，0..1
  vivid: {               // 簇内高彩度代表色，仅用于强调色
    rgba: Rgba;
    oklch: Oklch;
    weight: number;      // vivid 子集的面积占比
  };
}

interface ImagePalette {
  version: 2;
  polarity: 'light' | 'dark';
  clusters: PaletteCluster[];   // 均值色 + vivid，按面积权重排序
  neutral: Oklch;               // 中性色
  accents: Oklch[];             // 最多 2 个，C 来自 vivid
  metrics: {
    medianL: number;            // 加权中位明度
    meanChroma: number;         // 加权平均彩度
    hueSpread: number;          // 两个强调色的色相距离；只有一个时为 0
  };
}
```

- `polarity`：按加权中位明度判断，`medianL < 0.5` 为 `dark`，否则 `light`。这里只是图片自身的倾向，最终卡片极性还会结合卡片底色重新判断。
- `medianL`：把簇按 `L` 升序、权重降序排列，累计权重首次 ≥ 0.5 时的簇明度。

### 2.6 提取阶段常量

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `DEFAULT_MAX_COLORS` | 12 | 最多簇数 |
| `DEFAULT_MAX_EDGE` | 192 | 再采样目标最长边 |
| `DEFAULT_ALPHA_THRESHOLD` | 128 | 低于该 alpha 的像素忽略 |
| `MERGE_DELTA_E` | 0.025 | 合并近色阈值 |
| `ACHROMATIC_CHROMA` | 0.01 | “人眼几乎看不出色相”的彩度线，也是强调色可见性门 |
| `ACCENT_CANDIDATE_MIN_CHROMA` | 0.004 | 强调色候选最低彩度（vivid） |
| `ACCENT_CANDIDATE_MIN_WEIGHT` | 0.001 | 强调色候选最低面积 |
| `ACCENT_GROUP_MIN_WEIGHT` | 0.008 | 色相组可见所需最低面积 |
| `ACCENT_GROUP_HUE` | 30° | 色相分组间隔 |
| `ACCENT_WEIGHT_EXPONENT` | 0.5 | 组得分面积指数 |
| `ACCENT_CHROMA_EXPONENT` | 1.1 | 组得分彩度指数 |
| `VIVID_TOP_SAMPLES` | 5 | 每簇取多少个高彩样本 |
| `VIVID_MIN_WEIGHT_RATIO` | 0.005 | vivid 样本最低权重占簇比例 |
| `VIVID_MIN_GAIN` | 1.1 | vivid 相对均值的最低彩度增益 |
| 中性簇阈值 | 0.04 | `neutral` 只统计低于该彩度的簇 |

---

## 3. 卡片侧：读取色板与推断角色（`roles.ts`）

要让任意一张卡都能换色，先得知道每个 `config.style.color` token 在卡片里扮演什么角色。

### 3.1 读取 token

`readCardColorInventory` 读取 `card.config.style.color`：

- 值可以是字符串，也可以是 `{ light_mode, dark_mode }`（兼容 `lightMode`/`darkMode`）；
- 颜色支持 `#rgb/#rgba/#rrggbb/#rrggbbaa`、`rgb()/rgba()`（含百分比通道）；
- 解析失败的 token 直接忽略；
- 源卡 light/dark 完全相同的 token，后续输出也保持相同。

### 3.2 收集使用位置（`collectUsage`）

遍历 `body`/`header`，记录每个 token 被用在哪里：

- `background_style` / `background_color`：作为背景，记录嵌套深度（0 通常是 root shell）；
- `font_color` / `text_style.color` / `textStyle`：作为文字色，记录**当前父级背景 token**；
- `<font color='...'>`：从 markdown 内容里正则提取，记录父背景；
- `border_color` / `border.color`：作为描边，记录深度。

父背景的传递规则：节点自己的背景如果是已知 token，就成为子节点的背景；否则继承上层。这样 `on_*` 文字能找到它真正压在哪个表面上，而不是只靠名字猜。

### 3.3 角色推断顺序

角色共 15 种：

```text
canvas  body  panel  highlight  icon_surface
ink  muted  accent_text  on_surface
accent  accent_2  button  button_text  border  unknown
```

推断按以下顺序进行，后面的步骤会纠正前面的结果：

1. **名字提示**：先去掉 `cv_` / `cus_` / `mm_` / `mk_` 前缀，把 `-` 归一成 `_`，再匹配：
   - 完全匹配：`canvas`、`body`、`panel`、`ink`、`muted`、`accent`、`accent_2`、`button`、`button_text`、`border`、`icon_surface` 等；
   - 模式匹配：`on_*` → `on_surface`；`highlight_*` / `column_<n>` → `highlight`；`bg_<n>` → `panel`；`border_<n>` → `border`；`accent_text_<n>`、`ink_<n>`、`muted_<n>`、`button_<n>`、`button_text_<n>`；
   - `text_*` / `secondary` 是模糊角色 `text_or_muted`，留到下一步按对比度决定。
2. **`text_or_muted`**：计算每个候选与父背景的对比度，最高的一个当 `ink`，其余当 `muted`。
3. **按实际用途兜底**：名字没给出角色的 token：
   - 当过背景：深度包含 0 → `canvas`；否则彩度 ≥ 0.06 → `highlight`，否则 `panel`；
   - 只当过文字：与父背景对比度 ≥ 4.5 → `ink`，否则 `muted`；
   - 只当过描边 → `border`。
4. **名字与用途冲突时纠偏**：
   - 名字像表面色、但只被当文字用 → `on_surface`；
   - 名字像前景色、但只被当背景用 → 深度 0 则 `canvas`，否则 `panel`。
5. **选 canvas**，优先级：
   1. 名字归一后正好是 `canvas` 的 token；
   2. 背景深度包含 0 的 token（按名字排序）；
   3. 角色为 `body` 的 token；
   4. 第一个 `canvas/body/panel/highlight` 表面色。
6. **补正 canvas 候选**：被选中的 token 若角色是 `panel/body/highlight`，改成 `canvas`；其余 `bg_<n>` 如果彩度 ≥ 0.06 或与 canvas 对比度 ≥ 3，升级为 `highlight`。
7. **仍然 `unknown` 的 token 保持原色**，不参与换色，并在 `warnings` 里说明。

### 3.4 等价类

`light_mode` 和 `dark_mode` 格式化后都完全相同的 token 归为一组。合成阶段同一组会保持同色——例如原本 `ink` 和 `button` 是同一个黑，换色后仍然同为图片带来的深色。

---

## 4. 合成主题（`synthesize.ts`）

这是整个功能的核心，也是“为什么换完色仍然像一张卡”的原因。

### 4.1 三条原则

1. **表面色保留相对 canvas 的明暗差。** 卡片原本“深色高亮栏 / 浅色面板 / 图标底座”的层次，换色后仍然存在。
2. **前景色保留对比方向，并强制满足 WCAG。** 原本深字浅底，换色后仍是深字浅底；对比度不足就只调 `L` 把字推深/推浅，保留图片色相。
3. **同色 token 仍同色（等价类）。** 最后再做一次对比度修复；可读性优先于“严格同色”。

### 4.2 明暗极性

- 卡片极性：取 canvas 的 `light` 值，WCAG 相对亮度 > **0.35** 为 `light`，否则 `dark`。用相对亮度而不是 OKLab `L`，是因为饱和蓝的 `L` 会在 0.5 附近，但实际很暗。
- 合成 light 模式时沿用卡片极性；合成 dark 模式时强制 `dark`。所以一张深色卡在 light 模式下仍然是深色卡。
- 源卡 light/dark 相同时，输出也相同（custom-visual 的约定）；不同时分别生成两套。

### 4.3 “图片有没有颜色”：三个判定

这三个判定决定了中性表面/文字会不会被染色，是近中性图片修复的核心。

```text
imageHasColor(image)
  = image.accents.length > 0 || image.neutral.c >= ACHROMATIC_CHROMA(0.01)
```

- **`neutralHueFor(image)`**
  - `image.neutral.c >= 0.01`：用中性色自己的色相；
  - 否则用第一个强调色的色相（主体有颜色但整体很灰时，跟主体走）；
  - 都没有：0°。
- **`neutralChromaFor(sourceChroma, image, min, max)`**
  - 图片完全没有颜色：`min(sourceChroma, 0.004)`，几乎是纯灰；
  - 图片中性色自己看不到色相（`C < 0.01`）：`min(sourceChroma, 0.006)`，只留一点点强调色氛围；
  - 否则：把源卡彩度 `clamp(sourceChroma, min, max)`。

照片暗部常见 `C ≈ 0.004~0.008` 的色偏（白平衡、压缩噪声）。若直接拿它的色相给整张卡染色，灰石头照片会变成紫卡片。所以低于 0.01 的中性色不能当“可见颜色”，只能用强调色的色相；如果连强调色都没有，就压到 0.004 以下，保持灰。

- **`accentChromaCap(image, max)`**

```text
clamp(第一个强调色.C × 2, 0.06, maxAccentChroma)
```

`accents[].C` 现在来自 `vivid` 代表色，而不是被面积均值中和后的簇均值，因此混合簇的真实鲜艳度会重新参与封顶；公式本身不变。

源卡可能是高饱和品牌色（`C≈0.2`）。如果照搬源卡彩度，一张香槟金照片也会被合成成焦橙色。这里按图片强调色自身彩度封顶：图片越淡，卡片上的彩色块也越淡；同时保留 0.06 的下限，避免淡图把所有彩色块都压成灰。

### 4.4 canvas 的映射（`makeTargetCanvas`）

保留源卡“彩/灰”倾向，只换色相和明度锚点。

**明度：**

```text
light:  clamp(0.95 + (source.L - 0.95) × 0.3, 0.84, 0.995)
dark:   clamp(0.22 + (source.L - 0.22) × 0.3, 0.10, 0.34)
```

即目标底色锚定在 0.95/0.22，源卡底色的明暗差只保留 30%。这样不会因为源卡底色略深，换完就变成另一张卡。

**色相/彩度：**

- 如果源 canvas 本身有彩度（`C ≥ 0.05`）且图片有颜色：
  - 色相 = 图片强调色里离源色相最近的那个；没有强调色则用 `image.neutral.h`；
  - 彩度 = `min(clamp(source.C × 0.75, 0.06, 0.14), accentChromaCap(image, 0.14))`。
- 否则走中性路径：
  - 色相 = `neutralHueFor(image)`；
  - 彩度 = `neutralChromaFor(source.C, image, 0.006, 0.025)`。

### 4.5 表面色：body / panel / highlight / icon_surface（`mapSurface`）

除 `icon_surface` 外，明度按“相对 canvas 的明度差”映射：

```text
dL   = source.L - sourceCanvas.L
L    = clamp(targetCanvas.L + dL × scale, 0.02, 0.995)
scale = light 模式 0.9，dark 模式 0.8
```

- 深色高亮块在浅色卡上额外限制：若 `source.L < sourceCanvas.L - 0.45`，则 `L ≤ targetCanvas.L - 0.45`，保留“重块”感。
- `icon_surface` 固定 `L = 0.96`（light）/ `0.30`（dark），只从中性规则取一点彩度。

色相/彩度：

- 判定为彩色：图片有颜色，且（角色是 `highlight/accent/accent_2` 或源色 `C ≥ 0.05`）。高亮面即使源色是低彩度，也强制带一点图片的强调色（`C ≥ 0.06`），不能变成灰。
  - 色相 = 离源色相最近的图片强调色；没有强调色则用 `image.neutral.h`。
  - 彩度 = `min(max(surfaceChroma(source.C), highlight ? 0.06 : 0), accentChromaCap)`。
  - `surfaceChroma`：源色 `C < 0.05` 时走中性规则（0.005~0.03）；否则 `clamp(source.C × 0.85, 0.06, maxAccentChroma)`。
- 判定为中性：图片有颜色时仍走 `surfaceChroma`；图片没颜色时走 `neutralChromaFor(..., 0.005, 0.03)`。

### 4.6 强调色：accent / accent_2 / button（`mapAccent`）

按 token 在 inventory 中出现顺序编号，`accent` 和 `accent_2` 依次使用图片的强调色（`index % accents.length`）；`button` 不增加编号，避免按钮把第二个强调色吃掉。

分三种情况：

1. **源色几乎是单色**（`source.C < 0.045`）：保持单色。
   - `light`：`L = clamp(source.L, 0.10, 0.86)`
   - `dark`：`L = clamp(source.L × 0.5 + 0.45, 0.45, 0.90)`
   - 彩度：图片有颜色时 ≤ 0.02，否则 ≤ 0.004。
2. **图片没有强调色**（灰度图片）：不凭空造彩色，收成中性深/浅色。
   - `light`：`L = 0.34`；`dark`：`L = 0.70`。
   - 彩度：图片有颜色时 ≤ 0.04，否则 ≤ 0.004。
   - 这里刻意不保留源卡的高饱和 accent：灰图应该得到中性深/浅色，否则色相 0° 会得到一层暗红。
3. **有强调色**：
   - 色相 = 图片强调色；
   - 彩度 = `min(clamp(max(source.C, accent.C), 0.06, maxAccentChroma), accentChromaCap)`；
   - `light`：`L = clamp(source.L, 0.32, 0.84)`
   - `dark`：`L = clamp(source.L × 0.4 + 0.5, 0.45, 0.82)`
   - 最后再 `capChroma` 一次。

### 4.7 前景色：ink / muted / accent_text / on_surface / button_text

先确定每个文字 token 的**目标父背景**（`backgroundTokenFor`）：

1. AST 记录到的真实父背景优先；
2. `button_text` → `button` → `accent` → canvas；
3. `on_*` → 按短名找对应 token（`on_canvas` → canvas、`on_accent` → accent…），找不到再按角色找；
4. 兜底 canvas。

然后：

**普通前景（`mapForeground`）**

- 对比方向由目标背景决定：比较黑/白哪个对比更高，决定 `darker` 或 `lighter`；
- 基础明度：
  - `muted`：浅底 0.76 / 深底 0.46；
  - 其他：浅底 0.96 / 深底 0.16；
- 色相 = `neutralHueFor(image)`；
- 彩度 = `neutralChromaFor(source.C × 0.6, image, 0.004, 0.035)`；
- 目标对比度：`ink` 为 `max(minTextContrast, 7)`，其余为 `minTextContrast`（默认 4.5）；
- `ensureContrast` 只调 `L`（步长 0.01，最多 100 步），保留色相/彩度；实在达不到才退回纯黑/纯白。

**强调文字（`mapAccentText`）**

图片没有强调色时退回普通 `ink` 逻辑；否则用第一个强调色的色相，彩度至少 0.06，再走同样的对比度修复。

### 4.8 描边（`mapBorder`）

- 方向按源卡判断：源边框比源底色亮，目标边框也比目标底色亮；
- 明度差 `|sourceBorder.L - sourceCanvas.L|` 被 clamp 到 **0.06~0.16**；
- 目标明度 = `targetCanvas.L ± amount`；
- 色相/彩度走中性规则（`neutralChromaFor(source.C, image, 0.004, 0.03)`）。

> 当前描边默认相对 canvas 派生。如果一张卡在深层背景里单独用了描边 token，后续可以把父背景也记进 `TokenUsage` 再细化。

### 4.9 执行顺序

每个模式（light/dark）内部严格按以下顺序：

1. **表面色**：canvas / body / panel / highlight / icon_surface；
2. **强调色**：accent / accent_2 / button；
3. **前景色**：ink / muted / accent_text / on_surface / button_text（依赖第 1、2 步得到的背景）；
4. **描边**：border；
5. **未知 token**：保持原色；
6. **等价类**：原本同色的 token 统一成代表色（代表按角色优先级：canvas > body > panel > ink > muted > accent_text > accent > button > …）；
7. **最终对比度修复**：在等价类之后再做一遍，优先保证可读性。个别 token 因此不再同色是可接受的。

### 4.10 输出

```ts
interface DerivedTheme {
  colors: Record<string, { light_mode: string; dark_mode: string }>;
  roles: Record<string, TokenRole>;
  preview: PreviewColor[];   // UI 预览：优先列出角色色，再列图片强调色和主色
  warnings: string[];
}
```

`preview` 的构造顺序：

1. 按 `canvas → body → panel → ink → muted → accent_text → accent → accent_2 → button → button_text → highlight` 列出卡片角色色；
2. 追加图片强调色（标签“图片强调色”“图片次强调色”）；
3. 追加图片前三个主色；
4. 去重后最多 10 个。

先列图片强调色再列面积主色，是因为用户从照片里认出来的是“那个颜色”；只列面积主色时，暗背景可能压过主体，让人误以为取色取错了。

### 4.11 合成阶段参数

| 参数 | 默认 | 约束 | 作用 |
| --- | --- | --- | --- |
| `polarity` | 自动 | `light` / `dark` | 卡片明暗极性；不传时按 canvas 相对亮度推断 |
| `maxAccentChroma` | 0.16 | clamp 到 0.08~0.3 | 强调色彩度上限 |
| `minTextContrast` | 4.5 | clamp 到 3~12 | 正文/次要文字最小 WCAG 对比度；ink 另外尽量到 7 |

---

## 5. 写回与枚举回写

### 5.1 `apply.ts`：只改写 token 值

- 克隆卡片；
- 只改 `config.style.color` 里**已存在**的 token 的 `light_mode`/`dark_mode`；
- `background_style`、`border_color`、`<font color>` 等引用一律不动；
- 返回 `changed` 列表，方便 UI 展示和撤销。

### 5.2 `enums.ts`：只能走官方枚举的字段

有些字段没有 `config.style.color` 通道，只能从官方枚举里挑：

- `icon.color` / `ud_icon.style.color`
- `<text_tag color>` / `<number_tag background_color|font_color>` / `<audio background_color|fill_color>`
- `header.template` / `header.text_tag_list[].color` / `header.background_color`
- `table.header_style`
- `fill_color` / `text_color`
- 不支持自定义色的 `background_style` / `border_color`

这些字段使用**同一套主题锚点**（canvas / panel / ink / muted / accent / accent2 / onAccent），保证整张卡色相统一：

- 锚点优先取合成后主题里的对应 token；没有就用图片色按极性兜底；
- 目标色 → 官方枚举按 OKLab `deltaE` 找最近值；
- 灰阶和彩色分开选：源色/目标强调色是中性时只从 `grey-*` 里选，避免把灰色 icon 变成彩色；
- `text_tag` 有 13 个色族，中性时固定 `neutral`；
- `header.template` 的中性图片会落到 `default`/`grey`，不硬造彩色标题；
- 表格表头只有两档：文字色接近 `grey-600`（`deltaE < 0.12`）选 `grey`，否则 `default`；背景目标接近 canvas（`deltaE < 0.08`）选 `none`，否则 `grey`；
- `header.template` 用 `min(deltaE(accent, 模板色), deltaE(ink, 模板色))` 比较，避免深色图全被判成 `grey`。

枚举回写是**近似**的：目标色再准，最终也只能落在十几个官方色里。这是平台能力的边界，不是算法取舍。

---

## 6. 物化：让任意卡都能参与（`materialize.ts`）

换色前先把“没有自定义色通道”的颜色承载方式改造成可换色的形态。只改承载方式，不改视觉语义。

### 6.1 官方枚举/字面量 → `cus-*` token

- `normalizeExistingColors`：存量 token 里直接写官方色名（`light_mode: "blue"`）的先归一成 hex/rgba；
- 支持自定义背景的容器：`column`、`column_set`、`interactive_container`；
  - `background_style` / `background_color` → `cus-bg-N`；
- `interactive_container.border_color` → `cus-border-N`；
- `font_color` / `text_style.color` → 按颜色特征分配 `cus-ink-*` / `cus-muted-*` / `cus-accent-text-*`（彩度 ≥ 0.05 为强调文字；明度 < 0.35 或 > 0.75 为 ink；否则 muted）；
- markdown 里的 `<font color>` → 文字 token；
- 飞书回读形态的 `custom_background_style` / `custom_border_color` / `textStyle.customColor` 收回 token。

### 6.2 按钮 → `interactive_container`

按钮本身没有自定义颜色字段，转换规则：

| 按钮类型 | 底色 | 文字 | 描边 |
| --- | --- | --- | --- |
| `default` | `grey-50` → `cus-button-N` | `grey-900` → `cus-button-text-N` | `grey` → `cus-border-N` |
| `primary` | `blue` → `cus-button-N` | 白色 → `cus-button-text-N` | 无 |
| `text` / `primary_text` | 无底色 | 灰 / 蓝 → 文字 token | 无 |

- 保留 `behaviors`、`hover_tips`、`disabled_tips`、`confirm`、`margin`、`element_id`、`disabled`；
- 尺寸按 `tiny/small/medium/large` 映射高度、内边距和字号；
- 图标跟随文字色（删掉 `icon.color`），避免换色后图标和底色撞色；
- **例外**：`form` 内按钮（会丢 submit/reset 语义）和 `danger` 系列按钮（保留语义红）不转换，也不参与图片配色。

### 6.3 补默认字色

在有底色的容器里，没有显式字色的 markdown 会补一个 `cus-ink` token。否则图片把底色换深/换浅后，飞书默认字色不会自动反转，对比度就坏了。内容里已有 `<font>` / `<text_tag>` 等内联标签时不强行包 `<font>`，避免破坏局部字色。

---

## 7. 任务级入口（`index.ts`）

`recolorCardWithImage(card, pixels, options)` 串起全部流程：

```text
extractImagePalette
  → materializeCardColors
  → readCardColorInventory
  → supported = 有 token || 有枚举色 || 转换过按钮
  → deriveThemePalette（只有 token 时）
  → applyThemePalette
  → buildAnchors + remapEnumColors
  → 返回新卡片、image、inventory、theme、materialized、apply、changed
```

- 如果卡片完全没有任何可换色的颜色字段：`supported = false`，原样返回，`warnings` 说明。
- 只有枚举色、没有自定义 token 的卡：跳过 `deriveThemePalette`，直接用图片色生成锚点做枚举回写。
- `changed` 分别统计自定义 token、枚举字段、按钮转换的数量。

浏览器侧入口：

```ts
import { recolorCardWithImage, extractImagePalette } from 'larkard/palette';
import { recolorCardFromFile, recolorCardFromUrl, pixelsFromUrl } from 'larkard/palette/browser';

// 一步到位：File/Blob → 新卡片
const result = await recolorCardFromFile(card, file);

// 只用同源图片 URL 取色
const pixels = await pixelsFromUrl('/api/plus/media/key/...');
const imagePalette = extractImagePalette(pixels);
```

---

## 8. 确定性与复杂度

**确定性：**

- 没有随机数、没有模型、没有迭代收敛；
- 所有排序都有稳定的次级键（权重、明度、彩度、色相、名字、索引）；
- `vivid` 的高彩样本排序、色相分组和组得分也都有稳定次级键；
- 中位切分的轴和切点都由数据唯一决定；
- 同一份像素 + 同一张卡 → 完全相同的输出。

**复杂度（`n` 为再采样后的样本数，`k` 为簇数）：**

- 采样：`O(P)`，`P` 是解码后的像素数；
- 中位切分：最多 `k = 12` 次切分，每次对盒内样本排序，约 `O(k · n log n)`；
- 合并：`O(k²)`；
- `vivid`：每簇对成员样本排序，合计约 `O(n log n)`；
- 合成：`O(T log A)`，`T` 是 token 数，`A` 是强调色数（≤ 2）；
- 192 px 下 `n ≤ ~37k`，整个流程在毫秒级。

**跨端复现：** 算法本身确定，但图片解码结果可能受浏览器/解码器影响（色彩管理、缩放实现）。需要严格复现时，建议把提取出的 `ImagePalette` 存下来，而不是每次重新解码。

---

## 9. 已知边界

- **form 内按钮**不能转成交互容器（会丢 submit/reset 语义）；**danger 系列**按钮保留语义红。这两类走官方枚举，不参与图片配色。
- 按钮转交互容器后，文字统一为居中单行 markdown；原按钮的多行/富文本文案会被压成纯文本（按钮 schema 本身也只允许 `plain_text`）。
- 图表 `chart_spec` 的颜色属于数据语义，暂不参与换色。
- 官方红/绿等 `<font>` 文字和 `text_tag` 目前也会跟随图片强调色；如果业务强依赖状态语义色，后续需要再加一层语义保护名单。
- 描边目前默认相对 canvas 派生；深层背景里的独立描边 token 后续可以结合父背景细化。
- 枚举-only 字段只能落到官方枚举，颜色是近似值。
- 没有 `config.style.color` 的卡只会做枚举回写和按钮转换；能否换色取决于它是否至少有一个可承载颜色的字段。
- `vivid` 只解决“簇内被面积均值稀释”的问题。面积低于 0.8% 且没有被中位切分单独切出的极小主体，仍可能被面积型切分吞掉；要稳定抓取“黑夜里的红灯”，需要独立的显著性权重或二次候选 pass。

---

## 10. 调参速查

| 想要的效果 | 参数 | 调整方向 |
| --- | --- | --- |
| 保留更多/更少的图片主色 | `maxColors` | 默认 12；调大保留更多细分色 |
| 取色更细/更快 | `maxEdge` | 默认 192；调大更细，调小更快 |
| 忽略更多半透明像素 | `alphaThreshold` | 默认 128；调大更严格 |
| 卡片更“彩色” | `maxAccentChroma` | 默认 0.16；调大上限更高（但会被 `accentChromaCap` 再封顶） |
| 文字对比度更高 | `minTextContrast` | 默认 4.5；调大到 7 更严格 |

---

## 附：源码地图

| 文件 | 职责 |
| --- | --- |
| `color.ts` | sRGB ↔ OKLab/OKLCH、WCAG 对比度、`ensureContrast` |
| `extract.ts` | 加权中位切分、合并近色、中性色、强调色选择 |
| `browser.ts` | 浏览器图片解码与降采样 |
| `roles.ts` | 读取 `config.style.color`，按名字 + 使用位置推断角色、等价类 |
| `synthesize.ts` | 保留原卡明暗关系，把图片色相/彩度套到 token 上 |
| `apply.ts` | 克隆卡片并写回 token 值 |
| `official.ts` | 官方枚举 → light/dark 颜色对、最近枚举查找 |
| `enums.ts` | 枚举-only 字段回写 |
| `materialize.ts` | 物化官方色、按钮转交互容器、补默认字色 |
| `index.ts` | 任务级入口 `recolorCardWithImage`、`RecolorResult` |
