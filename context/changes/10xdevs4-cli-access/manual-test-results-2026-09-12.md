# Wyniki wykonania manual-test-guide.md — 12.09.2026

Wykonawca: Codex, macOS, około 18:30–18:37 Europe/Warsaw.

**Wynik: wszystkie 14 pozycji karty przeszły kryteria funkcjonalne. Jedna uwaga dotycząca zbędnych aktualizacji w `sync`.** Wykonano również opcjonalne profile i interaktywny wybór pominięcia konfliktu reguł. Nie oceniano wyglądu strony logowania ani automatycznego wczytania skilli przez aplikacje Codex/Claude/Cursor.

## Co rzeczywiście uruchomiono

Wykonano komendy z [instrukcji](manual-test-guide.md) w pseudoterminalach (`script`), na jednej świeżej sesji launchera `/tmp/10x-v4-manual/start.sh`. Logowanie przeszło przez link, callback i oczekiwanie CLI na wynik. Linki localhost otwarto klientem HTTP: odpowiedź 200, tekst `Zalogowano!`, zakończone logowanie CLI. Nie był to test wizualny w przeglądarce; narzędzie sterowania przeglądarką nie było dostępne.

- Binary: `/Users/admin/code/10x-cli-v4-delivery/dist/10x`; bez przebudowy w tej próbie.
- SHA-256 binary: `04660ff6c8269cf4c8e88e7c310c206054edfe4108e8143bda1e7ad7811b766f`.
- SHA-256 wykonanej wersji instrukcji, przed uzupełnieniem karty: `7884ddd02c1fa6af3ff0fe1c82445598661b2b5def3310ccb90e8a3b9cf7bf30`.
- Lokalne API: `http://127.0.0.1:54136`; po zakończeniu zatrzymane poleceniem `quit`.
- Katalog próby: `/var/folders/c1/sf6gc0052_d0dj3y0kp_wd3r0000gp/T/10x-coordinated-XsOeNR`. Projekty pozostawiono do obejrzenia.
- V3: kopia rzeczywiście opublikowanych materiałów z `/private/tmp/10x-v4-v3-e2e-published-fixture-20260912/objects/10xdevs3`.
- V4: `/tmp/10x-v4-p3-publisher-trial/stage-a`, release `r-691482549457c9f070488f3dc5e9aacd1daceef32d17d434754f48538bc83ed4`, manifest SHA-256 `44d23eb6ac5ea3fa757f8b770e900ae19a0abe8099cc47c639a51a17b5319d03`.

Dowody lokalne: [katalog logów](/tmp/10x-v4-manual-results-20260912), [sprawdzenia i snapshoty](/tmp/10x-v4-manual-results-20260912/checks.json). Pliki w `/tmp` są tymczasowe; niniejszy raport utrwala wnioski. Nie dołączono plików konfiguracji z tokenami.

## Wyniki krok po kroku

