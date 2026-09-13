# 10xDevs v4 — ręczny test lokalny krok po kroku

Dokument przygotowany 12.09.2026 dla lokalnego launchera `/tmp/10x-v4-manual/start.sh`.

**Cel:** przejść drogę uczestnika od logowania do pobrania pierwszego tygodnia, sprawdzić komplet dokumentów i ochronę własnych zmian, a następnie potwierdzić, że zakup v4 nie przełącza istniejącego projektu v3.

Zarezerwuj około 30–45 minut. Kroki 1–11 tworzą podstawowy przebieg; krok 12 rozszerza go o drugi język i narzędzie. Wykonuj je po kolei na jednym uruchomieniu API. Wyniki zapisz w tabeli na końcu.

## Zanim zaczniesz

- Użyj dwóch nowych terminali z `zsh` lub `bash`. **Terminal A** obsługuje API i pokazuje linki logowania. **Terminal B** służy do wpisywania komend CLI.
- `t10x` uruchamia przygotowanego kandydata CLI. Używaj tej nazwy zamiast globalnego `10x` lub `npx`, żeby testować właściwą wersję.
- Konta, konfiguracje CLI i projekty są odseparowane. `use10x v4` zmienia konto **i bieżący katalog** na projekt testowy v4. Nie musisz zakładać projektu samodzielnie.
- API korzysta z lokalnego KV/R2. Linki logowania są przechwytywane, żadne prawdziwe maile nie są wysyłane.
- Moduł 1 obu kursów jest w tej próbie odblokowany. Produkcyjny termin v4 pozostaje **14.09.2026, 08:00 Europe/Warsaw**; lokalny test nie potwierdza działania tego terminu na produkcji.
- Materiały pochodzą z zachowanej kopii opublikowanego v3 i zweryfikowanego wydania v4. Ten przebieg nie wymaga merge PR #30 i nie sprawdza końcowego buildu z historycznych pinów Git.

**Ważne:** launcher i dane wejściowe są w `/tmp`. Jeśli zostały usunięte lub po starcie pojawi się błąd brakującej ścieżki `E2E_*`, zatrzymaj próbę i zapisz komunikat. Trzeba odtworzyć te pliki; nie zastępuj ich przypadkowym buildem ani API produkcyjnym. Po zmianie kodu CLI trzeba osobno przebudować `dist/10x` — ten dokument zakłada obecny, sprawdzony plik.

## 1. Uruchom środowisko

**Terminal A:**

```bash
bash /tmp/10x-v4-manual/start.sh
```

Poczekaj na `GOTOWE: http://127.0.0.1:...`. Pozostaw proces uruchomiony.

**Terminal B:**

```bash
source /tmp/10x-v4-manual/env.sh
use10x v4
pwd
```

**Oczekiwany wynik:** informacja `Konto: v4`, a katalog kończy się na `/v4/project` wewnątrz katalogu próby `10x-coordinated-...`.

**Zwróć uwagę:** po ponownym uruchomieniu API powstają nowe konta, port i projekty. Wtedy ponownie wykonaj `source` i `use10x`; stare ustawienia terminala B nie wystarczą. Uruchamiaj jedną próbę naraz.

## 2. Zaloguj uczestnika mającego tylko v4

**Terminal B:**

```bash
t10x auth --email "$TEST_EMAIL"
```

**Terminal A:** znajdź nową linię `[MAIL v4] http://127.0.0.1:.../auth/callback?...`. Otwórz cały link w przeglądarce. Nie szukaj wiadomości w swojej prawdziwej skrzynce.

Wróć do **terminala B**:

```bash
t10x auth --status
t10x list 1 --json
```

**Oczekiwany wynik:**

- Strona linku potwierdza zalogowanie, a oczekujący proces CLI kończy się sukcesem.
- Status pokazuje testowy adres konta v4.
- Lista ma `course: "10xdevs4"`, odblokowany moduł 1 i lekcje `m1l1`–`m1l5`.

**Błąd do zgłoszenia:** żądanie dostępu do v3 przy logowaniu konta v4, brak linku mimo komunikatu o jego wysłaniu albo oczekiwanie CLI po poprawnym otwarciu linku. Link jest jednorazowy — przy kolejnej próbie użyj nowego.

## 3. Sprawdź podgląd bez zapisu, potem pierwszy zapis

**Terminal B, nadal pusty projekt v4:**

```bash
ls -la
t10x get m1l1 --tool codex --lang pl --dry-run
ls -la
```

**Oczekiwany wynik:** widzisz plan pobrania, ale projekt pozostaje pusty. Nie powinny pojawić się `.agents`, `AGENTS.md` ani `.10x-cli.json`.

