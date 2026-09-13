# Naprawa wydania CLI po v4 — executive brief do decyzji

Data: 2026-09-13 · Zakres: 10x-cli i 10x-toolkit · Etap: plan po przeglądzie (SOUND), przed zatwierdzeniem implementacji

[Plan](plan.md) · [Szczegółowe warianty i rejestr weryfikacji](decisions-details.md) · [Handoff wydania](release-handoff.md)

## Cel i sytuacja

Chcemy opublikować CLI z v4, w którym jedna zatwierdzona wersja, przetestowany commit mastera, tag, tarball npm i binaria mają tę samą tożsamość. Świeże dowody Linux/Windows mają dotyczyć dokładnie tej pary commitów, a treści v4 trafią do produkcji dopiero przez osobną, jawnie zatwierdzoną promocję.

CLI #38 zostało zmergowane jako `b0c789a`, ale prywatny receipt z Toolkit run `34743867441` dowodzi commitu sprzed squasha `c139ac5`. Publiczna bramka poprawnie odrzuciła wydanie. Badanie wykazało dwie dodatkowe luki: obecny CI tworzy commit wersji po testach, a receipty platform nie zawierają run/attempt, więc późniejszy producent może je przepisać.

Stan na 2026-09-13: 647 bazowych testów CLI przechodzi, typecheck, lint, buildy i smoke przechodzą po ponownym uruchomieniu poza sandboxem. npm latest to 1.20.0. Produkcyjny prefiks v4 w R2 jest pusty, polityka publikacji wyłączona, środowisko `content-production` nie istnieje. Backup obecnego v3 ma 57 obiektów i 35 776 634 bajty; różni się od historycznej fixture. Żadna naprawa nie została zaimplementowana.

## Co jest już ustalone

- **Wersja (wybór operatora):** finalna wersja jest commitowana w PR naprawczym; proponowana 1.21.0. Po testach nie powstaje żaden commit wersji.
- **Świeże dowody (wybór operatora):** ponowny test zachowanych bajtów z udanego kanonicznego push/master przy testowanym SHA Toolkit, bez ponownego tłumaczenia treści.
- **Źródło promocji:** tylko oryginalny push/master może być źródłem treści produkcyjnych; dispatch dowodowy nie buduje i nie autoryzuje wydania treści.
- **Ograniczenia twarde:** ścisły SHA, pochodzenie z mastera, dowody obu systemów, sanityzacja publicznych receiptów, autoryzacja kursów, ochrona danych i harmonogram 2026-09-14T06:00:00Z nie podlegają wariantom.
- **Granice procesu:** merge wykonuje człowiek; bez commitów na master, kasowania artefaktów, nadpisywania npm, włączania polityki i promocji w ramach przygotowania.

## Najważniejsze wybory na teraz

