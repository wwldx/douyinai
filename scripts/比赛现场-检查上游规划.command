#!/bin/zsh

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"

cd "$PROJECT_ROOT" || exit 1
clear
echo "正在检查本地服务与上游规划 API……"
echo ""

node scripts/check-upstream-planning.mjs
STATUS=$?

echo ""
if [[ $STATUS -eq 0 ]]; then
  echo "检查完成：上游规划链路正常。"
else
  echo "检查完成：发现异常，请保留上面的错误码和 Request ID。"
fi
echo ""
read -r "?按回车键关闭窗口……"
exit $STATUS
