#!/usr/bin/env bash
# 在 larkard@0.1.0 发布成功后运行。需要 npm 2FA。
# 用法：
#   NPM_OTP=123456 bash scripts/deprecate-old-packages.sh
# 或直接运行，按 npm 提示逐个输入验证码。
set -uo pipefail

OLD_PACKAGES=(
  adapter check cli compiler components language-server linter optimize
  parser patch renderer schema store validator
)
OLD_MESSAGE='Merged into larkard. Install larkard instead: https://www.npmjs.com/package/larkard'

OTP_ARGS=()
if [[ -n "${NPM_OTP:-}" ]]; then
  OTP_ARGS=(--otp="$NPM_OTP")
fi

failures=0
deprecate() {
  echo "==> npm deprecate $1"
  if ! npm deprecate "$1" "$2" "${OTP_ARGS[@]}"; then
    echo "    !! failed: $1"
    failures=$((failures + 1))
  fi
}

# 占位 / bootstrap 版本
deprecate 'larkard@0.0.0-stage' 'Placeholder version; use larkard@0.1.0 or later'
deprecate 'larkard@0.0.0' 'Bootstrap version; use larkard@0.1.0 or later'

# 旧的拆分包
for pkg in "${OLD_PACKAGES[@]}"; do
  deprecate "@open-feishu-card/$pkg" "$OLD_MESSAGE"
done

if [[ "$failures" -gt 0 ]]; then
  echo "完成，但有 $failures 个包失败（通常是 OTP 过期或权限不足）。重跑即可。"
  exit 1
fi
echo "完成：larkard 占位版本与 @open-feishu-card/* 已全部标记为 deprecated。"
