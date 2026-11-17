---
"@open-feishu-card/renderer": patch
---

- `button` 的 `primary_filled` / `danger_filled` 悬停色用成了真机的 **pressed** 值（#0442d2 / #e22e28），悬停反而变深。改回真机 ud 变量 light 档：hover `#336df4` / `#ff7570`（变浅一档），并补 `:active` pressed `#0442d2` / `#e22e28`。
