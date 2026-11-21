# 卡片程序协议 v1

一张**卡片程序**就是一个完整的交互卡片应用：界面、状态和交互逻辑都写在一个 JSON 文档里。它是在飞书卡片 JSON 2.0 的基础上加了少量 `$` 开头的扩展字段。运行时把程序和状态封印进发出去的卡片，收到点击回调时读出来、执行动作、重新渲染、更新卡片。服务端没有任何业务代码。

程序只能修改卡片自己的状态，不能访问网络、文件或其它外部资源。

> 实现：解释器在 `larkard/program`（`compileProgram` / `renderProgram` / `dispatchAction` / 模拟器），
> 宿主在 `larkard/program/runtime`（`CardRuntime`、`composeCard`、`CardInstanceStore`）。
> 平台事实与接入边界见 [program-runtime.md](program-runtime.md)。

## 文档结构

```json
{
  "$v": 1,
  "schema": "2.0",
  "header": { ... },
  "body": { "elements": [ ... ] },
  "$state": { "字段": 初始值 },
  "$actions": { "动作名": [ 操作, ... ] }
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `$v` | 否 | 协议版本，目前只有 `1` |
| `$state` | 是 | 全部状态字段及初始值。必须是纯 JSON 对象；字段名以字母或下划线开头，只含字母、数字、下划线 |
| `$actions` | 否 | 动作表：动作名到操作数组 |
| 其余字段 | — | 卡片 JSON 2.0 模板（`schema`、`config`、`header`、`body`……）。`schema` 省略时按 `"2.0"`。`config.update_multi` 由运行时归一为 `true`（卡片 JSON 2.0 只支持共享卡片） |

## 模板

模板就是普通的卡片 JSON，只多了两样东西：字符串插值和 `$` 指令。

### 插值

任何字符串值里都可以写 `{{ 表达式 }}`：

- 整个字符串只有一个 `{{ }}` 时，结果**保留原类型**：`"disabled": "{{ len(list) >= limit }}"` 得到布尔值。
- 否则按文字拼接：`null` 变成空串，数组和对象按 JSON 输出。
- 在 markdown 正文里（`tag` 为 `markdown` 或 `lark_md` 的对象的 `content`），插进去的值会自动转义，用户输入的 `**`、`<at>` 等不会生效。模板里直接写的字面量不转义。
- 确实要插入 markdown 时用 `{{{ 表达式 }}}`。提及用户请用 `{{ at(id) }}`、展示用户请用 `{{ person(id) }}`，它们生成的标签不会被转义。

### 指令

| 指令 | 写在哪 | 作用 |
| --- | --- | --- |
| `$if` | 任意对象 | 表达式为假时，这个对象不出现（从数组里去掉，或不写这个字段） |
| `$for` | 数组里的对象 | `"item in list"` 或 `"(item, index) in list"`，把对象按列表展开成多个。遍历对象时得到 `(值, 键)` |
| `$key` | 与 `$for` 同一个对象 | 每一项的唯一标识表达式，如 `"item.id"`，默认用下标。决定循环里 `element_id` 的后缀 |
| `$on` | 交互组件 | 点击时执行的动作：`"动作名"`，或 `{ "action": "动作名", "args": 参数 }` |

`$if` 和 `$key` 的值是表达式，可以不写 `{{ }}`。同一个对象上同时有 `$for` 和 `$if` 时，先展开再逐项判断。

`$on` 的 `args` 按模板规则在渲染时求值，再写进组件的回调 `value`。循环里的按钮要用 `args` 把当前项传给动作：

```json
{ "tag": "button", "$for": "t in todos", "$key": "t.id",
  "text": { "tag": "plain_text", "content": "删除 {{ t.title }}" },
  "$on": { "action": "remove", "args": { "id": "{{ t.id }}" } } }
