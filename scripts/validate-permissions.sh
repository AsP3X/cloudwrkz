#!/usr/bin/env bash
# Human: CI guard that permission keys in the shared catalog stay aligned with SQL migration seeds.
# Agent: READS shared/permissions/catalog.json + apps/api/migrations/*.sql in filename order; EXITS 1 on mismatch.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CATALOG="$ROOT/shared/permissions/catalog.json"
MIGRATIONS_DIR="$ROOT/apps/api/migrations"

if [[ ! -f "$CATALOG" ]]; then
  echo "Missing catalog: $CATALOG" >&2
  exit 1
fi

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "Missing migrations dir: $MIGRATIONS_DIR" >&2
  exit 1
fi

python3 - <<PY
import json
import re
import sys
from pathlib import Path

root = Path("$ROOT")
catalog_path = root / "shared" / "permissions" / "catalog.json"
migrations_dir = root / "apps" / "api" / "migrations"

catalog = json.loads(catalog_path.read_text())
catalog_keys = set(catalog["keys"])

found: set[str] = set()
insert_re = re.compile(
    r"INSERT INTO permissions\b.*?(?:ON CONFLICT|;)",
    flags=re.DOTALL,
)
key_re = re.compile(
    r"\(gen_random_uuid\(\)::text,\s+'([a-z][a-z0-9_.]*)',\s+'[^']+',",
)
delete_re = re.compile(
    r"DELETE FROM permissions\b[^;]*;",
    flags=re.DOTALL,
)

for migration_path in sorted(migrations_dir.glob("*.sql")):
    migration_text = migration_path.read_text()
    for match in re.finditer(
        r"(INSERT INTO permissions\b.*?(?:ON CONFLICT.*?;|;\s*\n)|DELETE FROM permissions\b[^;]*;)",
        migration_text,
        flags=re.DOTALL,
    ):
        stmt = match.group(0)
        if stmt.startswith("INSERT"):
            found |= set(key_re.findall(stmt))
            continue
        for prefix in re.findall(r"key LIKE '([a-z][a-z0-9_.]*)\.%'", stmt):
            found = {k for k in found if not k.startswith(f"{prefix}.")}
        if re.search(r"module = '([a-z][a-z0-9_.]*)'", stmt):
            module = re.search(r"module = '([a-z][a-z0-9_.]*)'", stmt).group(1)
            found = {
                k
                for k in found
                if not k.startswith(f"{module}.") and k != f"modules.{module}.view"
            }
        for exact in re.findall(r"key = '([a-z][a-z0-9_.]*)'", stmt):
            found.discard(exact)

missing_in_catalog = sorted(found - catalog_keys)
missing_in_migration = sorted(catalog_keys - found)

if missing_in_catalog:
    print("Keys in migration but not catalog.json:", ", ".join(missing_in_catalog))
if missing_in_migration:
    print("Keys in catalog.json but not migration:", ", ".join(missing_in_migration))

if missing_in_catalog or missing_in_migration:
    sys.exit(1)

print(f"Permission catalog OK ({len(catalog_keys)} keys)")
PY
