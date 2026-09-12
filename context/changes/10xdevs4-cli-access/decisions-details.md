# 10xDevs 4 — szczegółowe warianty i weryfikacja

Data: 2026-09-09. Zakres: 10x-cli i 10x-toolkit.

[Executive brief — tu wpisz finalne decyzje](decisions.md). Ten załącznik zachowuje pełne porównania techniczne; głównym arkuszem wyboru jest executive brief.

[Plan wykonawczy](plan.md) · [Skrót](plan-brief.md) · [Research](research.md) · [Przegląd planu](reviews/plan-review.md)

To arkusz wyboru wariantów, nie zmiana zatwierdzonego zakresu ani zgoda na wdrożenie. Obecne ustalenia zachowują ważność. Puste pole finalnej decyzji służy do utrwalenia wyboru lub świadomej korekty; nie oznacza, że wcześniejsze ustalenia trzeba zatwierdzać od nowa. Alternatywy B/C nie są zaimplementowane i nie zostały dopisane do planu jako obowiązujące.

## Jak czytać warianty

- **A — obecny plan:** zachowanie i zakres zapisane teraz.
- **B — najsolidniejsza alternatywa:** mocniejsze gwarancje, automatyzacja lub lepsza obsługa skali. „Bardziej pro” nie znaczy automatycznie lepsze dla obecnego etapu.
- **C — najzwinniejsza alternatywa:** mniejszy zakres mechanizmów i niższy koszt stały, z jawnym opisem utraconej wygody lub gwarancji. C może być celowo węższą realizacją A, jeśli A jest już prostym rozwiązaniem.
- **Koszt „budowa / utrzymanie”** to względna ocena architektoniczna, nie estymacja godzin ani rachunku dostawcy. Koszt ręcznej pracy operatora i supportu też się liczy.
- **Status** odróżnia Twoje wymagania od propozycji technicznych. „Do sprawdzenia” oznacza brak dowodu, nie pytanie o zgodę. Lista W01–W20 na końcu podaje wymagany wynik weryfikacji.

Warianty zachowują kontrolę dostępu, ochronę własnych plików i zakaz pobierania zablokowanych skilli v4. Nie przywracamy odrzuconego pomysłu archiwizacji skilli v3 tylko dlatego, że ich zamiennik v4 nie jest jeszcze dostępny.

## Ustalenia, które są już wyraźne

- V4-only ma móc się zalogować i pobrać pierwszy tydzień; nowy projekt ma korzystać z najlepszego dostępnego kursu.
- V3 ma cutoff sprzed v4 i tylko utrzymanie. V4 korzysta z najnowszych opublikowanych źródeł, z możliwością przypięcia pliku do commita.
- Przejście projektu jest jawne, ma podgląd, backup i odzyskiwanie.
- Migracja podmienia tylko odblokowane skille v4. Pozostałe pozostają aktywne z v3; manifest pamięta ich pochodzenie i oczekiwanie, a późniejsze sync kontynuuje aktualizacje.
- Temat Unaited nie jest już potrzebny. Sensowne rozwiązania z branchy można wykorzystać po sprawdzeniu.

## Indeks decyzji

