# 10xDevs 4 — executive brief do decyzji

Data: 2026-09-09 · Zakres: 10x-cli i 10x-toolkit · Etap: przed implementacją

[Plan](plan.md) · [Szczegółowe warianty i rejestr weryfikacji](decisions-details.md)

## Cel i sytuacja

Chcemy, żeby uczestnik 10xDevs 4 mógł się zalogować, pobrać dostępne skille i pracować na aktualnych materiałach. Osoba przechodząca z v3 ma zachować swój projekt i lokalne poprawki, a kolejne skille aktualizować do v4 w miarę odblokowywania kursu.

Badanie baz repozytoriów z 2026-09-07 wykazało, że samo dodanie nazwy nowej edycji nie wystarczy: do zmiany są logowanie, wybór kursu, publikowanie treści i sposób zapamiętywania instalacji. Wykryto też błędy mogące prowadzić do utraty grantów lub lokalnych plików. Stan zdalnych masterów po tym badaniu pozostaje do ponownego sprawdzenia.

Największy koszt obecnego planu wynika z bezpiecznej obsługi istniejących projektów: część skilli może już pochodzić z v4, a część jeszcze z v3. Narzędzie musi pamiętać ten stan, nie usuwać oczekujących plików i umieć odzyskać przerwaną aktualizację. Sam dostęp do pierwszego tygodnia jest węższym zadaniem.

## Co jest już ustalone

- **Nowy projekt:** wybiera najlepszą dostępną edycję. Istniejący projekt zmienia ją przez jawną migrację.
- **V3:** stabilna baza sprzed v4 i tylko poprawki utrzymaniowe. **V4:** najnowsze opublikowane źródła z możliwością pina konkretnego pliku.
- **Migracja:** podmieniamy tylko odblokowane skille v4. Pozostałe skille v3 nadal działają; manifest pamięta oczekiwanie, a późniejsze sync kontynuuje przejście.
- **Lokalna praca:** podgląd, backup i recovery chronią pliki oraz manifesty.
- **Unaited:** poza zakresem; wcześniejszy kod wykorzystujemy wybiórczo po sprawdzeniu.

## Najważniejsze wybory na teraz