| Krok | Wynik | Zaobserwowane zachowanie | Log w katalogu dowodów |
|---|---|---|---|
| 1 | OK | API uruchomione; konta i katalogi projektów odseparowane. | `step01-02.log` |
| 2 | OK funkcjonalnie | V4 zalogowane; lista zawiera dokładnie m1l1–m1l5. Termin w danych: `2026-09-14T06:00:00Z`, czyli 08:00 Warsaw. Lokalny fixture udostępnia moduł do testów przed terminem. Callback sprawdzony przez HTTP. | `step01-02.log`, `02-callback-v4.html` |
| 3 | OK | Dry-run nie utworzył plików projektu ani nie zmienił konfiguracji po zakończonym logowaniu. Pierwszy zapis utworzył binding `10xdevs4`, skille i reguły. | `step03.log`, `step03-04a.log` |
| 4 | OK z uwagą | Wszystkie lekcje pobrane, komplet references w obu skillach, ponowne get bez konfliktów. Sync zachował końcową treść, ale zgłosił 44 aktualizacje — szczegóły niżej. | `step03-04a.log`, `step04b.log`, `step04c-05.log` |
| 5 | OK | Usunięty `10x-stack-assess/references/decision-flow.md` odtworzony z identycznym SHA-256. | `step04c-05.log` |
| 6 | OK | Dopisek `MANUAL-KEEP-SKILL` zachowany bajt w bajt. Sync zgłosił pominięte konflikty; nie pytał o decyzję. | `step06-07a.log` |
| 7 | OK | Własny tekst poza blokiem i edycja wewnątrz bloku przetrwały `sync --force`. W interaktywnym get wybrano Skip; cały plik pozostał identyczny. | `step06-07a.log`, `step07b.log` |
| 8 | OK | Konto v3: login/list/get/sync bez dodatkowego wyboru edycji. Próba zapisu v4: `course_access_denied`, exit 4; nowy katalog pozostał pusty. | `step08a.log` |
| 9 | OK | Po `buy-v4` istniejący projekt nadal v3, bez zmiany treści. Nowy projekt wybrał v4 bez ponownego logowania; JWT został odświeżony o grant v4. | `step09.log` |
| 10 | OK | Konto dual domyślnie wybrało v4. Konto none: `no_access`, exit 4, zero wiadomości i brak zapisanych danych logowania/pliku projektu. | `step10.log` |
| 11a | OK | Blokada: `course_unavailable`, bez zmian w całym projekcie. Po odblokowaniu lista znów dostępna. | `step11a.log`, `step11-unlock.log` |
| 11b | OK | Wycofanie publikacji: `course_unavailable`, binding nadal v4, cały projekt bez zmian. Przywrócenie publikacji przywróciło listę. | `step11b.log`, `step11-restore.log` |
| 11c | OK | Po cofnięciu grantu i wylogowaniu nowe logowanie odrzucone, bez nowej wiadomości. Projekt bez zmian. `auth --status` zakończyło się oczekiwanym `auth_required`, exit 3. | `step11c.log` |
| 12 | OK dla CLI | Claude Code + EN oraz Cursor + PL: poprawne ścieżki, język i binding v4. Każdy wariant: 18 plików skilli/dokumentów identycznych z właściwym bundle. Sync: 0 aktualizacji, 20 bez zmian. | `step12.log` |

Oba skille, `10x-tech-stack-selector` i `10x-stack-assess`, zawierały wszystkie sześć dokumentów: `agent-friendly-criteria.md`, `decision-flow.md`, `eval-cases.md`, `handoff-schema.md`, `residual-interview.md`, `starter-registry.yaml`. Sprawdzono także treść plików.

Dowody zachowania/naprawy plików — SHA-256 przed i po były równe:

| Przypadek | SHA-256 |
|---|---|
| Odtworzony `decision-flow.md` | `8f88998ae05601eb52d8d7038af4310a7b558d8c14ac091668e148b06de4fffd` |
| Skill z lokalnym dopiskiem | `41de76d443c6ed56f6eb72cbf047f0b9303c17eb67205f163724b7965dfdef20` |
| Reguły z własnymi dopiskami | `16e74875ab7aaf9876a9475f7884a22bf7ad9fd3d6e9d24a70eacdb923496ca4` |

## Uwaga: powtarzane aktualizacje przy sync

Po zainstalowaniu pięciu lekcji PL/Codex zwykły `sync` raportował **44 zaktualizowane, 0 nowych, 83 bez zmian, 0 konfliktów**. Powtórzenie odtworzyło wynik. Końcowe bajty treści i binding projektu nie zmieniły się; zmieniły się metadane `.agents/.10x-cli-manifest.json`.

W kumulacyjnych bundle tej próby powtarzające się skille mają różne wygenerowane warianty PL. Na przykład prefiksy SHA-256 universalContent `10x-init/SKILL.md` w m1l1–m1l5 to kolejno `691d9921731d7666`, `c373189733323dfd`, `54dcf072cd54bb28`, `c373189733323dfd`, `108cb8dd38c57d48`. Sync przechodzi przez kolejne lekcje i wraca do końcowego wariantu. Obserwacja wskazuje na zbędne zapisy pośrednie i mało użyteczny licznik aktualizacji; nie stwierdzono utraty danych.

Surowe sprawdzenie `04-repeat-sync-unchanged` ma wynik `false`: porównywało cały projekt, łącznie z manifestem. Zachowano je w dowodach. Osobne `04-repeat-sync-content` ma `true`, z pustą listą zmienionych plików treści. Kryterium kroku 4 — brak duplikatów, zmiany edycji i nieoczekiwanych konfliktów — zostało spełnione, ale pełna bezczynność kolejnego sync nie została osiągnięta.

## Pokrycie automatyczne

Poniższa mapa wynika z odczytu aktualnego kodu testów. Liczby przebiegów pochodzą z wcześniejszych wyników zapisanych w [evidence.md](evidence.md); nie przedstawiam ich jako ponownego uruchomienia podczas tej próby manualnej.

