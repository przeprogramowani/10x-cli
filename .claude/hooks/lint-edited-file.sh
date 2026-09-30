#!/usr/bin/env bash
# PostToolUse (Write|Edit): check only the file the agent just edited.
#   JS/TS  -> oxlint errors (.oxlintrc.json; warnings stay warnings, as in CI)
#   JSON   -> JSON.parse (same as the quality:fast config-changed check)
# Exit 2 + stderr is the only combination Claude sees. Anything unexpected exits 0.
export NO_COLOR=1 FORCE_COLOR=0

FILE=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)
[ -n "$FILE" ] && [ -f "$FILE" ] || exit 0

case "$FILE" in
  *.ts|*.tsx|*.mts|*.cts|*.js|*.jsx|*.mjs|*.cjs|*.json) ;;
  *) exit 0 ;;
esac

# Run in the repo that owns the file (a worktree, not necessarily $CLAUDE_PROJECT_DIR).
ROOT=$(git -C "$(dirname "$FILE")" rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -f "$ROOT/.oxlintrc.json" ] || exit 0
cd "$ROOT" || exit 0
REL=${FILE#"$ROOT"/}

case "$REL" in
  *.json)
    if ! OUTPUT=$(node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$REL" 2>&1); then
      echo "Invalid JSON in $REL:" >&2
      printf '%s\n' "$OUTPUT" | grep --color=never -m 3 -E 'SyntaxError' >&2
      exit 2
    fi
    ;;
  *)
    # Deps not installed: nothing to run (not the agent's error to fix).
    [ -f node_modules/oxlint/bin/oxlint ] && command -v bun >/dev/null || exit 0
    # Relative path so ignorePatterns (dist, src/generated) still apply.
    if ! OUTPUT=$(bun run --bun node_modules/oxlint/bin/oxlint --quiet -f unix "$REL" 2>&1); then
      echo "oxlint reported errors in $REL:" >&2
      printf '%s\n' "$OUTPUT" >&2
      exit 2
    fi
    ;;
esac
exit 0