```

循环里带 `element_id` 的元素会自动加上 key 的哈希后缀，保证唯一且不超过 20 个字符。整张卡的 `element_id` 必须唯一，重复时渲染报错。

**视图里不能使用 `$user` 等上下文变量**：卡片对所有人显示同一个视图，渲染时不存在"当前查看者"。要给点击者个人反馈，请在动作里用 `toast`。

## 表达式

语法是 JavaScript 表达式的子集：

- 字面量：数字、`'字符串'` / `"字符串"`、`true`、`false`、`null`、`[数组]`、`{ 对象: 值 }`
- 变量：状态字段、循环变量、`let` 变量、上下文变量（`$` 开头，只能在动作里用）
- 取值：`a.b`、`a[0]`、`a[key]`、`list[-1]`、`list.length`。路径上任何一层为空时结果是 `null`，不会报错
- 运算：`+ - * / %`、`== != < <= > >=`（`===` 与 `==` 相同，都按值比较）、`&& || ??`、`!`、`条件 ? 甲 : 乙`
- 箭头函数：`x => x.done`、`(a, b) => a.n - b.n`，只能作为内置函数的参数
- 函数调用：只能调用内置函数。`list.includes(x)`、`name.toUpperCase()`、`Math.max(a, b)` 这类 JS 写法会自动转成对应的内置函数

不支持赋值、循环、自定义函数。表达式长度上限 2000 字符；一次渲染或一次动作有计算量上限，超出时报错。

### 内置函数

| 类别 | 函数 |
| --- | --- |
| 集合 | `len` `includes` `indexOf` `join(list, 分隔符)` `slice` `concat` `reverse` `sort(list, 键函数或比较函数)` `unique` `first` `last` `range(n)` / `range(a, b)` |
| 高阶 | `filter` `map` `find` `findIndex` `some` `every` `count(list, 值或条件)` `sum(list, 取值函数?)` |
| 对象 | `keys` `values` `entries` `has(obj, key)` `merge(a, b, ...)` |
| 数字 | `min` `max` `abs` `round(x, 位数?)` `floor` `ceil` `num` |
| 文字 | `str` `upper` `lower` `trim` `split` `replace(s, 旧, 新)` `startsWith` `endsWith` `padStart` `json` |
| 时间 | `date(毫秒, 'YYYY-MM-DD HH:mm', 时区 = 'Asia/Shanghai')` |
| 人员 | `at(open_id)` 生成会通知对方的 `<at>`；`person(open_id)` 生成只展示的 `<person>` |

## 动作

动作是按顺序执行的操作数组。每个操作是一个对象，用唯一的关键字表示类型：

| 操作 | 写法 | 说明 |
| --- | --- | --- |
| `set` | `{ "set": "路径", "value": "表达式" }` | 赋值 |
| `push` | `{ "push": "路径", "value": "表达式", "unique": true }` | 追加到数组末尾；`unique` 为真时已存在就跳过 |
| `remove` | `{ "remove": "路径", "value": "表达式" }` | 删除数组里所有等于该值的项；也可用 `"where": "x => 条件"` 或 `"index": "下标"` |
| `inc` | `{ "inc": "路径", "by": "表达式" }` | 数字累加，`by` 默认 1，空值按 0 |
| `toggle` | `{ "toggle": "路径" }` | 布尔取反 |
| `let` | `{ "let": "名字", "value": "表达式" }` | 定义局部变量，后续操作可用 |
| `if` | `{ "if": "条件", "then": [...], "else": [...] }` | 分支 |
| `assert` | `{ "assert": "条件", "toast": "提示" }` | 条件不成立就中止动作、不改任何状态，并把提示告诉点击者 |
| `toast` | `{ "toast": "提示", "type": "info" }` | 给点击者的提示；`type` 为 `info` / `success` / `warning` / `error`。多条时只显示最后一条 |

- **路径**写状态字段及其下层：`count`、`form.title`、`votes[$args.option]`、`items[i].done`。根字段必须在 `$state` 里声明过；中间缺失的对象会自动创建；`push` 的目标为空时自动建空数组。
- `value`、`if`、`assert`、`by`、`where`、`index` 的值是**表达式**，不用写 `{{ }}`；`toast` 的值是**文字**，可以用 `{{ }}` 插值。
- 动作是**事务**：`assert` 不成立，或任何一步出错（如类型不对），整个动作回滚，状态不变。
- 状态里只能存纯 JSON，不能存函数。

### 上下文变量（只能在动作里用）

| 变量 | 内容 |
| --- | --- |
| `$user` | 点击者 `{ open_id, user_id, union_id }`，`user_id` 需要应用开通权限才有 |
| `$args` | 组件 `$on.args` 渲染出的参数 |
| `$form` | 表单容器提交的 `form_value`（字段名到值） |
| `$input` | 输入框回调的值 |
| `$option` / `$options` | 单选 / 多选组件选中的值 |
| `$checked` | 勾选器状态 |
| `$now` | 点击时间，毫秒时间戳 |

## 回调 value

渲染时，`$on` 被转换成组件的回调行为：

```json
"behaviors": [{ "type": "callback", "value": { "__a": "动作名", "__p": 参数, "__r": 渲染时的版本号 } }]
```

组件模板里原有的 `behaviors`（如 `open_url`）会保留，回调追加在最后。`value` 里没有 `__a` 的回调不属于本协议，运行时会忽略。

## 限制

- 卡片体积官方建议在 30KB 以内，包括渲染出的视图、封印的程序和封印的状态。参考：示例报名卡的程序封印后约 0.8KB；100 人报名时整张卡约 9KB。
- 一张卡最多 200 个元素或组件（每个带 `tag` 的节点算一个）。
- 卡片发出 14 天后无法再更新。

## 校验

`compileProgram` 会给出带 JSON Pointer 路径的诊断，生成方可以据此逐条修复。常见问题：

- 视图里用了 `$user` 等上下文变量
- 引用了未定义的变量或不存在的内置函数
- `$on` 指向不存在的动作
- 写入了 `$state` 里没有声明的字段
- 不认识的指令（如 `$else`）或操作（如 `append`）
- `$for` 写在了非数组元素上

完整示例见 [`examples/signup.card.json`](../packages/larkard/examples/program-signup.card.json)。
