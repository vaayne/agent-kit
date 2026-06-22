#!/usr/bin/env bash
# Print the design-systems or design-templates catalog on demand, gathered live from
# the vendored files (no stored catalog to drift). Run before choosing a system/template.
#
# Usage:
#   ./scripts/catalog.sh systems     # 150+ design systems: slug | category | description
#   ./scripts/catalog.sh templates   # 110+ templates:      slug | description | triggers

set -euo pipefail

REFS_DIR="$(cd "$(dirname "$0")/.." && pwd)/references"

extract_ds_meta() {
  awk '
    /^> Category:/ { sub(/^> Category:[ \t]*/, ""); cat=$0 }
    /^>/ && !/^> Category:/ && cat != "" && desc == "" {
      sub(/^>[ \t]*/, ""); if (length($0) > 0) desc=$0
    }
    END { if (cat != "") printf "%s\t%s\n", cat, desc }
  ' "$1"
}

extract_description() {
  awk '
    /^---$/ { fm++; next }
    fm >= 2 { exit }
    fm == 1 && /^description:/ {
      sub(/^description:[ \t]*/, "")
      if ($0 == "|" || $0 == "|-" || $0 == ">") { getline; sub(/^[ \t]+/, ""); print; exit }
      if (length($0) > 0) { print; exit }
      getline; sub(/^[ \t]+/, ""); print; exit
    }
  ' "$1"
}

extract_triggers() {
  awk '
    /^---$/ { fm++; next }
    fm >= 2 { exit }
    fm == 1 && /^triggers:/ { intrig=1; next }
    intrig && /^  - / { sub(/^  - "?/, ""); sub(/"$/, ""); printf "%s, ", $0; next }
    intrig && /^[^ ]/ { exit }
  ' "$1" | sed 's/, $//'
}

case "${1:-}" in
systems)
  echo "slug | category | description"
  for d in "$REFS_DIR"/design-systems/*/; do
    slug="$(basename "$d")"
    IFS=$'\t' read -r category desc < <(extract_ds_meta "$d/DESIGN.md")
    echo "$slug | ${category:-?} | ${desc:-}"
  done | sort
  ;;
templates)
  echo "slug | description | triggers"
  for d in "$REFS_DIR"/design-templates/*/; do
    slug="$(basename "$d")"
    [[ -f "$d/SKILL.md" ]] || continue
    desc="$(extract_description "$d/SKILL.md")"
    triggers="$(extract_triggers "$d/SKILL.md")"
    echo "$slug | ${desc:-} | ${triggers:-}"
  done | sort
  ;;
*)
  echo "usage: $0 {systems|templates}" >&2
  exit 2
  ;;
esac
