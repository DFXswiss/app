#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

log_info "Tearing down e2e-stack (project: $E2E_PROJECT)..."
compose down -v --remove-orphans
log_info "E2E stack is down."
