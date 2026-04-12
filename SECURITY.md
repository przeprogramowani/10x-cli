# Security

## Reporting Vulnerabilities

If you discover a security vulnerability in this CLI, please report it privately:

- **Email**: security@przeprogramowani.pl
- **Do NOT** open a public GitHub issue for security vulnerabilities.

We will acknowledge receipt within 48 hours and aim to provide a fix or mitigation within 7 days for critical issues.

---

## Threat Model

The 10x CLI authenticates users, fetches lesson content from a remote API, and writes artifacts to the local filesystem. The following threat scenarios are explicitly defended against:

### T1 — Token Harvest via Environment Variable Injection

**Attack**: Attacker sets `API_BASE_URL` to a host they control, redirecting `/auth/login` and `/auth/verify` to capture user tokens.

**Defense** (`src/lib/api-client.ts`): Strict hostname allowlist. Only the exact production HTTPS host and loopback HTTP addresses are accepted. Paths, query strings, and fragments are rejected. See finding **F3**.

### T2 — Credential File Permission Escalation

**Attack**: Local unprivileged user reads `auth.json` if created with world-readable permissions, or races a stale temp file with loose mode.

**Defense** (`src/lib/config.ts`): Config directory is `0o700`, auth file is `0o600`. Atomic write pattern (tmp → chmod → rename). Stale `.tmp` files are force-removed before write. See finding **F4**.

### T3 — Token Refresh Race Condition

**Attack**: Multiple concurrent CLI invocations each attempt token refresh, burning refresh tokens or causing a "token already consumed" server-side error.

**Defense** (`src/lib/auth-guard.ts`): File-based lock with `proper-lockfile`. Double-check pattern inside critical section — if a sibling process already refreshed, the current process uses the rotated token without re-requesting.

### T4 — Bundle Injection (Malicious Lesson Content)

**Attack**: Compromised API or MITM injects malicious `.claude/` rules/prompts/skills via unsigned lesson bundles.

**Defense** (`src/lib/signing.ts`, `src/lib/api-content.ts`): Ed25519 signature verification with baked-in public keyset. Bundle integrity is verified before any artifacts are written to disk.

**Note**: `REQUIRE_SIGNATURES` is currently `false` (transition period). Once the API confirms all bundles are signed, this flag will be flipped to `true` to fail-closed.

### T5 — Sentinel Marker Injection

**Attack**: Malicious rule content contains sentinel markers (`<!-- BEGIN ... -->`), causing the next `apply` operation to strip legitimate student content.

**Defense** (`src/lib/sentinel-migration.ts`): Rules body is validated to not contain any sentinel marker pattern before write. See finding **F5**.

### T6 — Path Traversal via Artifact Names

**Attack**: Bundle artifact names like `../evil.json` or `CON` escape the target `.claude/` directory.

**Defense** (`src/lib/writer.ts`): `isSafeName()` rejects path separators, dot-prefixed names, null bytes, NTFS reserved names/characters, and alternate data streams. Applied to every artifact before filesystem mutation.

### T8 — Supply Chain Attack via Malicious Package Publish

**Attack**: Attacker publishes a compromised version of a dependency (or typosquatted package). The malicious code runs at install time via `postinstall` scripts or at runtime after import.

**Defense** (`.npmrc`):
- `ignore-scripts=true` — blocks `postinstall` and other lifecycle scripts from executing during install, neutralizing the most common attack vector.
- `minimum-release-age=604800` — refuses to install any package version published less than 7 days ago. Most malicious publishes are detected and pulled from the registry within this window, providing a quarantine buffer.
- `--frozen-lockfile` in CI — prevents the lockfile from being modified during CI installs, ensuring only audited dependency versions are used.

### T7 — Terminal Control Sequence Injection

**Attack**: API error messages contain ANSI escape sequences that clear the terminal, hide warnings, or spoof output.

**Defense** (`src/lib/output.ts`): `sanitize()` strips CSI sequences and C0/C1 control characters from all untrusted text before stderr output.

---

## Security Review History

| Date       | Finding | Summary                                         | Status  |
|------------|---------|--------------------------------------------------|---------|
| 2026-04-11 | F3      | API_BASE_URL token harvest via env var injection | Fixed   |
| 2026-04-11 | F4      | Stale tmp file mode inheritance                  | Fixed   |
| 2026-04-11 | F5      | Sentinel marker injection in rules body          | Fixed   |
| 2026-04-12 | —       | Full security audit (auth, network, output, fs)  | Passed  |

---

## Security Design Decisions

### Why a hostname allowlist instead of URL pattern matching?

Pattern-based validation (e.g., regex on URL) is prone to bypass via URL normalization tricks, nested paths, and unicode confusables. A literal hostname comparison against a small, explicit set eliminates this class of bugs entirely.

### Why Ed25519 for bundle signatures?

Ed25519 provides 128-bit security, fast verification, small signatures (64 bytes), and deterministic output (no nonce reuse risk). The public key is baked into the binary so that API compromise alone cannot inject unsigned content.

### Why file-based locking for token refresh?

The CLI may run as multiple parallel processes (e.g., in CI or scripted pipelines). In-process mutexes don't protect across processes. `proper-lockfile` with stale detection provides cross-process serialization without requiring a daemon or IPC channel.

### Why stderr for human output?

Stdout is reserved for machine-parseable data (JSON). Scripts piping CLI output through `jq` or other processors must not encounter human-readable messages mixed into the data stream. This separation also prevents terminal escape injection from corrupting structured output.
