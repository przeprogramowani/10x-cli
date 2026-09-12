# Podział zaakceptowanego zakresu

Data: 2026-09-12. Autorytet: [decisions-record.md](decisions-record.md), SHA-256 `3f877a33e03b5e3886bbb0073a1e792da7acdd78163b4aeac1a8a8567f7f489b`.

## Dwa changes i odpowiedzialność repo

| Zmiana | Toolkit | CLI | Wydanie |
|---|---|---|---|
| [10xdevs4-cli-access](plan.md) | Granty, auth/guard/discovery, formalny program, source resolver, immutable R2, podpisany map envelope, jedna ścieżka CI | Wybór/binding, obsługa release, bezpieczne get/list/sync i zmiana profilu | Samodzielna wartość dla v4-only; v3 pozostaje przezroczyste |
| [10xdevs4-project-migration](../10xdevs4-project-migration/plan.md) | Sprawdzona lista nazw, wyjątki i wygenerowana mapa w nowym wydaniu; testy API/E2E | Preview i jawne decyzje, manifest transition, ostatnia operacja recovery, sync pending | Wymaga kontraktów pierwszej zmiany; istniejące projekty mogą przejść na v4 |

Każdy plan w CLI jest kanoniczny dla obu repo i ma jedną sekcję Progress. Toolkit ma osobny folder każdej zmiany i odnośnik do właściwego planu, bez duplikowania checkboxów. Przy implementacji użyć osobnych branchy per change w obu repo; drugi bazować na rzeczywiście scalonym pierwszym wydaniu i ponownie sprawdzić diff. Dokumenty planowane są w dotychczasowych izolowanych worktrees. Nie zakładamy dokładnie dwóch PR-ów łącznie.

## Decyzje → zobowiązania

| ID | Wybór | Właściciel w podziale | Wiążący efekt |
|---|---|---|---|
| D01 | A | Dostęp, fazy 2 i 4 | API rekomenduje, istniejąca edycja ma pierwszeństwo |
| D02 | C | Dostęp, faza 1 | Wspólne writery KV, konieczne recovery i diagnostyka; bez transakcyjnej bazy |
| D03 | B | Dostęp, faza 3 | Formalny program i niezależna automatyczna kontrola pokrycia |
| D04 | A | Dostęp, fazy 3 i 7 | Cutoff/utrzymanie v3, brak zmiany żywych bajtów R2 |
| D05 | A + notatka | Dostęp, faza 3 | SHA pliku → SHA paczki → default kursu |
| D06 | C | Dostęp, faza 3; konsumowany przez migrację | Minimalne immutable v4, legacy v3 pozostaje |
| D07 | C | Dostęp, fazy 3 i 7 | Jedna ścieżka CI, ręczna promocja green build, warunkowy current, bez GC |
| D08 | A | Migracja | Tylko odblokowane v4; pozostałe v3 aktywne i pending |
| D09 | C | Migracja; envelope w dostępie | Generator ze sprawdzonej listy nazw + jawne wyjątki; CLI nie zgaduje |
| D10 | A | Migracja | Wersjonowany transition w manifestach profili, każdy writer go zachowuje |
| D11 | C | Migracja | Sync aktywnego profilu; --all-profiles jawne; raport odroczonych |
| D12 | C | Migracja | Jeden aktywny dziennik, snapshot dotykanych plików, recovery ostatniej operacji |
| D13 | A | Dostęp: zwykłe pliki; migracja: konflikty przejścia | Decyzje per plik, ochrona własnych zmian, bez globalnego force |
| D14 | A + notatka | Oba wydania | Stary CLI/nowy backend oraz nowy CLI/stare v3; downgrade dotyczy projektów po migracji |
| D15 | C | Ten podział | Dostęp i dostarczanie przed migracją; pełny cel pozostaje w obu planach |
| D16 | C | Testy/rollout obu zmian | Lokalne E2E, mały smoke/runbook; ochrona danych i kolejność pozostają |

## Przeniesienie 30 kryteriów poprzedniego planu

[Snapshot wspólnego planu](history/2026-09-09-combined-plan.md) zachowuje oryginalne 7 faz i 30 niewykonanych pozycji wyłącznie jako historię. Jego Progress nie jest już aktywnym stanem realizacji; nie uruchamiać go przez implement skill. [Historyczne review](history/2026-09-09-plan-review.md) dotyczy tej dawnej wersji.

| Dawne pozycje | Nowy właściciel | Zakres zachowany / doprecyzowany |
|---|---|---|
| 1.1–1.2, 2.1–2.3 | Dostęp, te same numery i tytuły | Granty, auth, guard, discovery |
| 3.1–3.6 | Dostęp, te same numery i tytuły | Program, źródła, wydania; 3.5 ma notatkę o pinie paczki, 3.6 sprawdza kontrakt przyszłej migracji |
| 4.1–4.3 | Dostęp, te same numery i tytuły | Wybór/binding i czysty podgląd |
| 5.1–5.3 | Dostęp, te same numery i tytuły | Zwykłe usuwanie, zmiana profili, freshness |
| 5.4 | Migracja: preview/mapa | Odblokowane zamienniki, konflikty, dry-run |
| 5.5–5.6 | Migracja: recovery | Przerwania, lock, snapshot, offline rollback; zakres ograniczony do ostatniej operacji |
| 5.7 | Migracja: manifesty i writery | Pending, pochodzenie, spójny commit, brak kolizji m1lN |
| 5.8 | Migracja: sync pending | Odblokowanie bez nowego release, aktywny profil/--all-profiles |
| 6.1–6.3 | Dostęp, te same numery i tytuły; powtórne gate dla migracji | Dokładne kandydaty, CI, review |
| 6.4 | Migracja: końcowe E2E | Wiele profili, interruption/rollback na Linux/Windows |
| 7.1–7.2, 7.4–7.5 | Dostęp, te same numery i tytuły | Bezpieczna pierwsza publikacja i realne konta; migracja ma własny rollout |

Dostęp dodaje 3.7–3.9 dla D03 B, pełnego D05 i faktycznego publishera D07 oraz 5.9 dla ochrony lokalnych reguł już w pierwszym wydaniu. Luki po przeniesionych numerach są celowe. Nowy plan migracji nadaje własne numery; żadne przeniesienie nie oznacza wykonania. Stan bieżący odczytywać tylko z dwóch kanonicznych planów.
