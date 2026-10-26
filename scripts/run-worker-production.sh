#!/bin/zsh
set -eu
PROJECT_ROOT="/Users/Shared/Projects/habi"
set -a
source "$PROJECT_ROOT/worker/.env.production.local"
set +a
cd "$PROJECT_ROOT/worker"
exec uv run --frozen python -m habi_worker.cli run-service