Teraz wykonaj rzeczywiste pobranie:

```bash
t10x get m1l1 --tool codex --lang pl
cat .10x-cli.json
ls .agents/skills
```

**Oczekiwany wynik:**

- Powstaje `.10x-cli.json` z `course: "10xdevs4"`.
- W `.agents/skills/` są m.in. `10x-init`, `10x-shape` i `10x-prd`.
- Powstaje `AGENTS.md` z blokiem reguł kursu. W tym przebiegu nie wyłączaj ich flagą `--no-course-rules`.
- Główna treść skilli odpowiada wybranemu językowi PL. Nazwy skilli, kod, nazwy plików i część dokumentów pomocniczych mogą pozostać po angielsku — nie traktuj tego samego w sobie jako błędu.

Jeśli CLI poprosi o decyzję, przeczytaj pytanie i zapisz, czego dotyczyło. Nie potwierdzaj w ciemno zastępowania istniejących plików; w świeżym projekcie nie powinno być konfliktu z Twoją wcześniejszą pracą.

## 4. Pobierz resztę tygodnia i obejrzyj dokumenty skilli

**Terminal B:**

```bash
t10x get m1l2 --tool codex --lang pl
ls .agents/skills/10x-tech-stack-selector/references
ls .agents/skills/10x-stack-assess/references
```

W obu katalogach powinny być te dokumenty:

```text
agent-friendly-criteria.md
decision-flow.md
eval-cases.md
handoff-schema.md
residual-interview.md
starter-registry.yaml
```

**Zwróć uwagę:** sama obecność `SKILL.md` nie wystarcza. Otwórz oba `SKILL.md`, wybierz odwołanie do pliku w `references/` i sprawdź, czy wskazany plik jest dostępny w tej samej paczce. Otwórz także `starter-registry.yaml` i `decision-flow.md` — pliki nie mogą być puste ani zawierać komunikatu błędu zamiast dokumentu.

Kontynuuj:

```bash
t10x get m1l3 --tool codex --lang pl
t10x get m1l4 --tool codex --lang pl
t10x get m1l5 --tool codex --lang pl
t10x get m1l5 --tool codex --lang pl
t10x sync --tool codex --lang pl
```

**Oczekiwany wynik:** wszystkie pięć lekcji pobiera się poprawnie; ponowne pobranie ostatniej lekcji i sync nie tworzą duplikatów, nie zmieniają edycji i nie zgłaszają konfliktów w plikach, których nie edytowałeś. Lekcje są kumulacyjne, więc powtarzające się skille między lekcjami są prawidłowe.

## 5. Sprawdź naprawę brakującego pliku

Ten krok usuwa tylko wskazany dokument **w projekcie testowym**. Najpierw sprawdź `pwd` — nadal ma kończyć się na `/v4/project`.

**Terminal B:**

```bash
pwd
shasum -a 256 .agents/skills/10x-stack-assess/references/decision-flow.md
rm .agents/skills/10x-stack-assess/references/decision-flow.md
t10x sync --tool codex --lang pl
shasum -a 256 .agents/skills/10x-stack-assess/references/decision-flow.md
```

**Oczekiwany wynik:** plik wraca, a hash przed usunięciem i po naprawie jest identyczny. Sync ma naprawić brak mimo tego, że wydanie na serwerze się nie zmieniło.

**Błąd do zgłoszenia:** sync twierdzi, że wszystko jest aktualne, ale pliku nadal brakuje.

## 6. Sprawdź ochronę własnej zmiany w skillu

**Terminal B:**

```bash
printf '\nMANUAL-KEEP-SKILL\n' >> .agents/skills/10x-init/SKILL.md
shasum -a 256 .agents/skills/10x-init/SKILL.md
t10x sync --tool codex --lang pl
shasum -a 256 .agents/skills/10x-init/SKILL.md
```

**Oczekiwany wynik:** hash pozostaje identyczny, dopisek nadal jest w pliku, a sync informuje o pominięciu konfliktu. **Zwykły sync nie pyta o decyzję — zachowuje lokalną wersję.** Pominięty konflikt nie musi oznaczać niezerowego kodu wyjścia całej komendy.

Nie używaj tutaj `--force`: dla skilli i promptów oznacza świadome nadpisanie lokalnej wersji. Ochronę reguł pod `--force` sprawdzisz osobno w następnym kroku.

## 7. Sprawdź reguły i tekst poza blokiem kursu

**Terminal B:**

