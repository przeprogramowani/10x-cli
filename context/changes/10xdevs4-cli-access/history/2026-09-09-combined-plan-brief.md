# 10xDevs 4 w CLI — skrót planu

> [Pełny plan](plan.md) · [Research](research.md) · [Decyzje i alternatywy do wyboru](decisions.md)
> Status: propozycja do przeglądu przed implementacją; kod aplikacji niezmieniony.

## Co chcemy osiągnąć

Uczestnik mający wyłącznie 10xDevs 4 loguje się przez `10x auth`, widzi pierwszy tydzień przez `10x list 1` i pobiera `m1l1–m1l5` bez podawania edycji. Kolejne `sync` aktualizuje właściwe materiały i chroni jego lokalne zmiany.

Dla nowego projektu z dostępem do obu edycji domyślnie wybieramy opublikowane v4. Projekt już korzystający z v3 pozostaje na v3. Uprawnienia sprawdza backend na podstawie aktywnych grantów; CLI nie zgaduje ani nie próbuje kolejnych sposobów logowania.

## Punkt wyjścia

Oba plany bazują na świeżych masterach: CLI `f89f195`, toolkit `da989a6`, w osobnych worktree. Synchronizacja uprawnień v4 istnieje, lecz brakuje logowania, publikacji pierwszego tygodnia i wyboru kursu. Przegląd wykazał błędy usuwania lokalnych plików, kontroli dostępu i zachowania grantów.

Unaited nie zostało wdrożone z brancha wydarzenia i nie jest potrzebne. Przenosimy tylko użyteczne rozwiązania po poprawkach. Osobny historyczny endpoint ZIP obecny na masterze również wycofujemy.

## Rekomendowane decyzje

| Obszar | Decyzja | Powód | Źródło |
|---|---|---|---|
| Pierwszy tydzień v4 | Osobne definicje na bazie obecnych m1l1–m1l5, z przeglądem treści | Szybki dostęp do istniejących materiałów i niezależne dalsze zmiany | Plan |
| Wybór kursu | Jawny wybór → edycja projektu → rekomendacja API | Nowy projekt dostaje najlepszy dostęp; istniejący zachowuje źródło | Użytkownik + review |
| Zmiana edycji | Jawna migracja całego projektu: podgląd, rozstrzygnięcie konfliktów, backup, dziennik, resume/rollback | Zatwierdzony scenariusz przejścia z istniejącego projektu v3 na v4 | Użytkownik |
| Wydania R2 | Niezmienne paczki pod releaseId; wskaźnik aktualnego wydania przełączany po weryfikacji | Całe get/sync/migracja korzysta z jednego wydania | Rekomendacja techniczna |
| Materiały v3 | Zachowanie publikacji przy wdrożeniu; źródła z cutoffu sprzed v4, dalej tylko utrzymanie | Aktualizacja skilli v4 nie zmienia materiałów starej edycji | Użytkownik + research |
| Wersje plików | V4 domyślnie latest; jawny commit pliku ma pierwszeństwo przed wersją kursu | Możemy rozwijać bibliotekę i zamrażać wybrane pliki | Użytkownik |
| Logowanie | Aktywny grant v3 lub v4; autoryzacja osobno dla każdej treści | Sam token nie daje dostępu do innych kursów | Review |
| Granty | Naprawa scalania tożsamości i indeksów przy Circle sync | Ręczny dostęp v4 nie znika po dołączeniu do v3 | Odtworzony błąd |
| Lokalne pliki | Usuwanie tylko niezmienionych, śledzonych plików; podgląd nic nie zapisuje | Chroni poprawki i własne notatki | Odtworzony błąd |
| Branch startowy | Czyste mastery; wybiórcze użycie wcześniejszego kodu | Pierwszy tydzień nie wymaga get-by-name ani eventu | Research |
| Wdrożenie | Zabezpieczenia backendu → treści v4 → CLI | Obecna odwrotna kolejność tworzy okno dostępu do cudzej edycji | Research |

## Zakres

