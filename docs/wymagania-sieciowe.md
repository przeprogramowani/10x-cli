# Wymagania sieciowe 10x-cli

English: [network-requirements.md](network-requirements.md).  
Machine-readable host list: [network-allowlist.json](network-allowlist.json).

10x-cli (`@przeprogramowani/10x-cli`) loguje użytkownika kursu 10xDevs i zapisuje materiały lekcji na dysk. Nie otwiera portu nasłuchującego. Nie wysyła kodu źródłowego projektu.

---

## Allowlista

Wszystkie wpisy: HTTPS, TCP 443, z urządzenia.

### Wymagane do kursu

| Host | Port | Protokół | Cel | Bez tego |
|------|------|----------|-----|----------|
| `10x-toolkit-api.przeprogramowani.workers.dev` | 443 | HTTPS | Logowanie, odświeżanie tokenu, lista i treść lekcji, `10x doctor` | Nie działa `10x auth`, `list`, `get`, `sync`; `doctor` zgłasza, że API jest nieosiągalne |
| `registry.npmjs.org` | 443 | HTTPS | Instalacja i aktualizacja `@przeprogramowani/10x-cli` (`npx` / `npm install -g`) | Nie da się zainstalować ani zaktualizować pakietu npm. `10x doctor` nadal działa — pomija sprawdzenie wersji |
| `toolkit.przeprogramowani.pl` | 443 | HTTPS | Link z e-maila logowania (`/auth/callback`) otwierany w przeglądarce | Logowanie mailem (`10x auth`) nie dokończy się po kliknięciu linku |

`10x-cli` woła API wyłącznie na `10x-toolkit-api.przeprogramowani.workers.dev`. `toolkit.przeprogramowani.pl` jest tylko dla przeglądarki przy logowaniu mailem.

### Przeglądarka — logowanie Circle

| Host | Port | Protokół | Cel | Bez tego |
|------|------|----------|-----|----------|
| `10x-toolkit-api.przeprogramowani.workers.dev` | 443 | HTTPS | Strona zatwierdzenia z wiadomości Circle | `10x auth --method circle` czeka, aż link wygaśnie |
| `app.circle.so` | 443 | HTTPS | Odczyt wiadomości Circle z linkiem | Użytkownik nie otworzy wiadomości (proces `10x` nie łączy się z tym hostem) |

### Opcjonalne

| Host | Port | Protokół | Cel | Bez tego |
|------|------|----------|-----|----------|
| `10xbench.ai` | 443 | HTTPS | Ranking modeli (`10x bench`) | `10x bench` nie działa; pobieranie lekcji bez zmian |
| `github.com` | 443 | HTTPS | `git clone` szablonu `10x-bench-kit`; opcjonalny binary z GitHub Releases | `10x bench-kit` nie pobierze szablonu. Kurs (`get` / `sync`) bez zmian |
| `objects.githubusercontent.com` | 443 | HTTPS | CDN assetów GitHub Releases (do potwierdzenia) | Pobranie standalone binary z Releases może się nie udać |
| `release-assets.githubusercontent.com` | 443 | HTTPS | CDN assetów GitHub Releases (do potwierdzenia) | j.w. |
| `10xdevs.pl` | 443 | HTTPS | Strona zapisu na kurs (tylko w komunikacie błędu) | Brak wpływu na CLI |

`10x bench-kit` może też wywołać `git ls-remote` wobec `origin` repozytorium, w którym uruchomiono komendę — to dowolny host z konfiguracji git użytkownika.

---

## Protokół i TLS

- HTTPS / TLS, TCP 443. Logowanie: `POST`/`GET` i powtarzany HTTP (co 2 s, do 5 min). Brak WebSocket i SSE.
- Timeout API i 10xbench: 30 s. `doctor` → API: 5 s. `doctor` → npm: 2 s.
- User-Agent: `10x-cli`.
- CLI nie nasłuchuje na żadnym porcie.

Przy korporacyjnym TLS inspection (własny CA):

| Ustawienie | Fakt |
|------------|------|
| `NODE_EXTRA_CA_CERTS` | Node.js doda plik PEM z CA. Działa, gdy `10x` uruchamia Node (instalacja npm). |
| Magazyn CA systemu | CLI nie włącza `--use-system-ca`. |
| `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` | `npm` / `npx` zwykle je honorują. `fetch` w Node 20 (minimum CLI) ich nie używa bez `NODE_USE_ENV_PROXY=1` (Node 24+). Na Node 20–22 proxy dla `10x auth` / `10x get`: do potwierdzenia. |
| Standalone binary | Inny runtime niż Node. `NODE_EXTRA_CA_CERTS` / `HTTPS_PROXY`: do potwierdzenia. |

