# Wymagania sieciowe 10x-cli (urządzenie służbowe)

Dokument dla zespołów security / sysadmin (firewall, proxy, EDR, MDM). Nie wymaga znajomości produktu.

**10x-cli** (`@przeprogramowani/10x-cli`) to program w terminalu: loguje uczestnika kursu 10xDevs i pobiera materiały lekcji na dysk. Cała komunikacja z usługami 10xDevs jest **wychodząca** (urządzenie nawiązuje połączenie). CLI **nie otwiera portu nasłuchującego** i **nie wgrywa kodu źródłowego projektu** na serwer.

Maszynowy spis hostów: [`network-allowlist.json`](network-allowlist.json).

---

## English summary (allowlist)

All rows are **outbound only**. Protocol is **HTTPS / TLS on TCP 443** unless noted.

| Hostname | Port / proto | Purpose | When used | Required? | Who connects |
|----------|--------------|---------|-----------|-----------|--------------|
| `10x-toolkit-api.przeprogramowani.workers.dev` | 443 / HTTPS | Delivery API: login, token refresh, membership, catalog, lessons, artifacts, `/health` | Login and every authenticated command (`auth`, `list`, `get`, `sync`, `doctor`) | **Yes.** Without it the tool cannot log in or fetch content. | CLI process |
| `registry.npmjs.org` | 443 / HTTPS | Install / update the public npm package; `10x doctor` version check | Install (`npx` / `npm install -g`); doctor (best-effort, 2s) | **Yes for npm/npx install.** Doctor still passes if the lookup fails. Not needed for a standalone GitHub-release binary except for later npm upgrades. | npm / CLI process |
| `toolkit.przeprogramowani.pl` | 443 / HTTPS | Magic-link callback (`/auth/callback`) | Email login: user clicks the link in the browser | **Yes for email login.** The CLI process does not call this host (its API allowlist is the `workers.dev` name only). | Browser |
| `10xbench.ai` | 443 / HTTPS | Public leaderboard `GET /api/leaderboard.json` | `10x bench` only | No. Core course download still works. | CLI process |
| `github.com` | 443 / HTTPS | `git clone` of the bench-kit template; optional binary from GitHub Releases | `10x bench-kit init/update`; optional binary install | No for course download. Required for bench-kit. Git may also probe the user’s existing `origin` remote (any host). | CLI (`git`) / browser |
| `10xdevs.pl` | 443 / HTTPS | Enrolment site | Printed in some error hints; not fetched by the CLI | No | Browser (human) |
| `app.circle.so` | 443 / HTTPS | Circle community (read the login DM) | Circle login method, in the user’s browser/app | **Not required on the device for the CLI process** (server-side only from 10x infrastructure). Humans typically need Circle in a browser to open the DM. | Browser (human), not CLI |

**Not required on the device** (do not add these for 10x-cli): `npm.pkg.github.com`, `*.r2.cloudflarestorage.com`, Cloudflare R2 presigned download hosts, `platforma.przeprogramowani.pl` (EDU archives — a different product path), `api.github.com` (release automation, not the user CLI), Sentry ingest hosts (Worker-side only).

---

## 1. Co trzeba odblokować

Kierunek zawsze: **urządzenie → internet** (egress). Wejście z internetu na stację nie jest potrzebne.

### 1.1 Proces CLI (maszyna → serwer)

| Host | Port | Po co | Kiedy | Wymagane |
|------|------|-------|-------|----------|
| `10x-toolkit-api.przeprogramowani.workers.dev` | 443 | API kursu: logowanie, odświeżanie tokenu, lista lekcji, treść lekcji jako JSON | Logowanie i każde polecenie z sesją | Tak. Bez tego: logowanie, `list`, `get`, `sync`, diagnostyka API w `doctor` nie działają. |
| `registry.npmjs.org` | 443 | Pakiet `@przeprogramowani/10x-cli` (tarball). `10x doctor` robi `GET …/latest` (timeout 2 s) | Instalacja / aktualizacja npm; `doctor` | Tak przy instalacji przez npm/npx. `doctor` przy blokadzie **nie pada** — pokazuje lokalną wersję i „update check skipped”. |
| `10xbench.ai` | 443 | `GET /api/leaderboard.json` (bez logowania) | Tylko `10x bench` | Nie |
| `github.com` | 443 | `git clone --depth 1 https://github.com/przeprogramowani/10x-bench-kit` | Tylko `10x bench-kit` | Nie dla kursu. Dla bench-kit: tak. |

