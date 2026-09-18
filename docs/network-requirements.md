# 10x-cli network requirements

Polish: [wymagania-sieciowe.md](wymagania-sieciowe.md).  
Machine-readable host list: [network-allowlist.json](network-allowlist.json).

10x-cli (`@przeprogramowani/10x-cli`) signs a 10xDevs course user in and writes lesson files to disk. It does not open a listening port. It does not upload project source code.

---

## Allowlist

Every row: HTTPS, TCP 443, from the device.

### Required for course use

| Host | Port | Protocol | Purpose | Without it |
|------|------|----------|---------|------------|
| `10x-toolkit-api.przeprogramowani.workers.dev` | 443 | HTTPS | Login, token refresh, lesson list and content, `10x doctor` | `10x auth`, `list`, `get`, `sync` fail; `doctor` reports the API unreachable |
| `registry.npmjs.org` | 443 | HTTPS | Install and update `@przeprogramowani/10x-cli` (`npx` / `npm install -g`) | npm install and upgrade fail. `10x doctor` still runs — it skips the version check |
| `toolkit.przeprogramowani.pl` | 443 | HTTPS | Login email link (`/auth/callback`) opened in the browser | Email login (`10x auth`) does not finish after the user clicks the link |

`10x-cli` calls the API only at `10x-toolkit-api.przeprogramowani.workers.dev`. `toolkit.przeprogramowani.pl` is browser-only, for email login.

### Browser — Circle login

| Host | Port | Protocol | Purpose | Without it |
|------|------|----------|---------|------------|
| `10x-toolkit-api.przeprogramowani.workers.dev` | 443 | HTTPS | Approval page from the Circle message | `10x auth --method circle` waits until the link expires |
| `app.circle.so` | 443 | HTTPS | Reading the Circle message that contains the link | The user cannot open the message (the `10x` process does not connect here) |

### Optional

| Host | Port | Protocol | Purpose | Without it |
|------|------|----------|---------|------------|
| `10xbench.ai` | 443 | HTTPS | Model leaderboard (`10x bench`) | `10x bench` fails; lesson download is unchanged |
| `github.com` | 443 | HTTPS | `git clone` of the `10x-bench-kit` template; optional GitHub Releases binary | `10x bench-kit` cannot fetch the template. Course `get` / `sync` unchanged |
| `objects.githubusercontent.com` | 443 | HTTPS | GitHub Releases asset CDN (unconfirmed) | Downloading the standalone binary from Releases may fail |
| `release-assets.githubusercontent.com` | 443 | HTTPS | GitHub Releases asset CDN (unconfirmed) | same |
| `10xdevs.pl` | 443 | HTTPS | Course enrolment site (error-message hint only) | No effect on the CLI |

`10x bench-kit` may also run `git ls-remote` against the `origin` of the repo where the command was invoked — that host is whatever the user’s git config already uses.

---

## Protocol and TLS

- HTTPS / TLS, TCP 443. Login: `POST`/`GET` and repeated HTTP (every 2 s, up to 5 min). No WebSocket or SSE.
- API and 10xbench timeout: 30 s. `doctor` → API: 5 s. `doctor` → npm: 2 s.
- User-Agent: `10x-cli`.
- The CLI does not listen on any port.

Corporate TLS inspection (custom CA):

| Setting | Fact |
|---------|------|
| `NODE_EXTRA_CA_CERTS` | Node.js appends a PEM CA file. Applies when `10x` runs on Node (npm install). |
| OS certificate store | The CLI does not enable `--use-system-ca`. |
| `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` | `npm` / `npx` usually honour these. Node 20 `fetch` (CLI minimum) does not unless `NODE_USE_ENV_PROXY=1` (Node 24+). On Node 20–22, proxy for `10x auth` / `10x get` is unconfirmed. |
| Standalone binary | Different runtime from Node. `NODE_EXTRA_CA_CERTS` / `HTTPS_PROXY`: unconfirmed. |

If inspection breaks TLS: point `NODE_EXTRA_CA_CERTS` at the corporate root, or disable inspection for the hosts in the tables.

---

## On the device