| Obszar instrukcji | Istniejące testy | Zakres / granica |
|---|---|---|
| Login, lista, pięć lekcji, powtórny get/sync, profile i języki | Toolkit `packages/api/src/__tests__/e2e/e2e-cli.test.ts:147` | Prawdziwy proces CLI i lokalny Worker; macierz v3/v4/dual × PL/EN × Claude Code/Codex/Cursor. Porównuje treść wszystkich plików z bundle. |
| Dry-run i binding | CLI `tests/course-command-safety.test.ts`, `tests/project-course.test.ts`; ten sam E2E | Sprawdza brak zapisów i spójność przypisania edycji. |
| References i naprawa braków | E2E porównuje komplet bundle i odtwarza usunięty SKILL.md; CLI `tests/sync-command.test.ts:488` | Dzisiejsza próba dodatkowo usunęła konkretny dokument `stack-assess/references/decision-flow.md`. E2E nie wykonuje dokładnie tego samego usunięcia. |
| Ochrona lokalnej edycji skilla | E2E; CLI `tests/sync-command.test.ts:365` | Rzeczywisty sync zachowuje dopisek. |
| Własne reguły i `--force` | CLI `tests/managed-safety.test.ts:83`, `tests/sync-command.test.ts:524` | Integracja writera/komend pokrywa ochronę bloków. Dzisiejszy rzeczywisty wybór Skip w terminalu uzupełnia tę weryfikację. |
| Zgodność v3, zakup v4, odświeżenie JWT | E2E `:246` i `:323`; CLI `tests/course-selection.test.ts` | Obejmuje także wydane npm CLI 1.20.0 i starsze wersje manifestu. |
| Brak grantu, odmowy między edycjami, wycofanie i blokada | E2E `:352`; Toolkit testy API `auth-courses`, `course-access`, `course-grants`, `me-courses` | Sprawdza odmowę i ochronę lokalnych plików; również scenariusze cofnięcia dostępu w trakcie logowania/refresh. |
| Integralność release i brak mieszania wersji | CLI `tests/content-release.test.ts`, `tests/sync-command.test.ts:455`; E2E | To dodatkowe zabezpieczenia poza podstawowym przebiegiem instrukcji. |
| Pin po squash merge | Toolkit `packages/course-content/src/build/__tests__/source-revisions.test.ts:234` | Odrzuca commit istniejący tylko na branchu; akceptuje wynikowy SHA squash na `origin/master`. Sprawdza także brak zdalnego mastera i niepełną historię. |

Ostatnie udokumentowane wyniki: **29/29 E2E**, **611 testów CLI + 10 smoke**, **807 testów pakietów Toolkit**. Testy automatyczne nie oznaczają jednak zielonego całego wydania: wcześniejszy pełny `ci:local` zakończył się błędem budowania zamrożonego źródła v3, opisanym w `evidence.md`.

Istniejący E2E sprawdza prawidłowe końcowe pliki po sync, ale **nie wymaga zera zapisów/aktualizacji przy kolejnym sync kumulacyjnych lekcji z różnymi wariantami współdzielonego skilla**. To konkretna luka ujawniona tą próbą. Przy poprawce należy dodać regresję z dwiema lekcjami dostarczającymi różne wersje tego samego pliku, a następnie sprawdzić kolejny sync: końcową treść, liczniki i brak ponownych zapisów treści.

Uruchomienie zwykłych testów CLI: `bun test` w worktree CLI. E2E: `pnpm test:e2e:cli` w Toolkit, z wymaganymi wejściami candidate/released CLI i fixture v3/stage v4 opisanymi w konfiguracji harnessu i `evidence.md`. E2E jest także podłączone do workflow CI; ten raport nie potwierdza wykonania zdalnego Windows CI.

## Granice i stan po próbie

- API zatrzymane; projekty testowe zachowane.
- Bez zmian kodu produktu, pinów, PR #30, publikacji czy produkcji w ramach tej próby.
- Nie sprawdzono wizualnego działania strony logowania ani wczytania skilli przez natywne aplikacje.
- Blokada/odblokowanie były sterowane fixture; nie czekano na rzeczywisty termin 14.09.
- Cofnięcie dostępu sprawdzono po wylogowaniu i przy nowym logowaniu; nie dowodzi to natychmiastowego unieważnienia wszystkich wydanych JWT.
- Właściwe źródła na masterze, pełny `ci:local`, Windows CI i rollout pozostają osobnymi warunkami. Nie zmieniono kryteriów Manual ani statusu całego planu na podstawie tej próby.
