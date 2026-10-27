#!/bin/zsh
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
PROJECT_ROOT="/Users/Shared/Projects/habi"
set -a
source "$PROJECT_ROOT/worker/.env.production.local"
set +a
cd "$PROJECT_ROOT/worker"
exec /opt/homebrew/bin/uv run --frozen python -m habi_worker.cli run-service