| Component | Required |
|-----------|----------|
| Node.js ≥ 20 | Yes for npm/npx install |
| npm / npx | Yes for npm install. No for the standalone binary |
| git | `10x bench-kit` only |
| Docker / Podman | Not for the CLI |
| OS | macOS, Linux, Windows |

Session tokens (email, access/refresh JWT, expiry) — not a Circle password:

| OS | Directory | Files | Permissions (POSIX) |
|----|-----------|-------|---------------------|
| macOS / Linux | `$XDG_CONFIG_HOME/10x-cli` or `~/.config/10x-cli` | `auth.json`, `config.json` | directory `0700`, `auth.json` `0600` |
| Windows | `%APPDATA%\10x-cli` | same files | — |

Lesson files are written into the user’s project directory (for example `.claude/skills/`, `CLAUDE.md`).

---

## Data leaving the device

| Data | When |
|------|------|
| Email address | `10x auth`; stored in `auth.json` |
| JWT access + refresh | Login and every API call (`Authorization: Bearer`) |
| Hostname and a short OS string | Start of `10x auth --method circle` only |
| User-Agent `10x-cli` | Every CLI request |
| Package-version GET (no token) | `10x doctor` → `registry.npmjs.org` |
| Public leaderboard JSON (no token) | `10x bench` |

Project source code is not uploaded.

---

## AI coding tools (separate allowlist)

10x-cli does not call Anthropic, OpenAI, Google, or OpenRouter. It writes files for the chosen `--tool`. Model traffic is that tool’s traffic.

| `--tool` | Vendor network requirements |
|----------|------------------------------|
| `claude-code` | [Claude Code — enterprise network](https://docs.claude.com/en/docs/claude-code/network-config) |
| `cursor` | [Cursor — network configuration](https://cursor.com/docs/enterprise/network-configuration) |
| `copilot` | [GitHub Copilot allowlist](https://docs.github.com/copilot/reference/copilot-allowlist-reference) |
| `codex` | [Codex — network](https://developers.openai.com/codex/agent-approvals-security/) — full local-CLI host list: confirm with OpenAI |
| `gemini` | [Gemini Code Assist network access](https://developers.google.com/gemini-code-assist/docs/network-access) — confirm for Gemini CLI |
| `kiro` | [Kiro — firewalls and proxies](https://kiro.dev/docs/web/firewalls/) |
| `devin-desktop` (`windsurf` alias) | [Devin Desktop — domains](https://docs.devin.ai/desktop/troubleshooting/windsurf-common-issues) |
| `generic` | No vendor |

---

## How to verify

```bash
curl -I --max-time 10 https://10x-toolkit-api.przeprogramowani.workers.dev/health
curl -I --max-time 10 https://registry.npmjs.org/@przeprogramowani/10x-cli/latest
curl -I --max-time 10 https://toolkit.przeprogramowani.pl/auth/callback
curl -I --max-time 10 https://10xbench.ai/api/leaderboard.json
curl -I --max-time 10 https://github.com/przeprogramowani/10x-bench-kit
```

TLS handshake matters (HTTP 200 is not required). On the device: `10x doctor`.

| Blocked host | CLI message |
|--------------|-------------|
| API | `Could not reach the 10x-toolkit API.` |
| `doctor`, 5 s timeout | `{url} did not respond within 5s.` |
| `doctor`, other network error | `{url} is unreachable.` |
| npm (does not fail `doctor`) | `10x-cli {version} (update check skipped).` |
| `10x bench` | `Could not reach 10xbench.ai.` |
| `10x bench-kit` | `Could not download the template from https://github.com/przeprogramowani/10x-bench-kit.` |
| bad certificate / intercept | `network_error` plus the runtime message |

Exit codes: `0` success, `1` error, `2` usage, `3` auth required, `4` forbidden, `5` not found. `doctor` with a dead API: **78**.

---

## Keeping this list current

Canonical hosts: [network-allowlist.json](network-allowlist.json). `tests/network-allowlist.test.ts` fails if `src/` or this document / the Polish version introduce a host outside the list. A new host = the same PR: JSON + EN + PL.
