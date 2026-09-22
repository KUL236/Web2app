#!/usr/bin/env bash
# Report build progress back to the web app.  Never fails the build.
# usage: notify.sh <status> [error_message]
# env  : CALLBACK_URL CALLBACK_SECRET BUILD_ID GITHUB_RUN_ID [DOWNLOAD_URL APK_SIZE]
set -u
[ -z "${CALLBACK_URL:-}" ] && { echo "callback: no CALLBACK_URL, skipping"; exit 0; }

status="$1"
message="${2:-}"

payload=$(jq -n \
  --arg build "${BUILD_ID:-}" --arg status "$status" --arg run "${GITHUB_RUN_ID:-}" \
  --arg msg "$message" --arg url "${DOWNLOAD_URL:-}" --arg size "${APK_SIZE:-0}" \
  '{build_id:$build, status:$status, github_run_id:$run}
   + (if $msg != "" then {error_message:$msg} else {} end)
   + (if $url != "" then {download_url:$url, apk_size:($size|tonumber? // 0)} else {} end)')

curl -sS --max-time 20 --retry 3 --retry-delay 2 -X POST "$CALLBACK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Callback-Secret: ${CALLBACK_SECRET:-}" \
  -d "$payload" -o /dev/null -w "callback($status) -> HTTP %{http_code}\n" \
  || echo "callback($status) failed (ignored)"
exit 0
