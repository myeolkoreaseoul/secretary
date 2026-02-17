#!/bin/bash
# Fire-and-forget shell command logger for Secretary.
# Called by PROMPT_COMMAND in .bashrc.
# Usage: log_command.sh "command text"

CMD="$1"
[ -z "$CMD" ] && exit 0

# Skip sensitive commands
case "$CMD" in
    *password*|*PASSWORD*|*secret*|*SECRET*|*token*|*TOKEN*|*apikey*|*API_KEY*|*SUPABASE*|*GEMINI*|*TELEGRAM*)
        exit 0 ;;
    export\ *KEY=*|export\ *TOKEN=*|export\ *SECRET=*|export\ *PASSWORD=*)
        exit 0 ;;
    curl*-H*[Aa]uth*|curl*[Bb]earer*)
        exit 0 ;;
esac

# Read credentials from .env each time (never cached in env)
ENV_FILE="/home/john/projects/secretary/bot/.env"
[ -f "$ENV_FILE" ] || exit 0
_URL=$(grep '^SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
_KEY=$(grep '^SUPABASE_SERVICE_KEY=' "$ENV_FILE" | cut -d= -f2-)

[ -z "$_URL" ] && exit 0
[ -z "$_KEY" ] && exit 0

# Truncate long commands
CMD="${CMD:0:500}"

# Pure bash JSON escaping
CMD="${CMD//\\/\\\\}"
CMD="${CMD//\"/\\\"}"
CMD="${CMD//$'\n'/\\n}"
CMD="${CMD//$'\t'/\\t}"
CMD="${CMD//$'\r'/\\r}"

# Write credentials to temp file for curl (avoid exposing in process args)
_TMPHEADERS=$(mktemp)
printf 'apikey: %s\nAuthorization: Bearer %s\nContent-Type: application/json\n' "$_KEY" "$_KEY" > "$_TMPHEADERS"

curl -sS -o /dev/null --max-time 5 -X POST \
  "${_URL}/rest/v1/activity_logs" \
  -H @"$_TMPHEADERS" \
  --data-raw "{\"window_title\": \"$ ${CMD}\", \"app_name\": \"shell\", \"category\": \"command\"}"

rm -f "$_TMPHEADERS"
