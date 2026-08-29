# @open-feishu-card/schema

## 0.1.4

### Patch Changes

- 飞书回读卡片时 custom_background_style / 丢失的 font_color 归一化：`normalizeStoredCardColors` 还原 cus-N + config.style.color；schema 补充 markdown.font_color 与 column.custom_background_style。

## 0.1.3

### Patch Changes

- 441c53b: disabled 的纯视觉 interactive_container 在表单外不再强制要求 behaviors（对齐官方组件库强调框写法：disabled + 白底/边框/圆角 + 无 behaviors）

## 0.1.2

### Patch Changes

- 为库包增加 CommonJS 双格式构建（ESM + CJS），可通过 `require` 使用。

## 0.1.1

### Patch Changes

- 首次正式发布：补齐构建产物与包内容（替换 npm 上的空占位 0.1.0）。
