<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Access and delivery

- **Plan**: [plan.md](../plan.md)
- **Mode**: Deep, targeted refinement of the accepted split
- **Date**: 2026-09-12
- **Verdict**: SOUND after fixes
- **Findings**: 0 open critical, 0 open warnings; fixed findings recorded below

## Verdicts

| Dimension | Verdict |
|---|---|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Both master refs freshly fetched and unchanged: CLI f89f195, toolkit da989a6. Parent verified more than five existing paths per repository and load-bearing symbols (MANIFEST_VERSION, applyBundle, computeRemovals, upsertCourseGrant). Referenced new files are proposed, not claimed present. Phase/Progress titles, numbers and local links were checked mechanically; briefs agree with accepted decisions. All three acceptance hashes remain unchanged.

One independent review agent checked the riskiest cross-repository claims, caller impact and existing patterns: D05 source tree enumeration (`packages/course-content/src/build/core.ts:26`), D14 signing/auth compatibility (`packages/api/src/lib/signing.ts:33`, `services/auth.ts:216`), D11 shared profiles (`src/lib/tool-profile.ts:72`, `:87`, `:111`) and D12 every manifest writer (`src/lib/writer.ts:465`). Parent reconciled D15 split and all D01–D16 allocations. Review of final deltas confirmed the fixes.

## Findings

### F1 — Ordinary managed rules needed first-release protection

- **Severity**: WARNING
- **Impact**: MEDIUM — first-release local-data guarantee.
- **Dimension**: End-State Alignment
- **Location**: Access Phase 5.
- **Evidence**: CLI `src/lib/writer.ts:355` writes the result of `planRules`; `:610` has no upstream-hash conflict classification, and opt-out removes the block. `src/lib/manifest.ts:53` lacks rule hashes; `src/lib/tool-switch.ts:280` also removes sentinel content.
- **Fix**: Access Phase 5 subsection 3 and criterion 5.9 now require optional upstream rule hashes, explicit decisions for unknown/modified blocks, shared-owner reconciliation, byte-preserved surrounding text and coverage of get/sync/force/opt-out/profile cleanup and partial failures.
- **Decision**: FIXED within the user's authorized plan reconciliation. Independent reviewer reread the final section and confirmed closure.

## Confirmed boundaries

First release is independently shippable: empty signed map entries are valid; actual reviewed mappings require a new immutable release in the second change. Package SHA selects the whole tree and explicit file SHA overrides it. V3 compatibility is separately checked in both old/new client directions. Active-profile sync reads all owners and defers unsafe shared changes; --all-profiles is explicit. Only the latest operation supports machine recovery; retained older backups are manual evidence, not undo history.

## Limits and required evidence

SOUND concerns the plan, not a tested or deployed feature. W04/W05 curriculum/cutoff, W08 actual publisher conditional promotion and remaining W01–W20 gates remain open where documented in [evidence.md](../evidence.md). They must be closed at the dependent implementation/release phases. No application tests, R2 publication, grant mutation or production deployment occurred in this review. Historical combined review is retained under the first change's history directory and is not inherited as the approval of this split.