CLI **nie** woła `toolkit.przeprogramowani.pl` jako API. Zmienna `API_BASE_URL` akceptuje wyłącznie ten host `workers.dev` (HTTPS) albo pętlę zwrotną `http://localhost` / `http://127.0.0.1` (środowisko deweloperskie autorów narzędzia, nie stacja kursanta).

Treść lekcji idzie **przez to samo API** (JSON). CLI nie pobiera archiwów ZIP z R2 ani z platformy EDU. Worker 10x czyta prywatny bucket R2 po swojej stronie — stacja kursanta nie łączy się z `*.r2.cloudflarestorage.com`.

`npm.pkg.github.com` jest używany w infrastrukturze wewnętrznej 10xDevs, nie przez pakiet publiczny. `.npmrc` CLI wskazuje `https://registry.npmjs.org/`.

### 1.2 Przeglądarka użytkownika (nie proces `10x`)

CLI **nie otwiera przeglądarki** i nie startuje lokalnego serwera callback (brak `localhost:port` przy logowaniu). Użytkownik klika link we własnej przeglądarce.

| Host | Kiedy | Uwagi |
|------|-------|--------|
| `toolkit.przeprogramowani.pl` | Logowanie mailem (`10x auth`) | Magic link z e-maila prowadzi na `/auth/callback`. To **inna nazwa** niż API CLI. |
| `10x-toolkit-api.przeprogramowani.workers.dev` | Logowanie Circle (`10x auth --method circle`) | Link zatwierdzenia w wiadomości Circle jest budowany z originu żądania CLI, czyli z hosta `workers.dev`. Przeglądarka musi więc dosięgnąć tego samego hosta co proces CLI. |
| `app.circle.so` | Odczyt wiadomości Circle | Proces CLI **nigdy** nie łączy się z Circle. API Circle woła serwer 10x. Użytkownik zwykle otwiera Circle w przeglądarce, żeby kliknąć link. |
| `10xdevs.pl` | Zapis na kurs (komunikaty błędu) | Tylko podpowiedź w tekście błędu. |
| `10xbench.ai` | Opcjonalnie strona rankingu | CLI i tak woła JSON bezpośrednio. |

### 1.3 Ścieżki opcjonalne (nie kurs)

| Host | Kiedy |
|------|--------|
| `github.com` oraz CDN wydań GitHub (często `objects.githubusercontent.com` / `release-assets.githubusercontent.com`) | Pobranie standalone binary z GitHub Releases zamiast npm. Dokładny host assetu: **do potwierdzenia** (zależy od aktualnego mechanizmu GitHub). |
| Dowolny host z `git remote origin` | `10x bench-kit` może zrobić `git ls-remote` wobec originu repozytorium, w którym użytkownik uruchomił komendę. |
| `registry.npmjs.org` (ponownie) | Komentarz w CLI: bootstrap szablonu bench-kit może odpalić `npm ci` w sklonowanym katalogu. |

---

## 2. Protokół

- **HTTPS (TLS) na 443.** W kodzie CLI nie ma WebSocket, SSE ani HTTP/2-only API. Logowanie to zwykłe `POST`/`GET` i **polling HTTP**.
- Timeout żądania API i 10xbench: **30 s**. Health w `doctor`: **5 s**. Sprawdzenie wersji na npm: **2 s**.
- Logowanie e-mail: poll `GET /auth/verify` co **2 s**, budżet **5 minut**.
- Logowanie Circle: poll `POST /auth/circle/poll`; interwał i `expires_in` przychodzą z serwera (domyślnie te same 2 s / 5 min, jeśli serwer nie poda innych). Przy `400 slow_down` CLI zwiększa przerwę o **5 s**.
- User-Agent: `10x-cli`.
- Brak lokalnego callbacku OAuth — nie trzeba otwierać portów przychodzących.

### TLS interception (MITM proxy, korporacyjny CA)

W źródle CLI **nie ma** własnej obsługi proxy ani własnego magazynu CA. Używa wbudowanego `fetch` runtime’u.