| Wybór | Dlaczego ma znaczenie | Rekomendacja |
|---|---|---|
| [D15 — kolejność wydań](#d15) | Określa, czy nowi uczestnicy czekają również na mechanizm migracji. | Rozważyć dwa wydania, jeśli pilny jest dostęp v4-only. |
| [D10 — model manifestów](#d10) | Największy wpływ na złożoność writerów, cleanup i późniejsze utrzymanie. | Zacząć od ograniczonego rozszerzenia obecnego modelu; unikać pełnej przebudowy bez dowodu potrzeby. |
| [D07 — udostępnianie wydań](#d07) | Ustala kontrolę nad tym, co i kiedy trafia do uczestników. | Jedna ścieżka CI i jawna promocja na start. |
| [D11 — zakres sync](#d11) | Wybór między wygodą wszystkich profili a węższą, bardziej przewidywalną operacją. | Wszystkie profile, z widocznym raportem aktualizacji i oczekiwania. |
| [D12 — granica rollbacku](#d12) | Chroni przed rozrostem migracji w pełny system historii projektu. | Pewne odzyskanie ostatniej operacji; bez obietnicy dowolnego cofania późniejszych zmian. |

Rekomendacje są wyborem proporcji między gwarancjami, wygodą i kosztem. Nie są estymacją czasu ani automatycznym zatwierdzeniem wariantu. Dokładny cutoff v3, zgodność treści i mechanika publishera wymagają dowodów opisanych na końcu.

## Jak korzystać z kart

Każda karta zaczyna się od opisu sytuacji i znaczenia decyzji. Dopiero potem podaje status oraz warianty: **A — obecny plan**, **B — najsolidniejsza alternatywa**, **C — najzwinniejsza alternatywa**. Kolumna „koszt / kompromis” opisuje słabą stronę i to, z czego rezygnujemy w zamian za korzyść.

Wybór B nie oznacza automatycznie lepszego rozwiązania na dziś. C może być oszczędniejszą realizacją tego samego zachowania, a nie rezygnacją z bezpieczeństwa. Wcześniejsze ustalenia pozostają ważne; pole decyzji służy do utrwalenia finalnego wyboru lub świadomej korekty.

<a id="d01"></a>

## D01. Jak uczestnik trafia do właściwej edycji

Uczestnik może mieć dostęp do v3, v4 albo obu edycji. Narzędzie powinno od razu działać dla nowego klienta v4, ale zakup kolejnej edycji nie powinien sam zmieniać istniejącego projektu. To decyzja o przewidywalności produktu: ile wyborów wykonujemy za użytkownika i jak tłumaczymy mu wynik.

**Status:** Potwierdzony kierunek: najlepsza dostępna edycja dla nowego projektu, jawna migracja istniejącego.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | API rekomenduje edycję; projekt pamięta wybór. | Wygodny start i brak przypadkowych przełączeń. | Zależność od dostępności API i jego kontraktu. |
| B — najsolidniejszy | Wersjonowana polityka wyboru z rozbudowaną diagnostyką. | Lepsza obsługa wielu produktów i klientów. | Więcej kodu i reguł do utrzymania. |
| C — najzwinniejszy | Mały endpoint i jawna kolejność v4→v3. | Ten sam efekt dla obecnych dwóch edycji. | Nowy produkt wymaga zmiany kodu. |

**Rekomendacja:** C: prosta realizacja ustalonego zachowania.

**Do sprawdzenia:** W01–W02. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d01).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d02"></a>

## D02. Na ile przebudowujemy zarządzanie dostępem

Samo zakupienie kursu nie wystarcza, jeśli synchronizacja kont zgubi uprawnienie albo CLI błędnie wymaga v3. W badaniu wykryliśmy ryzyko utraty niezależnego grantu przy zmianie tożsamości Circle. Musimy naprawić ten przepływ oraz sprawdzać dostęp przy każdym pobraniu. Wybór dotyczy skali naprawy: obecny magazyn danych czy nowy, silniej kontrolowany model.

**Status:** Poprawny dostęp jest wymagany; pozostanie przy KV to wybór techniczny.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Naprawa grantów, odzyskiwanie po awarii i kontrola wszystkich tras w obecnym KV. | Usuwa znane błędy bez migracji danych. | Pozostają ograniczenia równoległych zapisów i obecne okno cofania dostępu. |
| B — najsolidniejszy | Transakcyjny rejestr uprawnień z historią zmian. | Mocniejsze gwarancje spójności i audyt. | Duże rozszerzenie projektu i nowa infrastruktura. |
| C — najzwinniejszy | Wspólne funkcje zapisu, konieczne recovery i prosty raport rozbieżności. | Mało nowych elementów. | Nie daje gwarancji transakcyjności; część rozbieżności wymaga naprawy. |

**Rekomendacja:** A/C teraz; większą przebudowę uzależnić od dowodów, że potrzebujemy jej gwarancji.

**Do sprawdzenia:** W02–W03. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d02).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d03"></a>

## D03. Co dokładnie dostarczamy w pierwszym tygodniu v4

Obietnica „get m1lN działa” obejmuje zarówno dostęp, jak i właściwą zawartość. Istniejące materiały są dobrym punktem wyjścia, lecz te same numery lekcji nie gwarantują zgodności z programem v4. Decyzja wpływa na czas uruchomienia kursu i koszt późniejszego utrzymywania dwóch zestawów definicji.

**Status:** Tydzień 1 jest wymagany; dokładna zawartość i reguły wymagają przeglądu.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Osobne definicje v4 na bazie pięciu obecnych lekcji, po review. | Szybki start i niezależny rozwój edycji. | Kopie definicji trzeba utrzymywać. |
| B — najsolidniejszy | Formalna specyfikacja programu i automatyczna walidacja pokrycia. | Większa kontrola spójności całego kursu. | Dodatkowy model i praca przed publikacją. |
| C — najzwinniejszy | Mała, jawna lista artefaktów pięciu lekcji i przegląd wynikowych paczek. | Najmniejszy sensowny zakres. | Więcej ręcznej kontroli wraz z rozwojem kursu. |

**Rekomendacja:** C/A po zatwierdzeniu faktycznych treści.

**Do sprawdzenia:** W04. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d03).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d04"></a>

## D04. Jak utrzymujemy v3 po uruchomieniu v4

V3 ma pozostać stabilnym produktem dla dotychczasowych uczestników, podczas gdy biblioteka v4 będzie się rozwijała. Potrzebujemy punktu odcięcia źródeł i sposobu dostarczania wyjątkowych poprawek. Istotna różnica: historyczny commit opisuje źródła, a dzisiejsze obiekty w R2 są gotową publikacją, której nie możemy przypadkowo zastąpić inną.

**Status:** Cutoff i utrzymanie zatwierdzone; dokładny commit oraz proces poprawek pozostają do ustalenia.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Stała baza v3, jawne poprawki i osobna publikacja; zachowanie obecnych bajtów R2. | Rozwój v4 nie destabilizuje v3. | Dwa nurty utrzymania. |
| B — najsolidniejszy | Gałąź maintenance z tagowanymi, odtwarzalnymi wydaniami. | Dobra historia i regularny proces poprawek. | Stały koszt utrzymywania starego środowiska. |
| C — najzwinniejszy | Obecna publikacja zostaje; rzadkie poprawki z izolowanego checkoutu cutoffu. | Niski koszt stały. | Wolniejsza, bardziej ręczna obsługa poprawki. |

**Rekomendacja:** A z lekkim procesem C, dopóki poprawki v3 są rzadkie.

**Do sprawdzenia:** W05–W06. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d04).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d05"></a>

## D05. Jak łączymy rozwój v4 ze stabilnością wybranych plików

Chcemy dostarczać ulepszenia biblioteki bez ręcznego wersjonowania każdego skilla, a jednocześnie czasem zachować konkretny plik na starszej wersji. Pin commita daje ten wyjątek. Jego koszt pojawia się wtedy, gdy instrukcja, skrypt i pliki pomocnicze zaczynają pochodzić z różnych zmian i muszą nadal działać razem.

**Status:** Latest oraz pin pojedynczego pliku są zatwierdzone; rozbudowa mechanizmu jest otwarta.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Latest raz rozwiązywane do SHA; pin pliku ma pierwszeństwo. | Aktualność i precyzyjne wyjątki. | Zgodność powiązanych plików wymaga kontroli. |
| B — najsolidniejszy | Pełny lock źródeł, grupowe piny i testy zależności oraz transformacji. | Silniejsza odtwarzalność i zgodność. | Więcej reguł i narzędzi do obsługi. |
| C — najzwinniejszy | Mała konfiguracja default + path→SHA i walidacja paczki. | Spełnia wymaganie bez managera pakietów. | Semantyczne konflikty nadal wymagają review. |

**Rekomendacja:** C jako implementacja A; pin źródła nie zastępuje wersjonowania gotowej publikacji.

**Do sprawdzenia:** W07. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d05).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d06"></a>

