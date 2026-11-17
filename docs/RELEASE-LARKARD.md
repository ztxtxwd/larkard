# larkard 首次发布

这份文档记录从 `open-feishu-card-monorepo` 切换到 `larkard` 的一次性操作。之后的常规发版见 [`NOTES.md`](NOTES.md)。

## 0. 前置条件

- `gh auth status` 已登录，且对 `ztxtxwd` 有仓库管理权限。
- `npm whoami` 为 `ztxtxwd`（或实际包 owner），能完成 2FA。
- 当前分支为 `main`，工作区改动已 review / commit。

## 1. GitHub 仓库改名并转 Public

```bash
# 改名；GitHub 会保留 214 个 commit、Actions 历史与 secrets，并重定向旧 URL
gh repo rename larkard -R ztxtxwd/open-feishu-card-monorepo --yes

# 本地 remote 指到新 URL
git remote set-url origin https://github.com/ztxtxwd/larkard.git

# 转 Public（会提示确认）
gh repo edit ztxtxwd/larkard \
  --visibility public \
  --accept-visibility-change-consequences

gh repo view ztxtxwd/larkard --json nameWithOwner,visibility,url
```

转 Public 前已做过历史扫描：214 个 commit 中没有发现 `ghp_` / `github_pat_` / `AKIA` / `xox*` / 私钥 / `app_secret` 等模式；`sk-` 命中全部是图标名（`sk-automation_outlined` 之类）。如果之后又提交过本地凭据，重新扫一遍再公开。

## 2. 配置 npm Trusted Publisher

新包名是 `larkard`，需要把 OIDC 信任关系指到新仓库：

```bash
# 先 dry-run 核对仓库 / workflow 名
npm trust github larkard \
  --file publish.yml \
  --repo ztxtxwd/larkard \
  --dry-run

# 真正写入（需要 npm 2FA）
npm trust github larkard \
  --file publish.yml \
  --repo ztxtxwd/larkard
```

工作流文件名必须保持 `publish.yml`：npm Trusted Publisher 绑定的是这个文件名。

## 3. 推 main，走 CI 首发

```bash
git add -A
git commit -m "feat: rebrand and consolidate into larkard"
git push origin main
```

`publish.yml` 会：

1. `changeset version`：`larkard` 0.0.0 → 0.1.0，生成 CHANGELOG；
2. 提交并推送 `chore: version packages`；
3. build / test；
4. `changeset publish`（OIDC）；
5. 打 `larkard@0.1.0` tag 并推送。

验证：

```bash
npm view larkard version repository.url
npm view larkard dist-tags
```

### 如果首次发布因 Trusted Publisher 失败

npm 对从未发布过的包可能需要先有一次手动发布。fallback：

```bash
pnpm --filter larkard build
cd packages/larkard
npm publish --access public   # 需要 2FA
```

发布成功后再执行第 2 步配置 Trusted Publisher；后续版本全部走 CI。不要重复手动 bump 已经由 CI 发布的版本。

## 4. Deprecate 旧包

`larkard` 发布成功后，给 14 个旧包加迁移提示（旧版本仍可安装）：

```bash
for p in adapter check cli compiler components language-server linter optimize parser patch renderer schema store validator; do
  npm deprecate "@open-feishu-card/$p" \
    "Merged into larkard. Install larkard instead: https://www.npmjs.com/package/larkard"
done
```

需要 2FA；如果 CLI 提示 OTP，可在每条命令上加 `--otp=<code>`，或交互完成。
不要 `npm unpublish` 旧包：会破坏已有依赖，deprecate 已经足够。

## 5. VS Code 扩展（可选，独立发版）

扩展已把显示名改为 **Larkard**、版本升到 `0.3.0`，扩展 ID 仍是 `TianxiongZhao.lark-card-preview`。确认 `apps/vscode/dist` 构建正常后：

```bash
git tag vscode-v0.3.0
git push origin vscode-v0.3.0
```

`publish-vscode.yml` 会发 Marketplace + Open VSX + GitHub Release。secrets `VSCE_PAT` / `OVSX_PAT` 随仓库改名保留，不需要重建。

## 6. 之后的常规发版

回到 [`NOTES.md`](NOTES.md)：带 changeset 推 `main` 即可，`publish.yml` 会在同一轮完成 version + publish。
