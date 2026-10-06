# Toolkit changelog

A learner sees which 10x-toolkit releases (skills, prompts, rules, config templates) were
published since their project's last sync, or since a version or date they choose. A
successful sync or full get records the newest toolkit version as the project's baseline.
The command describes toolkit releases only; what a sync would download is still
`10x sync --dry-run`.

## Sub-features

- `changelog-record` — `sync` and an unfiltered `get` store `toolkit.version` in the manifest.
- `changelog-none` — nothing new since the recorded baseline.
- `changelog-new` — a newer release is listed, newest first.
- `changelog-since` — `--since vX.Y.Z` (exclusive) and `--since YYYY-MM-DD` (inclusive from
  that UTC day) ignore the baseline; `--limit` caps the list.
- `changelog-fallback` — no `toolkit` field: last applied lesson date; no manifest: latest
  5 releases plus the `Run 10x sync to record your baseline.` hint.
- `changelog-unsupported` — backend without the route: `sync`/`get` unchanged, `changelog`
  fails with `changelog_unsupported`.
- `changelog-usage` — invalid `--since` / `--limit` exit `2`.

## How to get to it (user POV)

- Run `10x sync --tool claude-code` (or `10x get <ref>`), then `10x changelog`.
- Run `10x changelog --since v2.59.0` or `10x changelog --since 2026-10-01 [--limit <n>]`.

## Driving it with verify.sh

Preconditions:

- Baseline run with `$V seed-auth`. The fake serves toolkit releases `v2.59.0`
  (2026-10-01), `v2.59.1` (2026-10-03) and `v2.59.2` (2026-10-05).
- Fake-world actions: `$V changelog release` publishes the next patch release, dated now;
  `$V changelog off` makes `GET /api/changelog` answer 404 (an older backend);
  `$V changelog on` restores it.

- **No baseline.** In the fresh project run `$V cli none -- changelog`. Exit `0`;
  `data.baseline.source` `none`; `data.newEntries` `3`. In a TTY (`$V tty`) the screen
  starts `Latest toolkit changes (no baseline recorded)` and ends with
  `Run 10x sync to record your baseline.`
- **Applied fallback.** Run `$V cli filtered -- get m1l1 --type skills --name
  verify-fixture-skill --tool claude-code` (a filtered get does not record), then
  `$V cli applied -- changelog`: `data.baseline.source` `applied` with a `date`.
- **Record (Phase 1).** Run `$V cli get -- get m1l1 --tool claude-code` and
  `$V cli sync -- sync --tool claude-code`. `.claude/.10x-cli-manifest.json` has
  `toolkit.version` `v2.59.2`; `requests.log` shows `GET /api/changelog?limit=1 -> 200`
  after each.
- **Nothing new (Phase 2).** Run `$V cli changelog -- changelog`. Exit `0`;
  `data.baseline` `{ source: "sync", version: "v2.59.2" }`; `data.newEntries` `0`. The
  TTY screen reads `Toolkit changes since v2.59.2 (recorded by your last 10x sync)` and
  `No toolkit changes since v2.59.2.`
- **New release.** Run `$V changelog release` (prints `v2.59.3`), then
  `$V cli changelog-new -- changelog`. `data.newEntries` `1`, `entries[0].version`
  `v2.59.3`; the TTY shows `v2.59.3 — <today>` and its notes.
- **Since a date / version.** `$V cli since-date -- changelog --since 2026-10-01` lists
  `v2.59.3` … `v2.59.0` (the 2026-10-01 release is included);
  `$V cli since-ver -- changelog --since v2.59.0` lists everything except `v2.59.0`;
  adding `--limit 2` returns `newEntries` `2`.
- **Usage.** `$V cli since-bad -- changelog --since yesterday` exits `2` with
  `error.code` `invalid_since`; `--limit 0` exits `2` with `invalid_limit`.
- **Older backend.** Run `$V changelog off`, `$V snapshot before-off`,
  `$V cli sync-off -- sync --tool claude-code`, `$V snapshot after-off`: exit `0`, the two
  snapshots are identical (the manifest keeps `v2.59.2` although `v2.59.3` exists), and
  `requests.log` shows `GET /api/changelog?limit=1 -> 404`. `$V cli chlog-off -- changelog`
  exits `1` with `error.code` `changelog_unsupported`. Then `$V changelog on`,
  `$V cli sync-on -- sync --tool claude-code`: its stdout equals `sync-off`'s, and the
  manifest now records `v2.59.3`.

## Gotchas

- The fake route follows the toolkit contract: `since` and `sinceDate` together, a
  malformed version/date, or `limit` outside 1–100 answer `400 {"error":"invalid_query"}`.
  The CLI never sends both, so probe that with `curl -H 'Authorization: Bearer
  fake-access-seed' "$API_URL/api/changelog?since=v2.59.0&sinceDate=2026-10-01"` (the API
  URL is in `run.env`); without the header it answers `401`.
- Recording is silent: a 404 or empty list leaves the manifest untouched and changes
  neither output nor exit code. Only `--verbose` mentions it.
- `$V changelog release` dates the new entry now (at least a minute after the previous
  one), so `--since <today>` includes it.
- Fake releases do not change lesson content: `sync` reports `unchanged` lessons while the
  changelog lists a release. Use `$V bump` for content changes.