W zakresie: logowanie/refresh, discovery, pierwszy tydzień EN/PL, get/list/sync, zachowanie edycji projektu, bezpieczeństwo aktualizacji, poprawne migracje profili oraz jawna migracja projektu v3→v4, niezmienne wydania v4, testy obu repo i kontrolowane wdrożenie.

Poza zakresem: samorejestracja Unaited, wygaszanie/usuwanie eventowych instalacji, nowy endpoint ręcznego nadawania grantów, scalanie get-by-name, tygodnie 2–5, automatyczne przełączanie edycji, dowolny downgrade, automatyczny merge konfliktów i rozbudowana platforma publikacyjna.

## Jak to będzie działać

Backend zwraca dostępne edycje oraz rekomendację; CLI uwzględnia ją przy pierwszym pobraniu i zapisuje edycję projektu. Każda odpowiedź z treścią nadal podlega autoryzacji i istniejącej weryfikacji podpisu. Publisher zapisuje wyłącznie wybraną edycję v4 w nowym prefiksie releases/<releaseId>, pozostawiając v3 bez zmian. Po sprawdzeniu katalogu, paczek i manifestu przełącza current.json; rollback wskazuje wcześniejsze wydanie. Manifest wydania zapisuje pochodzenie źródeł i hashe gotowych obiektów. API i CLI utrzymują jeden releaseId przez całą operację, a lokalne manifesty pamiętają wydanie zainstalowanych lekcji. Następne sync może wybrać nowsze wydanie.

Wersję źródła wybieramy według reguły **commit konkretnego pliku → domyślna wersja kursu**. Dla v4 domyślna wersja to najnowszy master wybrany do publikacji, rozwiązywany raz do pełnego SHA podczas budowania. CLI pobiera ostatnią udaną publikację. Przypięty plik pozostaje na wskazanym commicie do zmiany lub usunięcia przypięcia; brak pliku albo commita przerywa build.

Przypięcie `SKILL.md` dotyczy tylko tego pliku. Powiązane references/skrypty można przypiąć osobno; build sprawdza kompletność złożonego skilla i zapisuje pochodzenie plików. Nazwy skilli pozostają takie same. Pin dotyczy źródła, a tłumaczenia i transformacje są osobnym wejściem do builda. Dokładny cutoff v3 wymaga sprawdzenia historii; jego wybór nie nadpisuje obecnej publikacji. Utrzymaniowe wydanie v3 będzie miało osobny, jawny zakres zmian.

| Etap | Rezultat | Główne ryzyko |
|---|---|---|
| 1. Tożsamość i granty | Dostępy zachowane przy zmianach Circle ID | Nadpisanie innego źródła/indeksu |
| 2. API i logowanie | v4-only loguje się; każda treść sprawdza kurs | Pominięta droga do treści |
| 3. Pierwszy tydzień | Osobne m1l1–m1l5 i publisher v4 | Przypadkowa aktualizacja v3 |
| 4. CLI i edycja projektu | Automatyczny wybór i bezpieczne podglądy | Mieszanie kursów po częściowym zapisie |
| 5. Pliki, profile i migracja edycji | Ochrona lokalnych zmian oraz przejście v3→v4 z backupem i odzyskiwaniem | Przerwany zapis wielu plików i manifestów |
| 6. Testy współpracy | Faktyczny login→get→sync na kodzie kandydata | Testowanie innej wersji lub sztucznego tokena |
| 7. Wdrożenie | Sprawdzony backend, treści i opublikowane CLI | Kolejność i rollback |

## Zatwierdzona migracja projektu v3→v4