```bash
use10x v4
mkdir "$TENX_TEST_ROOT/v4/rules-project"
cd "$TENX_TEST_ROOT/v4/rules-project"
printf '# Własne reguły projektu\n\nMANUAL-OUTSIDE-RULES\n' > AGENTS.md
t10x get m1l1 --tool codex --lang pl
```

Otwórz `AGENTS.md` w edytorze. Sprawdź, czy własny nagłówek i `MANUAL-OUTSIDE-RULES` pozostały. Znajdź blok pomiędzy:

```text
<!-- BEGIN @przeprogramowani/10x-cli -->
...
<!-- END @przeprogramowani/10x-cli -->
```

**Wewnątrz tego bloku** dodaj osobną linię `MANUAL-INSIDE-RULES`. Nie usuwaj znaczników początku i końca. Zapisz plik.

**Terminal B:**

```bash
shasum -a 256 AGENTS.md
t10x sync --tool codex --lang pl --force
shasum -a 256 AGENTS.md
```

**Oczekiwany wynik:** hash `AGENTS.md` pozostaje identyczny, oba dopiski są zachowane, a konflikt reguł jest pokazany jako pominięty. `--force` nie daje zgody na ciche nadpisanie zmodyfikowanych reguł.

Osobny projekt w tym kroku pozwala sprawdzić `--force` bez nadpisania skilla zmienionego w kroku 6. Jeśli chcesz obejrzeć interaktywne rozwiązanie konfliktu reguł, użyj `t10x get m1l1 --type rules --tool codex --lang pl`; wybierz zachowanie własnej wersji i sprawdź dopiski ponownie.

## 8. Sprawdź konto v3 i odmowę dostępu do v4

**Terminal B:**

```bash
use10x v3
t10x auth --email "$TEST_EMAIL"
```

Otwórz nowy link `[MAIL v3]` w **terminalu A**, a po zalogowaniu wykonaj w **terminalu B**:

```bash
t10x list 1 --json
t10x get m1l1 --tool codex --lang pl
cat .10x-cli.json
t10x sync --tool codex --lang pl
```

**Oczekiwany wynik:** lista i plik przypisania wskazują `10xdevs3`. Nie potrzeba flagi `--course`, zakupu v4 ani migracji projektu.

Teraz w osobnym pustym projekcie tego samego konta sprawdź odmowę:

```bash
mkdir "$TENX_TEST_ROOT/v3/denied-project"
cd "$TENX_TEST_ROOT/v3/denied-project"
t10x get m1l1 --course 10xdevs4 --tool codex --lang pl
ls -la
use10x v3
```

**Oczekiwany wynik:** odmowa dostępu do v4; pusty projekt nie dostaje skilli ani `.10x-cli.json`. Ostatnia komenda wraca do wcześniejszego projektu v3.

Wykonaj ten krok **przed** `buy-v4`, inaczej konto będzie już uprawnione do obu edycji.

## 9. Zasymuluj zakup v4 bez przełączania projektu v3

Warunek początkowy: krok 8 zakończony, konto v3 zalogowane, a jego pierwotny projekt ma już `.10x-cli.json` z edycją v3.

**Terminal A — wpisz samą komendę i Enter:**

```text
buy-v4
```

**Terminal B:**

```bash
use10x v3
t10x list 1 --json
t10x get m1l1 --tool codex --lang pl
cat .10x-cli.json
```

**Oczekiwany wynik:** istniejący projekt nadal wskazuje `10xdevs3`. Dostęp do nowego kursu nie zmienia wcześniej pobranych materiałów na v4.

Następnie przetestuj nowy projekt **tej samej zalogowanej osoby**, bez ponownego logowania:

```bash
mkdir "$TENX_TEST_ROOT/v3/new-project"
cd "$TENX_TEST_ROOT/v3/new-project"
t10x list 1 --json
t10x get m1l1 --tool codex --lang pl
cat .10x-cli.json
```

**Oczekiwany wynik:** nowy projekt wybiera `10xdevs4`, a CLI obsługuje nieaktualne uprawnienia starego tokenu przez odświeżenie sesji. Nie powinieneś potrzebować nowego maila ani ręcznego `--course`.

Sprawdź jeszcze wcześniejszy projekt:

```bash
use10x v3
cat .10x-cli.json
```

Ma pozostać przy v3. `use10x` zawsze wraca do pierwotnego projektu danej tożsamości — nie wywołuj go w środku testu nowego katalogu.

## 10. Sprawdź konto dual i konto bez dostępu

**Terminal B:**

```bash
use10x dual
t10x auth --email "$TEST_EMAIL"
```

Otwórz link `[MAIL dual]` z **terminala A**, potem:

