#!/usr/bin/env bash
# Sync references/design-systems/ and references/design-templates/ from open-design.
#
# Usage:
#   ./scripts/sync.sh
#
# What it does:
#   1. Shallow-clones open-design (sparse: design-systems + design-templates only)
#   2. Copies both directories into the skill root
#   3. Cleans up the clone
#
# There is no stored catalog — run ./scripts/catalog.sh {systems|templates} to list
# what's available, gathered live from the files.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REFS_DIR="$SKILL_DIR/references"
REPO_URL="https://github.com/nexu-io/open-design.git"

CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/open-design"
SYNC_STAMP="$CACHE_DIR/.agent-kit-synced-head"

# ── clone or update ──────────────────────────────────────────────────

if [[ -d "$CACHE_DIR/.git" ]]; then
  echo "Updating cached open-design…"
  git -C "$CACHE_DIR" fetch --depth 1 origin main 2>&1 | tail -1
else
  echo "Cloning open-design (shallow + sparse)…"
  rm -rf "$CACHE_DIR"
  git clone --depth 1 --sparse "$REPO_URL" "$CACHE_DIR" 2>&1 | tail -1
  git -C "$CACHE_DIR" sparse-checkout set design-systems design-templates 2>/dev/null
fi

remote_head=$(git -C "$CACHE_DIR" rev-parse origin/main)
if [[ -f "$SYNC_STAMP" ]] \
  && [[ $(cat "$SYNC_STAMP") == "$remote_head" ]] \
  && [[ -d "$REFS_DIR/design-systems" ]] \
  && [[ -d "$REFS_DIR/design-templates" ]]; then
  echo "Generated design references already up to date."
  exit 0
fi

git -C "$CACHE_DIR" reset --hard origin/main >/dev/null

OD_ROOT="$CACHE_DIR"
DS_SRC="$OD_ROOT/design-systems"
DT_SRC="$OD_ROOT/design-templates"

# ── copy directories ──────────────────────────────────────────────────

echo "Copying references/design-systems/…"
rm -rf "$REFS_DIR/design-systems"
cp -r "$DS_SRC" "$REFS_DIR/design-systems"
# Remove non-content files
rm -f "$REFS_DIR/design-systems/README.md"
rm -rf "$REFS_DIR/design-systems/_schema"

echo "Copying references/design-templates/…"
rm -rf "$REFS_DIR/design-templates"
cp -r "$DT_SRC" "$REFS_DIR/design-templates"
rm -f "$REFS_DIR/design-templates/AGENTS.md"
rm -f "$REFS_DIR/design-templates/.DS_Store"
printf '%s\n' "$remote_head" > "$SYNC_STAMP"

# ── summary ───────────────────────────────────────────────────────────

ds_count=$(find "$REFS_DIR/design-systems" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
dt_count=$(find "$REFS_DIR/design-templates" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')

echo ""
echo "Done."
echo "  design-systems:   $ds_count  → references/design-systems/"
echo "  design-templates: $dt_count → references/design-templates/"
echo "  list them with:   ./scripts/catalog.sh {systems|templates}"