1. Sprawdza dostęp do v4, wybiera jedno konkretne wydanie i pobiera wyłącznie odblokowane zamienniki zainstalowanych materiałów.
2. Pokazuje diff dla wszystkich profili: zmiany, konflikty i skille pozostające na v3 do czasu dostępności w v4. Identyczne nazwy/ID nie zastępują mapowania.
3. Po rozstrzygnięciu konfliktów i zaakceptowaniu podglądu tworzy lokalny backup plików, manifestów i przypisania edycji.
4. Wykonuje zapis z dziennikiem i blokadą innych zapisów CLI. Przerwaną operację można wznowić lub wycofać bez pobierania nowszego wydania.
5. Na końcu zapisuje manifesty wszystkich profili i zmienia edycję projektu na v4. Skille jeszcze niedostępne w v4 zostają aktywne w wersji v3, z zapisanym pochodzeniem i statusem oczekiwania. Własne pliki oraz tekst poza zarządzanymi fragmentami reguł pozostają zachowane.
6. Kolejne `sync` sprawdza, co odblokowano w v4, aktualizuje dostępne zamienniki i dopiero po udanym zapisie zmienia ich pochodzenie/status w manifeście.

Proponowany interfejs: `10x migrate --to 10xdevs-4 --dry-run`, migracja interaktywna bez `--dry-run`, `--resume <id>` oraz `--rollback <id>`. Backup i dziennik zostają w `.10x-cli/migrations/<id>/`, poza aktywnymi katalogami narzędzi, bez automatycznego kasowania. Rollback nie nadpisuje zmian zrobionych po migracji; zgłasza konflikt. Migracja nie zmienia przy okazji profilu narzędzia. Wymaga aktualnego CLI; stare wersje nie respektują nowej blokady.

**Ustalony model: migracja stopniowa.** Projekt ma docelową edycję v4, ale manifest pamięta osobno wersję każdego skilla: już v4 albo nadal v3 i oczekujący na odblokowanie/publikację/mapowanie zamiennika. Nie archiwizujemy ani nie usuwamy skilli tylko dlatego, że ich lekcja v4 jest jeszcze niedostępna. Nie pobieramy zablokowanych treści i nie aktualizujemy oczekujących skilli z serwera v3. Zakończenie operacji migracji nie oznacza, że wszystkie skille zostały już podmienione.

`sync` sprawdza oczekujące wpisy także wtedy, gdy wydanie i hashe się nie zmieniły, bo lekcja mogła odblokować się czasowo. Chroni lokalne poprawki, nie instaluje przy okazji wszystkich nowych skilli z lekcji i nie usuwa oczekujących plików jako rzekomo nieaktualnych. Manifesty przechowują pochodzenie oraz hashe plików; identyczne ID lekcji v3/v4 nie zastępują tej informacji. Konflikty lokalnych zmian nigdy nie rozstrzygają się przez ogólne `--force`.

## Założenia i granice

- Rekomendowaną bazą treści są obecne zatwierdzone materiały pierwszego tygodnia; wskazanie osobnego źródła v4 zmieni fazę treści przed implementacją.
- Pełny backup i porównanie publikacji v3 powstają z rzeczywistych danych produkcyjnych przed wdrożeniem; lokalny commit nie zastępuje tego dowodu.
- Naprawiamy odtworzoną sekwencyjną utratę grantów. Obecny KV nie daje transakcyjności między równoległymi żądaniami; plan nie udaje, że zwykłe scalanie to zapewnia.
- Wdrożenie wymaga przejścia testów i przeglądu implementacji. Nie rozpoczęto żadnej fazy implementacyjnej.
- Rozmiar: zmiana obejmuje dwa repozytoria i siedem etapów; faza 5 obejmuje dodatkowo migrację projektu i testy odzyskiwania. Polityka stopniowej wymiany jest ustalona; przegląd obejmuje ochronę oczekujących plików i dalsze aktualizacje przez sync.

## Jak potwierdzimy sukces

- Konto v4-only przechodzi prawdziwe logowanie, pięć lekcji i sync; konto v3 oraz projekt już związany z v3 zachowują działanie.
- Nie da się pobrać cudzej edycji przez katalog, pojedynczy artefakt, ZIP ani nieznany prefix w R2.
- Testy zachowania lokalnych zmian, grantów i niezmienionej publikacji v3 przechodzą, a dowody wdrożenia wskazują dokładne wersje obu repo.

