# Naprawa wydania CLI po v4 — szczegółowe warianty i weryfikacja

Data: 2026-09-13. Zakres: 10x-cli i 10x-toolkit.

[Executive brief — tu wpisz finalne decyzje](decisions.md) · [Plan](plan.md) · [Skrót](plan-brief.md) · [Research](research.md) · [Przegląd planu](reviews/plan-review.md) · [Handoff](release-handoff.md)

To arkusz wyboru wariantów, nie zatwierdzenie planu ani zgoda na implementację. Alternatywy B/C nie są zaimplementowane i nie zostały dopisane do planu.

## Jak czytać warianty

- **A — obecny plan:** zachowanie opisane w `plan.md` po przeglądzie.
- **B — najsolidniejsza alternatywa:** więcej gwarancji lub automatyzacji, zwykle za cenę nowej infrastruktury.
- **C — najzwinniejsza alternatywa:** mniej kodu, automatyzacji lub przebiegów przy tych samych twardych ograniczeniach.
- **Koszt budowy / utrzymania** to ocena względna, nie estymacja godzin. Praca operatora też się liczy.

Żaden wariant nie osłabia ścisłego SHA, pochodzenia z mastera, dowodów Linux/Windows, sanityzacji publicznych receiptów, autoryzacji kursów, ochrony danych ani harmonogramu odblokowania.

## Ustalenia, które są już wyraźne

- Operator: wersja commitowana w PR naprawczym; proponowana 1.21.0, dostępność sprawdzana przy implementacji i przed publikacją.
- Operator: świeże dowody z ponownego testu zachowanych bajtów z kanonicznego push/master przy testowanym SHA Toolkit; bez ponownego tłumaczenia.
- Tylko oryginalny push/master jest źródłem promocji treści; dispatch nie jest producentem wydania.
- Merge wykonuje człowiek; login, polityka produkcyjna i promocja mają osobne zatwierdzenia.
- Stan bazowy: 647 testów CLI PASS, npm latest 1.20.0, R2 v4 puste, `content-production` 404, backup v3 57 obiektów / 35 776 634 bajty. Naprawa niezaimplementowana.

## Indeks decyzji

