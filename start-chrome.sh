#!/usr/bin/env bash
# 此脚本仅在使用 --use-system-profile 时可能需要——
# 如果之前用 system Chrome 做过 CDP 调试，可退出残留 Chrome。
# 正常情况下直接运行爬虫即可，Playwright 有自己的 Chromium。

echo "退出所有 Chrome 实例（如需）..."
pkill -f "Google Chrome" 2>/dev/null || true
sleep 1
echo "完成。"
echo ""
echo "运行爬虫（cookie 模式）："
echo "  npm run scrape -- --tid 45974302 --use-system-profile --max-pages 2"
