# 卡片程序运行时：平台事实与接入边界

> 协议本身见 [program-protocol.md](program-protocol.md)。入口：`larkard/program`（解释器）、
> `larkard/program/runtime`（宿主）、`larkard/state`（封印）。

## 链路

```
生成方（web / Agent）
  ├─ compileProgram / renderProgram
  ├─ composeCard（封印 card_prog + card_state）
  └─ 发消息（应用身份或用户身份）
          │
          ▼
        飞书 ── card.action.trigger ──▶ 宿主（bot / 长连接 / Webhook）
                                          ├─ CardRuntime.handleCallback
                                          └─ 响应体：{ toast, card: { type: 'raw', data } }
```

## 回调

- `card.action.trigger` 由**发送卡片消息的应用**接收。用应用的 user_access_token 发出的卡片，
  回调仍然推给这个应用，**不要求机器人加入会话**。
- 回调体是 2.0 结构：`header.event_type`、`event.operator`、`event.action`（`value` / `tag` /
  `form_value` / `option` …）、`event.context.open_message_id` / `open_chat_id`。
- **回调体里不带卡片。** 卡片的程序与状态只能从封印宿主读回，或者由宿主自己的存储提供。
- 必须在 **3 秒内**响应；不能是 3xx 重定向。响应体可以同时带 `toast` 和 `card`，
  两者原子生效（卡片不合法或超限时 toast 也一起丢失）。
- 已发送卡片的可交互期 30 天，可更新期 14 天。14–30 天仍能点击，但更新不生效。
- 删改顺序：**先算出响应再返回**，不要在响应之后写卡；消息卡片路径不需要 CardKit。
- 真机（Linux 桌面客户端 7.72.23，larkit sandbox）已验证：回调响应里的 `card` 会替换消息里的卡，
  toast 同时生效；平台 `raw_card_content` 回读**不是**立刻更新，800ms 时可能还是旧版，
  约 2 秒后才看到新的 `rev` / `state`。判断平台是否收下要看稍后的回读。
- 用户身份发卡同样成立：web2 用应用的 user_access_token 把卡发到**机器人不在**的群，
  回调仍推给发送应用；bot 从 `CardInstanceStore` 恢复后返回新卡，真实客户端会替换这张用户发的卡。
- 真机延迟：bitedb 客户端**未预热**时首次实例读取约 4.3 秒，超过 3 秒预算；bot 启动时
  `hydrateCardInstanceStore()`（建表 + 把行灌进内存）后，新卡首次点击约 0.8 秒。
  所以宿主必须在启动时 hydrate，web2 也要等实例种子写完再返回。
- 上一次响应丢失、客户端停在旧 `rev` 时，点击带回的是**当前卡**（即使动作被拒），
  用于修正客户端；否则服务端 rev 已推进，客户端会一直停在旧状态。

## 发卡与读回

- 发卡：`POST /im/v1/messages`，`msg_type: "interactive"`，`content` 是卡片 JSON 字符串。
- 读回：`GET /im/v1/messages/:id?card_msg_content_type=raw_card_content`，返回
  `{ json_card, json_attachment, card_schema }` 信封；本包会先解包再读宿主。
- **读回的前提是机器人在消息所属的群组内**（官方文档「获取指定消息的内容」前提条件）。
  因此用户身份发到机器人不在的会话时，读回不可用。
- 更新：`PATCH /im/v1/messages/:id` 必须由**发送这条消息的身份**调用；web2 这类
  「以用户身份发送」的场景要传用户 token。走回调响应则不需要任何写接口。

## 状态封印

- `composeCard` 在正文末尾挂两个命名宿主：`card_prog`（原始程序，不变）和
  `card_state`（`{ rev, state }`，每次变化 +1）。实现复用 `larkard/state`。
- 编码是 deflate + base64url，**不是加密**，不要把敏感数据放进状态。
- 卡片体积官方建议 ≤ 30KB（含视图、程序、状态）。封印对不可压缩文本约放大 1.8 倍；
  状态里放正文时，30KB 对应的原始文本约 17KB。运行时在超过预算 80% 时给 warning；
  真正超限时整批点击改成「卡片太大了」的错误提示，状态不落盘。
- 卡片最多 200 个元素或组件。
- 消息卡片没有 CardKit `sequence` 那样的乐观锁。单进程写同一张卡时靠 mailbox 串行；
  多进程场景只能用「每批读一次平台」对账（`readBeforeApply`），窗口仍然存在。

## 运行时行为

- 同一张卡的点击在 mailbox 里串行；排队中的点击合并成一批，只渲染一次新卡，
  新卡挂在**这一批最后一个**回调响应上。前面的响应只带 toast。
- 一批里任一动作失败或渲染失败：整批改成错误提示，状态不落盘。
- `handleCallback` 对**不是本协议的卡片**返回 `undefined`。宿主（例如已有其它卡片路由的 bot）
  应继续把事件交给其它处理器；不要用 `{}` 吞掉。
- 实例恢复顺序：内存 → `CardInstanceStore` → 平台读回。
  - 配置 `store` 后 `readBeforeApply` 默认关闭：单进程写卡，store 就是真源，
    点击不必每次多一次 GET；
  - 没有 store、机器人又不在会话里时，冷启动/缓存淘汰后的点击无法恢复状态。
- `CardHost` 的两个能力都是可选的：只处理回调的宿主只实现 `getRawCard`；
  只发卡的宿主只实现 `sendCard`。

## 接入示例（larklet / 长连接）

```ts
import { CardRuntime, type CardInstanceStore } from 'larkard/program/runtime';

const runtime = new CardRuntime({
  api: { getRawCard },           // 有 store 时可以不实现
  store,                         // 按 message_id 持久化 { program, rev, state }
  readBeforeApply: false,
});

// app/events.ts
export const events = {
  'card.action.trigger': async (event) => {
    const response = await runtime.handleCallback({ event: event.event });
    return response; // undefined → 交还给 larklet 的默认卡片处理
  },
};
```

`CardInstanceStore` 的 `load` 可以在本地存储未命中时回退到生成方（web2）的内部接口，
拿到程序与初始状态后由宿主接管后续 `rev` / `state`。

## 客户端校验

程序文档不能直接喂给 `checkCard`：模板里的交互组件是 `$on` 而不是 `behaviors`，
根上的 `$state` / `$actions` 也会被 Zod 默认 strip 掉。正确顺序是：

1. `compileProgram(doc)` 拿到带 JSON Pointer 的协议诊断；
2. `renderProgram(program, state, { rev })` 渲染出纯卡片 JSON；
3. 对渲染结果再跑 `checkCard`，检查 Schema、最佳实践与真机硬约束。
