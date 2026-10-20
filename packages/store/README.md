# `@open-feishu-card/store`

把卡片运行时数据**封印进卡片本身**：空分栏 `column_set` 的 `action.multi_url.url`，载荷为 `deflate → base64url`。本包解决「卡片 JSON 里自带一小段可回读数据」。

## 宿主形态（DSL）

```json
{
  "tag": "column_set",
  "element_id": "card_state",
  "action": {
    "multi_url": {
      "url": "lark://msgcard/unsupported_action#s1.<base64url>"
    }
  },
  "margin": "-8px 0 0 0",
  "columns": [{ "tag": "column", "width": "auto", "elements": [] }]
}
```

空分栏不放内容。真机仍会在它前面留下正文的纵向间距，所以 `margin` 的上边距写成这段间距的负数。间距按客户端**纵向**枚举算（default 8 / medium 12 / large 16，与 `packages/renderer` 同源）；未写 `vertical_spacing` 时按默认 8px。正文横向排列（`body.direction: 'horizontal'`）时宿主前面是列间距，不写 `margin`。URL 只写一份，避免四端复制吃额度。

## 安装

```bash
pnpm add @open-feishu-card/store
```

## 用法

```ts
import {
  sealCardState,
  readCardState,
  unsealCardState,
  encodeStateUrl,
  decodeStateUrl,
} from '@open-feishu-card/store'

const card = {
  schema: '2.0',
  body: { elements: [{ tag: 'markdown', content: 'hi' }] },
}

sealCardState(card, { step: 1, selected: ['a'] })
const state = readCardState<{ step: number }>(card)
unsealCardState(card) // 读出并移除宿主
```

编解码也可单独用：

```ts
const url = encodeStateUrl({ ok: true })
const data = decodeStateUrl(url)
```

## 回读注意

- 请走 **`raw_card_content`**（或等价 RAW）。`user_card_content` 会丢掉 URL，解不出 state。
- adapter 可能投影成 `actions[]`；`readCardState` 已兼容 DSL / adapter / RAW 几种形态。
- 封印（`sealCardState`）针对 **DSL** 卡片：宿主追加在 `body.elements` 末尾。
- 卡片总大小有上限（约 153KB 量级，以官方为准）；封印大对象前先估体积。

## 相关包

- [`@open-feishu-card/adapter`](../adapter) — DSL ↔ RAW；`element_id` / `column_set.action` 需 round-trip
