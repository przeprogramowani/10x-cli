# Dependency update analysis

Analysis only; no dependency versions were changed. Captured on 2026-07-27 with
Bun 1.3.8 against repo-map scan `a27e2c4` (2026-07-27).

## Method

- `bun outdated` reported eight outdated direct dependencies. Because the
  manifest pins exact versions, its `Update` column matched `Current` for all
  eight; the table below compares `Current` with `Latest`.
- `bun pm ls --all | head -100` confirmed the installed current versions and
  showed the relevant packages in the local dependency tree. A focused
  `bun pm why` check additionally confirmed that
  `conventional-commits-parser` is used transitively by
  `conventional-recommended-bump`.
- `npx madge --extensions ts src --json` produced 27 modules and 66 internal
  edges. External npm imports are not represented in that default Madge JSON,
  so direct package consumers were verified from source imports and their
  transitive `src` consumers were calculated by walking the Madge graph
  backwards.
- The repo map marks both direct-consumer zones as high fan-out:
  `src/commands` has Ce=38 and `src/lib` has Ce=17. Its warning that static
  analysis cannot see runtime/dynamic wiring applies here, especially to the
  dynamically loaded conventional-changelog preset.

## Findings

| package | current -> latest | major? | imported by | risk | recommendation |
| --- | --- | --- | --- | --- | --- |
| `@clack/prompts` | `0.9.1 -> 1.7.0` | yes (`0 -> 1`) | Direct: `src/commands/auth.ts`, `src/lib/conflict-prompt.ts`, `src/lib/tool-prompt.ts`. Transitive reverse closure: `src/commands/get.ts`, `src/commands/sync.ts`, `src/index.ts`. | **High.** Runtime interactive UX crosses both mapped high-fan-out zones and covers authentication, tool selection, orphan warnings, and conflict resolution. Tests also mock the package API, so API or cancellation-semantics changes can affect production and test seams together. | **human decision** — review the 1.x API/migration notes and validate every TTY/non-TTY prompt flow in a dedicated change. |
| `@types/bun` | `1.3.12 -> 1.3.14` | no | No direct or transitive package import in `src`; loaded ambiently for the full TypeScript program by `tsconfig.json` (`types: ["node", "bun"]`). No Bun-specific symbol is referenced in `src` (tests do import `bun:test`). | **Low.** Patch-level, type-only change with no runtime edge. Ambient declaration changes can still surface anywhere during strict typechecking. | Candidate for a later isolated patch iteration; require typecheck and the differential test gate. |
| `@types/node` | `22.19.17 -> 26.1.2` | yes (`22 -> 26`) | No literal `@types/node` import; it is ambient via `tsconfig.json`. Direct Node built-in/global API consumers include `src/index.ts`, `src/commands/{doctor,get,sync}.ts`, and `src/lib/{api-client,api-content,auth-flow,auth-guard,config,conflict-prompt,fs-utils,manifest,output,signing,tool-detect,tool-prompt,tool-switch,update-check,writer}.ts`; their graph closure reaches every CLI command through `src/index.ts`. | **High.** Ambient declarations affect nearly the whole strict TypeScript program, while the package still declares runtime support as Node `>=20`; adopting Node 26 declarations could accidentally permit APIs unavailable on older supported runtimes. | **human decision** — align the declaration major with the supported Node/Bun runtime matrix before considering an isolated migration. |
| `conventional-changelog-angular` | `8.3.1 -> 9.2.1` | yes (`8 -> 9`) | No `src` import. Runtime-loaded by `scripts/auto-version.mjs` through `Bumper.loadPreset("angular")`. | **Medium.** Production CLI code is untouched, but preset behavior can change automated release classification and therefore published versions. The dynamic load is invisible to Madge. | **human decision** — evaluate together with the release-versioning stack and exercise representative commit histories before changing it. |
| `conventional-commits-parser` | `6.4.0 -> 7.1.1` | yes (`6 -> 7`) | No `src` import. No direct repository import was found; `bun pm why` shows it is a transitive dependency of `conventional-recommended-bump`, so `scripts/auto-version.mjs` reaches it indirectly. | **Medium.** Release-only blast radius, but parse changes can alter which commits feed the automated bump recommendation. The manifest also pins it directly, so dependency deduplication/compatibility must be reviewed with the other release packages. | **human decision** — assess as part of one coordinated release-tooling decision, not as an independent source dependency. |
| `conventional-recommended-bump` | `11.2.0 -> 12.1.0` | yes (`11 -> 12`) | No `src` import. Directly imported by `scripts/auto-version.mjs`; it also brings `conventional-commits-parser` transitively. | **High for releases, none for CLI runtime.** This script selects major/minor/patch and is invoked by the release workflow, so behavior drift can produce an incorrect published version even though the `src` graph is unaffected. | **human decision** — review the major migration with both conventional-changelog packages and test no-bump, patch, minor, and breaking-change histories. |
| `oxlint` | `0.16.12 -> 1.76.0` | yes (`0 -> 1`) | No `src` import. Invoked by the `lint` package script and by `tools/examples-catalog/build.mjs`. | **Medium.** Tool-only, but it is a CI gate over the repository and an examples-catalog gate. A large version jump can change rule defaults, diagnostics, or configuration behavior; the pinned baseline is two deliberate warnings. | **human decision** — trial in a dedicated lint-tooling change and compare diagnostics/config semantics against the pinned warning baseline. |
| `typescript` | `5.9.3 -> 7.0.2` | yes (`5 -> 7`) | No runtime `src` import. It compiles the entire `tsconfig.json` program (`src`, `scripts`, and `tests`) through `bun run typecheck`. | **High.** Two compiler majors affect every source module and strict/bundler-mode semantics, and type declaration compatibility must be considered with both `@types/node` and `@types/bun`. | **human decision** — plan as a compiler migration, review breaking changes for both majors, and keep it separate from ambient-type upgrades unless compatibility requires coordination. |

## Caveats

- “No `src` import” means no static source-package edge, not no repository
  impact. Type packages are ambient, while lint/compiler/release packages act
  through scripts and CI.
- The reverse closure is limited to static imports. Dynamic imports, generated
  code interactions, executable/package resolution, and behavior changes
  internal to dependencies remain unknown until a dedicated update is tested.
- Major versions are recommendations for human review only. This report does
  not authorize or perform any package, manifest, or lockfile change.
