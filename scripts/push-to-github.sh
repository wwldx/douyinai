#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BRANCH="$(git branch --show-current)"
if [[ -z "$BRANCH" ]]; then
  echo "未在普通分支上，无法自动推送。"
  exit 1
fi

REMOTE="${GIT_REMOTE:-origin}"
MESSAGE="${1:-Update hackathon demo $(date '+%Y-%m-%d %H:%M')}"

echo "工作目录: $ROOT_DIR"
echo "当前分支: $BRANCH"
echo "目标远端: $REMOTE"

if [[ -f package.json ]]; then
  echo "运行检查..."
  npm run check
fi

echo "暂存改动..."
git add -A

if git diff --cached --quiet; then
  echo "没有新的提交内容，直接推送当前分支。"
else
  echo "创建提交: $MESSAGE"
  git commit -m "$MESSAGE"
fi

echo "推送到 $REMOTE/$BRANCH ..."
git push -u "$REMOTE" "$BRANCH"

echo "完成。"
