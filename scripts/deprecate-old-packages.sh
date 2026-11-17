#!/usr/bin/env bash
# 在 larkard@0.1.0 发布成功后运行。需要 npm 2FA。
# 用法：NPM_OTP=123456 bash scripts/deprecate-old-packages.sh
set -euo pipefail

PACKAGES=(
  adapter check cli compiler components language-server linter optimize
  parser patch renderer schema store validator
)
MESSAGE='Merged into larkard. Install larkard instead: https://www.npmjs.com/package/larkard'

OTP_ARGS=()
if [[ -n "${NPM_OTP:-}" ]]; then
  OTP_ARGS=(--otp="$NPM_OTP")
fi

for pkg in "${PACKAGES[@]}"; do
  echo "==> deprecate @open-feishu-card/$pkg"
  npm deprecate "@open-feishu-card/$pkg" "$MESSAGE" "${OTP_ARGS[@]}"
done

echo "done. @open-feishu-card/* 已全部标记为 deprecated."
