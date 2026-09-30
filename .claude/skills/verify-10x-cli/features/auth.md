# Sign in and out

A learner signs in with a magic link sent to their email, checks who they are signed in as
and which courses they can reach, and signs out, which deletes the local credentials.

## Sub-features

- `auth-login-email` requests a magic link and waits until it is clicked.
- `auth-status` reports the signed-in email, token validity and available courses.
- `auth-logout` deletes local credentials.
- `auth-required` makes content commands fail with exit `3` when signed out.

## How to get to it (user POV)

- Run `10x auth` and choose `Email magic link`.
- Run `10x auth --email <email>` (still asks for the method in a TTY).
- Run `10x auth --status`.
- Run `10x auth --logout`.

## Driving it with verify.sh

Preconditions:

- Baseline run, **no** `seed-auth` (or `$V cli logout -- auth --logout` first).
- `$V doctor` prints `info not logged in`.

- **Signed-out guard.** Run `$V cli list-anon -- list`. Exit `3`, `error.code` is `auth_required`.
- **Request link.** Run `$V tty login -- auth --email learner@example.test`, then
  `$V wait-screen 'How do you want to sign in'`. The method menu shows
  `Email magic link` selected.
- **Choose email.** Run `$V keys Enter` and `$V wait-screen 'Check your inbox'`. The screen
  reads `Magic link sent to learner@example.test`.
- **Click the link.** Run `$V click`. It prints `clicked magic link for session <id>`.
- **Signed in.** Run `$V wait-screen '10x exited'` and `$V screen login-done`. The screen
  shows `Authenticated`, `Signed in as learner@example.test.` and `[10x exited 0]`.
- **Status.** Run `$V cli status -- auth --status`. Exit `0`; `data.email` is
  `learner@example.test`, `data.is_valid` is `true`, `data.courses[0].slug` is `10xdevs3`.
- **Persistence.** Run `$V snapshot after-login`. `config/10x-cli/auth.json` exists.
- **Logout.** Run `$V cli logout -- auth --logout`. Exit `0`, `data.logged_out` is `true`.
  Then `$V cli status2 -- auth --status`: exit `3`, `error.code` `auth_required`.

## Gotchas

- `--email` does not skip the method menu in a TTY; the first screen is always the menu.
- Non-TTY `auth --email` polls every 2 s for up to 5 minutes and blocks the helper; drive
  login through `tty`, not `cli`.
- `$V click` clicks the newest unclicked session only. A second `auth` run creates a new
  session; click after the `Check your inbox` screen, not before.
- `seed-auth` writes a fake token with a 1-hour expiry; expired or near-expiry tokens make
  the CLI call `/auth/refresh` (visible in `requests.log`).
