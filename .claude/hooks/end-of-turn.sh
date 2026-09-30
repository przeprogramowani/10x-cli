#!/usr/bin/env bash
# Stop: sweep everything this turn changed before the agent finishes; one retry.
#   - oxlint errors + JSON syntax on every changed file (also catches files
#     rewritten via Bash, which never reach the per-edit hook)
#   - bun tests related to changed files (full top-level suite takes ~70 s,
#     so only tests/*.test.ts that import a changed module, or changed tests)
#   - skills/ validator when skills/ changed
#   - whole-project tsc --noEmit
# Exit 2 + stderr keeps the agent working with the report as the reason.
# Full scope stays with `bun run quality:affected` / `quality:gate` and CI.
export NO_COLOR=1 FORCE_COLOR=0

INPUT=$(cat)

# Already sent back once by this hook: let it finish. The commit gate catches the rest.
# (loop_count covers Cursor, which imports hooks from .claude/settings.json.)
ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
LOOPS=$(printf '%s' "$INPUT" | jq -r '.loop_count // 0' 2>/dev/null)
if [ "$ACTIVE" = "true" ] || [ "${LOOPS:-0}" != "0" ]; then
  exit 0
fi

# Session cwd may be a worktree while $CLAUDE_PROJECT_DIR is the main checkout.
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
ROOT=$(git -C "${CWD:-${CLAUDE_PROJECT_DIR:-.}}" rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$ROOT" || exit 0
[ -f .oxlintrc.json ] && [ -f node_modules/typescript/bin/tsc ] && command -v bun >/dev/null || exit 0

# Changed and new files. Nothing changed (a Q&A turn): nothing to check.
CHANGED=$({ git diff --name-only HEAD; git ls-files -o --exclude-standard; } 2>/dev/null | sort -u)
[ -n "$CHANGED" ] || exit 0

LINT=() JSONS=() TESTS=() SKILLS=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in
    *.ts|*.tsx|*.mts|*.cts|*.js|*.jsx|*.mjs|*.cjs) LINT+=("$f") ;;
    *.json) JSONS+=("$f") ;;
  esac
  case "$f" in
    skills/*|scripts/validate-cli-skills.mjs) SKILLS=1 ;;
  esac
  case "$f" in
    tests/*/*) ;;                              # helpers, fixtures, e2e, smoke: not unit scope
    tests/*.test.ts) TESTS+=("$f") ;;
    src/*.ts|src/*.tsx)
      MOD=${f%.*}                              # src/lib/writer.ts -> src/lib/writer
      while IFS= read -r t; do TESTS+=("$t"); done < <(
        grep --color=never -lE "src/${MOD#src/}(\\.[jt]sx?)?['\"]" tests/*.test.ts 2>/dev/null
      )
      ;;
  esac
done <<EOF
$CHANGED
EOF

REPORT=""
if [ "${#LINT[@]}" -gt 0 ]; then
  OUT=$(bun run --bun node_modules/oxlint/bin/oxlint --quiet -f unix "${LINT[@]}" 2>&1) || REPORT="$REPORT
oxlint errors in changed files:
$OUT
"
fi

for j in "${JSONS[@]}"; do
  OUT=$(node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$j" 2>&1) || REPORT="$REPORT
Invalid JSON in $j:
$(printf '%s\n' "$OUT" | grep --color=never -m 3 SyntaxError)
"
done

if [ "${#TESTS[@]}" -gt 0 ]; then
  mapfile -t TESTS < <(printf '%s\n' "${TESTS[@]}" | sort -u | sed 's|^|./|')
  OUT=$(timeout 90 bun test "${TESTS[@]}" 2>&1)
  RC=$?
  # 124 = our timeout, not a test failure: leave it to quality:affected / CI.
  if [ "$RC" -ne 0 ] && [ "$RC" -ne 124 ]; then
    # Keep the failures and the summary; bun prints passing tests too.
    OUT=$(printf '%s\n' "$OUT" | grep --color=never -E -B 30 '^\(fail\)|^ *[0-9]+ fail$|^error:|Ran [0-9]+ tests' | tail -n 120)
    REPORT="$REPORT
bun test (related to changed files: ${TESTS[*]}) fails:
$OUT
"
  fi
fi

if [ "$SKILLS" = 1 ]; then
  OUT=$(node scripts/validate-cli-skills.mjs 2>&1) || REPORT="$REPORT
Skill validation (bun run validate:cli-skills) fails:
$OUT
"
fi

OUT=$(node node_modules/typescript/bin/tsc --noEmit --pretty false 2>&1) || REPORT="$REPORT
Typecheck (tsc --noEmit) fails:
$OUT
"

if [ -n "$REPORT" ]; then
  echo "Fix these before you finish:$REPORT" >&2
  exit 2
fi
exit 0
