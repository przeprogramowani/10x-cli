#!/usr/bin/env bash
# PostToolUse (Write|Edit): check only the file the agent just edited.
#   JS/TS  -> oxlint errors and warnings (--deny-warnings, as `bun run lint` in CI)
#   JSON   -> JSON.parse (same as the quality:fast config-changed check)
# Exit 2 + stderr is the only combination Claude sees. Exit 1 + stderr is a
# non-blocking hook error shown to the user: used when the hook cannot check.
# Files outside a checkout of this repo are not ours: exit 0.
# Records the file's checkout for this session so the Stop hook also sweeps
# edits made in a sibling worktree.
export NO_COLOR=1 FORCE_COLOR=0
command -v jq >/dev/null || { echo "lint-edited-file hook: jq is not installed, edit not checked" >&2; exit 1; }
INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)
[ -n "$FILE" ] && [ -f "$FILE" ] || exit 0
case "$FILE" in
  *.ts|*.tsx|*.mts|*.cts|*.js|*.jsx|*.mjs|*.cjs|*.json) ;;
  *) exit 0 ;;
esac
ROOT=$(git -C "$(dirname "$FILE")" rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -f "$ROOT/.oxlintrc.json" ] || exit 0
cd "$ROOT" || exit 0

SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null | tr -cd 'A-Za-z0-9_-')
if [ -n "$SID" ]; then
  REGISTRY="${TMPDIR:-/tmp}/claude-hooks/$SID.roots"
  mkdir -p "${REGISTRY%/*}" 2>/dev/null &&
    { grep -qxF "$ROOT" "$REGISTRY" 2>/dev/null || printf '%s\n' "$ROOT" >> "$REGISTRY"; }
fi

REL=${FILE#"$ROOT"/}
case "$REL" in
  *.json)
    if ! OUTPUT=$(node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$REL" 2>&1); then
      echo "Invalid JSON in $REL:" >&2
      printf '%s\n' "$OUTPUT" | grep --color=never -m 3 -E 'SyntaxError' >&2
      exit 2
    fi ;;
  *)
    if ! { [ -f node_modules/oxlint/bin/oxlint ] && command -v bun >/dev/null; }; then
      echo "lint-edited-file hook: oxlint or bun missing in $ROOT (run \`bun install\`), $REL not checked" >&2
      exit 1
    fi
    # Relative path so ignorePatterns (dist, src/generated) still apply.
    if ! OUTPUT=$(bun run --bun node_modules/oxlint/bin/oxlint --deny-warnings -f unix "$REL" 2>&1); then
      echo "oxlint reported problems in $REL:" >&2
      printf '%s\n' "$OUTPUT" >&2
      exit 2
    fi ;;
esac
exit 0