## D06. Czy każda aktualizacja pobiera jeden spójny zestaw treści

CLI pobiera wiele paczek w jednej operacji. Jeśli podczas sync nadpiszemy część publikacji, projekt może dostać dane z dwóch różnych wydań. To utrudnia diagnozę, odtwarzanie błędu i bezpieczne wznowienie migracji. Decyzja dotyczy identyfikowania całego wydania, a nie tylko wersji poszczególnych plików.

**Status:** Niezmienne wydania są rekomendacją techniczną w obecnym planie.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Osobny releaseId i niezmienne paczki; wskaźnik aktywnego wydania. | Spójne pobrania i prostsze wycofanie publikacji. | Zmiany API oraz większa liczba obiektów. |
| B — najsolidniejszy | Deduplikowane obiekty po hashach, podpisane indeksy i kanały wydań. | Lepsza obsługa wielu produktów i częstych publikacji. | Dodatkowe indeksy i zarządzanie zależnościami. |
| C — najzwinniejszy | Proste niezmienne wydania tylko v4, bez kanałów i deduplikacji. | Zachowuje potrzebną spójność małym kosztem. | Większe zużycie miejsca przez kopie. |

**Rekomendacja:** C; oszczędzać na infrastrukturze wokół wydań, zachowując jedno wydanie na operację.

**Do sprawdzenia:** W08–W09. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d06).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d07"></a>

## D07. Kto i kiedy udostępnia nowe wydanie uczestnikom

Zbudowana paczka nie musi od razu trafić do użytkowników. Potrzebujemy określić moment publikacji oraz zabezpieczyć się przed sytuacją, w której starsze zadanie nadpisze wybór nowszego. Zachowanie poprzednich wydań ułatwia odzyskiwanie, ale z czasem zwiększa zajętość magazynu. To decyzja operacyjna o automatyzacji, kontroli i retencji.

