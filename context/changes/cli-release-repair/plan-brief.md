# Naprawa wydań CLI — plan po decyzjach operatora

[Pełny plan](plan.md) · [Eksport decyzji](decisions-record.md) · [Badanie wykonalności](decision-alignment-research.md) · [Handoff](release-handoff.md)

## Co i dlaczego

Naprawiamy wydanie po squashu: dowód ma wskazywać dokładnie commit publikowany jako npm i binaria. Operator wybrał automatyzację numerowania i łańcucha wydań. Nie będzie osobnego zatwierdzania numeru wersji; pozostaje zwykły merge kodu przez człowieka.

## Punkt wyjścia

CLI master b0c789a i Toolkit master 39925ab nie zmieniły się po świeżym fetch. Stary dowód obejmuje CLI sprzed squasha. Obecny automat dodatkowo tworzy commit wersji po testach. Naprawa nie została zaimplementowana; wcześniejsze 647 testów to wynik bazowego kodu. Ostatnia inspekcja wykazała npm 1.20.0 i nieopublikowane v4; ponowimy ją przed operacjami.

## Docelowe zachowanie

Bot oblicza wersję i zapisuje ją w istniejącym PR-ze CLI przed końcowymi testami. Po ludzkich mergach koordynator sam uruchamia świeże testy zachowanych treści na Linux/Windows, sprawdza ich tożsamość i wyzwala publikację dokładnego commitu. Pobranie rzeczywistej paczki z npm zamyka weryfikację jej bajtów; udany build nie wystarcza.

## Decyzje

| ID | Wybór | Skutek | Źródło |
|---|---|---|---|
| D01 C | Obecna ścieżka PR Toolkit; dispatch tylko wydaniowy | Najpierw merge CLI, potem Toolkit; przyszły samodzielny PR CLI potrzebuje rzeczywistego PR-a Toolkit | Eksport |
| D02 A | Tryb dowodowy w ci.yml | Wspólne testy; deploy/publish/transformacje pozostają push-only | Eksport |
| D03 A | Pełna obsługa attemptów | Nowe nazwy artefaktów, ścisły wybór próby, komplet obu OS; bez kasowania starych | Eksport |
| D04 B | Automatyczny łańcuch i trwała blokada | Jeden koordynator, reakcja na oba repo, jawna tożsamość operacji i kontrolowane uprawnienia | Eksport |
| D05 A + komentarz | Automatyczny numer w tym samym PR-ze | Istniejące reguły bump; brak osobnego PR-a lub akceptacji wersji | Komentarz operatora nadrzędny wobec starej rekomendacji |
| D06 C | Publikacja katalogu | npm sam ustawia registry gitHead; porównanie integrity następuje po publikacji | Eksport |
| D07 C | Ręczne dokończenie awarii częściowej | Runbook i zachowane artefakty; nigdy drugi npm publish tej samej wersji | Eksport |
| D08 A | Osobne testy paczki i treści | Najpierw pobrany npm/v3, później zatwierdzona promocja i weryfikacja v4 | Eksport |

## Zakres i mechanizm

D05 realizujemy przez mały automat przygotowujący wersję w zwykłym PR-ze. Numer wynika z ostatniego opublikowanego taga i reguł conventional commits; kolejne uruchomienie nie podbija go ponownie. Obecne dane dają 1.21.0, lecz nie jest to numer do ręcznego zatwierdzenia. Automat działa z zaufanego kodu mastera i nie uruchamia skryptów kandydata z tokenem zapisu.

Koordynator działa w Toolkit. Własność operacji zapisuje na osobnej referencji Git poza masterem, aktualizowanej bez force; blokada obejmuje testy i publikację w obu repo. Potrzebne są tokeny o wskazanych w planie zakresach, w tym odczyt blokady Toolkit przez zaufany workflow CLI. Koordynator domyślnie pozostaje nieaktywny do weryfikacji konfiguracji przez Session A. Nie dodajemy bazy ani nowej usługi. Opóźnione, powtórzone lub niejednoznaczne zdarzenia nie mogą wywołać drugiego wydania.

Po npm pack i smoke następuje npm publish katalogu z tego samego czystego checkoutu. To ponowne pakowanie: równość bajtów sprawdzamy pobraniem z rejestru. Próba syntetyczna npm 11.12.1 przeszła; test rzeczywistej paczki nadal jest wymagany. Niezgodność oznacza nieukończone wydanie, którego nie nadpisujemy.

W zakresie są workflowy, walidatory, regresje, dokumentacja i dwa PR-y. Nie zmieniamy produktu, autoryzacji, zegarów, uprawnień kursantów ani EDU. Ukończenie auth-access-resilience nie jest nową zależnością. Zachowujemy cutoff v3, pełne foldery skills i odblokowanie modułu 1 o 2026-09-14 06:00 UTC.

## Fazy

| Faza | Wynik | Główne ryzyko |
|---|---|---|
| 1 | Świeże dowody z zachowanych bajtów i ścisłe attempty | Pomieszanie źródłowego runu z nowym testem |
| 2 | Automatyczna wersja/koordynacja i publikacja katalogu | Uprawnienia, wyścigi, niezgodność po npm publish |
| 3 | Testy, runbooki, review i dwa PR-y | Kolejność merge oraz bezpieczne uruchomienie koordynatora |
| 4 | Faktyczne wydanie i pobrana paczka | Login, oddzielna promocja treści i rzeczywisty czas odblokowania |

Przed implementacją potrzebne jest zatwierdzenie wynikowego planu. Przed aktywacją automatu sprawdzimy zakresy credentiali i konkurencyjne zapisy na izolowanej referencji testowej. Po wdrożeniu tej naprawy zwykły merge CLI nadal wymaga dowodu z realnego PR-a Toolkit — D01 C nie rozwiązuje niezależnych PR-ów CLI bez takiego partnera.

## Odbiór i pozostałe bramki

- Dowody, tag, registry gitHead, wersja i binaria wskazują ten sam commit; integrity pobranej paczki odpowiada wcześniejszemu pack.
- Faktyczna paczka przechodzi login/v3, EN/PL, pełne skills, sync/refresh i ochronę lokalnych zmian. Phase 4: najwyższy dostępny autoryzowany kurs, stabilny v3, brak zapisów w podglądzie i brak bindingu po nieudanym preflight.
- Promocja v4 wymaga osobnej zgody i procedury withdraw; później weryfikujemy tożsamość i prawdziwe odblokowanie. Session C stage 1 pozostaje niespełniony.

Eksport już zastosowano. Nie trzeba ponownie eksportować decyzji. Ten dokument służy do odbioru poprawionego planu, nie autoryzuje implementacji ani produkcji.
