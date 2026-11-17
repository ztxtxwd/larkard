# @open-feishu-card/optimize

发送前的卡片**视觉优化**。纯函数、零运行时依赖，不渲染 DOM。

当前提供：

## 分栏内的交互容器等高

真机 `interactive_container` 的 `heightValue` 只认 pixels：`height` 为 `auto` 时完全由内容撑开。同一个 `column_set` 里，只要某一列的文字多折了一行，这一列的容器就会比其它列高一截，卡片看起来参差不齐。

`equalizeInteractiveContainerHeights()` 会：

1. 找出 `column_set` 中「每列恰好一个顶层 `interactive_container`」的组；
2. 按真机布局规则预测每个容器的自然高度（字号 / 行高 / padding / border / margin / 子项间距 / 折行）；
3. 取最大值，给组内所有容器写 `height: "Npx"`。

```ts
import { equalizeInteractiveContainerHeights } from '@open-feishu-card/optimize';

const { card, groups, skipped, changes } = equalizeInteractiveContainerHeights(dsl);

// 默认按渲染器 605px 卡片宽度预测。要同时覆盖窄屏（宁可留白也不裁字）：
const narrowSafe = equalizeInteractiveContainerHeights(dsl, { widths: [605, 360] });
```

### 什么时候会跳过

优化器宁可不动，也不猜一个可能裁字的高度。以下情况整组跳过，并在 `skipped` 里给出原因：

- 列数 < 2；
- 列宽不是 `weighted` / 固定 px（`auto` 宽度算不出来）；
- 某列不是恰好一个顶层 `interactive_container`；
- 目标容器已经写死 `height`（可用 `overwriteFixedHeight: true` 重新按内容预测），或 `direction: horizontal`；
- 容器内有 chart / table / audio / video / 嵌套容器等不在测量白名单里的组件；
- 自然高度超过 `maxHeight`；
- 各列预测高度本来就相同（`skipWhenEqual`，默认开启）。

### 测量精度

内置字宽表按 CJK 1em、ASCII Arial 度量，并对 ASCII 留 3% 余量：高度偏大只是留白，偏小会裁字。浏览器里可以传 Canvas 测量拿到当前字体的精确宽度：

```ts
const canvas = document.createElement('canvas').getContext('2d')!;
const measureText = (text: string, fontSize: number, bold: boolean) => {
  canvas.font = `${bold ? 'bold ' : ''}${fontSize}px -apple-system, "PingFang SC", Arial, sans-serif`;
  return canvas.measureText(text).width;
};
equalizeInteractiveContainerHeights(dsl, { measureText });
```

### 局限

固定高度对卡片宽度敏感。`cardWidth` 默认 605（渲染器根节点 `max-width`），真机窗口更窄时文字可能多折一行。需要跨宽度安全时传 `widths: [宽, 窄]`，代价是宽卡下方会多留白。

参考宽度请保持在 **320px 以上**：飞书客户端在卡片宽度 ≤ 320px 时会启用另一套 `flex_mode` 规则（`stretch` 堆叠、`bisect` / `trisect` 强制等宽），本优化器按宽卡布局计算列宽。窄屏上更稳妥的做法是让分栏自然堆叠，而不是钉死宽度和高度。
