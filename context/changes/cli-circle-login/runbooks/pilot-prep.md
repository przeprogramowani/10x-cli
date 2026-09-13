# Runbook: operator steps before the Circle login pilot

Change: `cli-circle-login` · Written 2026-09-13 · Owner: operator (Marcin Czarkowski)

These are the actions only the operator can perform. Nothing here is executed by an agent.
The results feed Phase 7 (pilot enablement). Phases 2–6 (implementation and tests) do not
wait for them. Do not paste any token value into this file, the repo, a chat, or a log.

Order of rollout stays: (1) deploy Toolkit with `AUTH_CIRCLE_LOGIN = "disabled"`,
(2) release the CLI in the slot agreed with `p0-cli-release`, (3) enable the pilot separately.

---

## A. SQLite-backed Durable Objects on the production Cloudflare account

### What is evidence today

| Item | Status | Source |
| --- | --- | --- |
| Account identity for the production Worker | **Evidence** | `wrangler whoami` (2026-09-13): OAuth login for `przeprogramowani@gmail.com`, account id `eb313d34b48a9aa3c87eb3554e33134d`, scopes include `workers (write)` |
| The migration `v1` with `new_sqlite_classes = ["DeviceLogin", "AuthBudget"]` is syntactically valid and both bindings resolve | **Evidence** | `pnpm --filter @przeprogramowani/api build` (wrangler 4.80.0 `deploy --dry-run`) lists `env.DEVICE_LOGIN` and `env.AUTH_BUDGET` as Durable Objects (gate 2.4, commit `52b6beb`) |
| The state machine and budgets behave under workerd | **Evidence** | `circle-login-do.test.ts`, 17 tests under `unstable_dev` (gate 2.1/2.2) |
| The account plan allows SQLite-backed Durable Objects | **Assumption** | Operator statement 2026-09-13 ("Plan Cloudflare Toolkita obsługuje SQLite DO: tak"). A dry run never contacts the plan check; only a real deploy does |

### How to turn the assumption into proof (no code change, no flag change)

1. Dashboard read (2 minutes): Cloudflare dashboard → account `eb313d34…` → *Workers & Pages* →
   *Plans*. Record the plan name here: `……………`. Since 2025 both the Free and the Paid Workers
   plan accept `new_sqlite_classes`; only legacy KV-backed classes (`new_classes`) need Paid.
   If the plan page shows Free, note the Free-plan DO limits (storage 5 GB, requests per day)
   and confirm they exceed the pilot (a few hundred logins).
2. Definitive proof is Phase 7 step 1: `wrangler deploy` of the Toolkit candidate with
   `AUTH_CIRCLE_LOGIN = "disabled"`. A successful deploy applies migration `v1`. If Cloudflare
   rejects the migration, the deploy is aborted as a whole and production is unchanged; stop
   and report the exact error text (it contains no secret) before any retry.
3. After the deploy, a read-only check: `pnpm exec wrangler deployments list` (from
   `packages/api`) shows the new version; the dashboard Worker page lists both classes under
   *Durable Objects* with storage backend *SQLite*.

Nothing in this section requires the flag to leave `disabled`.

---

## B. `CIRCLE_MESSAGING_TOKEN`: where it comes from, where it goes, what it may do

### Source

- Community: Brave, Circle community id `1272` (the community both 10xDevs 3.0 and 4.0 use;
  `CIRCLE_COMMUNITY_ID` in `packages/api/wrangler.toml`).
- Circle admin UI → *Settings* → *Developers* → *API tokens* → *Create token* → type
  **Admin API v2** (not *Headless Auth*, which mints member JWTs and cannot send messages).
- Name it so rotation is traceable, for example `10x-cli-login-messaging`.
- Create a **dedicated** token. Do not reuse `CIRCLE_API_TOKEN` (member sync). Circle Admin
  v2 tokens are not scoped per endpoint, so "minimal scope" here means: a separate token used
  by exactly one code path, revocable on its own, with its own blast radius. This is decision
  D07 with the interview correction "one messaging secret now".

### Where it is configured

The Worker secret is set once against the production Worker, before Phase 7, from
`packages/api` on the Toolkit branch that carries Phase 2+:

```sh
cd packages/api
pnpm exec wrangler secret put CIRCLE_MESSAGING_TOKEN
# paste the value at the prompt; never pass it with -e, an env file or a shell argument
pnpm exec wrangler secret list   # prints names only; confirm CIRCLE_MESSAGING_TOKEN is present
```

