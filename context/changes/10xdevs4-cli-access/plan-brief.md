# 10xDevs 4 — pierwsze wydanie: dostęp i dostarczanie

Aktualizacja: 2026-09-12. [Plan](plan.md) · [Rekord akceptacji](decisions-record.md) · [Podział prac](split-map.md) · [Dowody do zebrania](evidence.md)

Uczestnik mający tylko v4 ma się zalogować i pobrać pierwszy tydzień bez podawania edycji. Nowy projekt z dostępem do obu kursów wybierze dostępne v4. Istniejący projekt v3 zachowa edycję i sposób pracy również po zakupie v4.

To pierwsza z dwóch zmian. [Druga — migracja projektów](../10xdevs4-project-migration/plan-brief.md) — pozwoli świadomie przenieść istniejący projekt, zachować niedostępne jeszcze skille v3 i wymieniać je później przez sync. Każda zmiana może wymagać PR-ów w CLI i toolkit. Jedno miejsce postępu na zmianę znajduje się w jej planie w repo CLI; toolkit zawiera odnośniki i swój zakres.

## Co obejmuje pierwsze wydanie

Toolkit naprawi zachowanie grantów, dopuści logowanie v4-only i sprawdzi uprawnienia na każdej trasie treści. Formalna specyfikacja programu będzie określała oczekiwaną zawartość lekcji; automatyczna walidacja porówna ją z definicjami i wynikowymi paczkami EN/PL. Dokładna zawartość nadal wymaga dowodu zgodności z kursem.

CLI będzie wybierał edycję według kolejności: jawny wybór → edycja istniejącego projektu → rekomendacja API. Poprawimy propagowanie wybranego kursu do manifestów, bezpieczne usuwanie plików oraz podglądy, które obecnie mogą zmieniać konfigurację. Zwykły get/sync nie będzie przełączał edycji projektu. Do czasu drugiego wydania v4 można rozpocząć w osobnym katalogu.

V3 zachowuje obecne obiekty R2. Cutoff sprzed v4 będzie bazą źródeł dla jawnych poprawek utrzymaniowych; wybór commita nie oznacza nadpisania obecnej publikacji. Testujemy osobno stary CLI z nowym backendem i nowy CLI na istniejącym projekcie v3. Użytkownik tylko v3 nie musi migrować ani dodawać flag.

## Jak trafiają do użytkownika nowe skille

Wersja źródła wynika z kolejności **SHA pliku → SHA całej paczki skilla → domyślna wersja kursu**. Pin paczki obejmuje SKILL.md, references, skrypty i pozostałe pliki. V4 domyślnie bierze latest rozwiązane raz do konkretnego SHA podczas budowania. CLI pobiera gotową publikację, nie repozytorium Git.

Każde wydanie v4 ma własny niezmienny katalog w R2 i manifest hashy. Get/sync wybiera jedno wydanie na całą operację. CI buduje i sprawdza wynik; operator ręcznie promuje dokładnie to wydanie. Latest nie oznacza automatycznej promocji. Jedna ścieżka CI obsługuje promocję i rollback; warunkowy zapis current musi zostać dowiedziony na faktycznym publisherze. Nie dodajemy GC ani kanałów wydań.

Pierwsza zmiana dostarcza też podpisany format mapy migracji, który może jeszcze nie mieć wpisów. Druga dołoży sprawdzone mapowanie i lokalną operację migracji. Nie dopisujemy mapy do już opublikowanego niezmiennego wydania.

## Kolejność i warunki wydania

1. Naprawa tożsamości/grantów oraz autoryzacja i discovery.
2. Specyfikacja treści, źródła i publisher v4 z ochroną v3.
3. Wybór edycji w CLI i bezpieczeństwo zwykłych aktualizacji.
4. Lokalne E2E na konkretnych kandydatach obu repo, testy kompatybilności v3, Linux/Windows i review implementacji.
5. Zatrzymanie starych publisherów i snapshot v3; zabezpieczony Worker; zweryfikowane treści i ręczna promocja; próba kont; publikacja CLI.

Nie wdrożono kodu. Po fetch z 2026-09-12 mastery nadal wskazują CLI f89f195 i toolkit da989a6. Najważniejsze niezamknięte dowody: finalny cutoff v3, faktyczna zawartość programu, pełny snapshot v3 oraz warunkowa promocja przez rzeczywistą ścieżkę publikacji. Każdy ma przypisany etap w evidence.md; brak dowodu nie jest zaliczeniem kryterium.