**Status:** Otwarte: ręczna czy automatyczna promocja; ścieżka warunkowego zapisu wymaga próby.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Weryfikacja kompletu, jedna aktywacja naraz, warunkowy zapis wskaźnika; brak GC na start. | Niepełne lub spóźnione zadanie nie powinno przejąć publikacji. | Trzeba domknąć wyzwalacz i uprawnienia wszystkich writerów. |
| B — najsolidniejszy | Kontroler promocji z historią, kanałami i bezpieczną retencją. | Większa automatyzacja i kontrola skali. | Nowa usługa i ryzykowna logika usuwania. |
| C — najzwinniejszy | Jedna ścieżka CI, ręczna promocja zielonego builda, bez automatycznego kasowania. | Mało mechanizmów i jasna odpowiedzialność. | Praca operatora przy każdym wydaniu. |

**Rekomendacja:** C na start; automatyczną promocję wybrać świadomie, a nie utożsamiać z latest.

**Do sprawdzenia:** W08, W10. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d07).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d08"></a>

## D08. Jak projekt przechodzi na v4, gdy kurs odblokowuje się stopniowo

Uczestnik po v3 może mieć więcej skilli, niż jest obecnie dostępnych w v4. Ustaliliśmy, że te skille pozostają aktywne, a podmieniamy tylko odblokowane zamienniki. Projekt może więc już celować w v4 i nadal używać części plików v3. Pozostaje zdecydować, jak dużo automatycznej kontroli zgodności takiego zestawu budujemy.

**Status:** Migracja stopniowa jest potwierdzona; zakres kontroli zależności jest wyborem realizacyjnym.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Wymiana dostępnych skilli, reszta z pochodzeniem v3 i statusem pending. | Projekt działa dalej bez wcześniejszego dostępu do lekcji. | Mieszany zestaw może mieć niezgodne zależności. |
| B — najsolidniejszy | Graf zależności i testy zgodnych grup aktualizacji. | Więcej problemów wykrywanych przed zapisem. | Koszt utrzymywania modelu zgodności. |
| C — najzwinniejszy | Jawna lista zamienników i mała lista grup wymagających wspólnej aktualizacji. | Ten sam model produktu z prostszą implementacją. | Nieopisane zależności wymagają review i diagnostyki. |

**Rekomendacja:** A z C; zachowanie nieodblokowanych skilli nie podlega ponownemu wyborowi.

**Do sprawdzenia:** W11–W12. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d08).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d09"></a>

## D09. Skąd wiemy, który skill v4 zastępuje zainstalowany skill v3

Lekcje mogą zmienić kolejność i zawartość, a skill może dostać nową nazwę lub zmienić znaczenie. Sama zgodność m1lN albo nazwy katalogu może więc prowadzić do złej podmiany. Mapa odpowiedników określa, co wolno aktualizować i czego jeszcze nie umiemy dopasować. Jej jakość wpływa bezpośrednio na liczbę skilli pozostających pending.

**Status:** Mapowanie jest potrzebne; format i stopień automatyzacji pozostają propozycją.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Jawna mapa wersjonowana z wydaniem; brak dopasowania pozostawia pending. | Przewidywalne zamienniki i obsługa zmian nazw. | Mapa wymaga aktualizowania. |
| B — najsolidniejszy | Stabilne ID artefaktów i relacje zastąpienia, podziału lub scalenia. | Dobra obsługa długiej historii biblioteki. | Nowy model tożsamości i dodatkowe reguły. |
| C — najzwinniejszy | Generowanie mapy ze sprawdzonej listy stałych nazw; wyjątki ręcznie. | Mało pracy przy stabilnej bibliotece. | Trzeba potwierdzić zgodność znaczenia nazw. |

**Rekomendacja:** C po sprawdzeniu tożsamości artefaktów; CLI nadal dostaje jawną mapę.

**Do sprawdzenia:** W11, W13. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d09).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d10"></a>

## D10. Jak zapisujemy prawdę o stanie projektu

Manifest jest pamięcią narzędzia: mówi, co zostało zainstalowane, które pliki należą do CLI i czy użytkownik je zmienił. Przy migracji samo course=v4 już nie wystarcza, bo część skilli nadal pochodzi z v3. Utrata tej informacji może spowodować pominięcie aktualizacji albo usunięcie działającego skilla. To jedna z najważniejszych decyzji o złożoności całej implementacji.