- The header form is configuration: `CIRCLE_MESSAGING_AUTH_SCHEME = "Token"` (default,
  EDU's proven form) in `wrangler.toml`. Change it to `"Bearer"` only if section C shows that
  `Token` is rejected and `Bearer` accepted.
- While `AUTH_CIRCLE_LOGIN = "disabled"` the secret is never read on a request path.
- Rotation: create a new token in Circle, `wrangler secret put` again, then revoke the old
  token in Circle. In-flight logins are unaffected (the DM was already sent). Revoking first
  would turn every `start` into `dm_rejected` until the new secret lands.
- The per-community extension (`CIRCLE_MESSAGING_TOKEN_<communityId>`) is documented in the
  Toolkit runbook `docs/how-to/login-with-circle.md` (Phase 3) and is not needed for one
  community.

---

## C. Controlled DM trial on the pilot account (W01–W03)

One supervised message, sent by the operator from a terminal, to the operator's own pilot
member account in Brave. Nothing is sent by an agent. Expect a real DM to arrive in Circle.

### Preparation

- Pilot account: a member of community `1272` that the operator controls, with an email the
  operator can read. Use a **second** account if possible, because the token owner messaging
  themself is a known diagnostic case in EDU (self-DM rejection). If only one account exists,
  record that fact in the table; the self-DM result is then W02b.
- Two tokens to try: the existing `CIRCLE_API_TOKEN` (sync token) and the new dedicated
  messaging token from section B. Two header forms each: `Token` and `Bearer`.
- Keep bodies in a private directory outside any repo and delete them afterwards.

```sh
mkdir -p ~/Private/circle-dm-trial && cd ~/Private/circle-dm-trial
read -rs CIRCLE_TRIAL_TOKEN      # paste the token; nothing is echoed or stored in history
export CIRCLE_TRIAL_TOKEN
export RECIPIENT="pilot-account@example.test"   # the pilot member's Circle email
```

Body: the same shape Phase 3 sends (a two-paragraph rich-text document). The link is a
harmless placeholder for the trial.

```sh
cat > body.json <<'EOF'
{
  "user_email": "RECIPIENT_PLACEHOLDER",
  "rich_text_body": {
    "type": "doc",
    "content": [
      { "type": "paragraph", "content": [ { "type": "text", "text": "10x CLI login test: this message checks delivery only. Link: https://example.invalid/auth/circle/approve" } ] },
      { "type": "paragraph", "content": [ { "type": "text", "text": "Approval links expire after 15 minutes." } ] }
    ]
  }
}
EOF
sed -i '' "s/RECIPIENT_PLACEHOLDER/$RECIPIENT/" body.json
```

### One attempt (repeat per token × header form, but stop at the first accepted pair)

```sh
SCHEME=Token   # then Bearer if Token is rejected
curl -sS -o response.json -w 'HTTP %{http_code}\n' \
  --max-time 5 \
  -X POST https://app.circle.so/api/admin/v2/messages \
  -H "Authorization: $SCHEME $CIRCLE_TRIAL_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @body.json
# Inspect the shape only; never paste the body anywhere shared:
python3 -c "import json;d=json.load(open('response.json'));print(sorted(d.keys()) if isinstance(d,dict) else type(d))"
```

Reading the result:

- `200` and a `chat_room_message` object → **sent**. Check the Circle inbox of the pilot
  account and note who appears as sender (name and role).
- `401` "You cannot perform this action." → this token or header form is **rejected**; try the
  other header form, then the other token. A 401 on both forms for `CIRCLE_API_TOKEN` is the
  expected outcome for a sync-only token.
- `422` "Failed to create chat room." → the token is accepted but the room could not be
  created: self-DM, a non-member recipient, or blocked messages. Record and continue with W03.
- `429` → wait 60 s before any retry; a single trial should never reach this.
- Anything else (5xx, timeout) → **unknown**; do not resend within 5 minutes, then retry once.

Do not send more than one message per (token, header) pair. The whole trial should send at
most a handful of DMs.

### W03: recipient with member messages disabled

1. In the pilot account (as that member): *Profile* → *Settings* → *Notifications* /
   *Messaging* → turn off direct messages from members (the exact label varies; record it).
2. Repeat the single accepted attempt from above once.
3. Record: did the admin DM still arrive, and what HTTP status came back.
4. Re-enable messaging afterwards.

### Result table (fill in; this table is the Phase 1 output)

| Id | Question | Result | Evidence (status, shape, screenshot name; no secrets) |
| --- | --- | --- | --- |
| W01a | `CIRCLE_API_TOKEN` accepted by the messaging endpoint? With which header form? | Token: … / Bearer: … | |
| W01b | Dedicated messaging token accepted? With which header form? | Token: … / Bearer: … | |
| W01 | Chosen production pair → value of `CIRCLE_MESSAGING_AUTH_SCHEME` | `Token` / `Bearer` | |
| W02a | Sender shown in Circle (name, role, "admin" badge?) | | |
| W02b | DM to the token owner's own account: accepted or `422`? | | |
| W03 | Member messages disabled on the recipient: DM delivered? HTTP status? | | |

### After the trial

- Delete `~/Private/circle-dm-trial` (`rm -rf`), `unset CIRCLE_TRIAL_TOKEN`.
- If the dedicated token was used from a terminal, rotate it before it becomes the production
  secret, or accept the exposure explicitly in the table.
- Copy the table into `context/changes/cli-circle-login/runbooks/live-dm-check.md` (Phase 1
  artifact) and only then check rows 1.1 and 1.2 in `plan.md` yourself. Set
  `CIRCLE_MESSAGING_AUTH_SCHEME` in `wrangler.toml` to the W01 value if it differs from
  `Token`; that is a one-line config commit, not a code change.

---

## D. Release slot

Before Phase 7 integration, agree the CLI release slot with the `p0-cli-release` session or
owner. This change does not take over its workflow, versioning, release tokens, candidate
variables or evidence pointers. On 2026-09-13 no session named `p0-cli-release` was reachable
from this machine; the request is recorded in the run report and must be raised by the
operator or relayed once that session is up.