| ID | Temat | Rekomendacja do wyboru |
|---|---|---|
| [D01](#d01) | Granica dowodu: PR CLI a wydanie z mastera | A — tryb `pr` przed mergem i świeży dowód `release` po squashu. |
| [D02](#d02) | Tryb dowodowy: wspólny `ci.yml` czy osobny workflow | A z testem listy zadań z efektami; B, jeśli test nie jest wiarygodną blokadą. |
| [D03](#d03) | Retencja stage, attempty i ponowienia | C — tylko attempt 1 i świeży dispatch; A przy częstych rerunach. |
| [D04](#d04) | Skala automatyzacji sekwencji między repozytoriami | A z uproszczeniem C; B przy regularnych wydaniach. |
| [D05](#d05) | Proces wersji po naprawie | C lub A zależnie od użycia podpowiedzi bumpu; B osobno. |
| [D06](#d06) | Pakowanie npm: dokładny tarball i `gitHead` | A; B po potwierdzeniu provenance. |
| [D07](#d07) | Dokończenie częściowego wydania | C z regresją zero drugiej publikacji; A po pierwszym użyciu runbooka. |
| [D08](#d08) | Promocja v4 i zakres testów do bramek | A — osobne bramki pakietu i treści. |

<a id="d01"></a>

## D01. Tryby kandydata CLI i dowód po squashu

**Status:** `cli_candidate_kind` dodany po przeglądzie planu (F2); nie jest decyzją operatora.

**Oparcie:** Plan: implementation approach, merge order kroki 3–5; review F2.

### A — obecny plan

Dispatch Toolkit z mastera przyjmuje `cli_candidate_kind`. Tryb `pr` wymaga PR z tego samego repozytorium, którego aktualny head równa się SHA. Tryb `release` wymaga SHA równego pobranemu masterowi CLI. Po squashu wcześniejszy receipt jest nieaktualny i powstaje nowy.

- **Silna strona:** Dowód przed mergem i dokładny dowód wydawanego commitu; brak forków.
- **Słaba strona:** Dwa pełne przebiegi E2E na wydanie.
- **Tradeoff:** Czas CI za jednoznaczną tożsamość na każdym etapie.
- **Koszt budowy / utrzymania:** średni / średni.

### B — najsolidniejsza alternatywa

Merge queue w CLI; dowód Toolkit powstaje dla commitu grupy. Zachowanie jego SHA na finalnym masterze jest warunkiem do sprawdzenia dla wybranej metody merge, nie potwierdzoną gwarancją. Jeśli SHA się zmieni, obowiązuje świeży dowód po mergu.

- **Silna strona:** Możliwość jednego dowodu, wyłącznie po potwierdzeniu zachowania finalnego SHA.
- **Słaba strona:** Cross-repo dowód musi zmieścić się w cyklu kolejki; nowa konfiguracja repo.
- **Tradeoff:** Mniej przebiegów kosztem infrastruktury i złożoności statusów.
- **Koszt budowy / utrzymania:** wysoki / średni.

### C — najzwinniejsza alternatywa

Dowód PR przez istniejącą ścieżkę PR Toolkit z `CLI_CANDIDATE_SHA`; nowy dispatch obsługuje tylko `release`. Wariant warunkowy: obecnie nie ma potwierdzonej drogi uzyskania tego dowodu dla finalnego SHA Toolkit po jego squashu. Bez takiego dowodu wariant pozostaje zablokowany; nie wolno osłabić checka PR ani zastąpić commitu równoważnym drzewem.

- **Silna strona:** Mniej walidacji wejść i jeden tryb dispatch.
- **Słaba strona:** Po mergu repair Toolkit nie ma otwartego PR do certyfikacji PR CLI; zależność od zmiennej.
- **Tradeoff:** Mniej kodu kosztem kruchej kolejności merge.
- **Koszt budowy / utrzymania:** niski / średni.

**Moja rekomendacja:** A — tryb `pr` przed mergem i świeży dowód `release` po squashu.

**Do sprawdzenia:** W01, W02.

**Finalny wybór wpisz w [karcie D01 executive briefu](decisions.md#d01).**

<a id="d02"></a>

## D02. Evidence dispatch w `ci.yml` a osobny workflow

**Status:** Operator wybrał ponowny test zachowanych bajtów; miejsce trybu to propozycja planu.

**Oparcie:** Plan: implementation approach, faza 1; research: artifact lifecycle.

### A — obecny plan

`workflow_dispatch` tylko z mastera w kanonicznym `ci.yml`. Dispatch pobiera wybrany stage, weryfikuje inventory, hash i źródło, uruchamia E2E/OpenAPI na obu systemach. Wszystkie zadania z efektami ubocznymi pozostają push-only.

- **Silna strona:** Jedna macierz E2E i wspólne walidatory.
- **Słaba strona:** Bezpieczeństwo zależy od warunków `if` na każdym zadaniu.
- **Tradeoff:** Brak duplikacji kosztem dyscypliny przy każdej zmianie CI.
- **Koszt budowy / utrzymania:** średni / średni.

### B — najsolidniejsza alternatywa

Osobny `evidence.yml` wywołuje wspólną macierz E2E jako reusable workflow; plik nie zawiera zadań deploy, publish, R2 ani notyfikacji.

- **Silna strona:** Dispatch strukturalnie nie może uruchomić efektów ubocznych.
- **Słaba strona:** Refaktor `ci.yml` i zmiana nazw jobów sprawdzanych przez weryfikator CLI.
- **Tradeoff:** Silniejsza separacja kosztem większej zmiany w krytycznym CI.
- **Koszt budowy / utrzymania:** wysoki / niski.

### C — najzwinniejsza alternatywa

Mały osobny workflow z kopią kroków E2E i receiptu, bez refaktoru `ci.yml`.

- **Silna strona:** Separacja bez naruszania głównego CI.
- **Słaba strona:** Kopia E2E może się rozjechać z push/master.
- **Tradeoff:** Szybka separacja kosztem duplikacji.
- **Koszt budowy / utrzymania:** niski / średni.

**Moja rekomendacja:** A z testem listy zadań z efektami; B, jeśli test nie jest wiarygodną blokadą.

**Do sprawdzenia:** W03.

**Finalny wybór wpisz w [karcie D02 executive briefu](decisions.md#d02).**

<a id="d03"></a>

## D03. Retencja stage, nazwy z attemptem i reruny

**Status:** Ponowny test zachowanych bajtów wybrany przez operatora; polityka rerunów i retencji to propozycja planu.

**Oparcie:** Plan: critical implementation details, faza 1; research: attempt mixing, retained content.

### A — obecny plan

Każdy udany master zachowuje stage niezależnie od filtra zmian treści. Artefakty i receipty zawierają run ID i attempt. Normalnym ponowieniem jest świeży dispatch; rerun jest akceptowany tylko z kompletem jobów, receiptów i artefaktów tego samego attemptu.

- **Silna strona:** Obsługuje reruny bez mieszania generacji.
- **Słaba strona:** Walidacja kompletu attemptu i stabilności runu to dodatkowa logika.
- **Tradeoff:** Wygoda rerunów za więcej testów.
- **Koszt budowy / utrzymania:** średni / średni.

### B — najsolidniejsza alternatywa

A oraz prywatne archiwum stage poza retencją GitHub, z hashem inventory i ostrzeżeniem przed wygaśnięciem artefaktu.

- **Silna strona:** Dowód i promocja nie zależą od terminu wygaśnięcia.
- **Słaba strona:** Nowy magazyn, uprawnienia i ścieżka weryfikacji archiwum.
- **Tradeoff:** Trwałość kosztem kolejnego systemu z danymi prywatnymi.
- **Koszt budowy / utrzymania:** wysoki / średni.

### C — najzwinniejsza alternatywa

Retencja każdego udanego mastera i nazwy z attemptem jak w A, ale świeże dowody dispatch akceptowane są wyłącznie z attempt 1; każde ponowienie dowodów to nowy dispatch. Oryginalny push/master zachowuje oddzielną walidację dokładnego attemptu i kompletu jego jobów. Dispatch nie może zastąpić nieudanego producenta stage.

- **Silna strona:** Mniej stanów dowodowego dispatch; nadal wymagane sprawdzenie obu OS oraz źródłowego push/master.
- **Słaba strona:** Flaky job wymaga pełnego nowego przebiegu.
- **Tradeoff:** Czas CI zamiast kodu obsługi rerunów.
- **Koszt budowy / utrzymania:** niski / niski.

**Moja rekomendacja:** C — tylko attempt 1 i świeży dispatch; A przy częstych rerunach.

**Do sprawdzenia:** W04, W05.

**Finalny wybór wpisz w [karcie D03 executive briefu](decisions.md#d03).**

<a id="d04"></a>

## D04. Orkiestracja dowodu i wydania między repozytoriami

**Status:** Plan zakłada ręczne dispatch Session A z inspekcją przed każdą operacją; skala automatyzacji otwarta.

**Oparcie:** Plan: critical implementation details, merge order, faza 4.

### A — obecny plan

Session A pobiera SHA, sprawdza aktywne i oczekujące runy oraz zmienne, uruchamia dispatch z jawnymi wejściami, rejestruje run i uruchamia wydanie CLI. Grupy concurrency nie anulują przebiegów; nieznane nowsze wartości zatrzymują operację.

- **Silna strona:** Brak tokenów cross-repo; każda operacja ma jawne wejścia.
- **Słaba strona:** Ręczne przepisywanie identyfikatorów i zależność od dyscypliny.
- **Tradeoff:** Kontrola człowieka kosztem czasu operatora.
- **Koszt budowy / utrzymania:** niski / średni.

### B — najsolidniejsza alternatywa

Automatyczny łańcuch przez `workflow_run` / `repository_dispatch` z lease między repozytoriami.

- **Silna strona:** Powtarzalna sekwencja bez ręcznych błędów.
- **Słaba strona:** Token cross-repo o szerokich uprawnieniach i trudniejsze zatrzymanie.
- **Tradeoff:** Mniej pracy przy częstych wydaniach, większa powierzchnia ataku.
- **Koszt budowy / utrzymania:** wysoki / średni.

### C — najzwinniejsza alternatywa

Jak A, ale ścieżka wydania bierze wyłącznie jawne wejścia dispatch; zmienne repozytorium zostają tylko wskaźnikiem dla checków PR.

- **Silna strona:** Mniej mutowalnego stanu do inspekcji przy wydaniu.
- **Słaba strona:** Checki PR nadal zależą od zmiennych.
- **Tradeoff:** Prostsza inspekcja kosztem dwóch modeli wejść.
- **Koszt budowy / utrzymania:** niski / niski.

**Moja rekomendacja:** A z uproszczeniem C; B przy regularnych wydaniach.

**Do sprawdzenia:** W02, W06.

**Finalny wybór wpisz w [karcie D04 executive briefu](decisions.md#d04).**

<a id="d05"></a>

## D05. `auto-version.mjs` i przygotowanie wersji

**Status:** Operator wybrał wersję w PR naprawczym (1.21.0 proponowana); dalszy proces wersji to propozycja planu.

**Oparcie:** Plan: accepted decisions, faza 2; research: untested version commit.

### A — obecny plan

`package.json` z wersją w PR; CI waliduje zgodność wersji, tagu i npm. `auto-version.mjs` może zostać jako podpowiedź bez zapisu.

- **Silna strona:** Wersja przechodzi review; podpowiedź bumpu dostępna.
- **Słaba strona:** Ręczny krok w każdym wydaniu.
- **Tradeoff:** Kontrola człowieka za drobny koszt pracy.
- **Koszt budowy / utrzymania:** niski / niski.

### B — najsolidniejsza alternatywa

Usługa automatycznego PR wersji z changelogiem, zatwierdzana przez człowieka.

- **Silna strona:** Mniej ręcznej pracy przy regularnych wydaniach.
- **Słaba strona:** Poza zakresem naprawy; dodatkowy writer i konfiguracja.
- **Tradeoff:** Wygoda za kolejną zależność.
- **Koszt budowy / utrzymania:** średni / średni.

### C — najzwinniejsza alternatywa

Usunąć zapis i podpowiedź z `auto-version.mjs`; zostaje walidacja zgodności wersji z tagiem i rejestrem.

- **Silna strona:** Najmniej kodu; jedno źródło prawdy.
- **Słaba strona:** Brak automatycznej podpowiedzi bumpu.
- **Tradeoff:** Prostota kosztem wygody.
- **Koszt budowy / utrzymania:** niski / niski.

**Moja rekomendacja:** C lub A zależnie od użycia podpowiedzi bumpu; B osobno.

**Do sprawdzenia:** W07.

**Finalny wybór wpisz w [karcie D05 executive briefu](decisions.md#d05).**

<a id="d06"></a>

## D06. Tarball, `gitHead` i przypięty npm

**Status:** Katalog pakowania z `gitHead` i npm 11.12.1 dodane po przeglądzie planu (F1); nie jest decyzją operatora.

**Oparcie:** Plan: implementation approach, faza 2; review F1.

### A — obecny plan

W oddzielnym katalogu dodać do manifestu pakietu tylko `gitHead` walidowanego SHA; źródło i wersja w Git bez zmian. Przypięty npm 11.12.1 (wersja weryfikowana w testach) pakuje raz; tarball przechodzi smoke, jest zachowany i publikowany. Po publikacji weryfikacja integrity, wersji i `gitHead` w rejestrze.

- **Silna strona:** Opublikowane bajty to bajty po smoke.
- **Słaba strona:** Własny helper i test mock-registry.
- **Tradeoff:** Dodatkowy kod za gwarancję przed publikacją.
- **Koszt budowy / utrzymania:** średni / niski.

### B — najsolidniejsza alternatywa

A oraz npm provenance z OIDC i kontrola powtórnego pakowania.

- **Silna strona:** Publiczny, weryfikowalny związek pakietu z workflow.
- **Słaba strona:** Zgodność provenance z publikacją tarballa niepotwierdzona; konfiguracja uprawnień.
- **Tradeoff:** Audytowalność kosztem nowej zależności w publikacji.
- **Koszt budowy / utrzymania:** średni / średni.

### C — najzwinniejsza alternatywa

Publikacja katalogu z checkoutu dokładnego SHA; lokalny `npm pack` w tym samym jobie i porównanie integrity z rejestrem po publikacji.

- **Silna strona:** npm ustawia `gitHead` sam; mało kodu.
- **Słaba strona:** Rozbieżność wykrywamy po publikacji, a wersji nie da się nadpisać.
- **Tradeoff:** Mniej kodu kosztem wykrywania zamiast zapobiegania.
- **Koszt budowy / utrzymania:** niski / niski.

**Moja rekomendacja:** A; B po potwierdzeniu provenance.

**Do sprawdzenia:** W08, W09.

**Finalny wybór wpisz w [karcie D06 executive briefu](decisions.md#d06).**

<a id="d07"></a>

## D07. Recovery po npm success i GitHub failure

**Status:** Automatyczny recovery dodany po przeglądzie planu (F3); skala nie jest wybrana przez operatora.

**Oparcie:** Plan: critical implementation details, faza 2; review F3.

### A — obecny plan

Dispatch recovery przyjmuje oryginalny run/attempt i ID artefaktów pakietu oraz binariów. Manifest wydania wiąże SHA, wersję, dowód, integrity i hashe binariów. Recovery porównuje tarball w rejestrze, nigdy nie wywołuje `npm publish` dla istniejącej wersji i uzupełnia tylko brakujące assety.

- **Silna strona:** Powtarzalne dokończenie bez przebudowy i drugiej publikacji.
- **Słaba strona:** Workflow i testy dla rzadkiej awarii.
- **Tradeoff:** Kod na zapas za mniejsze ryzyko ręcznego błędu.
- **Koszt budowy / utrzymania:** średni / średni.

### B — najsolidniejsza alternatywa

Najpierw szkic GitHub Release z kompletem binariów, potem npm, na końcu upublicznienie szkicu; recovery jak A.

- **Silna strona:** Mniej stanów częściowych.
- **Słaba strona:** Przebudowa kolejności i sprzątanie porzuconych szkiców.
- **Tradeoff:** Mniejsza szansa awarii za większą zmianę workflow.
- **Koszt budowy / utrzymania:** wysoki / średni.

### C — najzwinniejsza alternatywa

Workflow odmawia publikacji istniejącej wersji i zachowuje manifest wydania; runbook opisuje ręczne dokończenie z weryfikacją integrity i hashy.

- **Silna strona:** Brak workflow recovery; blokada drugiej publikacji zostaje.
- **Słaba strona:** Ręczny upload i ryzyko pomyłki operatora.
- **Tradeoff:** Mniej kodu za pracę przy rzadkiej awarii.
- **Koszt budowy / utrzymania:** niski / niski.

**Moja rekomendacja:** C z regresją zero drugiej publikacji; A po pierwszym użyciu runbooka.

**Do sprawdzenia:** W10.

**Finalny wybór wpisz w [karcie D07 executive briefu](decisions.md#d07).**

<a id="d08"></a>

## D08. Bramki pakietu i treści v4

**Status:** Plan rozdziela wydanie CLI od promocji; podział testów między bramki jest otwarty.

**Oparcie:** Plan: faza 4, merge order krok 6; handoff: content promotion, downloaded-package acceptance.

### A — obecny plan

Po publikacji: niezależne pobranie z rejestru, instalacja z wyłączonymi skryptami, help/version, potem zatwierdzony login i akceptacja v3, wyboru kursu, braku zapisów przy podglądzie, EN/PL i sync. Promocja v4 po osobnym zatwierdzeniu polityki, środowiska i dokładnych wejść; potem test tożsamości v4 i odblokowania po 2026-09-14T06:00:00Z.

- **Silna strona:** Wczesny dowód pakietu; brak deklaracji gotowości v4 przed dowodami.
- **Słaba strona:** Dwie serie testów z realnym kontem.
- **Tradeoff:** Więcej pracy za rozdzielenie ryzyk.
- **Koszt budowy / utrzymania:** średni / średni.

### B — najsolidniejsza alternatywa

A oraz próba promocji i withdraw w osobnym buckecie przed produkcyjną promocją.

- **Silna strona:** Mechanika sprawdzona przed produkcją.
- **Słaba strona:** Dodatkowe środowisko i dane.
- **Tradeoff:** Pewność za koszt infrastruktury.
- **Koszt budowy / utrzymania:** wysoki / średni.

### C — najzwinniejsza alternatywa

Po publikacji wykonujemy weryfikację integrity i instalację anonimową; login, v3 i v4 w jednej akceptacji po promocji. To odroczenie testów, nie ich usunięcie: weryfikacja wydania CLI i etap 1 Session C pozostają otwarte do wymaganej akceptacji rzeczywistego pakietu.

- **Silna strona:** Jeden login, jedna seria testów.
- **Słaba strona:** Regresja v3 w pakiecie wyjdzie dopiero przy promocji.
- **Tradeoff:** Mniej pracy za późniejsze wykrycie.
- **Koszt budowy / utrzymania:** niski / niski.

**Moja rekomendacja:** A — osobne bramki pakietu i treści.

**Do sprawdzenia:** W11, W12, W13, W14.

**Finalny wybór wpisz w [karcie D08 executive briefu](decisions.md#d08).**

<a id="verification"></a>

## Rzeczy do sprawdzenia — wymagany dowód

Rejestr dowodów do zebrania; brak wpisu nie oznacza zaliczenia. „Session A” oznacza implementującego koordynatora wydania.

| ID | Co sprawdzić i jaki wynik zapisać | Właściciel | Kiedy wynik jest potrzebny |
|---|---|---|---|
| W01 | Syntetyczny cykl: merge Toolkit → dowód `pr` dla head PR CLI → squash → dowód `release` dla SHA mastera. Odmowa dla forka, nieaktualnego head, starego SHA i SHA spoza mastera. D01-B wymaga dodatkowo próby finalnego SHA merge queue; D01-C dowodu wykonalności checka PR z finalnym SHA Toolkit. | Session A | Przed review PR; wykonalność alternatyw przed ich przyjęciem |
| W02 | Zapis inspekcji przed każdą operacją: aktualne SHA masterów, aktywne/oczekujące runy obu repo, wartości i czasy zmiennych. Nieznana nowsza wartość zatrzymuje krok. | Session A | Bezpośrednio przed każdym dispatch i publikacją |
| W03 | Test workflow listujący zadania z efektami (transform, deploy, publish, R2, notyfikacje) i dowodzący, że dispatch żadnego nie uruchamia. | Session A | Przed PR Toolkit |
| W04 | Master tylko API/docs zachowuje stage; poprzednie stage nie są usuwane; zapisać daty wygaśnięcia stage `10313382854` i przyszłych stage. | Session A | Przed mergem Toolkit |
| W05 | Reprodukcja przepisania attemptu jest odrzucana; selektywny rerun bez Windows, mieszane joby, wygasły lub zduplikowany artefakt kończą się odmową bez prywatnych danych. | Session A | Przed PR Toolkit |
| W06 | Wymagane uprawnienia tokenu cross-repo i sposób zatrzymania łańcucha; częstość wydań CLI uzasadniająca automatyzację. | Operator + Session A | Przed wyborem D04-B |
| W07 | Brak wersji 1.21.0 i tagu `v1.21.0` w npm i GitHub. | Session A | Przy implementacji i ponownie przed publikacją |
| W08 | Pack/extract/mock-registry: `gitHead` w tarballu, zainstalowany npm 11.12.1, integrity opublikowane równe spakowanemu, źródło i wersja w Git bez zmian. | Session A | Przed PR CLI |
| W09 | Zgodność npm provenance z publikacją tarballa w GitHub Actions. | Session A | Przed wyborem D06-B |
| W10 | Symulacja npm success / GitHub failure: zero drugich wywołań `npm publish`; brak lub wygaśnięcie oryginalnego artefaktu zatrzymuje dokończenie. | Session A | Przed PR CLI |
| W11 | Pobrany z rejestru pakiet: SHA-512, `gitHead`, wersja, SHA tagu i para źródeł zgodne z dowodem; instalacja w izolacji z wyłączonymi skryptami, help/version. | Session A | Po publikacji |
| W12 | Po zatwierdzonym loginie: status konta, najwyższy dostępny autoryzowany kurs, stabilny binding v3, brak zapisów przy podglądzie i nieudanym preflight, EN/PL, sync i ochrona lokalnych edycji. | Session A + operator | Po publikacji, przed etapem 1 Session C |
| W13 | Prerekwizyty promocji: `content-production` z reviewerem, PR polityki z secured floor, świeży backup v3 porównany z 57 obiektami / 35 776 634 bajtami, wejścia withdraw. | Operator + Session A | Przed zatwierdzeniem promocji |
| W14 | Produkcja po 2026-09-14T06:00:00Z: odblokowanie modułu 1 bez override KV oraz zgodność release ID i hash manifestu v4 w pobranym CLI. | Session A | Po promocji i po granicy czasu |

### Miejsce na wyniki weryfikacji

Skopiuj wiersz dla kolejnych wyników; brak wpisu nie oznacza zaliczenia.

| ID W… | Wynik i odnośnik do dowodu | Data / osoba | Wpływ na decyzję D… |
|---|---|---|---|
| … | … | … | … |

## Zależności między wyborami

- **D01 + D04:** tryb `pr` i ścieżka wydania określają, które wejścia pochodzą ze zmiennych, a które z jawnego dispatch.
- **D02 + D03:** miejsce trybu dowodowego decyduje, które joby produkują artefakty z attemptem i które stage są zachowywane.
- **D05 + D06:** wersja z PR i `gitHead` w tarballu razem wiążą pakiet z testowanym SHA.
- **D06 + D07:** recovery opiera się na zachowanym tarballu i manifeście wydania; D06-C zmienia to, co można porównać przy dokończeniu.
- **D08:** wydanie pakietu nie spełnia etapu 1 Session C bez dowodu dostarczenia.

## Weryfikacja zewnętrznych założeń na dzień 2026-09-13

Założenia o npm (publikacja tarballa bez automatycznego `gitHead`) pochodzą z inspekcji npm 11.12.1 w przeglądzie planu; o artefaktach i rerunach GitHub z dokumentacji cytowanej w research. Przy kontroli kart sprawdzono [dokumentację merge queue GitHub](https://docs.github.com/en/enterprise-cloud%40latest/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue): opisuje tymczasowe branche i różne metody merge. Nie wykonano próby potwierdzającej identyczność finalnego SHA w tych repozytoriach; D01-B pozostaje warunkowy. Bez zmian w CI lub produkcji.

## Uzgodnienie dokumentów po wyborze

Finalne wybory zapisujemy w [executive briefie](decisions.md), potem uzgadniamy `plan.md` i `plan-brief.md` oraz uzyskujemy autoryzację wynikowego zakresu. Stan realizacji pozostaje wyłącznie w sekcji Progress planu.