```bash
t10x list 1 --json
t10x get m1l1 --tool codex --lang pl
cat .10x-cli.json
```

**Oczekiwany wynik:** świeży projekt osoby posiadającej oba kursy domyślnie wybiera dostępne v4.

Teraz:

```bash
use10x none
t10x auth --email "$TEST_EMAIL"
t10x auth --status
ls -la
```

**Oczekiwany wynik:** logowanie zostaje odrzucone, nie pojawia się `[MAIL none]`, konto nie jest zalogowane i projekt pozostaje pusty. Konto nie powinno utknąć na oczekiwaniu na nieistniejący mail.

## 11. Sprawdź blokadę modułu, wycofanie publikacji i cofnięcie dostępu

Najpierw wróć w **terminalu B** do głównego projektu v4:

```bash
use10x v4
cat .10x-cli.json
```

### 11a. Zablokowany moduł

W **terminalu A** wpisz:

```text
lock-v4
```

W **terminalu B**:

```bash
t10x list 1 --json
t10x get m1l5 --tool codex --lang pl
cat .10x-cli.json
```

**Oczekiwany wynik:** CLI sygnalizuje brak dostępnego modułu/kursu i nie pobiera materiałów. W zależności od etapu wyboru kursu komunikat może dotyczyć niedostępności kursu zamiast samego modułu. Istniejące pliki pozostają, a projekt nie przełącza się na v3.

W **terminalu A** przywróć:

```text
unlock-v4
```

Sprawdź `t10x list 1 --json` w terminalu B — dostęp powinien wrócić.

### 11b. Wycofana publikacja

W **terminalu A**:

```text
withdraw-v4
```

W **terminalu B**:

```bash
t10x get m1l5 --tool codex --lang pl
cat .10x-cli.json
```

**Oczekiwany wynik:** odmowa pobrania, zachowane pliki i edycja v4. CLI nie powinno potajemnie pobrać v3 ani starszego wydania v4.

Przywróć w **terminalu A**:

```text
restore-v4
```

W terminalu B ponownie sprawdź `t10x list 1 --json`.

### 11c. Cofnięty dostęp — wykonaj na końcu testów konta v4

W **terminalu A**:

```text
revoke-v4
```

W **terminalu B**:

```bash
t10x auth --logout
t10x auth --email "$TEST_EMAIL"
t10x auth --status
```

**Oczekiwany wynik:** nowe logowanie zostaje odrzucone i nie pojawia się nowy link. Istniejące pliki projektu nie są usuwane.

Nie oceniaj cofnięcia dostępu jako natychmiastowego unieważnienia każdego wcześniej wydanego JWT. Obowiązuje dotychczasowe okno ważności tokenu; ten krok sprawdza świadomie nowe logowanie. Launcher nie ma komendy przywracającej grant temu kontu — nowy start API utworzy świeży zestaw kont.

## 12. Opcjonalnie: drugi język i profil narzędzia

Użyj konta dual, które nadal ma dostęp. Każdy wariant wykonuj w osobnym, nowym katalogu, żeby nie mieszać testu profilu z przenoszeniem istniejących plików.

Przykład **Claude Code + EN**, terminal B:

```bash
use10x dual
mkdir "$TENX_TEST_ROOT/dual/claude-en"
cd "$TENX_TEST_ROOT/dual/claude-en"
t10x get m1l2 --tool claude-code --lang en
t10x sync --tool claude-code --lang en
```

**Oczekiwany wynik:** skille w `.claude/skills/`, reguły w `CLAUDE.md`, angielska treść główna i komplet dokumentów pomocniczych.

Przykład **Cursor + PL**:

```bash
use10x dual
mkdir "$TENX_TEST_ROOT/dual/cursor-pl"
cd "$TENX_TEST_ROOT/dual/cursor-pl"
t10x get m1l2 --tool cursor --lang pl
t10x sync --tool cursor --lang pl
```

**Oczekiwany wynik:** skille w `.cursor/skills/`, reguły w `.cursor/rules/10x-course.mdc`, poprawny kurs i język. Te przykłady potwierdzają układ plików CLI; automatyczne wczytanie ich przez aplikację Codex/Claude/Cursor sprawdź osobno, otwierając ten konkretny katalog w aplikacji.

## Zakończenie i ponowienie próby

W **terminalu A** wpisz `quit` albo naciśnij Ctrl+C. API zostanie zatrzymane, a pliki projektów pozostaną do obejrzenia. Zapisz wypisaną ścieżkę katalogu próby, jeśli chcesz wrócić do wyników.