**Status:** Ewidencja pochodzenia i pending potwierdzona; konkretny schemat nie jest finalnie wybrany.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Rozszerzyć manifesty profili o wersjonowaną ewidencję przejścia. | Wykorzystuje obecny model i zapisuje rzeczywiste pochodzenie. | Wszystkie writery i cleanup muszą zachować nowe dane. |
| B — najsolidniejszy | Jedna autorytatywna baza stanu; manifesty profili jako wyliczane wyniki. | Spójniejszy model wielu profili. | Szeroka migracja danych i konsumentów. |
| C — najzwinniejszy | Jeden mały rejestr przejścia obok obecnych manifestów, obsługiwany wspólnym adapterem. | Mniej zmian w istniejących schematach. | Dwa źródła stanu nadal wymagają spójnego zapisu. |

**Rekomendacja:** A jako baza. C wybrać tylko po wykazaniu, że faktycznie zmniejsza liczbę ścieżek i wyjątków.

**Do sprawdzenia:** W13–W14. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d10).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d11"></a>

## D11. Co użytkownik musi zrobić, żeby dokończyć migrację

Po początkowym przejściu nie chcemy wymagać pamiętania o każdym starym skillu. Sync ma wykryć nowe możliwości aktualizacji, także gdy lekcję odblokował sam upływ czasu, bez nowej publikacji. Otwarty pozostaje zakres: czy jedno polecenie aktualizuje wszystkie profile projektu, czy tylko aktualnie używane narzędzie.

**Status:** Kontynuacja przez sync potwierdzona; domyślne wszystkie profile to rekomendacja techniczna.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Każdy sync sprawdza pending we wszystkich zapisanych profilach. | Najmniej pracy uczestnika i zapomnianych instalacji. | Więcej odczytów i szerszy zakres pojedynczego polecenia. |
| B — najsolidniejszy | Backend przygotowuje wersjonowany plan dostępnych aktualizacji. | Mniej przeliczania przy dużej skali. | Nowy protokół i obsługa aktualności cache. |
| C — najzwinniejszy | Prosty skan pending; tylko aktywny profil, z jawnym --all-profiles. | Mniejsza i łatwiejsza do przewidzenia operacja. | Pozostałe profile mogą dłużej pozostać na v3. |

**Rekomendacja:** A z prostym skanem; świadomie rozstrzygnąć domyślny zakres profili.

**Do sprawdzenia:** W12, W15. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d11).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d12"></a>

## D12. Jak daleko sięga obietnica bezpiecznego cofnięcia

Migracja zapisuje wiele plików i manifestów. Przerwanie po połowie nie może być traktowane jak zwykłe ponowienie pobrania, bo część danych mogła się już zmienić. Backup zachowuje poprzednie bajty, a dziennik pozwala rozpoznać wykonaną część pracy. Decyzja dotyczy granicy między odzyskaniem ostatniej operacji a budowaniem pełnej historii zmian projektu.

**Status:** Backup, resume i rollback zatwierdzone; retencja i wygoda cofania późniejszych zmian są otwarte.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Backup, staging i dziennik; cofanie z kontrolą późniejszych edycji. | Przerwaną operację można wznowić lub odwrócić. | Dużo stanów awarii i dodatkowe dane na dysku. |
| B — najsolidniejszy | Historia snapshotów, wiele punktów powrotu i narzędzia naprawcze. | Lepsza obsługa złożonych incydentów. | Koszt własnego systemu historii projektu. |
| C — najzwinniejszy | Jeden aktywny dziennik i snapshot dotykanych plików; ograniczone cofanie ostatniej operacji. | Zachowuje recovery przy mniejszej liczbie stanów. | Po późniejszych zmianach część odzyskiwania jest ręczna. |

**Rekomendacja:** C jako ograniczenie zakresu A; nie obiecywać dowolnego cofania historii.

**Do sprawdzenia:** W14, W16. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d12).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d13"></a>

## D13. Kto rozstrzyga konflikt między lokalną poprawką a nową wersją

Użytkownik może dopisać instrukcję do skilla, zmienić skrypt albo dodać własny plik. Aktualizacja nie powinna uznać takiej pracy za zbędne pozostałości. Jednocześnie zachowanie każdej lokalnej wersji może zatrzymywać przejście na v4. Wybieramy podział pracy między automatykę narzędzia, uczestnika i support, szczególnie dla wspólnych plików reguł.

