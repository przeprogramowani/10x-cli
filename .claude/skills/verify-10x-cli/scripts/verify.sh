#!/usr/bin/env bash
# VERIFICATION SCAFFOLDING — drive the real `10x` CLI against a local fake API.
# Usage: verify.sh <command> [args]   (see ../SKILL.md for the full recipe)
#
#   up                      start a run: isolated config + project dir, fake API on a free port
#   doctor                  read-only: is this run worth driving? (exit 0 = yes)
#   seed-auth               write a valid fake auth.json (skip the login flow)
#   cli <label> -- <args>   run `10x <args>` in the run's project dir (non-TTY => JSON mode);
#                           stdout/stderr/exit saved as evidence
#   tty <label> -- <args>   start `10x <args>` in a private tmux PTY (human mode, prompts)
#   keys <keys...>          send tmux keys to the PTY (e.g. Down Enter, or literal text)
#   screen <label>          capture the PTY screen as evidence
#   wait-screen <regex> [s] wait until the PTY screen matches (default 20 s)
#   click                   "click" the newest pending magic link (fake mailbox)
#   bump <lessonId>         publish a new upstream version of a fixture lesson
#   changelog <action>      fake toolkit changelog: release (newer entry) | off (route 404s) | on
#   snapshot <label>        save file tree + sha256 of project and config dirs
#   note <text>             append a line to the run's notes.md
#   down                    stop what this run started, delete scratch, keep evidence
#
# Run selection: $VERIFY_RUN, else the run `up` last started in this checkout.
# Entry point: VERIFY_ENTRY=src (default, bun run src/index.ts) or dist (node dist/index.mjs,
# run `bun run build` first).
set -uo pipefail

ROOT=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
HERE="$ROOT/.claude/skills/verify-10x-cli/scripts"
BASE="$ROOT/.quality-local/verify-10x-cli"
CMD=${1:-help}; shift || true

die() { echo "verify: $*" >&2; exit 1; }

load_run() {
  RUN=${VERIFY_RUN:-$(cat "$BASE/current" 2>/dev/null || true)}
  [ -n "$RUN" ] || die "no run; start one with: verify.sh up"
  EVID="$BASE/$RUN"
  [ -f "$EVID/run.env" ] || die "run $RUN has no run.env (already down?)"
  # shellcheck disable=SC1091
  . "$EVID/run.env"
}

ours() { # pid is alive AND is the fake API this run started
  [ -n "${API_PID:-}" ] && ps -p "$API_PID" -o args= 2>/dev/null | grep -F -q "fake-api.ts $SCRATCH"
}

cli_env() {
  env API_BASE_URL="$API_URL" BUNDLE_PUBLIC_KEYSET="$KEYSET" \
    XDG_CONFIG_HOME="$SCRATCH/config" APPDATA="$SCRATCH/config" \
    NO_COLOR=1 FORCE_COLOR=0 "$@"
}

entry() {
  if [ "${VERIFY_ENTRY:-src}" = dist ]; then
    [ -f "$ROOT/dist/index.mjs" ] || die "dist/index.mjs missing; run: bun run build"
    echo "node $ROOT/dist/index.mjs"
  else
    echo "bun run $ROOT/src/index.ts"
  fi
}