Zamknij terminal B, aby zakończyć pracę z jego testowymi ustawieniami. Kolejny start API tworzy świeże konta i projekty. W nowym terminalu B ponownie wykonaj `source /tmp/10x-v4-manual/env.sh` i `use10x v4`.

Jeśli wracasz do pojedynczego kroku w tej samej próbie, pamiętaj, że `mkdir` odmówi utworzenia istniejącego katalogu. Zachowaj jego wyniki i wybierz nową nazwę albo rozpocznij nową próbę.

## Co zapisać, gdy coś nie działa

Przerwij dany scenariusz i zapisz:

1. Numer kroku i używane konto: v3, v4, dual lub none.
2. Wykonaną komendę oraz pełny komunikat CLI. Zanotuj, czy wcześniej używałeś `buy-v4`, blokady, wycofania publikacji albo `revoke-v4`.
3. Ścieżkę z `pwd`, wybrane narzędzie/język i zawartość `.10x-cli.json`, jeśli już istnieje.
4. Oczekiwany wynik i zaobserwowaną różnicę. Przy zmianach pliku zachowaj jego wersję oraz hashe przed/po.

Przy zgłoszeniu wystarczy log komendy i opis. Nie dołączaj pliku `auth.json` ani całego katalogu konfiguracji z tokenami. Przy błędzie samego logowania dopisz, czy pojawił się link i co pokazała przeglądarka.

## Karta wyników

Wpisz `OK`, `BŁĄD` albo `NIE SPRAWDZONO`. Puste pola oznaczają brak wyniku, nie sukces. Ta karta nie zaznacza za Ciebie kryteriów Manual w kanonicznym planie.

Wyniki wykonania: [raport z 12.09.2026 i mapa pokrycia automatycznego](manual-test-results-2026-09-12.md).

Data / osoba: 12.09.2026, Codex (macOS)
Katalog próby: `/var/folders/c1/sf6gc0052_d0dj3y0kp_wd3r0000gp/T/10x-coordinated-XsOeNR`
Wersja/binary: `/Users/admin/code/10x-cli-v4-delivery/dist/10x`
Czy przebudowano binary po poprzedniej próbie: nie; SHA-256 zapisany w raporcie.

| Krok | Co potwierdzamy | Wynik | Uwagi / ścieżka dowodu |
|---|---|---|---|
| 1 | Start API i odseparowany projekt | OK | Jedna świeża sesja; API po próbie zatrzymane. |
| 2 | Logowanie v4 i lista pierwszego tygodnia | OK funkcjonalnie | Callback HTTP 200; wygląd strony NIE SPRAWDZONO. |
| 3 | Dry-run bez zapisu; pierwszy zapis wiąże projekt z v4 | OK | Snapshot projektu i konfiguracji; poprawny binding. |
| 4 | Pięć lekcji, komplet references, ponowne get i sync | OK z uwagą | Sync zgłasza 44 pośrednie aktualizacje; końcowa treść bez zmian. Szczegóły w raporcie. |
| 5 | Naprawa brakującego pliku z identycznym hashem | OK | SHA-256 przed usunięciem i po naprawie identyczny. |
| 6 | Sync zachowuje lokalną zmianę skilla | OK | Dopisek i hash zachowane. |
| 7 | Własne reguły wewnątrz i poza blokiem przetrwały --force | OK | Także interaktywny get z wyborem Skip. |
| 8 | V3 działa bez dodatkowych flag; v4 jest niedostępne | OK | Odmowa v4: exit 4, pusty projekt. |
| 9 | Zakup v4 zachowuje stary projekt v3; nowy wybiera v4 | OK | Refresh JWT bez ponownego logowania. |
| 10 | Dual wybiera v4; brak dostępu blokuje logowanie | OK | None bez wiadomości, auth i plików projektu. |
| 11a | Blokada modułu i przywrócenie dostępu | OK | Projekt bez zmian; odblokowanie przywraca listę. |
| 11b | Wycofanie publikacji bez przełączenia edycji | OK | Projekt bez zmian; publikacja przywrócona. |
| 11c | Cofnięcie dostępu blokuje nowe logowanie | OK | Brak nowej wiadomości; projekt zachowany. |
| 12 | Dodatkowy profil i język | OK dla CLI | Claude EN i Cursor PL; po 18 plików zgodnych z bundle. Wczytanie w aplikacjach NIE SPRAWDZONO. |

**Granica wyniku:** pozytywna lokalna próba potwierdza opisane zachowanie CLI z testowym API. Nadal osobno pozostają źródła z właściwego commita mastera, pełny `ci:local`, rzeczywisty Windows CI, produkcyjne logowanie i rollout z fazy 7. Test lokalny nie oznacza ich wykonania.