| Mechanizm | Stan |
|-----------|------|
| `NODE_EXTRA_CA_CERTS` | Zmienna Node.js: dodatkowe CA w PEM. Działa dla CLI zainstalowanego przez npm, o ile proces to Node. Nie jest czytana przez kod 10x-cli — tylko przez runtime. |
| Magazyn CA systemu (Keychain / Windows store) | Node **nie** jest skonfigurowany w CLI na `--use-system-ca`. Czy bundled Node użyje systemowego magazynu: **do potwierdzenia** (zależne od wersji Node na stacji). |
| `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` | W kodzie CLI **nie** są ustawiane. `npm` / `npx` przy instalacji zwykle je honorują. Wbudowane `fetch` w Node 20 (minimalne `engines`) **nie** używa tych zmiennych, dopóki nie włączono `NODE_USE_ENV_PROXY=1` (wsparcie `fetch` od Node 24). Na Node 20–22 proxy dla samego `10x get` / `10x auth`: **do potwierdzenia / najpewniej nie** bez dodatkowego agenta. |
| Skompilowany binary (`bun build --compile`) | Inny runtime niż Node. Honorowanie `NODE_EXTRA_CA_CERTS` / `HTTPS_PROXY`: **do potwierdzenia**. |

Praktycznie: przy SSL inspection na Node 20 najpewniejsza ścieżka to `NODE_EXTRA_CA_CERTS` wskazujący korporacyjny root CA **oraz** odblokowanie hostów bez łamania TLS, jeśli inspection psuje `fetch`.

---

## 3. Wymagania lokalne

| Składnik | Wymagane? |
|----------|-----------|
| Node.js **≥ 20** | Tak dla npm/npx. Jedyna zadeklarowana zależność runtime. |
| npm / npx | Tak przy instalacji z npm. Nie przy standalone binary. |
| git | Tylko `10x bench-kit`. |
| Docker / Podman | Nie do działania CLI. Bench-kit ostrzega, że późniejsze uruchomienia benchmarku mogą ich potrzebować. |
| Porty nasłuchujące CLI | Brak. |
| Systemy | macOS, Linux, Windows (testy CI: Ubuntu i Windows). |

**Pliki na dysku (dane uwierzytelniające):**

| System | Katalog | Pliki |
|--------|---------|--------|
| macOS / Linux | `$XDG_CONFIG_HOME/10x-cli` albo `~/.config/10x-cli` | `auth.json` (tryb katalogu `0700`, plik `0600`), `config.json` (preferencja narzędzia AI) |
| Windows | `%APPDATA%\10x-cli` | te same nazwy |

`auth.json` (schemat v1) trzyma: adres e-mail, `access_token`, `refresh_token`, `expires_at`, `created_at`, opcjonalnie `method` (`email` \| `circle`). To tokeny sesji kursu, nie hasło do Circle.

Artefakty lekcji lądują w katalogu projektu (np. `.claude/skills/`, `CLAUDE.md`) — lokalnie, pod kontrolą użytkownika.

Projekty ćwiczeniowe z kursu mogą później uruchamiać własne serwery deweloperskie (localhost). To **nie jest** część 10x-cli.

---

## 4. Co wychodzi z urządzenia (prywatność)

| Dane | Kiedy | Uwagi |
|------|-------|--------|
| Adres e-mail | `10x auth` | Wysyłany do API. Zapisywany lokalnie w `auth.json`. |
| Tokeny JWT (access + refresh) | Logowanie; potem `Authorization: Bearer` przy API; odświeżenie przy wygaśnięciu | Tylko do API 10x. Access ok. 1 h, refresh ok. 30 dni (po stronie serwera). |
| Hostname systemu i krótki opis OS | Tylko start logowania Circle | Pole opcjonalne w `POST /auth/circle/start` (max 128 / 64 znaki). |
| User-Agent `10x-cli` | Każde `fetch` CLI | |
| — | — | **Kod źródłowy projektu nie jest wysyłany.** CLI tylko pobiera JSON lekcji i zapisuje pliki lokalnie. |
| Telemetria / Sentry / analytics w CLI | — | **Brak** w kodzie CLI. Sentry jest po stronie Workera API, nie ze stacji kursanta. |
| `10x doctor` → npm | Opcjonalny GET wersji | Bez tokenu, bez e-maila. |
| `10x bench` | GET publicznego JSON | Bez tokenu. |

---

## 5. Narzędzia AI (osobna allowlista)