**Status:** Ochrona zmian jest wymaganiem; sposób prezentacji i rozwiązywania konfliktów pozostaje do wyboru.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Podgląd i decyzje per plik; usuwanie wyłącznie bezpiecznych plików śledzonych. | Chroni pracę i pozwala kontrolować podmianę. | Więcej ręcznych decyzji w CLI. |
| B — najsolidniejszy | Merge trójstronny z bazową wersją i podglądem wyniku. | Mniej pracy przy niezależnych zmianach tekstu. | Złożony mechanizm; merge tekstu nie gwarantuje poprawności skilla. |
| C — najzwinniejszy | Zachować lokalny plik, udostępnić kandydat v4 poza aktywnym katalogiem i zgłosić konflikt. | Mało automatyki, bez nadpisywania pracy. | Użytkownik scala ręcznie i ponawia sync. |

**Rekomendacja:** C/A na start; automatyczny merge jako osobny zakres.

**Do sprawdzenia:** W13, W17. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d13).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d14"></a>

## D14. Co obiecujemy użytkownikowi, który uruchomi stare CLI

Nowa wersja narzędzia może rozumieć pending, blokadę migracji i nowy manifest, ale wcześniej wydany program nie nauczy się ich sam. Zmiana numeru schematu może nawet zostać przez niego odczytana jako brak instalacji. Ta decyzja wyznacza realną granicę wsparcia oraz to, ile ochrony da się zapewnić technicznie, a ile wymaga aktualizacji i komunikacji.

**Status:** Granica starego CLI jest znana z badania; ostateczna polityka wsparcia potrzebuje próby na wydanym binary.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Odczyt wspieranych starych manifestów w nowym CLI i wymóg aktualnej wersji dla v4. | Realistyczne wsparcie istniejących projektów. | Nie blokuje wszystkich zapisów starego programu. |
| B — najsolidniejszy | Negocjowanie możliwości z API i plan wycofywania starych klientów. | Lepsza kontrola przyszłych zmian wersji. | Nowy protokół nadal nie kontroluje starego kodu offline. |
| C — najzwinniejszy | Wyraźne wymaganie wersji, komunikat migracji i prosta diagnostyka. | Niski koszt implementacji. | Większy udział supportu przy przypadkowym downgrade. |

**Rekomendacja:** A/C; dokumentować ograniczenie zamiast sugerować, że rozwiązuje je pole min-version.

**Do sprawdzenia:** W18. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d14).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d15"></a>

## D15. Czy wszystko musi wejść w pierwszym wydaniu

Początkowy problem dotyczył dostępu v4 i pierwszego tygodnia. Obecny plan obejmuje również bezpieczną migrację, manifesty i nowy model publikowania. To szerszy projekt z wartością dla dwóch grup: nowych uczestników oraz osób przenoszących istniejące projekty. Wybieramy, czy obie grupy czekają na komplet, czy dostarczamy funkcje etapami.

**Status:** Unaited poza zakresem; kolejność dostarczenia całego rozwiązania pozostaje decyzją produktową.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Jeden skoordynowany zakres na czystych masterach, z migracją od początku. | Pełny scenariusz użytkownika przy wydaniu. | Dłuższe oczekiwanie na zamknięcie szerokiego zakresu. |
| B — najsolidniejszy | Niezależne kompatybilne wydania komponentów i kontrolowana aktywacja funkcji. | Duża elastyczność kolejności dostarczania. | Więcej kontraktów i kombinacji do testowania. |
| C — najzwinniejszy | Najpierw bezpieczny dostęp v4 dla nowych projektów, potem migracja. | Wcześniejsza wartość dla v4-only. | Istniejące projekty czekają na zatwierdzoną migrację. |

**Rekomendacja:** C przy priorytecie szybkiego uruchomienia dostępu; A, jeśli migracja musi wejść równocześnie.

**Do sprawdzenia:** W01, W19. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d15).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

<a id="d16"></a>

## D16. Ile automatyzacji potrzebujemy, żeby bezpiecznie wydawać

