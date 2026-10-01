#!/usr/bin/env bash

# Runs the local-only workerd service-binding proof. It never reads deployment
# credentials or contacts a hosted service.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for command in node pnpm; do
  command -v "$command" >/dev/null 2>&1 || { echo "Browser proxy workerd tests require $command." >&2; exit 1; }
done

cd "$repo_root"
pnpm --filter @dayli/api exec vitest run --config vitest.proxy-integration.config.ts