10x-cli **nie wywołuje** OpenRouter, Anthropic, OpenAI ani Google. Zapisuje pliki pod wybrane narzędzie (`--tool`). Ruch modelu to ruch **tego narzędzia**, nie CLI.

| Profil `--tool` | Oficjalne wymagania sieciowe dostawcy |
|-----------------|----------------------------------------|
| `claude-code` | [Claude Code — enterprise network](https://docs.claude.com/en/docs/claude-code/network-config) |
| `cursor` | [Cursor — network configuration](https://cursor.com/docs/enterprise/network-configuration) |
| `copilot` | [GitHub Copilot allowlist](https://docs.github.com/copilot/reference/copilot-allowlist-reference) |
| `codex` | [Codex — agent approvals & security (network)](https://developers.openai.com/codex/agent-approvals-security/) — pełnej korporacyjnej listy hostów dla lokalnego CLI w dokumentacji OpenAI nie znaleziono (**do potwierdzenia** u dostawcy). |
| `gemini` | CLI Gemini nie ma jednej strony „corporate allowlist”; pokrewny produkt: [Gemini Code Assist network access](https://developers.google.com/gemini-code-assist/docs/network-access) (**do potwierdzenia** dla samego Gemini CLI). |
| `kiro` | [Kiro — firewalls and proxies](https://kiro.dev/docs/web/firewalls/) |
| `devin-desktop` (alias `windsurf`) | [Devin Desktop — domains to allowlist](https://docs.devin.ai/desktop/troubleshooting/windsurf-common-issues) |
| `generic` | Brak dostawcy — tylko lokalne pliki `.ai/` |

---

## 6. Diagnostyka dla administratora

### 6.1 Szybki test hostów

```bash
curl -I --max-time 10 https://10x-toolkit-api.przeprogramowani.workers.dev/health
curl -I --max-time 10 https://registry.npmjs.org/@przeprogramowani/10x-cli/latest
curl -I --max-time 10 https://toolkit.przeprogramowani.pl/auth/callback
curl -I --max-time 10 https://10xbench.ai/api/leaderboard.json
curl -I --max-time 10 https://github.com/przeprogramowani/10x-bench-kit
```

Oczekiwanie: odpowiedź TLS + HTTP (niekoniecznie 200 na każdym URL — ważny jest sam fakt zestawienia TLS, nie treść). Na stacji użytkownika: `10x doctor` (sprawdza API; lookup npm jest opcjonalny).

### 6.2 Typowe komunikaty CLI przy blokadzie

Cytaty z kodu — szukaj ich w logu / stderr:

| Sytuacja | Komunikat |
|----------|-----------|
| API niedostępne (`auth` / `list` / `get` / `sync`) | `Could not reach the 10x-toolkit API.` |
| `doctor` — API, timeout 5 s | `{url} did not respond within 5s.` |
| `doctor` — API, inny błąd sieci | `{url} is unreachable.` |
| `doctor` — npm zablokowany | `10x-cli {wersja} (update check skipped).` (to **nie** jest błąd) |
| `10x bench` | `Could not reach 10xbench.ai.` |
| `10x bench-kit` | `Could not download the template from https://github.com/przeprogramowani/10x-bench-kit.` |
| TLS / intercept psujący `fetch` | `network_error` oraz surowy komunikat runtime (np. certyfikat); CLI nie ma osobnej etykiety „proxy”. |

Kody wyjścia: `0` sukces, `1` błąd, `2` użycie, `3` brak sesji, `4` brak uprawnień, `5` nie znaleziono. `doctor` przy padniętym API kończy kodem **78**.

---

## 7. Jak ten spis jest utrzymywany

1. Kanoniczna lista hostów w repozytorium: [`docs/network-allowlist.json`](network-allowlist.json).
2. Test `tests/network-allowlist.test.ts` skanuje `src/` i **failuje**, gdy pojawi się nowy host `http(s)://…` spoza listy.
3. Zmiana hosta w kodzie = ten sam PR aktualizuje JSON **oraz** ten dokument.

Wersja dokumentu: 2026-09-18, względem 10x-cli `1.23.0` (gałąź dokumentacji). Hosty API potwierdzone w publicznym Workera; niestandardowa domena `toolkit.przeprogramowani.pl` wynika z konfiguracji callbacku logowania (nie z `routes` w `wrangler.toml` w git — przypięcie domeny jest w panelu Cloudflare).
