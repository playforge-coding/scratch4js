#!/usr/bin/env bash
#
# Bump the project version across every place it is hard-coded:
#   - each package's package.json   ("version": "x")
#   - create-tw-extension bundlers.js  (PLUGIN_VERSIONS caret ranges '^x')
#   - scratch-mcp manifest.json     ("version": "x")
#   - scratch-mcp src/index.js      (server identity  version: 'x')
#
# Usage: scripts/bump-version.sh <new-version>
#   e.g. scripts/bump-version.sh 1.2.0
#
# Skips node_modules/, build/, and dist/ so generated artifacts are left alone.

set -euo pipefail

NEW="${1:-}"
if [[ -z "$NEW" ]]; then
  echo "usage: $0 <new-version>" >&2
  exit 1
fi
if ! [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+].+)?$ ]]; then
  echo "error: '$NEW' is not a valid semver version" >&2
  exit 1
fi

# Resolve repo root from this script's location so it works from anywhere.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

changed=()

# 1. Every package's own "version" field (the first one in each file).
while IFS= read -r -d '' pkg; do
  if grep -q '"version"' "$pkg"; then
    sed -i "0,/\"version\": \"[^\"]*\"/s//\"version\": \"$NEW\"/" "$pkg"
    changed+=("$pkg")
  fi
done < <(find packages -name package.json \
  -not -path '*/node_modules/*' -not -path '*/build/*' -not -path '*/dist/*' -print0)

# 2. bundlers.js — only the PLUGIN_VERSIONS caret ranges (lines like
#    `[PLUGIN_WEBPACK]: '^1.1.0',`). The webpack/rollup/vite dev-dep versions
#    are unrelated third-party versions and are left untouched.
BUNDLERS="packages/create-tw-extension/src/bundlers.js"
if [[ -f "$BUNDLERS" ]]; then
  sed -i -E "s/(\\[PLUGIN_[A-Z]+\\]: ')\\^[0-9][^']*'/\\1^$NEW'/g" "$BUNDLERS"
  changed+=("$BUNDLERS")
fi

# 3. manifest.json — source manifest only.
MANIFEST="packages/scratch-mcp/manifest.json"
if [[ -f "$MANIFEST" ]]; then
  sed -i "0,/\"version\": \"[^\"]*\"/s//\"version\": \"$NEW\"/" "$MANIFEST"
  changed+=("$MANIFEST")
fi

# 4. scratch-mcp server identity in src/index.js — version: 'x'.
INDEX="packages/scratch-mcp/src/index.js"
if [[ -f "$INDEX" ]]; then
  sed -i -E "s/version: '[0-9][^']*'/version: '$NEW'/" "$INDEX"
  changed+=("$INDEX")
fi

echo "Bumped version to $NEW in:"
printf '  %s\n' "${changed[@]}"