Jeśli inspection psuje TLS: wskaż korporacyjny root w `NODE_EXTRA_CA_CERTS` albo wyłącz inspection dla hostów z tabeli.

---

## Na urządzeniu

| Składnik | Wymagane |
|----------|----------|
| Node.js ≥ 20 | Tak przy instalacji npm/npx |
| npm / npx | Tak przy instalacji z npm. Nie przy standalone binary |
| git | Tylko `10x bench-kit` |
| Docker / Podman | Nie dla CLI |
| System | macOS, Linux, Windows |

Tokeny sesji (e-mail, access/refresh JWT, data ważności) — nie hasło do Circle:

| System | Katalog | Pliki | Uprawnienia (POSIX) |
|--------|---------|-------|---------------------|
| macOS / Linux | `$XDG_CONFIG_HOME/10x-cli` lub `~/.config/10x-cli` | `auth.json`, `config.json` | katalog `0700`, `auth.json` `0600` |
| Windows | `%APPDATA%\10x-cli` | te same | — |

Materiały lekcji zapisują się w katalogu projektu użytkownika (np. `.claude/skills/`, `CLAUDE.md`).

---

## Dane wychodzące z urządzenia

| Dane | Kiedy |
|------|-------|
| Adres e-mail | `10x auth`; zapis w `auth.json` |
| JWT access + refresh | Logowanie i każde wywołanie API (`Authorization: Bearer`) |
| Hostname i krótki opis OS | Tylko start `10x auth --method circle` |
| User-Agent `10x-cli` | Każde żądanie CLI |
| GET wersji pakietu (bez tokenu) | `10x doctor` → `registry.npmjs.org` |
| Publiczny JSON rankingu (bez tokenu) | `10x bench` |

Kod źródłowy projektu nie jest wysyłany.

---

## Narzędzia AI (osobna allowlista)

10x-cli nie woła Anthropic, OpenAI, Google ani OpenRouter. Zapisuje pliki pod wybrane `--tool`. Ruch modelu to ruch tego narzędzia.

| `--tool` | Wymagania sieciowe dostawcy |
|----------|------------------------------|
| `claude-code` | [Claude Code — enterprise network](https://docs.claude.com/en/docs/claude-code/network-config) |
| `cursor` | [Cursor — network configuration](https://cursor.com/docs/enterprise/network-configuration) |
| `copilot` | [GitHub Copilot allowlist](https://docs.github.com/copilot/reference/copilot-allowlist-reference) |
| `codex` | [Codex — network](https://developers.openai.com/codex/agent-approvals-security/) — pełna lista hostów lokalnego CLI: do potwierdzenia u OpenAI |
| `gemini` | [Gemini Code Assist network access](https://developers.google.com/gemini-code-assist/docs/network-access) — do potwierdzenia dla Gemini CLI |
| `kiro` | [Kiro — firewalls and proxies](https://kiro.dev/docs/web/firewalls/) |
| `devin-desktop` (alias `windsurf`) | [Devin Desktop — domains](https://docs.devin.ai/desktop/troubleshooting/windsurf-common-issues) |
| `generic` | Brak dostawcy |

---

## Weryfikacja

```bash
curl -I --max-time 10 https://10x-toolkit-api.przeprogramowani.workers.dev/health
curl -I --max-time 10 https://registry.npmjs.org/@przeprogramowani/10x-cli/latest
curl -I --max-time 10 https://toolkit.przeprogramowani.pl/auth/callback
curl -I --max-time 10 https://10xbench.ai/api/leaderboard.json
curl -I --max-time 10 https://github.com/przeprogramowani/10x-bench-kit
```

Ważne jest zestawienie TLS (niekoniecznie HTTP 200). Na urządzeniu: `10x doctor`.

| Blokada | Komunikat CLI |
|---------|----------------|
| API | `Could not reach the 10x-toolkit API.` |
| `doctor`, timeout 5 s | `{url} did not respond within 5s.` |
| `doctor`, inny błąd sieci | `{url} is unreachable.` |
| npm (nie blokuje `doctor`) | `10x-cli {wersja} (update check skipped).` |
| `10x bench` | `Could not reach 10xbench.ai.` |
| `10x bench-kit` | `Could not download the template from https://github.com/przeprogramowani/10x-bench-kit.` |
| zły certyfikat / intercept | `network_error` i komunikat runtime |

Kody wyjścia: `0` sukces, `1` błąd, `2` użycie, `3` brak sesji, `4` brak uprawnień, `5` nie znaleziono. `doctor` przy martwym API: **78**.

---

## Aktualizacja tej listy

Kanoniczne hosty: [network-allowlist.json](network-allowlist.json). Test `tests/network-allowlist.test.ts` failuje, gdy `src/` albo ten dokument / wersja angielska dodadzą hosta spoza listy. Nowy host = ten sam PR: JSON + PL + EN.