CLI, backend i treści są wydawane osobno. Każdy element może przechodzić własne testy, a razem nadal nie działać. Dodatkowo kolejność publikacji decyduje o tym, czy v4 pojawi się dopiero za poprawną kontrolą dostępu. Wybór dotyczy stopnia automatyzacji procesu, przy zachowaniu testów chroniących uprawnienia i dane użytkownika.

**Status:** Plan zakłada backend→treści→CLI; zakres infrastruktury testowej i orkiestracji jest propozycją.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Testy dokładnych kandydatów obu repo, próby realnych kont i etapowe wdrożenie. | Sprawdzamy faktycznie wydawany zestaw. | Więcej koordynacji i kroków operatora. |
| B — najsolidniejszy | Automatyczne próby wdrożenia/rollbacku i środowisko zgodne z produkcją. | Większa powtarzalność częstych wydań. | Stały koszt dodatkowego środowiska i danych testowych. |
| C — najzwinniejszy | Lokalne E2E, mały smoke test i krótki wykonywalny runbook. | Mniej infrastruktury utrzymaniowej. | Większa zależność od operatora w produkcji. |

**Rekomendacja:** A z lekką orkiestracją C; nie ciąć testów recovery ani kontroli dostępu.

**Do sprawdzenia:** W06, W09, W16, W19–W20. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d16).

**Twoja finalna decyzja:** … (A / B / C / własny / odroczyć)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** …

## Co trzeba sprawdzić przed realizacją i wydaniem

Nie wszystkie niewiadome wymagają decyzji właściciela. Część to zadania badawcze i testy po stronie zespołu. Pełny rejestr W01–W20, z oczekiwanym dowodem, właścicielem zadania i terminem, jest w [załączniku](decisions-details.md#verification).

| Obszar | Co pozostaje niewiadome | Kiedy potrzebujemy odpowiedzi |
|---|---|---|
| Stan kodu | Co zmieniło się na masterach i branchach od badania z 2026-09-07. | Przed rozpoczęciem prac na wybranych bazach. |
| Dostęp v4 | Faktyczne granty, konfiguracja Circle i działanie kont v3/v4/both. | Podczas zamykania auth; realna próba przed wydaniem. |
| Cutoff i treści | Właściwy commit v3, zawartość pierwszego tygodnia i mapa odpowiedników. | Przed finalizacją źródeł/publikacji i dopuszczeniem migracji. |
| R2 | Warunkowe przełączanie wskaźnika przez rzeczywisty publisher; spójność pobrań podczas zmiany wydania. | Przed uruchomieniem nowego publikowania. |
| Pliki i manifesty | Pending przeżywa każdy get/sync/cleanup; współdzielone reguły i profile pozostają spójne. | Przed wydaniem migracji. |
| Odzyskiwanie | Awaria w każdym kroku zapisu, brak/uszkodzenie backupu, późniejsze edycje i różnice systemów operacyjnych. | Przed zadeklarowaniem gwarancji resume/rollback. |
| Kompatybilność i rollout | Zachowanie starego binary, dokładne kandydaty obu repo, zatrzymanie starych jobów i próba wycofania. | Przed publikacją odpowiedniej części produktu. |

## Koszty i ograniczenia, które warto zaakceptować świadomie

- Stopniowa migracja oznacza przejściowo mieszany zestaw skilli v3/v4. To ustalone zachowanie; koszt stanowią jego ewidencja i kontrola zgodności.
- Ochrona lokalnych zmian oznacza, że część aktualizacji pozostanie konfliktem do ręcznego rozstrzygnięcia.
- Niezmienne wydania i backupy zwiększają zużycie miejsca. Na początek oszczędzamy na automatyce retencji, nie znamy jeszcze kosztu liczbowego.
- Naprawa obecnego KV zachowuje jego ograniczenia spójności. Wariant z nowym rejestrem danych jest większym projektem.
- Nowe CLI nie może zagwarantować, że wcześniej wydany program respektuje jego manifesty i blokady.

## Dyspozycja po przeglądzie

**Zakres pierwszego wydania:** …

**Wybrane warianty do przeniesienia do planu:** …

**Decyzje odroczone i warunki powrotu:** …

**Najważniejsze dowody do zebrania przed kodowaniem:** …

**Pozostałe uwagi:** …

Szczegółowe koszty względne, źródła techniczne i zależności wariantów zachowano w [załączniku](decisions-details.md). Ten brief nie zmienia samoczynnie planu ani jego stanu wykonania.
