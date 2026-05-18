#!/bin/sh
set -e

# Human: Bootstrap local `.env` files from examples and replace GENERATE_ME placeholders with random secrets.
# Agent: CALLS generate_secret; LOOPS init_env_file for apps/api, apps/web-vite, apps/cli; EXITS 1 if example missing.

generate_secret() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
    elif command -v dd >/dev/null 2>&1; then
        dd if=/dev/urandom bs=1 count=32 2>/dev/null | od -An -tx1 | tr -d ' \n'
    else
        head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
    fi
}

init_env_file() {
    env_file="$1"
    example_file="$2"

    if [ ! -f "$example_file" ]; then
        echo "Error: $example_file not found"
        exit 1
    fi

    if [ ! -f "$env_file" ]; then
        echo "Creating $env_file from $example_file..."
        cp "$example_file" "$env_file"
    fi

    tmp_file="${env_file}.tmp"
    cp "$env_file" "$tmp_file"

    # Human: Replace one GENERATE_ME assignment per pass; skip comment lines that mention GENERATE_ME.
    # Agent: LOOPS while grep '=GENERATE_ME'; CALLS generate_secret; awk first non-# match then mv tmp.
    while grep -qE '=GENERATE_ME' "$tmp_file"; do
        secret="$(generate_secret)"
        awk -v rep="$secret" '
          !done && $0 !~ /^[[:space:]]*#/ && /GENERATE_ME/ {
            sub(/GENERATE_ME/, rep)
            done = 1
          }
          { print }
        ' "$tmp_file" > "${tmp_file}.new"
        mv "${tmp_file}.new" "$tmp_file"
    done

    mv "$tmp_file" "$env_file"
    echo "$env_file is ready."
}

init_env_file "apps/api/.env" "apps/api/.env.example"
init_env_file "apps/web-vite/.env" "apps/web-vite/.env.example"
init_env_file "apps/cli/.env" "apps/cli/.env.example"