next_seq() { # max existing NN- prefix + 1
  local n; n=$(ls "$EVID" | grep -E '^[0-9]{2}-' | cut -c1-2 | sort -n | tail -1)
  printf '%02d' $((10#${n:-0} + 1))
}

case "$CMD" in
  up)
    RUN=${VERIFY_RUN:-$(date +%Y%m%d-%H%M%S)-$$}
    EVID="$BASE/$RUN"
    SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/10x-verify-$RUN.XXXX")
    mkdir -p "$EVID" "$SCRATCH/config" "$SCRATCH/project"
    git -C "$SCRATCH/project" init -q   # a user project is usually a git repo
    nohup bun "$HERE/fake-api.ts" "$SCRATCH" "${VERIFY_PORT:-0}" >"$EVID/fake-api.log" 2>&1 &
    API_PID=$!
    for _ in $(seq 1 100); do [ -f "$SCRATCH/api.json" ] && break; sleep 0.1; done
    [ -f "$SCRATCH/api.json" ] || { kill "$API_PID" 2>/dev/null; cat "$EVID/fake-api.log" >&2; die "fake API did not start"; }
    API_URL=$(jq -r .url "$SCRATCH/api.json")
    KEYSET=$(jq -c .keyset "$SCRATCH/api.json")
    {
      printf 'RUN=%q\nSCRATCH=%q\nEVID=%q\nAPI_PID=%q\nAPI_URL=%q\nKEYSET=%q\n' \
        "$RUN" "$SCRATCH" "$EVID" "$API_PID" "$API_URL" "$KEYSET"
      printf 'TMUX_SOCK=%q\nREV=%q\n' "10x-verify-$RUN" "$(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet HEAD || echo -dirty)"
    } >"$EVID/run.env"
    echo "$RUN" >"$BASE/current"
    printf '# verify-10x-cli run %s\n\n- rev: %s\n- api: %s (pid %s)\n- project: %s/project\n\n' \
      "$RUN" "$(. "$EVID/run.env"; echo "$REV")" "$API_URL" "$API_PID" "$SCRATCH" >"$EVID/notes.md"
    echo "run=$RUN api=$API_URL pid=$API_PID project=$SCRATCH/project evidence=$EVID"
    ;;

  doctor)
    load_run
    ok=1
    check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; ok=0; fi; }
    check "fake API pid $API_PID is alive and was started by this run" ours
    check "API $API_URL answers /health" "curl -fsS --max-time 3 '$API_URL/health' | grep -q ok"
    check "API URL is loopback (CLI allowlist + keyset override)" "[[ '$API_URL' == http://127.0.0.1:* ]]"
    check "config dir is private to this run" "[ -d '$SCRATCH/config' ] && [[ '$SCRATCH' == */10x-verify-$RUN.* ]]"
    check "project dir exists" "[ -d '$SCRATCH/project' ]"
    check "checkout revision unchanged since up ($REV)" \
      "[ \"\$(git -C '$ROOT' rev-parse --short HEAD)\$(git -C '$ROOT' diff --quiet HEAD || echo -dirty)\" = '$REV' ]"
    ver=$(cd "$SCRATCH/project" && cli_env $(entry) --version 2>&1)
    check "CLI starts ($(entry | cut -d' ' -f1-2 | sed "s|$ROOT/||") => $ver)" "[ -n '$ver' ]"
    if [ -f "$SCRATCH/config/10x-cli/auth.json" ]; then echo "info auth.json present (logged in)"; else echo "info not logged in"; fi
    [ "$ok" = 1 ]
    ;;

  seed-auth)
    load_run
    mkdir -p "$SCRATCH/config/10x-cli"
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ); exp=$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+1H +%Y-%m-%dT%H:%M:%SZ)
    printf '{"version":1,"email":"verify@example.test","access_token":"fake-access-seed","refresh_token":"fake-refresh-seed","expires_at":"%s","created_at":"%s","method":"email"}\n' \
      "$exp" "$now" >"$SCRATCH/config/10x-cli/auth.json"
    chmod 600 "$SCRATCH/config/10x-cli/auth.json"
    echo "seeded $SCRATCH/config/10x-cli/auth.json (expires $exp)"
    ;;

  cli)
    load_run
    LABEL=${1:?label}; shift; [ "${1:-}" = "--" ] && shift
    OUT="$EVID/$(next_seq)-$LABEL"
    printf '10x %s\n' "$*" >"$OUT.cmd"
    (cd "$SCRATCH/project" && cli_env $(entry) "$@" </dev/null >"$OUT.stdout" 2>"$OUT.stderr")
    code=$?
    echo "$code" >"$OUT.exit"
    echo "== 10x $*   (exit $code, evidence ${OUT#"$ROOT"/}.*)"
    [ -s "$OUT.stdout" ] && { echo "-- stdout"; head -c 4000 "$OUT.stdout"; echo; }
    [ -s "$OUT.stderr" ] && { echo "-- stderr"; head -c 2000 "$OUT.stderr"; echo; }
    exit 0   # the CLI's exit code is data, recorded in .exit
    ;;

  tty)
    load_run
    LABEL=${1:?label}; shift; [ "${1:-}" = "--" ] && shift
    tmux -L "$TMUX_SOCK" kill-server 2>/dev/null || true
    printf '10x %s\n' "$*" >"$EVID/$(next_seq)-$LABEL.cmd"
    q=$(printf '%q ' "$@")
    tmux -L "$TMUX_SOCK" new-session -d -s cli -x 120 -y 40 -c "$SCRATCH/project" \
      "$(printf 'API_BASE_URL=%q BUNDLE_PUBLIC_KEYSET=%q XDG_CONFIG_HOME=%q APPDATA=%q NO_COLOR=1 %s %s; echo; echo "[10x exited $?]"; sleep 600' \
        "$API_URL" "$KEYSET" "$SCRATCH/config" "$SCRATCH/config" "$(entry)" "$q")"
    echo "PTY started on tmux socket $TMUX_SOCK (session cli)"
    ;;

  keys)
    load_run
    tmux -L "$TMUX_SOCK" send-keys -t cli "$@"
    ;;

  screen)
    load_run
    OUT="$EVID/$(next_seq)-${1:?label}.screen.txt"
    tmux -L "$TMUX_SOCK" capture-pane -p -t cli | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' >"$OUT" || die "no PTY session"
    cat "$OUT"; echo "(saved ${OUT#"$ROOT"/})"
    ;;

  wait-screen)
    load_run
    pat=${1:?regex}; t=${2:-20}
    for _ in $(seq 1 $((t * 5))); do
      tmux -L "$TMUX_SOCK" capture-pane -p -t cli 2>/dev/null | grep -Eq -- "$pat" && exit 0
      sleep 0.2
    done
    tmux -L "$TMUX_SOCK" capture-pane -p -t cli 2>/dev/null | tail -15
    die "screen never matched /$pat/ within ${t}s"
    ;;

  click)
    load_run
    sid=$(curl -fsS "$API_URL/__fake/sessions" | jq -r '[.[] | select(.clicked == false)] | last | .session // empty')
    [ -n "$sid" ] || die "no pending magic-link session"
    curl -fsS -X POST "$API_URL/__fake/click?session=$sid" >/dev/null && echo "clicked magic link for session $sid"
    ;;

  bump)
    load_run
    curl -fsS -X POST "$API_URL/__fake/bump?lesson=${1:?lessonId}"; echo
    ;;

  changelog)
    load_run
    case "${1:-}" in
      release) curl -fsS -X POST "$API_URL/__fake/changelog/release" ;;
      off) curl -fsS -X POST "$API_URL/__fake/changelog/route?enabled=0" ;;
      on) curl -fsS -X POST "$API_URL/__fake/changelog/route?enabled=1" ;;
      *) die "usage: verify.sh changelog release|off|on" ;;
    esac
    echo
    ;;

  snapshot)
    load_run
    OUT="$EVID/$(next_seq)-${1:?label}.tree.txt"
    for d in project config; do
      echo "## $d"
      (cd "$SCRATCH/$d" && find . -path ./.git -prune -o -type f -print0 | sort -z | xargs -0 -r sha256sum)
    done >"$OUT"
    cat "$OUT"; echo "(saved ${OUT#"$ROOT"/})"
    ;;

  note)
    load_run
    echo "- $*" >>"$EVID/notes.md"
    ;;

  down)
    load_run
    tmux -L "$TMUX_SOCK" kill-server 2>/dev/null || true
    if ours; then kill "$API_PID" && echo "stopped fake API pid $API_PID"; else echo "fake API pid $API_PID not running (or not ours): left alone"; fi
    [ -f "$SCRATCH/requests.log" ] && cp "$SCRATCH/requests.log" "$EVID/requests.log"
    case "$SCRATCH" in */10x-verify-"$RUN".*) rm -rf "$SCRATCH" && echo "removed scratch $SCRATCH" ;; esac
    mv "$EVID/run.env" "$EVID/run.env.down"
    [ "$(cat "$BASE/current" 2>/dev/null)" = "$RUN" ] && rm -f "$BASE/current"
    echo "evidence kept: $EVID"
    ;;

  *)
    sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    ;;
esac