| ID | Temat | Rekomendacja do wyboru |
|---|---|---|
| [D01](#d01) | Wybór edycji i odkrywanie dostępu | C — mały resolver i jawna lista kursów wystarczą; zachować zachowanie opisane w A. |
| [D02](#d02) | Uprawnienia, tokeny i zachowanie grantów przy zmianach Circle | A/C teraz; B dopiero przy potwierdzonych wymaganiach silniejszej spójności. Nie oszczędzać na kontroli wszystkich tras. |
| [D03](#d03) | Źródło materiałów pierwszego tygodnia v4 | C/A po przeglądzie zawartości; dokładnego syllabus nie przyjmować z samego ID lekcji. |
| [D04](#d04) | Cutoff v3 i publikowanie poprawek utrzymaniowych | A z procesem C na start. Kandydat cutoffu wymaga dowodu z historii i treści. |
| [D05](#d05) | V4 latest i przypięcia commitów pojedynczych plików | C jako implementacja A. Nie dodawać dodatkowych poziomów override bez realnych przypadków. |
| [D06](#d06) | Niezmienne wydania R2 i identyfikator wydania w API | C — w praktyce najwęższa realizacja A. Nie wracać do mutowalnych paczek przy operacjach wielu pobrań. |
| [D07](#d07) | Promocja wydania, równoległe publikacje i retencja R2 | C na start; docelowy trigger promocji wpisać w finalnej decyzji. Konkretnego mechanizmu CAS nie uznawać za sprawdzony tylko na podstawie dokumentacji. |
| [D08](#d08) | Stopniowa migracja v3→v4 i zakres zgodności skilli | A z C jako sposobem wdrożenia. Odrzucone wcześniej archiwizowanie/blokowanie całej migracji nie wraca jako alternatywa. |
| [D09](#d09) | Mapa odpowiedników między edycjami | C po W11; bez dowodu stabilności tożsamości pozostać przy ręcznej mapie A. |
| [D10](#d10) | Manifesty: edycja projektu, pochodzenie i stan oczekiwania | A jako obecna baza; przed wyborem C sprawdzić, czy rzeczywiście zmniejsza liczbę ścieżek zapisu. To jedna z najważniejszych decyzji implementacyjnych. |
| [D11](#d11) | Kontynuacja przez sync i zakres profili | A z prostym pełnym skanem pending; wybór wszystkich profili versus aktywnego zaznaczyć jawnie. |
| [D12](#d12) | Backup, dziennik, wznowienie i rollback | C jako ścisłe ograniczenie A; backup nie zastępuje dziennika, a Git commit użytkownika nie obejmuje pewnie plików ignorowanych/nieśledzonych. |
| [D13](#d13) | Lokalne konflikty, usuwanie plików i reguły współdzielone | C/A na pierwsze wydanie; automatyczny merge B zostawić jako osobny zakres. |
| [D14](#d14) | Kompatybilność starych CLI i manifestów | A/C; decyzję opierać na demonstracji starego binary, nie deklaracji minCliVersion w pliku. |
| [D15](#d15) | Zakres pierwszego wydania i wykorzystanie branchy | C, jeśli pilność logowania i tygodnia 1 przeważa; A, jeśli migracja musi wejść razem. To decyzja o kolejności, nie ciche cięcie zakresu. |
| [D16](#d16) | Weryfikacja, kolejność wdrożenia i wycofanie publikacji | A z C w zakresie automatyzacji; nie skracać testów odzyskiwania ani nie wdrażać treści przed autoryzacją. |

<a id="d01"></a>

## D01. Wybór edycji i odkrywanie dostępu

**Status:** Kierunek potwierdzony; szczegółowy kontrakt discovery jest propozycją techniczną.

**Oparcie:** Plan: fazy 2 i 4.

### A — obecny plan

Jedno discovery API; nowy projekt wybiera najwyższą dostępną edycję. Istniejący zachowuje binding, zmieniany wyłącznie migracją. Jawny wybór służy też do podglądu.

- **Silna strona:** Wygodne logowanie v4-only; zakup v4 nie zmienia istniejącego projektu.
- **Słaba strona:** Nowa zależność CLI od discovery; jego awaria przerywa operację zamiast uruchamiać zgadywanie.
- **Tradeoff:** Automatyczny dobór dla nowej instalacji w zamian za dodatkowy kontrakt API.
- **Koszt budowy / utrzymania:** średni / niski.

### B — najsolidniejsza alternatywa

Wspólna, wersjonowana polityka uprawnień i wyboru edycji, z kodami powodów, testami kontraktowymi i diagnostyką dla supportu.

- **Silna strona:** Spójne decyzje we wszystkich klientach i łatwiejsze wyjaśnienie odmowy.
- **Słaba strona:** Większy model i utrzymywanie zgodności wersji polityki.
- **Tradeoff:** Opłaca się przy wielu klientach/edycjach; dla dwóch kursów może być nadmiarem.
- **Koszt budowy / utrzymania:** wysoki / średni.

### C — najzwinniejsza alternatywa

Mały endpoint zwracający dwie znane edycje i rekomendację; stała kolejność v4→v3, jeden wspólny resolver CLI, bez ogólnego silnika polityk.

- **Silna strona:** Mało kodu, nadal automatyczny wybór i ochrona istniejących projektów.
- **Słaba strona:** Dodanie nowego produktu wymaga jawnej aktualizacji kodu.
- **Tradeoff:** Rezygnacja z konfigurowalności na rzecz prostoty; nadal bez fallbacku przy awarii.
- **Koszt budowy / utrzymania:** niski / niski.

**Moja rekomendacja:** C — mały resolver i jawna lista kursów wystarczą; zachować zachowanie opisane w A.

**Do sprawdzenia:** W01, W02.

**Finalny wybór wpisz w [karcie D01 executive briefu](decisions.md#d01).**


<a id="d02"></a>

## D02. Uprawnienia, tokeny i zachowanie grantów przy zmianach Circle

**Status:** Wymaganie poprawnego dostępu potwierdzone; pozostanie przy KV i granice spójności są propozycją techniczną.

**Oparcie:** Plan: fazy 1–2.

### A — obecny plan

Naprawić scalanie grantów i odzyskiwanie indeksów w KV. Każda trasa sprawdza kurs i odblokowanie lekcji. Discovery czyta aktualne granty; token z nieaktualnym zakupem odświeżamy raz.

- **Silna strona:** Naprawia odtworzone błędy bez zmiany magazynu danych.
- **Słaba strona:** Zapis kilku kluczy KV nie jest transakcją; model tokenów zachowuje dotychczasowe okno cofnięcia dostępu do 1h.
- **Tradeoff:** Mniejsza zmiana infrastruktury w zamian za jawne ograniczenia równoległych zapisów.
- **Koszt budowy / utrzymania:** średni / średni.

### B — najsolidniejsza alternatywa

Jeden autorytatywny, transakcyjny rejestr grantów i tożsamości, z idempotentnymi zdarzeniami, historią zmian oraz kontrolowaną projekcją do odczytu.

- **Silna strona:** Silniejsze gwarancje aktualizacji i lepszy audyt; łatwiejsza obsługa złożonych źródeł dostępu.
- **Słaba strona:** Migracja danych, nowa ścieżka zapisów i więcej operacji utrzymaniowych.
- **Tradeoff:** Usuwa część klas błędów kosztem znacznego rozszerzenia zakresu; natychmiastowe cofanie tokenów wymaga dodatkowego projektu.
- **Koszt budowy / utrzymania:** wysoki / wysoki.

### C — najzwinniejsza alternatywa

Pozostać przy KV i obecnych tokenach; scentralizować funkcje zapisu, zachować konieczny marker odzyskiwania, sekwencyjny reconcile i prosty raport rozbieżności, bez nowego systemu zdarzeń.

- **Silna strona:** Mniej elementów, wykorzystanie obecnej infrastruktury.
- **Słaba strona:** Równoległe wywołania z różnych procesów nadal wymagają wykrywania i naprawy; sekwencyjny cron nie serializuje wszystkich webhooków.
- **Tradeoff:** Najmniejszy sensowny zakres naprawy; nie wolno obiecywać transakcyjności.
- **Koszt budowy / utrzymania:** średni / niski–średni.

**Moja rekomendacja:** A/C teraz; B dopiero przy potwierdzonych wymaganiach silniejszej spójności. Nie oszczędzać na kontroli wszystkich tras.

**Do sprawdzenia:** W02, W03.

**Finalny wybór wpisz w [karcie D02 executive briefu](decisions.md#d02).**


<a id="d03"></a>

## D03. Źródło materiałów pierwszego tygodnia v4

**Status:** Nie w pełni zatwierdzone: dostęp do tygodnia 1 jest wymagany, ale dokładna zawartość wymaga przeglądu.

**Oparcie:** Plan: faza 3, definicje treści.

### A — obecny plan

Osobne definicje v4 na bazie obecnych m1l1–m1l5, z przeglądem treści specyficznych dla v3; publikacja EN/PL.

- **Silna strona:** Szybki start na istniejących materiałach i niezależny rozwój edycji.
- **Słaba strona:** Kopia definicji może się rozjechać; obecny tydzień v3 nie jest dowodem właściwego programu v4.
- **Tradeoff:** Szybkość dostarczenia w zamian za ręczną kontrolę zgodności programu.
- **Koszt budowy / utrzymania:** niski–średni / średni.

### B — najsolidniejsza alternatywa

Jawna specyfikacja programu v4: macierz lekcja→artefakty→reguły→zależności, przegląd treści i automatyczna walidacja pokrycia wydania.

- **Silna strona:** Lepsza kontrola kompletności i zmian programu; wsparcie późniejszych tygodni.
- **Słaba strona:** Dodatkowy model treści i proces redakcyjny.
- **Tradeoff:** Większa kontrola kosztem czasu przed pierwszą publikacją.
- **Koszt budowy / utrzymania:** wysoki / średni.

### C — najzwinniejsza alternatywa

Ręcznie wskazać wymagane artefakty pięciu lekcji w małych, jawnych definicjach i przejrzeć ich wynik; bez ogólnego modelu programu i bez runtime importów z v3.

- **Silna strona:** Niewielka ilość kodu i widoczny zakres; niezależność edycji pozostaje.
- **Słaba strona:** Powtórzenia i ręczne aktualizacje wraz z rozwojem kursu.
- **Tradeoff:** Prostota dla pięciu lekcji zamiast przygotowania infrastruktury dla całego katalogu.
- **Koszt budowy / utrzymania:** niski / niski–średni.

**Moja rekomendacja:** C/A po przeglądzie zawartości; dokładnego syllabus nie przyjmować z samego ID lekcji.

**Do sprawdzenia:** W04.

**Finalny wybór wpisz w [karcie D03 executive briefu](decisions.md#d03).**


<a id="d04"></a>

## D04. Cutoff v3 i publikowanie poprawek utrzymaniowych

**Status:** Zatwierdzone: cutoff sprzed v4 i tylko utrzymanie. Nieustalone: dokładny SHA i docelowy proces wydań utrzymaniowych.

**Oparcie:** Plan: faza 3; aktualna publikacja v3 pozostaje nienaruszona podczas wdrożenia v4.

### A — obecny plan

Pełny SHA jako baza v3, świadome poprawki utrzymaniowe, osobny zakres publikacji. Backup i hashe rzeczywistych obiektów R2 chronią obecnych użytkowników.

- **Silna strona:** Zmiany v4 nie przepływają do v3; można wykazać, co zmieniło się w publikacji.
- **Słaba strona:** Dwa nurty utrzymania. Historyczny commit nie musi odtwarzać dzisiejszych tłumaczeń i paczek.
- **Tradeoff:** Stabilność starej edycji kosztem osobnych poprawek i publikacji.
- **Koszt budowy / utrzymania:** średni / średni.

### B — najsolidniejsza alternatywa

Dedykowana gałąź maintenance v3 z tagowanymi wydaniami, zapisanymi wejściami transformacji i manifestami wynikowych obiektów; jawna polityka przenoszenia poprawek.

- **Silna strona:** Powtarzalne wydania i dobra historia audytowa.
- **Słaba strona:** Proces gałęzi, testy kompatybilności i utrzymanie starego środowiska builda.
- **Tradeoff:** Najlepsze przy regularnym utrzymaniu v3; kosztowne przy kilku poprawkach rocznie.
- **Koszt budowy / utrzymania:** średni–wysoki / średni.

### C — najzwinniejsza alternatywa

Pozostawić opublikowane paczki v3 bez zmian; przy rzadkiej poprawce utworzyć izolowany checkout cutoffu z wybranymi poprawkami i wydać tylko przejrzany diff, bez stale utrzymywanej gałęzi.

- **Silna strona:** Mało stałej infrastruktury i brak przypadkowego republish v3.
- **Słaba strona:** Więcej ręcznej pracy przy każdej poprawce; odtwarzalność zależy od zapisanych wejść i wyników.
- **Tradeoff:** Niski koszt stały w zamian za wolniejsze, rzadsze wydania.
- **Koszt budowy / utrzymania:** niski–średni / niski przy rzadkich poprawkach.

**Moja rekomendacja:** A z procesem C na start. Kandydat cutoffu wymaga dowodu z historii i treści.

**Do sprawdzenia:** W05, W06.

**Finalny wybór wpisz w [karcie D04 executive briefu](decisions.md#d04).**


<a id="d05"></a>

## D05. V4 latest i przypięcia commitów pojedynczych plików

**Status:** Zatwierdzone: latest domyślnie, możliwość pina pliku. Szczegóły rozwiązywania źródeł i cache są propozycją.

**Oparcie:** Plan: faza 3, źródła artefaktów.

### A — obecny plan

Pin pliku ma pierwszeństwo przed domyślną wersją kursu. Latest rozwiązuje się do SHA raz podczas builda; pliki czytamy z czystych drzew Git. Zapisujemy pochodzenie, brak źródła przerywa build.

- **Silna strona:** Elastyczne wyjątki i ustalone wejścia konkretnego wydania.
- **Słaba strona:** Można połączyć SKILL.md i skrypt z niezgodnych wersji. Pin źródła nie zamraża sam z siebie tłumaczenia.
- **Tradeoff:** Precyzja wyboru plików wymaga kontroli ich wspólnej zgodności.
- **Koszt budowy / utrzymania:** średni / średni.

### B — najsolidniejsza alternatywa

Pełny lock źródeł, grupowe przypięcia całych skilli obok override pliku, wersjonowanie transformacji i testy zgodności zależności; budowanie w odtwarzalnym środowisku.

- **Silna strona:** Silniejsze odtwarzanie wydań i mniej niejawnych zależności.
- **Słaba strona:** Więcej reguł pierwszeństwa, metadanych i narzędzi aktualizacji locka.
- **Tradeoff:** Dodatkowe gwarancje kosztem obsługi bardziej rozbudowanego systemu wersji.
- **Koszt budowy / utrzymania:** wysoki / średni–wysoki.

### C — najzwinniejsza alternatywa

Jedna mała konfiguracja per kurs: default SHA/latest i słownik path→SHA. Grupować odczyty po commicie, zachować manifest źródeł, walidację support files i prosty cache wynikający z wejściowych hashy.

- **Silna strona:** Zachowuje wymagane piny bez budowania ogólnego managera pakietów.
- **Słaba strona:** Zgodność semantyczna SKILL.md ze skryptami nadal wymaga review; mniej automatycznych ułatwień.
- **Tradeoff:** Mała implementacja kosztem ręcznej kontroli wyjątków.
- **Koszt budowy / utrzymania:** średni / niski–średni.

**Moja rekomendacja:** C jako implementacja A. Nie dodawać dodatkowych poziomów override bez realnych przypadków.

**Do sprawdzenia:** W07.

**Finalny wybór wpisz w [karcie D05 executive briefu](decisions.md#d05).**


<a id="d06"></a>

## D06. Niezmienne wydania R2 i identyfikator wydania w API

**Status:** Propozycja techniczna włączona do planu; osobnego ostatecznego wyboru architektury nie zapisano.

**Oparcie:** Plan: fazy 3, 4 i 7.

### A — obecny plan

Osobny prefiks releases/<releaseId>, katalog, mapa migracji i manifest hashy; current.json wskazuje zweryfikowane wydanie. Wszystkie pobrania w operacji używają jednego releaseId.

- **Silna strona:** Spójność wielu pobrań; nieudany upload nie jest aktywowany; rollback nie nadpisuje paczek.
- **Słaba strona:** Zmiany wszystkich tras i klientów; więcej obiektów i obsługa starych wydań.
- **Tradeoff:** Większy koszt początkowy za prostsze odzyskiwanie i diagnozowanie publikacji.
- **Koszt budowy / utrzymania:** średni–wysoki / średni.

### B — najsolidniejsza alternatywa

Obiekty adresowane hashem, deduplikacja, podpisane indeksy wydań, kanały candidate/stable i promocja tych samych bajtów między środowiskami.

- **Silna strona:** Lepszy audyt i skalowanie wielu kanałów; ograniczenie duplikacji danych.
- **Słaba strona:** Dodatkowa warstwa indeksów, zależności i zarządzania retencją.
- **Tradeoff:** Wartość rośnie przy wielu wydaniach/produktach; obecnie ryzyko nadmiernego zakresu.
- **Koszt budowy / utrzymania:** wysoki / wysoki.

### C — najzwinniejsza alternatywa

Niezmienne katalogi i paczki tylko dla v4, prosty releaseId oraz jeden current.json; v3 zachowuje istniejące klucze. Bez deduplikacji, kanałów i usługi rejestru wydań.

- **Silna strona:** Zachowuje spójność wymaganą przez migrację przy najmniejszej liczbie nowych elementów.
- **Słaba strona:** Duplikacja obiektów i podstawowa obsługa historii.
- **Tradeoff:** Koszt miejsca zamiast skomplikowanej logiki; nadpisywanie stałych kluczy nie jest równoważnym uproszczeniem.
- **Koszt budowy / utrzymania:** średni / niski–średni.

**Moja rekomendacja:** C — w praktyce najwęższa realizacja A. Nie wracać do mutowalnych paczek przy operacjach wielu pobrań.

**Do sprawdzenia:** W08, W09.

**Finalny wybór wpisz w [karcie D06 executive briefu](decisions.md#d06).**


<a id="d07"></a>

## D07. Promocja wydania, równoległe publikacje i retencja R2

**Status:** Nie w pełni ustalone: wymagane gwarancje zapisano, ale wyzwalacz promocji i konkretna ścieżka zapisu potrzebują wyboru.

**Oparcie:** Plan: fazy 3 i 7; latest oznacza ostatnie udane opublikowane wydanie, nie każdy commit natychmiast.

### A — obecny plan

Weryfikować komplet wydania, serializować publikację/rollback, warunkowo zmieniać current; zachowywać poprzednie wydania bez automatycznego kasowania w pierwszej wersji.

- **Silna strona:** Stare zadanie nie powinno nadpisać nowego wydania; aktywne operacje zachowują swoje źródła.
- **Słaba strona:** Pozostaje wybrać, czy każdy zielony build promuje automatycznie. Retencja bez limitu zwiększa zajętość magazynu.
- **Tradeoff:** Proste odzyskiwanie kosztem miejsca i konieczności domknięcia kontroli writerów.
- **Koszt budowy / utrzymania:** średni / średni.

### B — najsolidniejsza alternatywa

Jeden kontroler promocji z rejestrem zdarzeń, kanałami i sprawdzaniem warunków wdrożenia; referencyjna retencja chroniąca używane wydania i kontrolowany garbage collector.

- **Silna strona:** Spójna polityka także dla narzędzi operatora; mniejsza zależność od ręcznych procedur.
- **Słaba strona:** Nowa usługa/stan oraz szczególnie ryzykowna logika usuwania starych wydań.
- **Tradeoff:** Mniejszy koszt operacyjny przy skali, większy koszt budowy i utrzymania systemu.
- **Koszt budowy / utrzymania:** wysoki / wysoki.

### C — najzwinniejsza alternatywa

Jedna ścieżka promocji w CI, jawne uruchomienie dla wskazanego zielonego builda, brak równoległych alternatywnych writerów; warunkowy zapis wskaźnika i brak automatycznego GC.

- **Silna strona:** Mało automatyki i czytelny wybór publikowanych bajtów.
- **Słaba strona:** Operator wykonuje promocję; rozwiązanie wymaga rzeczywistego wyeliminowania bocznych ścieżek zapisu.
- **Tradeoff:** Część pracy ręcznej zamiast usługi sterującej. Sam odczyt, porównanie i zwykły PUT nie zastępuje warunkowego zapisu.
- **Koszt budowy / utrzymania:** niski–średni / niski przy małej liczbie wydań.

**Moja rekomendacja:** C na start; docelowy trigger promocji wpisać w finalnej decyzji. Konkretnego mechanizmu CAS nie uznawać za sprawdzony tylko na podstawie dokumentacji.

**Do sprawdzenia:** W08, W10.

**Finalny wybór wpisz w [karcie D07 executive briefu](decisions.md#d07).**


<a id="d08"></a>

## D08. Stopniowa migracja v3→v4 i zakres zgodności skilli

**Status:** Potwierdzone wprost przez użytkownika: podmiana tylko odblokowanych skilli; reszta zostaje aktywna jako v3 i oczekuje na v4.

**Oparcie:** Plan: faza 5, migracja i kontynuacja.

### A — obecny plan

Po jawnej migracji projekt celuje w v4. Podmieniamy dostępne skille, a pozostałym zachowujemy bajty v3 i status pending. Cały skill z support files zmienia się razem.

- **Silna strona:** Projekt nadal działa, bez wcześniejszego udostępniania treści i bez usuwania późniejszych skilli.
- **Słaba strona:** Przejściowo współistnieją źródła v3/v4; zależności i wspólne reguły mogą być niezgodne.
- **Tradeoff:** Płynne przejście za cenę jawnego stanu przejściowego i testów zgodności.
- **Koszt budowy / utrzymania:** wysoki / średni.

### B — najsolidniejsza alternatywa

Deklaracje zależności i zgodności między skillami; wyliczanie zgodnych grup aktualizacji oraz testy macierzy v3/v4 przed dopuszczeniem zamiennika.

- **Silna strona:** Lepiej wykrywa przypadki, gdy pojedyncza podmiana psuje inny skill.
- **Słaba strona:** Koszt utrzymywania grafu zależności i definicji zgodności.
- **Tradeoff:** Więcej automatycznej ochrony, ale możliwe opóźnienie aktualizacji większej grupy przez jeden konflikt.
- **Koszt budowy / utrzymania:** wysoki / wysoki.

### C — najzwinniejsza alternatywa

Jawna lista niezależnych zamienników i mała lista wyjątków wymagających wspólnej aktualizacji; walidacja plików plus przegląd znanych zależności, bez ogólnego solvera.

- **Silna strona:** Zachowuje zatwierdzony model przy mniejszej złożoności.
- **Słaba strona:** Słabiej wykrywa nieopisane zależności semantyczne.
- **Tradeoff:** Ręczna kontrola niewielkiej biblioteki zamiast ogólnego systemu zależności.
- **Koszt budowy / utrzymania:** średni / niski–średni.

**Moja rekomendacja:** A z C jako sposobem wdrożenia. Odrzucone wcześniej archiwizowanie/blokowanie całej migracji nie wraca jako alternatywa.

**Do sprawdzenia:** W11, W12.

**Finalny wybór wpisz w [karcie D08 executive briefu](decisions.md#d08).**


<a id="d09"></a>

## D09. Mapa odpowiedników między edycjami

**Status:** Potrzeba bezpiecznego mapowania wynika z migracji; format i stopień ręcznego utrzymywania nie są finalnie zatwierdzone.

**Oparcie:** Plan: fazy 3 i 5; identyczne m1lN nie dowodzi identycznego zestawu artefaktów.

### A — obecny plan

Jawna mapa tożsamości artefaktów i docelowych lekcji, wersjonowana z wydaniem. Brak wpisu pozostawia pending; dostęp sprawdzany na żywo.

- **Silna strona:** Obsługuje przeniesienia i zmiany nazw; nie myli postępu lekcji z pochodzeniem skilla.
- **Słaba strona:** Ręczna mapa może się zestarzeć albo nie pokryć istniejących instalacji.
- **Tradeoff:** Więcej pracy redakcyjnej za przewidywalne zamienniki.
- **Koszt budowy / utrzymania:** średni / średni.

### B — najsolidniejsza alternatywa

Stabilne, niezależne od nazw ID artefaktów, jawne relacje zastąpienia/podziału/scalenia i testy pokrycia dla znanych historycznych wydań.

- **Silna strona:** Lepsza ewolucja biblioteki i automatyczna diagnoza brakujących ścieżek migracji.
- **Słaba strona:** Nowy kontrakt tożsamości oraz rozbudowane reguły historii.
- **Tradeoff:** Długoterminowa elastyczność kosztem wdrożenia modelu rejestru artefaktów.
- **Koszt budowy / utrzymania:** wysoki / średni–wysoki.

### C — najzwinniejsza alternatywa

Generować prostą mapę z przejrzanej listy niezmienionych nazw; tylko rename/usunięcia i zmiany znaczenia opisywać ręcznie. Publikować wynik jako jawny dokument, bez zgadywania w CLI.

- **Silna strona:** Mały koszt utrzymania przy stabilnych nazwach.
- **Słaba strona:** Wymaga potwierdzenia, że zachowana nazwa oznacza ten sam artefakt; reguły i kumulatywne lekcje nadal potrzebują kontroli.
- **Tradeoff:** Automatyzujemy mechanikę, pozostawiamy review znaczenia.
- **Koszt budowy / utrzymania:** niski–średni / niski.

**Moja rekomendacja:** C po W11; bez dowodu stabilności tożsamości pozostać przy ręcznej mapie A.

**Do sprawdzenia:** W11, W13.

**Finalny wybór wpisz w [karcie D09 executive briefu](decisions.md#d09).**


<a id="d10"></a>

## D10. Manifesty: edycja projektu, pochodzenie i stan oczekiwania

**Status:** Potwierdzone: manifest pamięta oczekujące aktualizacje. Szczegółowy schemat i miejsce przechowywania są propozycją.

**Oparcie:** Plan: fazy 4–5.

### A — obecny plan

Root binding określa v4; manifesty profili dostają wersjonowany courseTransition per artefakt, z rzeczywistym źródłem, plikami/hashami i stanem pending/conflict/applied. Stare ownership oddzielamy od lekcji v4.

- **Silna strona:** Prawdziwa informacja o instalacji; cleanup chroni pending, identyczne ID lekcji nie nadpisują źródła.
- **Słaba strona:** Wszystkie writery muszą zachować nowe pola; rozproszone manifesty i wspólne ścieżki zwiększają złożoność.
- **Tradeoff:** Mniejsza migracja schematu w zamian za dodatkową ewidencję obok lekcji.
- **Koszt budowy / utrzymania:** wysoki / średni–wysoki.

### B — najsolidniejsza alternatywa

Jedna autorytatywna baza stanu projektu z tożsamością fizycznych plików i grafem właścicieli; manifesty profili jako wyliczane projekcje.

- **Silna strona:** Mniej rozbieżności między profilami i bardziej jednolity model.
- **Słaba strona:** Duża migracja lokalnego stanu i zmiana wszystkich konsumentów; pliki nadal wymagają osobnego recovery.
- **Tradeoff:** Lepsza struktura długoterminowa kosztem szerokiego refaktoru.
- **Koszt budowy / utrzymania:** wysoki / średni po wdrożeniu.

### C — najzwinniejsza alternatywa

Mały, dedykowany rejestr przejścia w jednym pliku projektu; dotychczasowe manifesty zostają dla v4, a jeden wspólny adapter do odczytu/zapisu/cleanup uwzględnia pending.

- **Silna strona:** Mniejszy schemat i mniej powielanych danych przejścia.
- **Słaba strona:** Dwa źródła informacji wymagają wspólnej transakcji; uproszczenie nie zadziała, jeśli którykolwiek writer ominie adapter.
- **Tradeoff:** Mniej zmian w typach kosztem konieczności jednego rygorystycznego punktu integracji.
- **Koszt budowy / utrzymania:** średni / średni.

**Moja rekomendacja:** A jako obecna baza; przed wyborem C sprawdzić, czy rzeczywiście zmniejsza liczbę ścieżek zapisu. To jedna z najważniejszych decyzji implementacyjnych.

**Do sprawdzenia:** W13, W14.

**Finalny wybór wpisz w [karcie D10 executive briefu](decisions.md#d10).**


<a id="d11"></a>

## D11. Kontynuacja przez sync i zakres profili

**Status:** Potwierdzone: późniejsze sync podmienia skille po odblokowaniu. Obsługa wszystkich profili domyślnie jest propozycją techniczną.

**Oparcie:** Plan: faza 5; brak nowego wydania nie oznacza braku nowo odblokowanej lekcji.

### A — obecny plan

Przy każdym sync sprawdzać pending przed filtrami lekcji i skrótem digestu; domyślnie wszystkie zapisane profile. Pobierać tylko wskazane zamienniki, bez reszty lekcji.

- **Silna strona:** Odblokowanie czasowe działa bez nowego builda; nie trzeba pamiętać o dawnych profilach.
- **Słaba strona:** Więcej sprawdzanych wpisów i niespodziewany dla części użytkowników szerszy zakres sync.
- **Tradeoff:** Wygoda automatycznej kontynuacji kosztem dodatkowych odczytów i złożoności filtrów.
- **Koszt budowy / utrzymania:** średni–wysoki / średni.

### B — najsolidniejsza alternatywa

Backend zwraca wersjonowany plan dostępnych aktualizacji z wersją stanu odblokowania; klient przelicza tylko zmienione możliwości i pokazuje postęp profili.

- **Silna strona:** Mniej zbędnego przeliczania przy dużych instalacjach; lepsza obserwowalność.
- **Słaba strona:** Nowy protokół i unieważnianie cache także dla zmian czasu/KV.
- **Tradeoff:** Optymalizacja kosztem kolejnego kontraktu i ryzyka nieaktualnych danych.
- **Koszt budowy / utrzymania:** wysoki / wysoki.

### C — najzwinniejsza alternatywa

Prosta kontrola całej małej listy pending przy sync, bez osobnego protokołu aktualizacji. Rozważyć domyślnie wybrany profil i jawne --all-profiles, z widocznym raportem pozostałych wpisów.

- **Silna strona:** Mniej pobrań i mniejszy zakres jednej operacji; łatwiejsze debugowanie.
- **Słaba strona:** Pozostałe profile mogą długo pozostać na v3, jeśli użytkownik ich nie synchronizuje.
- **Tradeoff:** Mniejszy koszt za mniejszą automatyzację; zmiana domyślnego zakresu wymaga Twojego wyboru.
- **Koszt budowy / utrzymania:** średni / niski–średni.

**Moja rekomendacja:** A z prostym pełnym skanem pending; wybór wszystkich profili versus aktywnego zaznaczyć jawnie.

**Do sprawdzenia:** W12, W15.

**Finalny wybór wpisz w [karcie D11 executive briefu](decisions.md#d11).**


<a id="d12"></a>

## D12. Backup, dziennik, wznowienie i rollback

**Status:** Potwierdzone: preview, backup, resume/rollback i końcowy zapis metadanych. Retencja i zakres rollbacku po zakończeniu wymagają finalizacji.

**Oparcie:** Plan: faza 5; zakończona transakcja może pozostawić skille pending.

### A — obecny plan

Lokalny backup i staging odblokowanych plików; dziennik zamiaru/wyniku, blokada zapisów, odzyskiwanie z before/after hashy. Wspólne manifesty i binding zatwierdzane na końcu.

- **Silna strona:** Przerwanie jest rozpoznawalne; lokalny rollback nie wymaga sieci ani ponownego dostępu do kursu.
- **Słaba strona:** Dużo stanów awarii i testów systemów plików. Backupy zostają bez automatycznego kasowania; późniejsze edycje mogą zablokować automatyczny rollback.
- **Tradeoff:** Gwarancje odzyskania kosztem kodu i miejsca na dysku.
- **Koszt budowy / utrzymania:** wysoki / średni–wysoki.

### B — najsolidniejsza alternatywa

Trwały rejestr wielu operacji, historia snapshotów, diagnostyka/naprawa, kontrolowana retencja i zdefiniowane gwarancje trwałości na każdym wspieranym systemie.

- **Silna strona:** Lepsze wsparcie długiej historii zmian i trudnych przypadków odzyskiwania.
- **Słaba strona:** Większa powierzchnia błędów oraz utrzymywanie własnego systemu historii projektu.
- **Tradeoff:** Wartość dla rozbudowanego managera instalacji; duży koszt dla jednej migracji.
- **Koszt budowy / utrzymania:** bardzo wysoki / wysoki.

### C — najzwinniejsza alternatywa

Jeden aktywny dziennik i minimalny snapshot tylko dotykanych plików. Zachować resume/rollback ostatniej operacji; po kolejnych zmianach dawać backup do ręcznego odzyskania zamiast obiecywać dowolną historię cofania.

- **Silna strona:** Mniej stanów i mniej danych; zachowuje odzyskiwanie przerwanej migracji.
- **Słaba strona:** Węższa wygoda cofania zakończonych operacji; ręczna praca po późniejszych zmianach.
- **Tradeoff:** Mniejszy zakres produktu przy zachowaniu wymaganej ochrony danych.
- **Koszt budowy / utrzymania:** średni–wysoki / średni.

**Moja rekomendacja:** C jako ścisłe ograniczenie A; backup nie zastępuje dziennika, a Git commit użytkownika nie obejmuje pewnie plików ignorowanych/nieśledzonych.

**Do sprawdzenia:** W14, W16.

**Finalny wybór wpisz w [karcie D12 executive briefu](decisions.md#d12).**


<a id="d13"></a>

## D13. Lokalne konflikty, usuwanie plików i reguły współdzielone

**Status:** Kierunek ochrony zmian wynika z zaakceptowanej migracji; szczegóły UX konfliktów są propozycją.

**Oparcie:** Plan: fazy 4–5.

### A — obecny plan

Usuwać tylko niezmienione śledzone pliki bez pozostałych właścicieli; chronić pending. Konflikty rozstrzygane per plik, bez ogólnego --force. Jeden wynik dla współdzielonego bloku reguł.

- **Silna strona:** Chroni pracę użytkownika; nie myli brakujących hashy z pozwoleniem na nadpisanie.
- **Słaba strona:** Częstsze ręczne decyzje i pozostawione pliki; rules bez historycznego hasha wymagają ostrożności.
- **Tradeoff:** Bezpieczeństwo lokalnych zmian za cenę mniej bezobsługowych aktualizacji.
- **Koszt budowy / utrzymania:** średni–wysoki / średni.

### B — najsolidniejsza alternatywa

Przechowywać bazowe treści i obsłużyć merge trójstronny z podglądem; śledzić ownership reguł i niejednoznaczne wyniki przekazywać użytkownikowi.

- **Silna strona:** Mniej ręcznej pracy przy niezależnych zmianach tekstu.
- **Słaba strona:** Merge tekstu nie dowodzi zgodności semantycznej skilla; więcej przechowywanych danych i przypadków do testów.
- **Tradeoff:** Wygoda za znacznie większy zakres; nie jest to obecnie zatwierdzona automatyka.
- **Koszt budowy / utrzymania:** wysoki / wysoki.

### C — najzwinniejsza alternatywa

Przy konflikcie zachować lokalny plik, zapisać kandydat v4 poza aktywnymi katalogami i zgłosić pending/conflict. Użytkownik scala ręcznie, potem ponawia sync.

- **Silna strona:** Mało interfejsu i brak silnika merge; praca lokalna pozostaje chroniona.
- **Słaba strona:** Więcej pracy uczestnika, wolniejsze domykanie konfliktów.
- **Tradeoff:** Koszt obsługi konfliktu przesunięty z narzędzia na świadomą operację użytkownika.
- **Koszt budowy / utrzymania:** średni / niski.

**Moja rekomendacja:** C/A na pierwsze wydanie; automatyczny merge B zostawić jako osobny zakres.

**Do sprawdzenia:** W13, W17.

**Finalny wybór wpisz w [karcie D13 executive briefu](decisions.md#d13).**


<a id="d14"></a>

## D14. Kompatybilność starych CLI i manifestów

**Status:** Otwarte ograniczenie techniczne: wydany stary CLI nie rozumie nowego bindingu ani dziennika.

**Oparcie:** Plan: fazy 4–7; numer schematu manifestu nie oznacza edycji kursu.

### A — obecny plan

Nowy CLI czyta wspierane stare manifesty, blokuje uszkodzone/nieznane stany i jasno wymaga aktualnej wersji dla v4. Nie obiecujemy, że stary binary przestanie pisać.

- **Silna strona:** Realistyczna migracja istniejących instalacji bez fałszywych gwarancji.
- **Słaba strona:** Użytkownik może uruchomić starą wersję; sam bump schematu nie powstrzyma jej writera.
- **Tradeoff:** Kompatybilność odczytu kosztem ograniczonej ochrony przed downgrade.
- **Koszt budowy / utrzymania:** średni / średni.

### B — najsolidniejsza alternatywa

Wersjonowane negocjowanie możliwości klienta z API, konsekwentne minimalne wersje dla nowych operacji, diagnostyka wersji w projekcie i plan wycofania starych klientów.

- **Silna strona:** Przyszłe przejścia wersji są kontrolowane i lepiej widoczne.
- **Słaba strona:** Więcej protokołu i polityki wsparcia; nadal nie kontroluje już wydanego lokalnego kodu ani jego offline zapisów.
- **Tradeoff:** Silniejsza kontrola przyszłych klientów, bez magicznej naprawy starych.
- **Koszt budowy / utrzymania:** wysoki / średni.

### C — najzwinniejsza alternatywa

Wyraźna dokumentacja, komunikat migracji i check wersji w nowym CLI; wspierać konkretną minimalną wersję, bez nowego protokołu negocjacji.

- **Silna strona:** Niski koszt; brak pozornej gwarancji blokady.
- **Słaba strona:** Większy udział supportu przy przypadkowym downgrade.
- **Tradeoff:** Prostota za mniejszą automatyzację zgodności.
- **Koszt budowy / utrzymania:** niski / średni przy problemach użytkowników.

**Moja rekomendacja:** A/C; decyzję opierać na demonstracji starego binary, nie deklaracji minCliVersion w pliku.

**Do sprawdzenia:** W18.

**Finalny wybór wpisz w [karcie D14 executive briefu](decisions.md#d14).**


<a id="d15"></a>

## D15. Zakres pierwszego wydania i wykorzystanie branchy

**Status:** Potwierdzone: Unaited jest nieaktualne; korzystamy z sensownych rozwiązań po review. Czyste mastery i brak zależności od get-by-name to rekomendacja realizacyjna.

**Oparcie:** Plan: zakres i wszystkie fazy; podstawy badania pochodzą z 2026-09-07.

### A — obecny plan

Czyste mastery, selektywne przeniesienie poprawek. Jeden skoordynowany zakres obejmuje v4 auth, tydzień 1, publikację, ochronę plików i migrację; bez eventu i get-by-name.

- **Silna strona:** Spójny docelowy produkt, ograniczone dziedziczenie niepotrzebnego kodu.
- **Słaba strona:** Szeroki zakres opóźnia pełne wydanie; część wcześniejszej pracy trzeba zaadaptować ponownie.
- **Tradeoff:** Mniejszy dług z branchy, ale więcej pracy przed zamknięciem całości.
- **Koszt budowy / utrzymania:** wysoki / średni.

### B — najsolidniejsza alternatywa

Osobne, kompatybilne kontrakty i kandydaci wydań dla backendu/publishera/CLI, z kontrolowaną aktywacją możliwości i pełną macierzą kombinacji wersji.

- **Silna strona:** Łatwiejsze niezależne wydawanie i wykrywanie regresji między repozytoriami.
- **Słaba strona:** Więcej konfiguracji, stanów przejściowych i testów kompatybilności.
- **Tradeoff:** Elastyczne dostarczanie kosztem koordynacji produktów.
- **Koszt budowy / utrzymania:** wysoki / wysoki.

### C — najzwinniejsza alternatywa

Dwa pionowe wydania: najpierw zabezpieczone v4 auth/get/list/sync dla nowych projektów i zachowanie v3, potem migracja stopniowa. Zachować docelowy plan migracji i potrzebne kontrakty wydań od początku.

- **Silna strona:** Wcześniejsza wartość dla v4-only, mniejszy zakres pojedynczego wdrożenia.
- **Słaba strona:** Istniejący projekt v3 czeka na migrację; trzeba jawnie zakomunikować ograniczenie pierwszego wydania.
- **Tradeoff:** Szybsze dostarczenie części celu w zamian za odroczenie zatwierdzonej funkcji, nie jej usunięcie.
- **Koszt budowy / utrzymania:** średni na pierwsze wydanie / średni łącznie.

**Moja rekomendacja:** C, jeśli pilność logowania i tygodnia 1 przeważa; A, jeśli migracja musi wejść razem. To decyzja o kolejności, nie ciche cięcie zakresu.

**Do sprawdzenia:** W01, W19.

**Finalny wybór wpisz w [karcie D15 executive briefu](decisions.md#d15).**


<a id="d16"></a>

## D16. Weryfikacja, kolejność wdrożenia i wycofanie publikacji

**Status:** Plan techniczny; wykonanie wdrożenia nie zostało rozpoczęte.

**Oparcie:** Plan: fazy 6–7.

### A — obecny plan

Testować dokładne kandydaty obu repo. Zatrzymać stare publish joby, zrobić inventory v3, wdrożyć zabezpieczenia API, potem zweryfikowane treści v4 i CLI. Sprawdzić realne konta przed npm release.

- **Silna strona:** Testujemy faktyczny zestaw wersji; v4 nie pojawia się przed ochroną dostępu.
- **Słaba strona:** Więcej kroków i koordynacji; realne próby wymagają działającego środowiska i kont.
- **Tradeoff:** Mniejsze ryzyko wdrożenia za dłuższy proces wydania.
- **Koszt budowy / utrzymania:** średni–wysoki / średni.

### B — najsolidniejsza alternatywa

Automatyczny rehearsal publikacji i rollbacku, osobne środowisko zgodne z produkcją, testy kontraktowe i stopniowe udostępnianie po mierzalnych warunkach.

- **Silna strona:** Wcześniejsze wykrywanie problemów i powtarzalność wydań.
- **Słaba strona:** Utrzymanie środowiska, danych testowych i mechanizmu stopniowego wdrażania.
- **Tradeoff:** Opłacalne przy częstych wydaniach; dodatkowy koszt stały teraz.
- **Koszt budowy / utrzymania:** wysoki / wysoki.

### C — najzwinniejsza alternatywa

Deterministyczne lokalne E2E na kandydacie, mały skrypt smoke i krótki wykonywalny runbook produkcyjny. Zachować pełną ochronę tras, testy utraty danych i kolejność API→treści→CLI.

- **Silna strona:** Mniej infrastruktury i prosta obsługa kilku wydań.
- **Słaba strona:** Większa zależność od operatora podczas próby produkcyjnej.
- **Tradeoff:** Oszczędzamy na orkiestracji, nie na ochronie danych i dostępu.
- **Koszt budowy / utrzymania:** średni / niski–średni.

**Moja rekomendacja:** A z C w zakresie automatyzacji; nie skracać testów odzyskiwania ani nie wdrażać treści przed autoryzacją.

**Do sprawdzenia:** W06, W09, W16, W19, W20.

**Finalny wybór wpisz w [karcie D16 executive briefu](decisions.md#d16).**


<a id="verification"></a>

## Rzeczy do sprawdzenia — wymagany dowód

To rejestr badań i weryfikacji, nie lista domyślnie spełnionych warunków. Własność „implementujący” oznacza pracę techniczną do wykonania; „właściciel kursu” dotyczy treści lub polityki produktu. Nie wymagamy odpowiedzi użytkownika na rzeczy, które da się ustalić z kodu i testów.

| ID | Co sprawdzić i jaki wynik zapisać | Właściciel | Kiedy wynik jest potrzebny |
|---|---|---|---|
| W01 | Stan branchy i masterów po 2026-09-07: aktualne SHA, diff od baz CLI `f89f195` i toolkit `da989a6`, nowe poprawki oraz kolizje z planem. Obecny arkusz nie jest nowym audytem zdalnych repo. | Implementujący | Przed rozpoczęciem kodowania na wybranych bazach |
| W02 | Rzeczywiste granty i konfiguracja v4 oraz macierz v3-only/v4-only/both/neither. Wynik ma odróżniać brak uprawnienia od błędu CLI/backendu i niedostępnej treści. Bez publikowania danych kont. | Implementujący + operator | Przed zamknięciem fazy auth; próba realnych kont przed wydaniem |
| W03 | Wszystkie writery grantów/indeksów, zachowanie przy awarii i równoległych zmianach. Zapisać odtworzenie błędu, wynik retry i granicę gwarancji KV; nie nazywać odczyt–merge–zapis transakcją. | Implementujący | Przed wyborem docelowego modelu spójności / D02 |
| W04 | Dokładne artefakty i reguły m1l1–m1l5 v4, oba języki, nazwy/nawiązania do v3. Zweryfikować też datę odblokowania — w planie jest już przeszły timestamp 2026-09-07. | Właściciel kursu + implementujący | Przed publikacją treści; wybór źródła przed finalnym buildem |
| W05 | Finalny cutoff v3. `157667a30ad52169ba489d3dccc4bfc36ad530af` z 2026-08-06 to kandydat z wcześniejszego planu, nie zatwierdzony punkt odcięcia. Potrzebne uzasadnienie historią treści i ewentualna lista późniejszych poprawek v3. | Implementujący + właściciel kursu | Przed zamknięciem konfiguracji źródeł v3; nie musi blokować prac auth |
| W06 | Pełna lista kluczy/hashe i backup produkcyjnego v3, z paginacją i błędami odczytu. Porównać przed/po; zatrzymać stare publish joby przed snapshotem. To jedyny dowód zachowania opublikowanych bajtów. | Operator + implementujący | Przed zmianą publikowania i ponownie po rollout |
| W07 | Odczyt wielu przypiętych commitów bez zmiany checkoutu, brakujące pliki/commity, wykonywalne skrypty, kompletność support files, rozróżnienie hashy źródła i transformacji, poprawne unieważnienie cache. | Implementujący | Przed zamknięciem resolvera/publishera |
| W08 | Warunkowe przełączanie current przez rzeczywistą ścieżkę produkcyjną: pierwsza publikacja bez wskaźnika, dwa konkurujące zapisy, rollback i niespełniony warunek. Workers API ma mechanizm warunkowego PUT; to nie dowodzi, że obecny skrypt Wrangler/S3 korzysta z niego. | Implementujący | Przed uznaniem D07 za gotowe do wdrożenia |
| W09 | Przełączenie wydania między pobraniami; wszystkie trasy i fallback języka pozostają przy wskazanym releaseId. Podpis wiąże course/release/hash; brak błędnego cyklu hashy; zachowanie cache/API podczas rollbacku i wycofania. | Implementujący | Przed release API i CLI |
| W10 | Lista wszystkich triggerów i writerów R2, uprawnienia operatora/CI, wybór manualnej lub automatycznej promocji oraz rozmiar/częstość wydań. Wynik ma uzasadnić strategię retencji, a nie zgadywać koszt magazynu. | Operator + właściciel produktu | Wyzwalacz przed uruchomieniem publikacji; pomiar retencji przed dodaniem GC |
| W11 | Mapa istniejących skilli v3→v4, wyjątki nazw/tożsamości, reguły kumulatywnych lekcji i docelowe lekcje. Oddzielić „jeszcze niedostępny” od „celowo wycofany”. Zapisać pokrycie i listę pending bez mapy. | Właściciel kursu + implementujący | Przed pierwszą migracją; aktualizować wraz z treściami |
| W12 | Zależności mieszanki aktywnych skilli v3/v4; całość SKILL.md+support files; odblokowanie przez czas/KV przy tym samym release/digest. Dowód, że nie pobieramy zablokowanych danych. | Implementujący + właściciel treści | Przed dopuszczeniem stopniowej migracji |
| W13 | Kolizje tych samych m1lN, pending w cleanup/force/filtered get, brakujące hashe oraz zachowanie lokalnych zmian. Każdy rewrite manifestu musi zachować źródło i stan przejścia. | Implementujący | Przed zamknięciem schematu i writerów |
| W14 | Wszystkie współdzielone ścieżki, szczególnie AGENTS.md dla Codex/Devin/generic i legacy profile. Przerwać zapis po każdej operacji danych/metadanych; wykazać spójny resume/rollback oraz blokadę innych nowych writerów. | Implementujący | Przed wydaniem migracji |
| W15 | Pending w profilu innym niż aktywny, mapowanie do nigdy niepobranej lekcji, jawne filtry, dwa profile z różnymi lokalnymi zmianami. Raport nie może udawać pełnej migracji po częściowym sync. | Implementujący | Przed finalizacją D11 |
| W16 | Zachowanie journal/rename/lock i trybów plików na wspieranych systemach, brak miejsca, brak/uszkodzenie backupu oraz późniejsze edycje przed rollbackiem. Test procesu to nie automatycznie dowód odporności na utratę zasilania. | Implementujący | Przed zadeklarowaniem gwarancji recovery |
| W17 | Bezpieczne edytowanie sentinelów i tekstu obok nich, brak historycznego hasha rules, własne pliki w katalogu skilla oraz wynik nierozstrzygniętego konfliktu. | Implementujący | Przed zamknięciem writera i UX konfliktów |
| W18 | Próba starego wydanego CLI na fixture po migracji: czy interpretuje nowy manifest jako brak stanu i czy nadal zapisuje. Wynik określa dokumentację kompatybilności; nowy plik min-version nie stanowi samodzielnej blokady. | Implementujący | Przed publikacją dokumentacji i migracji |
| W19 | Kandydaty obu repo, lokalne E2E rzeczywistego auth, EN/PL, profile, Linux/Windows oraz próby v4-only/v3/both. Oddzielić testy kodu od próby produkcyjnej na właściwych kontach. | Implementujący + operator | Przed wydaniem odpowiedniej części D15 |
| W20 | Próba wycofania/promocji poprzedniego wydania; secured Worker jako minimalna wersja rollbacku. Potwierdzić, że stare joby nie mogą ponownie opublikować v3 lub ominąć nowej polityki. | Operator + implementujący | Przed pierwszym rollout i jego zamknięciem |

### Miejsce na wyniki weryfikacji

Skopiuj wiersz dla kolejnych wyników; brak wpisu nie oznacza zaliczenia.

| ID W… | Wynik i odnośnik do dowodu | Data / osoba | Wpływ na decyzję D… |
|---|---|---|---|
| … | … | … | … |

## Zależności między wyborami

- **D08 + D10 + D11 + D12 + D13:** stopniowa migracja wymaga ewidencji pending, ochrony przed cleanup, kontroli odblokowania i recovery. Nie można usunąć jednej z tych odpowiedzialności, pozostawiając tę samą obietnicę użytkownikowi.
- **D05 + D06 + D07:** pin pliku wybiera źródło; releaseId wybiera gotowy wynik; current wskazuje aktywne wydanie. To trzy różne role. Latest źródeł nie oznacza pobierania mastera na komputerze uczestnika.
- **D09 + D11:** mapę można upraszczać, ale sama równość nazw i ID lekcji nie może zastąpić dowodu zgodności oraz uprawnień.
- **D10 + D12 + D14:** osobny manifest/rejestr nie zwalnia z transakcji zapisu i nie naprawia starego binary.
- **D15-C:** odracza wydanie migracji, a nie zmienia zatwierdzonej polityki. Nie należy raportować pełnego celu jako ukończonego po samym auth/get v4.
- **D07-B oraz D12-B:** retencja danych wymaga zdefiniowania, co nadal musi dać się wznowić/cofnąć. Automatyczne usuwanie bez tego kontraktu jest dodatkowym ryzykiem.

## Weryfikacja zewnętrznych założeń na dzień 2026-09-09

Dokumentacja Workers API opisuje warunkowe `put` i wynik `null`, gdy warunek nie jest spełniony. To potwierdza istnienie mechanizmu po stronie R2, ale W08 nadal wymaga sprawdzenia wybranego klienta, dostępu i pełnej ścieżki publishera. [R2 Workers API — put i warunki](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

R2 dokumentuje silną spójność operacji magazynu; nie oznacza to atomowej zmiany zestawu obiektów ani automatycznego unieważnienia zewnętrznych cache. D06 zakłada osobne niezmienne wydanie i zmianę jednego wskaźnika. [Model spójności R2](https://developers.cloudflare.com/r2/reference/consistency/).

Workers KV jest magazynem o spójności ostatecznej i nie jest dobrym zamiennikiem transakcyjnego koordynatora aktualizacji. Dlatego D02-A/C jawnie zachowują ograniczenia tego modelu. [Jak działa Workers KV](https://developers.cloudflare.com/kv/concepts/how-kv-works/).

Nie wykonano w tym kroku prób produkcyjnych, pomiarów kosztów ani świeżego fetch/audytu branchy. Odnośniki do dokumentacji nie zastępują wyników W01–W20.

## Uzgodnienie dokumentów po wyborze

Finalne wybory i dyspozycję zapisujemy w [executive briefie](decisions.md). Następnie uzgadniamy plan oraz skrót z tymi wyborami i przeglądamy zmienione kontrakty. Stan realizacji pozostaje wyłącznie w sekcji Progress planu; załącznik nie tworzy drugiej listy wykonania.
