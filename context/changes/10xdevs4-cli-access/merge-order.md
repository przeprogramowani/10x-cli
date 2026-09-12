# Kolejność PR-ów, merge i publikacji

Stan sprawdzony 12.09.2026. Główne zmiany CLI i Toolkit można wystawić jako drafty do przeglądu. Gotowość do przeglądu nie zamyka warunków merge ani publikacji.

## 1. Toolkit: komplet dokumentów źródłowych

[PR #30](https://github.com/przeprogramowani/10x-toolkit/pull/30) dostarcza references dla `10x-stack-assess`. Trzeba również dostarczyć pięć przygotowanych kopii `references/progress-format.md` dla `10x-implement`, `10x-impl-review`, `10x-plan-review`, `10x-tdd` i `10x-goal-implement`, wraz z testem zgodności. Można rozszerzyć #30 albo wystawić mały PR następczy. Obecny #30 sam nie odblokuje pełnego buildu v3.

**Przed pierwszym mergem:** zgodnie z instrukcją wydania Toolkit zatrzymać stare automaty publikujące/wdrażające i rozliczyć uruchomione oraz oczekujące zadania. Obecny master po merge może zapisywać R2, wdrażać Workera, publikować paczki i wysyłać powiadomienia. Te czynności nie są częścią samego wystawienia draftów.

Po squash merge pobrać pełną historię `origin/master` i użyć rzeczywistego wynikowego SHA w wyjątkach źródeł v3 w głównym PR Toolkit. Zachować domyślny cutoff v3 `da989a6f7d4963c275a98943e85d225baf426228`. Dla stack-assess potrzebny jest wyjątek pakietu; dla pięciu brakujących dokumentów wystarczą jawne wyjątki plików. Każdy pin musi wskazywać commit osiągalny z `origin/master`, zawierający dany plik. Nie używać SHA brancha sprzed squasha.

## 2. Oba drafty: zamknąć wspólne CI

Po aktualizacji źródeł uruchomić pełny `pnpm ci:local`. Skonfigurować testowanie dokładnej pary commitów oraz zatwierdzonego zestawu danych v3:

- Toolkit: `CLI_CANDIDATE_SHA`.
- CLI: `TOOLKIT_CANDIDATE_SHA`.
- Oba repo: `V3_E2E_FIXTURE_RUN_ID`, `V3_E2E_FIXTURE_HEAD_SHA`, `V3_E2E_INVENTORY_SHA256`.
- CLI: sekret `TOOLKIT_READ_TOKEN` do prywatnego Toolkit oraz `OPENROUTER_API_KEY` wymagany przez job przygotowania tłumaczeń.

Przy sprawdzeniu 12.09 oba repo nie miały żadnych zmiennych Actions; w CLI brakowało obu wymienionych sekretów. Zweryfikowano nazwy, bez odczytu wartości. Przygotowanie prywatnego artefaktu v3 i uruchomienie jego producenta opisuje Toolkit `docs/how-to/release-10xdevs4-cli.md`.

Wymagane: zielone testy dokładnej pary kandydatów na Linux i Windows oraz sprawdzenie OpenAPI. Po zmianie commita zaktualizować odpowiednią zmienną i ponowić właściwe kontrole. Lokalne wyniki nie zastępują tego warunku.

## 3. Merge głównego PR Toolkit i wdrożenie API

Najpierw Toolkit: zawiera ochronę dostępu, discovery, niezmienne wydania materiałów i nowe kontrakty API, z których korzysta CLI. Po merge sprawdzić zabezpieczone API na wdrożeniu i zapisać rewizję stanowiącą minimalną bezpieczną wersję rollbacku. Produkcyjna publikacja materiałów v4 pozostaje wyłączona do osobnego kroku.

Squash zmieni SHA Toolkit: zaktualizować `TOOLKIT_CANDIDATE_SHA` w CLI na rzeczywisty commit mastera i ponowić wspólne CI z nadal otwartym kandydatem CLI.

## 4. Publikacja i sprawdzenie materiałów v4

Wykonać kontrolowaną publikację dokładnie przetestowanego wydania v4 według instrukcji Toolkit. Sprawdzić komplet EN/PL, skuteczny harmonogram modułu 1 (14.09.2026, 08:00 Europe/Warsaw), rzeczywiste konta v3/v4/dual i niezmienione klucze/hashe produkcyjnego v3. Wcześniejsza lokalna próba miała odblokowanie sterowane fixture; przed terminem nie należy oczekiwać odblokowania produkcji bez jawnej decyzji o harmonogramie.

## 5. Merge i wydanie CLI

CLI na końcu, po gotowym API i materiałach oraz zamknięciu bramek wydania. Obecny workflow po push na master może automatycznie podnieść wersję, opublikować npm i GitHub Release. Dlatego merge CLI należy zaplanować jako krok wydania po przygotowaniu backendu.

Po squash CLI wynikowy SHA zastępuje wcześniejszy SHA kandydata w `CLI_CANDIDATE_SHA` Toolkit przed kolejnymi wspólnymi kontrolami; stałe piny źródeł kursu są odrębną konfiguracją.

## Pozostałe uwagi

- [Próba manualna](manual-test-results-2026-09-12.md) przeszła kryteria funkcjonalne. Zbędne aktualizacje raportowane przez powtórny `sync` są jawną uwagą, z opisaną luką w regresjach. Nie stwierdzono utraty końcowej treści.
- Migracja istniejącego projektu v3 do v4 pozostaje osobną zmianą i nie należy do tych PR-ów.
- Wystawienie draftów nie zmienia statusu warunków 6.2/6.3 ani produkcyjnej fazy 7 w kanonicznym planie.
