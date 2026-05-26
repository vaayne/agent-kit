#!/usr/bin/env bash
# Sync references/design-systems/ and references/design-templates/ from open-design.
#
# Usage:
#   ./scripts/sync.sh
#
# What it does:
#   1. Shallow-clones open-design (sparse: design-systems + design-templates only)
#   2. Copies both directories into the skill root
#   3. Regenerates references/design-systems.md and references/design-templates.md
#   4. Cleans up the clone

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REFS_DIR="$SKILL_DIR/references"
REPO_URL="https://github.com/nexu-io/open-design.git"

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

# ── clone ─────────────────────────────────────────────────────────────

echo "Cloning open-design (shallow + sparse)…"
git clone --depth 1 --sparse "$REPO_URL" "$TMP_DIR/od" 2>&1 | tail -1
git -C "$TMP_DIR/od" sparse-checkout set design-systems design-templates 2>/dev/null

OD_ROOT="$TMP_DIR/od"
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

# ── generate catalogs ─────────────────────────────────────────────────

extract_ds_meta() {
  local design_md="$1"
  [[ -f "$design_md" ]] || return
  # Extract category and one-liner from the > Category: and > description lines
  awk '
    /^> Category:/ { sub(/^> Category:[ \t]*/, ""); cat=$0 }
    /^>/ && !/^> Category:/ && cat != "" && desc == "" {
      sub(/^>[ \t]*/, "")
      if (length($0) > 0) desc=$0
    }
    END { if (cat != "") printf "%s\t%s\n", cat, desc }
  ' "$design_md"
}

generate_design_systems() {
  local slugs=()
  while IFS= read -r d; do
    slugs+=("$(basename "$d")")
  done < <(find "$REFS_DIR/design-systems" -mindepth 1 -maxdepth 1 -type d | sort)

  cat <<'HEADER'
# Design Systems Catalog

Pick a design system when the user names a brand, or choose one that matches the visual tone.

Each folder ships:
- `DESIGN.md` — brand spec (palette, typography, component rules, atmosphere)
- `tokens.css` — CSS custom properties; paste `:root { … }` verbatim into the first `<style>`
- `components.html` — worked component fixture for shape and class reference

## How to use

1. Find the right slug from the table below
2. Read `references/design-systems/<slug>/DESIGN.md` for brand context
3. Read `references/design-systems/<slug>/tokens.css` and paste its `:root` block
4. Reference `references/design-systems/<slug>/components.html` for component shapes

## All design systems

| Slug | Category | Description |
|---|---|---|
HEADER

  for slug in "${slugs[@]}"; do
    local meta category desc
    meta="$(extract_ds_meta "$REFS_DIR/design-systems/$slug/DESIGN.md")"
    category="$(echo "$meta" | cut -f1)"
    desc="$(echo "$meta" | cut -f2)"
    if [[ ${#desc} -gt 80 ]]; then
      desc="${desc:0:77}…"
    fi
    echo "| \`$slug\` | $category | $desc |"
  done
}

extract_description() {
  local skill_md="$1"
  [[ -f "$skill_md" ]] || return
  awk '
    /^---$/ { fm++; next }
    fm >= 2 { exit }
    fm == 1 && /^description:/ {
      sub(/^description:[ \t]*/, "")
      if ($0 == "|" || $0 == "|-" || $0 == ">") { getline; sub(/^[ \t]+/, ""); print; exit }
      if (length($0) > 0) { print; exit }
      getline; sub(/^[ \t]+/, ""); print; exit
    }
  ' "$skill_md"
}

extract_triggers() {
  local skill_md="$1"
  [[ -f "$skill_md" ]] || return
  awk '
    /^---$/ { fm++; next }
    fm >= 2 { exit }
    fm == 1 && /^triggers:/ { intrig=1; next }
    intrig && /^  - / { sub(/^  - "?/, ""); sub(/"$/, ""); printf "%s, ", $0; next }
    intrig && /^[^ ]/ { exit }
  ' "$skill_md" | sed 's/, $//'
}

generate_design_templates() {
  local slugs=()
  while IFS= read -r d; do
    slug="$(basename "$d")"
    [[ "$slug" == ".DS_Store" ]] && continue
    slugs+=("$slug")
  done < <(find "$REFS_DIR/design-templates" -mindepth 1 -maxdepth 1 -type d | sort)

  cat <<'HEADER'
# Design Templates Catalog

Pick a template when the user's brief matches a known format. Each template has a pre-built seed HTML and workflow — using one produces far better results than writing from scratch.

Each template contains:
- `SKILL.md` — workflow and instructions
- `assets/template.html` — seed file to copy (when present)
- `references/` — layouts, checklists (when present)

## How to use

1. Find the right slug from the table below (match the user's brief to the description / triggers)
2. Read `references/design-templates/<slug>/SKILL.md` for the workflow
3. Read `references/design-templates/<slug>/assets/template.html` for the seed
4. Copy seed verbatim, bind design-system tokens, fill content

## All templates

| Slug | Description | Use when the user says… |
|---|---|---|
HEADER

  for slug in "${slugs[@]}"; do
    local desc triggers
    desc="$(extract_description "$REFS_DIR/design-templates/$slug/SKILL.md")"
    triggers="$(extract_triggers "$REFS_DIR/design-templates/$slug/SKILL.md")"
    if [[ ${#desc} -gt 80 ]]; then
      desc="${desc:0:77}…"
    fi
    if [[ ${#triggers} -gt 60 ]]; then
      triggers="${triggers:0:57}…"
    fi
    echo "| \`$slug\` | $desc | $triggers |"
  done
}

mkdir -p "$REFS_DIR"

echo "Generating catalogs…"
generate_design_systems > "$REFS_DIR/design-systems.md"
generate_design_templates > "$REFS_DIR/design-templates.md"

# ── summary ───────────────────────────────────────────────────────────

ds_count=$(find "$REFS_DIR/design-systems" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
dt_count=$(find "$REFS_DIR/design-templates" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')

echo ""
echo "Done."
echo "  design-systems:  $ds_count  → references/design-systems/"
echo "  design-templates: $dt_count → references/design-templates/"
echo "  catalogs:              → references/design-systems.md, references/design-templates.md"
