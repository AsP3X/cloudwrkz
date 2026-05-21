#!/usr/bin/env bash
# Human: Safe wrapper for stopping the LOCAL dev Compose stack without deleting Postgres data by default.
# Agent: READS CLOUDWRKZ_CONFIRM_DESTROY_DATA; DEFAULT docker compose down (no -v); REQUIRES explicit confirm for volume wipe.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
if [[ ! -f "$COMPOSE_FILE" ]]; then
  COMPOSE_FILE="docker-compose.dev.yml.example"
fi

if [[ "${1:-}" == "--destroy-volumes" ]]; then
  if [[ "${CLOUDWRKZ_CONFIRM_DESTROY_DATA:-}" != "yes" ]]; then
    echo "Refusing to destroy volumes." >&2
    echo "This permanently deletes local Postgres data in the dev stack." >&2
    echo "If you are certain, run:" >&2
    echo "  CLOUDWRKZ_CONFIRM_DESTROY_DATA=yes $0 --destroy-volumes" >&2
    exit 1
  fi
  echo "WARNING: destroying dev volumes (postgres_data)..." >&2
  docker compose -f "$COMPOSE_FILE" down -v
  exit 0
fi

docker compose -f "$COMPOSE_FILE" down "$@"