| Wybór | Dlaczego ma znaczenie | Rekomendacja |
|---|---|---|
| [D01 — granica dowodu PR i mastera](#d01) | Decyduje, ile przebiegów dowodowych potrzeba między mergem Toolkit a publikacją CLI. | A: osobny tryb PR i świeży dowód mastera po squashu. |
| [D04 — skala automatyzacji sekwencji](#d04) | Łańcuch dwóch repozytoriów to największe źródło ręcznej pracy i pomyłek koordynacji. | A teraz; automatyczny łańcuch dopiero przy częstych wydaniach. |
| [D06 — pakowanie npm](#d06) | Ustala, czy publikowane bajty są dokładnie tymi, które przeszły smoke. | A: jeden tarball z `gitHead`, przypięty npm. |
| [D07 — dokończenie częściowego wydania](#d07) | Awaria po `npm publish` nie może prowadzić do drugiej publikacji ani przebudowy. | C na pierwsze wydanie, jeśli regresja „zero drugiej publikacji” pozostaje. |
| [D08 — promocja v4 i zakres testów](#d08) | Oddziela gotowość pakietu od gotowości treści v4 i etapu 1 Session C. | A: osobne bramki, bez deklarowania gotowości v4 przed dowodami. |

Rekomendacje są proporcją między gwarancjami, automatyzacją i kosztem, a nie estymacją czasu ani zatwierdzeniem planu. Rekomendacje przeglądu planu nie są decyzjami operatora.

## Jak korzystać z kart

Każda karta opisuje sytuację, status i trzy warianty: **A — obecny plan**, **B — najsolidniejsza alternatywa**, **C — najzwinniejsza alternatywa**. Wariant C oszczędza zakres lub automatyzację, nigdy ścisłą tożsamość commitu, dowody obu systemów, prywatność ani ochronę danych.

Wcześniejsze wybory operatora (wersja w PR, ponowny test zachowanych bajtów) są opisane w statusach. Pole decyzji służy do utrwalenia wyboru albo świadomej korekty.

<a id="d01"></a>

## D01. Jak dowodzimy CLI przed mergem i po squashu

Toolkit master musi potwierdzić niezmergowany PR CLI, zanim operator go zmerguje, a po squashu powstaje nowy SHA, którego wcześniejszy dowód nie obejmuje. Bez rozdzielenia tych przypadków albo blokujemy wymagany check PR, albo ryzykujemy publikację z dowodem innego commitu. Wybór dotyczy liczby przebiegów i mechanizmu wyznaczania SHA.

**Status:** Przegląd planu dodał jawny `cli_candidate_kind` (`pr` / `release`); wybór mechanizmu nie jest decyzją operatora.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Dispatch w trybie `pr` dla aktualnego head PR z tego samego repo, potem świeży dispatch `release` dla SHA mastera. | Dowód przed mergem i dokładny dowód wydawanego commitu. | Dwa przebiegi E2E i ponowna koordynacja po squashu. |
| B — najsolidniejszy | Merge queue w CLI z dowodem dla commitu grupy; zgodność tego SHA z finalnym masterem wymaga osobnego potwierdzenia. | Możliwość ograniczenia powtórnych testów, jeśli finalny SHA pozostaje identyczny. | Nowa infrastruktura; bez dowodu zachowania SHA nadal potrzebny świeży test po mergu. |
| C — najzwinniejszy | Dowód PR przez istniejącą ścieżkę Toolkit PR z `CLI_CANDIDATE_SHA`; nowy dispatch tylko w trybie `release`. | Mniej kodu trybów i walidacji wejść. | Niepotwierdzona wykonalność po mergu Toolkit: bez dowodu dla jego finalnego SHA wariant jest zablokowany. |

**Rekomendacja:** A; B rozważyć dopiero, gdy wydania CLI będą częste, a C tylko jeśli ścieżka PR Toolkit pozostaje dostępna po mergu repair.

**Do sprawdzenia:** W01–W02. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d01).

**Twoja finalna decyzja:** C (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=C; basis=c154c1cf97e5; version=1; updated=2026-09-13T09:45:50.099Z -->

<a id="d02"></a>

## D02. Gdzie żyje tryb dowodowy w Toolkit

Ponowny test zachowanych bajtów potrzebuje przebiegu, który uruchamia E2E Linux/Windows, ale nie tłumaczy treści, nie wdraża Workera, nie publikuje pakietów i nie promuje R2. Kanoniczny `ci.yml` ma już te zadania obok zadań z efektami ubocznymi. Pomyłka w warunku zadania może więc uruchomić deploy z dispatchu.

**Status:** Operator wybrał ponowny test zachowanych bajtów; umieszczenie trybu w `ci.yml` to propozycja planu.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | `workflow_dispatch` tylko z mastera w `ci.yml`; zadania z efektami ubocznymi jawnie push-only; testy workflow. | Wspólna macierz E2E i walidatory bez duplikacji. | Każde nowe zadanie w `ci.yml` wymaga poprawnego warunku push-only. |
| B — najsolidniejszy | Osobny `evidence.yml` wywołujący wspólną macierz E2E przez reusable workflow; brak zadań z efektami w pliku. | Strukturalna separacja: dispatch fizycznie nie ma dostępu do deployu. | Refaktor `ci.yml` na reusable workflow i nowe nazwy jobów w weryfikatorze. |
| C — najzwinniejszy | Osobny mały workflow kopiujący tylko kroki E2E i receiptu, bez refaktoru `ci.yml`. | Separacja bez przebudowy głównego CI. | Duplikacja definicji E2E, która może się rozjechać z push/master. |

**Rekomendacja:** A z testem listującym wszystkie zadania z efektami; B, jeśli test workflow nie da się utrzymać jako wiarygodnej blokady.

**Do sprawdzenia:** W03. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d02).

**Twoja finalna decyzja:** A (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=A; basis=62aa7f94824a; version=1; updated=2026-09-13T09:45:50.112Z -->

<a id="d03"></a>

## D03. Retencja stage, attempty i ponowienia

Dziś artefakty mają stałe nazwy, receipty nie zawierają run/attempt, a stage nie powstaje dla każdego commita mastera. Świeży dowód wymaga stage z dokładnego SHA Toolkit i jednoznacznego wyboru attemptu. Otwarte są koszt obsługi rerunów i ochrona przed wygaśnięciem artefaktów.

**Status:** Ponowny test zachowanych bajtów wybrany przez operatora; polityka rerunów i retencji to propozycja planu.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Stage z każdego udanego mastera, nazwy z attemptem, świeży dispatch jako normalne ponowienie; rerun tylko z kompletem jobów tego attemptu. | Reruny działają, a selektywne kończą się odmową. | Walidacja kompletu attemptu to dodatkowa logika i testy. |
| B — najsolidniejszy | A oraz archiwum stage poza retencją GitHub z hashem inventory i ostrzeżeniem przed wygaśnięciem. | Dowód i promocja nie zależą od terminu wygaśnięcia artefaktu. | Nowy prywatny magazyn, uprawnienia i proces jego utrzymania. |
| C — najzwinniejszy | Świeże dowody dispatch akceptowane tylko dla attempt 1; każde ponowienie dowodów to nowy dispatch. Retencja stage i ścisła walidacja attemptu źródłowego pozostają. | Mniej obsługiwanych stanów dowodowego dispatch. | Flaky E2E wymaga pełnego nowego przebiegu; walidacji oryginalnego push/master nie można pominąć. |

**Rekomendacja:** C, jeśli koszt pełnego E2E jest akceptowalny; A, gdy reruny okażą się częste. B dopiero przy wygaśnięciu potrzebnego stage.

**Do sprawdzenia:** W04–W05. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d03).

**Twoja finalna decyzja:** A (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=A; basis=e5d8c40005ca; version=1; updated=2026-09-13T09:45:50.114Z -->

<a id="d04"></a>

## D04. Ile sekwencji wydania automatyzujemy

Po mergach trzeba kolejno: pobrać aktualne SHA, uruchomić dowód, zarejestrować run, uruchomić wydanie CLI i sprawdzić pakiet. GitHub serializuje przebiegi tylko w obrębie jednego repozytorium, więc koordynację między repo wykonuje Session A. Wybór dotyczy podziału pracy między operatora a automatyzację.

**Status:** Plan zakłada ręcznie wyzwalane dispatch z jawnymi wejściami i inspekcją przed każdą operacją; skala automatyzacji jest otwarta.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Session A uruchamia dispatch z jawnymi SHA i run/attempt, grupy concurrency bez anulowania, inspekcja runów i zmiennych przed każdym krokiem. | Czytelna odpowiedzialność i brak tokenów cross-repo. | Kilka ręcznych kroków i zależność od dyscypliny operatora. |
| B — najsolidniejszy | Automatyczny łańcuch: sukces mastera Toolkit wyzwala dowód, receipt wyzwala wydanie CLI; lease między repo. | Powtarzalna sekwencja bez ręcznego przepisywania identyfikatorów. | Token cross-repo, nowe uprawnienia i trudniejsze zatrzymanie łańcucha. |
| C — najzwinniejszy | Jak A, ale ścieżka wydania nie używa zmiennych repozytorium; zmienne zostają tylko wskaźnikiem dla checków PR. | Mniej mutowalnego stanu do inspekcji. | Wejścia dispatch trzeba przepisywać ręcznie z dowodu. |

**Rekomendacja:** A teraz, z C jako uproszczeniem, jeśli checki PR CLI nie wymagają aktualizacji zmiennych po squashu; B przy regularnych wydaniach.

**Do sprawdzenia:** W02, W06. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d04).

**Twoja finalna decyzja:** B (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=B; basis=7142d35e7877; version=1; updated=2026-09-13T09:45:50.103Z -->

<a id="d05"></a>

## D05. Jak dalej obsługujemy numer wersji

Obecny CI oblicza wersję i commituje ją po testach, przez co publikowany commit nie jest testowanym commitem. Operator wybrał wersję w PR naprawczym. Pozostaje, co zostaje z `auto-version.mjs` i jak ma wyglądać przygotowanie wersji w kolejnych wydaniach.

**Status:** Operator wybrał wersję commitowaną w PR naprawczym (proponowana 1.21.0); los `auto-version.mjs` i proces kolejnych wydań to propozycja planu.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Wersja w `package.json` w PR; CI tylko waliduje; `auto-version.mjs` zostaje jako rekomendacja bez zapisu. | Człowiek przegląda wersję, a narzędzie podpowiada bump. | Ręczny krok w każdym PR wydaniowym. |
| B — najsolidniejszy | Automatyczny PR wersji (np. usługa typu release-please) przygotowuje bump i changelog do review. | Mniej ręcznej pracy przy regularnych wydaniach. | Nowa usługa, poza zakresem naprawy; kolejny writer w repo. |
| C — najzwinniejszy | Usunąć ścieżkę zapisu i rekomendacji z `auto-version.mjs`; ręczny bump i walidacja zgodności z tagiem oraz npm. | Najmniej kodu i jedno źródło prawdy. | Brak podpowiedzi bumpu na podstawie commitów. |

**Rekomendacja:** C lub A, zależnie od tego, czy podpowiedź bumpu jest używana; B jako osobna zmiana w przyszłości.

**Do sprawdzenia:** W07. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d05).

**Twoja finalna decyzja:** A (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** chcę za wszelką cenę uniknąc manualnego akceptowania wersji, jeżeli możemy to utrzymać w podobnym stanie jak działało lub inaczej zapewnić automatyzację bez wzrostu złożoności - zróbmy to

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=A; basis=1ca96b22e95b; version=1; updated=2026-09-13T09:45:50.116Z -->

<a id="d06"></a>

## D06. Jak pakujemy i publikujemy npm

Publikacja katalogu przez npm sama uzupełnia `gitHead`, ale publikacja gotowego tarballa już nie. Plan chce spakować raz, przetestować ten tarball i opublikować dokładnie te bajty. Wybór określa, czy smoke dotyczy publikowanych bajtów, czy tylko ich odpowiednika.

**Status:** Przegląd planu dodał katalog pakowania z `gitHead` i przypięty npm 11.12.1; operator tego nie zatwierdzał.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Oddzielny katalog pakowania z `gitHead` walidowanego SHA, przypięty npm 11.12.1, jeden tarball: smoke, retencja, publikacja, weryfikacja rejestru. | Opublikowane bajty to dokładnie bajty po smoke. | Własny helper pakowania i test mock-registry. |
| B — najsolidniejszy | A oraz npm provenance z OIDC i porównanie powtórnego pakowania. | Publiczny, weryfikowalny związek pakietu z workflow i commitem. | Wymaga zgodności provenance z publikacją tarballa i konfiguracji uprawnień. |
| C — najzwinniejszy | Publikacja katalogu z checkoutu dokładnego SHA; lokalny `npm pack` i porównanie integrity z rejestrem po publikacji. | npm sam ustawia `gitHead`; mniej kodu. | Rozbieżność wykryjemy dopiero po publikacji, której nie da się nadpisać. |

**Rekomendacja:** A; B jako rozszerzenie, gdy potwierdzimy zgodność provenance; C nie daje gwarancji przed publikacją.

**Do sprawdzenia:** W08–W09. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d06).

**Twoja finalna decyzja:** C (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=C; basis=c29071bc49ba; version=1; updated=2026-09-13T09:45:50.105Z -->

<a id="d07"></a>

## D07. Jak kończymy częściowo udane wydanie

Jeśli npm przyjmie wersję, a upload binariów do GitHub Release się nie uda, ponowny run nie może zbudować pakietu od nowa ani wywołać drugiego `npm publish`. Obecne pobieranie artefaktów widzi tylko bieżący run. Wybór dotyczy automatyzacji rzadkiej, ale kosztownej awarii.

**Status:** Automatyczny recovery z oryginalnym run/attempt to poprawka z przeglądu planu; operator nie wybrał jeszcze skali.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Dispatch recovery z oryginalnym run/attempt i ID artefaktów; manifest wydania; porównanie tarballa w rejestrze; dokończenie tylko brakujących assetów. | Powtarzalne dokończenie bez drugiej publikacji. | Dodatkowy workflow i testy dla rzadkiego scenariusza. |
| B — najsolidniejszy | Kolejność: szkic GitHub Release z kompletem binariów, potem npm, na końcu upublicznienie; recovery jak A. | Mniej stanów częściowych w ogóle. | Przebudowa kolejności zadań i obsługa porzuconych szkiców. |
| C — najzwinniejszy | Workflow odmawia publikacji istniejącej wersji; runbook opisuje ręczne dokończenie z weryfikacją integrity i hashy binariów. | Brak workflow recovery; zachowana blokada drugiej publikacji. | Ręczna praca operatora i ryzyko pomyłki przy uploadzie. |

**Rekomendacja:** C na pierwsze wydanie z regresją „zero drugiej publikacji”; A, gdy runbook zostanie użyty lub wydania staną się częste.

**Do sprawdzenia:** W10. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d07).

**Twoja finalna decyzja:** C (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=C; basis=8c7b00733ce1; version=1; updated=2026-09-13T09:45:50.107Z -->

<a id="d08"></a>

## D08. Promocja v4 i zakres testów przed jej bramką

Opublikowany pakiet nie oznacza, że v4 jest dostępne: R2 v4 jest puste, polityka wyłączona, a moduł 1 odblokuje się 2026-09-14T06:00:00Z. Etap 1 Session C wymaga dowodu faktycznego dostarczenia. Wybór dotyczy tego, które testy zamykają wydanie CLI, a które czekają na promocję.

**Status:** Plan rozdziela wydanie CLI od promocji treści; zakres testów przypisanych do każdej bramki jest otwarty.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Po publikacji: pobrany pakiet, instalacja anonimowa, potem zatwierdzony login i pełna akceptacja v3; promocja v4 osobno, potem test tożsamości v4 i odblokowania. | Wczesny dowód pakietu bez czekania na treści. | Dwie serie testów z realnym kontem. |
| B — najsolidniejszy | A oraz próba promocji i wycofania w osobnym buckecie przed zatwierdzeniem produkcyjnej promocji. | Mechanika promocji sprawdzona przed produkcją. | Środowisko testowe i dodatkowe dane. |
| C — najzwinniejszy | Po publikacji tylko instalacja anonimowa i integrity; login, v3 i v4 w jednej akceptacji po promocji. Weryfikacja wydania pozostaje otwarta do tych testów. | Jedna wspólna sesja akceptacyjna. | Regresja v3 wyjdzie później; brak podstaw do zamknięcia weryfikacji CLI lub etapu 1 Session C wcześniej. |

**Rekomendacja:** A; B nie jest konieczne, jeśli promocja używa istniejącego `promote-content.yml` z CAS i withdraw.

**Do sprawdzenia:** W11–W14. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d08).

**Twoja finalna decyzja:** A (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=A; basis=4fc752bec70b; version=1; updated=2026-09-13T09:45:50.110Z -->

## Co trzeba sprawdzić przed realizacją i wydaniem

Większość niewiadomych to testy i inspekcje po stronie Session A, nie pytania do operatora. Pełny rejestr W01–W14 jest w [załączniku](decisions-details.md#verification).

| Obszar | Co pozostaje niewiadome | Kiedy potrzebujemy odpowiedzi |
|---|---|---|
| Dowód PR i mastera | Pełny cykl merge Toolkit → dowód PR CLI → squash → świeży dowód mastera. | Przed review PR naprawczych. |
| Workflow Toolkit | Czy dispatch nie uruchamia żadnego zadania z efektami i czy każdy master zachowuje stage. | Przed mergem Toolkit. |
| Attempty | Odmowa przepisanych, mieszanych i niekompletnych attemptów. | Przed mergem Toolkit. |
| Pakiet | `gitHead`, integrity, wersja 1.21.0 wolna, brak drugiej publikacji. | Przed mergem CLI i ponownie przed publikacją. |
| Produkcja | Akceptacja pobranego pakietu, prerekwizyty promocji, odblokowanie po 06:00 UTC. | Po publikacji, przed promocją i po granicy czasu. |

## Koszty i ograniczenia, które warto zaakceptować świadomie

- Świeży dowód po squashu oznacza drugi pełny przebieg E2E Linux/Windows dla każdego wydania.
- Stage z każdego udanego mastera zwiększa zużycie retencji artefaktów GitHub.
- Ręczna koordynacja między repozytoriami zależy od inspekcji Session A przed każdą operacją; zmienne nie są blokadą.
- Wydanie pakietu nie czyni v4 dostępnym; etap 1 Session C pozostaje niespełniony do dowodu dostarczenia.
- Obecny v3 różni się od historycznej fixture; zachowujemy faktyczny stan, nie przywracamy fixture.

## Dyspozycja po przeglądzie

**Zakres pierwszego wydania:** …

**Wybrane warianty do przeniesienia do planu:** …

**Decyzje odroczone i warunki powrotu:** …

**Najważniejsze dowody do zebrania przed kodowaniem:** …

**Pozostałe uwagi:** …

Szczegółowe koszty i zależności wariantów są w [załączniku](decisions-details.md). Ten brief nie zmienia planu ani nie autoryzuje implementacji.
