#!/usr/bin/env bash
set -euo pipefail

# The API's Config.url() hardcodes http://localhost:<port> for Environment.LOC, assuming
# frontend and API share one machine. In this multi-container harness that is false, so browser
# calls to localhost would miss the API. This script forwards local port 3000 to the real api
# service so those URLs work. Delete once the API base URL is configurable instead.

LISTEN_PORT="${E2E_LOOPBACK_PORT:-3000}"
API_URL="${E2E_API_URL:-http://api:3000}"

# Strip scheme; keep host:port (or host) only — drop any path suffix.
# Defaults: http → port 80, https → port 443 when no :port is present.
_scheme="http"
case "${API_URL}" in
  https://*) _scheme="https" ;;
esac
_rest="${API_URL#http://}"
_rest="${_rest#https://}"
_rest="${_rest%%/*}"
if [[ "${_rest}" == *:* ]]; then
  UPSTREAM_HOST="${_rest%%:*}"
  UPSTREAM_PORT="${_rest##*:}"
else
  UPSTREAM_HOST="${_rest}"
  if [[ "${_scheme}" == "https" ]]; then
    UPSTREAM_PORT="443"
  else
    UPSTREAM_PORT="80"
  fi
fi

socat "TCP-LISTEN:${LISTEN_PORT},fork,reuseaddr" "TCP:${UPSTREAM_HOST}:${UPSTREAM_PORT}" &

# Wait until the forwarder is actually accepting connections (fail loud if not).
_max_attempts=20
_attempt=0
while (( _attempt < _max_attempts )); do
  if (echo >/dev/tcp/127.0.0.1/"${LISTEN_PORT}") 2>/dev/null; then
    break
  fi
  _attempt=$((_attempt + 1))
  sleep 0.25
done
if (( _attempt >= _max_attempts )); then
  echo "forwarder failed to start listening on 127.0.0.1:${LISTEN_PORT}" >&2
  exit 1
fi

exec npx playwright test "$@"
