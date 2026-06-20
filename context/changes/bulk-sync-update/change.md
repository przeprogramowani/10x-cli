---
change_id: bulk-sync-update
title: Bulk download & update with change visibility (10x-cli + 10x-toolkit)
status: implemented
created: 2026-06-16
updated: 2026-06-20
---

## Notes

Evangelist feedback: students want a way to download all modules/lessons at once,
or to refresh artifacts they already downloaded, plus a way to see WHAT changed
since their last download (many skills have been updated since course start and
there's currently no way to verify what moved). Today this requires manually
looping `list m0`, `list m1`, … then `get m0l1`, `get m0l2`, … one lesson at a
time. We want a single CLI command for this operation.

Original (PL): "Przydała by się opcja w 10x-cli do pobierania wszystkich modułów
i lekcji za jednym razem albo aktualizowanie już pobranych artefaktów. […] w
zasadzie nie ma tego jak zweryfikować że coś zostało zmienione. […] Jakiś automat
w cli na taka operację by się przydał."

**Scope note (2026-06-20):** this is a coordinated **two-repo** change. The CLI gets
a new `10x sync` command (this repo); `10x-toolkit` gets a per-lesson `contentHash`
on the catalog endpoint so the sync can detect "what changed" in one request instead
of re-downloading every lesson. See `research.md` → "Follow-up Research 2026-06-20".

Merged the duplicate `cli-update-all` change (created 2026-06-20) into this folder —
same work, restarted after a few days. The backend findings from that investigation
live in `research.md`.

**Scope decision (2026-06-20):** the v1 plan listed "background sync / auto-update of
applied artifacts" as a non-goal (`10x-toolkit/context/archive/2026-04-07-10x-cli-design/plan.md:63`).
That call is ~2 months old and is now **explicitly reversed** — users asked for this
directly. `10x sync` is in scope. No need to re-debate the "should we even" framing in
planning; go straight to the `how`.
