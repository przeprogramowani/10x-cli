# Logowanie do 10x-cli wiadomością Circle — szczegółowe warianty i weryfikacja

Data: 2026-09-13. Zakres: `10x-cli`, `10x-toolkit` oraz decyzja o udziale `przeprogramowani-edu`.

[Executive brief — tu wpisz finalne decyzje](decisions.md). Ten załącznik trzyma pełne porównania techniczne; arkuszem wyboru jest brief.

[Przegląd architektury](architecture-review.md) · [Research](research.md) · [Framing](frame.md)

`plan.md` jeszcze nie istnieje. Wariant „A — obecny plan” oznacza tu rekomendację z `architecture-review.md`, czyli obecną propozycję architektury, a nie zapisany plan wykonawczy. Plan powstanie po tych decyzjach i to on, a nie ten dokument, będzie nosił fazy i sekcję Progress. Żadna wiadomość Circle nie została wysłana, nic nie zostało wdrożone ani scalone.

## Jak czytać warianty

- **A — obecny plan:** wariant rekomendowany w przeglądzie architektury (Design A: kanał po stronie Toolkitu, przepływ w duchu RFC 8628, stan w Durable Object).
- **B — najsolidniejsza alternatywa:** największa liczba gwarancji — więcej dowodów, więcej sprawdzeń, zwykle więcej kodu, kontraktów i wdrożeń.
- **C — najzwinniejsza alternatywa:** najoszczędniejsza realizacja tego samego zachowania, z jawnie nazwaną utraconą gwarancją lub wygodą. C nie jest rezygnacją z twardych ustaleń.
- **Koszt „budowa / utrzymanie”** to względna ocena architektoniczna, nie estymacja godzin. Czas operatora i obciążenie supportu liczą się jako koszt.
- **Status** oddziela to, co już ustalone, od tego, co otwarte. „Do sprawdzenia” oznacza brak dowodu, nie pytanie o zgodę.

Tam, gdzie przegląd wymieniał więcej niż trzy możliwości, odrzucone opcje zostały opisane w kontekście karty w briefie albo w słabej stronie właściwego wariantu: sam link w DM bez wiązania z terminalem (D02), KV jako magazyn stanu jednorazowego (D03) oraz pełny most EDU jako sposób ponownego użycia kodu (D10, tożsamy z D01-B).

## Ustalenia, które są już wyraźne

- Logowanie mailem zostaje bez zmian; wydane CLI 1.20.0 ma działać po wdrożeniu backendu tak samo jak dziś.
- Kredencjałem jest istniejący JWT HS256 Toolkitu plus refresh z rotacją rodziny. Refresh, odbieranie dostępu, `/api/me/courses`, odblokowania modułów i jawny wybór edycji projektu pozostają nietknięte.
- Dowód tożsamości przez Circle nigdy nie tworzy ani nie przywraca grantu; uprawnienie czytamy z `CLI_10X3_MEMBERSHIP_KV` w chwili zatwierdzenia i wydania tokenu.
- Sekrety Circle pozostają po stronie serwera; w logach nie ma bearera, adresata ani treści wiadomości.
- Wysyłka DM: 4xx to odrzucenie, timeout i 5xx to wynik nieznany. Nigdy automatycznej ponownej wysyłki ani cichego przełączenia na e-mail.
- Stan jednorazowy wymaga dowodu atomowości; `get` plus `delete` na KV takim dowodem nie jest.
- Odpadają: ciasteczko EDU jako kredencjał CLI, sam identyfikator żądania jako uprawnienie, dowolne callback URL.

## Indeks decyzji

| ID | Temat | Rekomendacja do wyboru |
|---|---|---|
| [D01](#d01) | Własność kanału Circle i sprzężenie awarii | A w realizacji C: Toolkit właścicielem, bez warstw na zapas. B tylko przy świadomej zgodzie na EDU i Supabase w ścieżce logowania CLI. |
| [D02](#d02) | Wiązanie zatwierdzenia z terminalem | A: przepisywany `user_code` plus bearer z fragmentu. C dopiero po dowodach z pilotażu, B jako osobna zmiana. |
| [D03](#d03) | Magazyn stanu jednorazowego w Toolkicie | A: Durable Object per logowanie. C rozważyć, jeśli W04 pokaże nieproporcjonalny koszt harnessu; KV nie jest wariantem. |
| [D04](#d04) | Uprawnienie przy logowaniu i moment sprawdzenia | A: wymóg aktywnego kursu przy `start` i ponowny odczyt przy zatwierdzeniu oraz wydaniu. C tylko razem z D05-B. |
| [D05](#d05) | Enumeracja członkostwa i kształt odpowiedzi `start` | A dla spójności z logowaniem mailem; B, jeśli enumeracja ma zostać zamknięta produktowo. |
| [D06](#d06) | Wybór metody logowania w CLI | A; C jako pierwszy etap przy najmniejszym wydaniu. B po pilotażu i po wyniku W11. |
| [D07](#d07) | Limity, flaga roll-outu i token Circle | A z progami z `policy.ts` EDU jako wartościami wyjściowymi. C tylko przy pozytywnym W01 i świadomej zgodzie na wspólny token. |
| [D08](#d08) | Utwardzenie istniejącej ścieżki mailowej | A w wydaniu C: test graniczny plus zapisana zmiana następcza. B tylko przy uznaniu długu maila za pilniejszy. |
| [D09](#d09) | Dowód z żywej wysyłki DM | A: jedna nadzorowana wysyłka przed finalizacją planu. C wyłącznie przy izolowanym transporcie. |
| [D10](#d10) | Udział repozytorium EDU i forma ponownego użycia kodu | A/C: przenieść reguły, nie budować wspólnego pakietu dla dwóch konsumentów. |

<a id="d01"></a>

## D01. Własność kanału Circle i sprzężenie awarii

**Status:** Kredencjał i brak nadawania uprawnień są ustalone; właściciel kanału jest otwarty.

**Oparcie:** `architecture-review.md` §3 (Design A i Design B), tabela porównawcza w §3, §4 i pozycja D1 w §10; `research.md` — „EDU has no CLI credential mechanism”, „Toolkit auth backend”, „Architecture Insights”.

### A — obecny plan

Toolkit dostaje własne trasy `/auth/circle/*`, własny stan logowania, własny transport do Circle Admin v2 i własną stronę zatwierdzenia. EDU nie zmienia się wcale, poza opcjonalnym wskaźnikiem w dokumentacji. Kod EDU (transport, kryptografia, polityka) jest źródłem do przeniesienia, a nie zależnością w czasie działania.

- **Silna strona:** Toolkit pozostaje jedyną władzą uwierzytelniania; nie powstaje nowy kontrakt zaufania ani klucz do rotacji, a awaria EDU lub Supabase nie dotyka logowania CLI.
- **Słaba strona:** Toolkit musi zbudować to, co EDU ma gotowe: transport, magazyn atomowy, budżety, flagi i stronę zatwierdzenia w przeglądarce.
- **Tradeoff:** Płacimy powtórzeniem pracy za brak zależności między usługami i za dwa repozytoria zamiast trzech.
- **Koszt budowy / utrzymania:** średni–wysoki / niski.

### B — najsolidniejsza alternatywa

EDU pozostaje dowodem tożsamości. CLI startuje logowanie w Toolkicie, link z DM otwiera stronę EDU w trybie „zatwierdzenie CLI”, a po potwierdzeniu EDU woła nowy endpoint Toolkitu z podpisaną asercją (`email`, `user_code`, `nonce`, `exp`) pod nowym sekretem lub parą kluczy. Toolkit weryfikuje asercję, sprawdza uprawnienie na żywo i oznacza logowanie jako zatwierdzone.

- **Silna strona:** Ponownie używamy sprawdzonych RPC z blokadami wierszy, budżetów, neutralności czasowej i mechanizmu pilotażu; wystarczy jeden zestaw tokenów Circle.
- **Słaba strona:** Powstaje ukryta zależność czasu działania — awaria EDU albo Supabase blokuje logowanie CLI — oraz nowy kontrakt zaufania (klucz, rotacja, okno replay), którego dziś nic nie zapewnia. Toolkit i tak potrzebuje własnego stanu urządzenia, więc zysk z „reuse Postgres” jest częściowy, a wdrożenia są trzy.
- **Tradeoff:** Kupujemy dojrzałe gwarancje EDU ceną sprzężenia awarii i kierunku sprzecznego z zapisaną rolą Toolkitu jako władzy dostępu.
- **Koszt budowy / utrzymania:** wysoki / wysoki.

### C — najzwinniejsza alternatywa

Toolkit właścicielem, ale bez warstw na zapas: jeden moduł kanału zamiast rozdzielonych warstw transportu, polityki i dostawców, stałe skopiowane wprost, brak wspólnego pakietu i brak abstrakcji „dowolny dostawca tożsamości”. Granica zaufania i kontrakty HTTP identyczne jak w A.

- **Silna strona:** Najmniej nowego kodu przy tym samym zachowaniu i tej samej granicy zaufania co A; łatwiej to przeczytać w całości podczas przeglądu.
- **Słaba strona:** Drugi kanał albo drugi produkt wymusi refaktor, a reguły dublują się względem EDU bez wspólnego źródła.
- **Tradeoff:** Oszczędzamy na strukturze, nie na gwarancjach; koszt wraca dopiero przy trzecim dostawcy.
- **Koszt budowy / utrzymania:** średni / niski–średni.

**Moja rekomendacja:** A w realizacji w duchu C: Toolkit jako właściciel, bez budowania platformy dostawców tożsamości. B tylko przy świadomej zgodzie na EDU i Supabase w ścieżce logowania CLI.

**Do sprawdzenia:** W01, W04.

**Finalny wybór wpisz w [karcie D01 executive briefu](decisions.md#d01).**

<a id="d02"></a>

## D02. Wiązanie zatwierdzenia z terminalem

**Status:** Odrzucenie „samego linku” jest ustalone; forma drugiego dowodu jest otwarta.

**Oparcie:** `architecture-review.md` §3 (Design A, „Why two proofs”, wariant A1 i Design C), §6 (reguły granic zaufania), §8 (koszt wycieku bearera i zgadywania kodu) oraz D2 w §10; `research.md` — RFC 8628 §5.4, przegląd CLI, „Magic-link pitfalls”.

### A — obecny plan

Dwa niezależne dowody. Bearer w fragmencie linku dowodzi, że wiadomość dotarła na konto Circle; przepisany na stronie `user_code` dowodzi, że osoba zatwierdzająca ma dostęp do terminala, który poprosił o logowanie. `device_code` nigdy nie opuszcza kanału terminal–API, strona nie ma sesji ani ciasteczka, a liczba prób kodu jest ograniczona i budżetowana.

- **Silna strona:** Zamyka scenariusz zdalnego phishingu z RFC 8628 §5.4 i działa w układzie telefon plus terminal, czyli tam, gdzie ta funkcja w ogóle istnieje (SSH, devcontainer).
- **Słaba strona:** Jeden krok więcej niż automatyczne potwierdzenie w EDU; trzeba obsłużyć pomyłki, limit prób i czytelny komunikat po wyczerpaniu prób.
- **Tradeoff:** Kilka znaków wpisanych przez człowieka w zamian za jedyną właściwość odróżniającą ten przepływ od kliknięcia w link.
- **Koszt budowy / utrzymania:** średni / niski.

### B — najsolidniejsza alternatywa

Do A dochodzi tryb przeglądarkowy: CLI otwiera stronę Toolkitu z `state` i PKCE, a po zatwierdzeniu wraca na `http://127.0.0.1:{port}` z kodem autoryzacyjnym. Kod z terminala pozostaje ścieżką uniwersalną dla telefonu i SSH, więc oba protokoły muszą działać równolegle.

- **Silna strona:** Najmocniejsze wiązanie w scenariuszu lokalnym (ta sama przeglądarka, ten sam proces) i naturalne miejsce na wybór metody oraz przyszłych dostawców.
- **Słaba strona:** Dwa protokoły do utrzymania i przetestowania, nasłuch `node:http` z ryzykiem przekroczenia budżetu startu CLI, większa powierzchnia ataku (open redirect, przejęcie portu) — a wszystko to w scenariuszu, który nie jest przyczyną powstania tej funkcji.
- **Tradeoff:** Dokładamy cały drugi protokół dla przypadku, w którym mail zwykle i tak działa.
- **Koszt budowy / utrzymania:** wysoki / średni–wysoki.

### C — najzwinniejsza alternatywa

Wariant A1 z przeglądu: strona pokazuje kod, a człowiek porównuje go z kodem w terminalu i zatwierdza. Te same endpointy i ten sam stan, mniej pól formularza i mniej obsługi błędów.

- **Silna strona:** Najkrótsza ścieżka dla użytkownika i najprostsza strona; zachowuje bearer jako dowód odbioru DM.
- **Słaba strona:** Porównanie „na oko” bywa pomijane; osoba w pośpiechu zatwierdzi żądanie atakującego, który wywołał logowanie na jej adres. Dla funkcji służącej odzyskiwaniu dostępu to zła proporcja ryzyka.
- **Tradeoff:** Wygoda kupiona osłabieniem jedynej właściwości, która odróżnia ten przepływ od linku w mailu.
- **Koszt budowy / utrzymania:** niski / niski.

**Moja rekomendacja:** A. C dopiero wtedy, gdy pilotaż wykaże, że przepisywanie kodu realnie blokuje użytkowników; B jako osobna, późniejsza zmiana.

**Do sprawdzenia:** W07, W10.

**Finalny wybór wpisz w [karcie D02 executive briefu](decisions.md#d02).**

<a id="d03"></a>

## D03. Magazyn stanu jednorazowego w Toolkicie

**Status:** Wymóg dowodu atomowości jest ustalony; wybór magazynu otwarty. KV nie jest wariantem.

**Oparcie:** `architecture-review.md` §7.2 (`DeviceLogin` i `AuthBudget`, bindingi i migracja), §9 (testy pod workerd) oraz D3 w §10; `research.md` — „Cloudflare primitives”, „Atomicity must be built in Toolkit”, słabości KV w Toolkicie.

### A — obecny plan

`DeviceLogin` jako Durable Object per logowanie, ze stanem `pending`, `dispatched`, `approved`, `redeemed`, `denied`, `expired`, hashami `device_code`, `user_code` i bearera oraz licznikiem prób. Każde przejście to jedna synchroniczna transakcja magazynu, `alarm()` wygasza i czyści. Budżety w osobnym `AuthBudget` DO per podmiot.

- **Silna strona:** Pojedyncza instancja z transakcyjnym SQLite to w Workerze najbliższy odpowiednik blokad wierszy z EDU; podwójny odbiór tokenów jest niemożliwy z konstrukcji.
- **Słaba strona:** To pierwszy Durable Object w Toolkicie: nowy binding, migracja `new_sqlite_classes`, nowy harness testowy i nowa wiedza operacyjna.
- **Tradeoff:** Płacimy jednorazowym kosztem infrastruktury za gwarancję, której KV nie da w żadnej konfiguracji.
- **Koszt budowy / utrzymania:** średni–wysoki / niski.

### B — najsolidniejsza alternatywa

Stan logowania w Postgresie EDU, przez RPC z blokadami wierszy, którym towarzyszą testy SQL na realnym silniku i skrypt weryfikujący współbieżność (trzy sesje, oczekiwanie na blokadzie, przegrany podwójny odbiór).

- **Silna strona:** Najmocniejszy dowód atomowości, jaki dziś mamy, razem z gotowymi budżetami, GC i wykrywaniem konfliktu ładunku.
- **Słaba strona:** Wymusza D01-B ze wszystkimi jego kosztami; Toolkit i tak potrzebuje własnego stanu dla `device_code`, więc powstają dwa magazyny zamiast jednego.
- **Tradeoff:** Kupujemy udowodnioną współbieżność ceną sprzężenia awarii i nowego kontraktu zaufania.
- **Koszt budowy / utrzymania:** wysoki / wysoki.

### C — najzwinniejsza alternatywa

D1 jako magazyn stanu, z każdym przejściem zapisanym jako warunkowy `UPDATE … WHERE state = ?` i liczbą zmienionych wierszy w roli testu „czy to ja wykonałem przejście”.

- **Silna strona:** Zwykły SQL, znajomy model testowania i brak migracji klas DO; łatwo obejrzeć stan w konsoli podczas diagnostyki.
- **Słaba strona:** D1 daje transakcje wyłącznie na poziomie batcha, więc żadne przejście nie może składać się z dwóch zapisów; pomyłka w tym miejscu daje cichy błąd współbieżności, a nie wyjątek.
- **Tradeoff:** Oszczędzamy na nowym modelu wykonania kosztem dyscypliny, którą trzeba utrzymywać ręcznie w każdym przejściu.
- **Koszt budowy / utrzymania:** średni / średni.

**Moja rekomendacja:** A. C tylko wtedy, gdy W04 pokaże, że koszt harnessu DO jest nieproporcjonalny do zysku; B wyłącznie jako konsekwencja wyboru D01-B.

**Do sprawdzenia:** W04, W12.

**Finalny wybór wpisz w [karcie D03 executive briefu](decisions.md#d03).**

<a id="d04"></a>

## D04. Uprawnienie przy logowaniu i moment sprawdzenia

**Status:** Brak nadawania i przywracania grantów jest ustalony; liczba i miejsce sprawdzeń otwarte.

**Oparcie:** `architecture-review.md` §1 (twarde ograniczenia), §7.1, §8 („Entitlement revoked between start and approval”) oraz D4 w §10; `research.md` — `activeRegisteredCourseIds`, wymóg aktywnego kursu w logowaniu mailem, „Identity vs entitlement” po stronie EDU.

### A — obecny plan

Wymagamy co najmniej jednego aktywnego zarejestrowanego kursu już przy `start`, tak jak robi to logowanie mailem, i czytamy KV ponownie przy zatwierdzeniu oraz przy wydaniu tokenu. Odebranie dostępu między startem a zatwierdzeniem kończy się odmową; po wydaniu tokenu działa istniejąca ścieżka 403 na refreshu.

- **Silna strona:** Jedna reguła dla obu kanałów; nie powstaje drugi, luźniejszy sposób wejścia do produktu.
- **Słaba strona:** Dwa lub trzy odczyty KV na logowanie i konieczność uzgodnienia z kształtem odpowiedzi `start` z D05 — jawna odmowa i neutralna odpowiedź wykluczają się.
- **Tradeoff:** Spójność i wczesna odmowa w zamian za ujawnienie członkostwa oraz kilka dodatkowych odczytów.
- **Koszt budowy / utrzymania:** niski / niski.

### B — najsolidniejsza alternatywa

Sprawdzenie przy każdym przejściu: start, wysyłka, zatwierdzenie i wydanie tokenu, z kodami powodów w logu i zamknięciem kanału (fail closed), gdy odczyt KV się nie powiedzie lub przekroczy budżet czasu.

- **Silna strona:** Najwęższe okno między sprawdzeniem a wydaniem kredencjału i pełna diagnostyka odmowy dla supportu, bez ujawniania danych w logu.
- **Słaba strona:** Więcej odczytów i ścieżek błędu; chwilowa niedostępność KV zamyka logowanie także w sytuacjach, w których dziś by przeszło.
- **Tradeoff:** Kupujemy audytowalność i wąskie okno ceną dostępności kanału.
- **Koszt budowy / utrzymania:** średni / średni.

### C — najzwinniejsza alternatywa

Jedno sprawdzenie, w chwili wydania tokenu. `start` zachowuje się neutralnie i nie ujawnia, czy adres należy do uczestnika; do wydania kredencjału i tak potrzebne jest aktywne uprawnienie.

- **Silna strona:** Najmniej odczytów KV i jedno miejsce, w którym reguła obowiązuje; naturalnie spójne z neutralną odpowiedzią z D05-B.
- **Słaba strona:** Osoba bez dostępu przechodzi całą ścieżkę, zużywa budżet wysyłki i dowiaduje się o odmowie dopiero po zatwierdzeniu w przeglądarce.
- **Tradeoff:** Oszczędzamy na odczytach i ujawnianiu członkostwa kosztem czytelności odmowy i zużytych wiadomości.
- **Koszt budowy / utrzymania:** niski / niski.

**Moja rekomendacja:** A. C wyłącznie razem z D05-B; B, gdy pojawi się wymóg audytowy albo incydent z odebranym dostępem.

**Do sprawdzenia:** W09.

**Finalny wybór wpisz w [karcie D04 executive briefu](decisions.md#d04).**

<a id="d05"></a>

## D05. Enumeracja członkostwa i kształt odpowiedzi `start`

**Status:** Kontrakt `start` jest nowy, więc obie postawy są dopuszczalne; wybór otwarty.

**Oparcie:** `architecture-review.md` §7.1 (tabela odpowiedzi `POST /auth/circle/start`) oraz D5 w §10; `research.md` — limit 3 na 15 minut naliczany po sprawdzeniu członkostwa w Toolkicie, neutralna odpowiedź i wspólny deadline w EDU.

### A — obecny plan

Jawny `403 no_access` przy `start`, z kodem błędu dołączonym do `ERROR_CODE_MESSAGES` w CLI i podpowiedzią, co zrobić dalej. Dokładnie tak zachowuje się dziś logowanie mailem.

- **Silna strona:** Użytkownik i support od razu wiedzą, czy problem leży w dostępie, czy w dostarczeniu wiadomości; nie ma czekania na nic.
- **Słaba strona:** Odpowiedź potwierdza, czy adres należy do uczestnika, więc kanał jest enumerowalny — tak samo jak logowanie mailem dzisiaj.
- **Tradeoff:** Czytelność diagnozy w zamian za utrzymanie istniejącego wycieku informacji o członkostwie.
- **Koszt budowy / utrzymania:** niski / niski.

### B — najsolidniejsza alternatywa

Neutralne `200` z `delivery: "unknown"` dla wszystkich, wspólny deadline odpowiedzi (jak w EDU) i budżety naliczane także adresom spoza kursu, żeby czas i treść odpowiedzi nie różnicowały przypadków.

- **Silna strona:** Brak różnicy w treści i w czasie; kanał przestaje być narzędziem do sprawdzania, kto jest uczestnikiem.
- **Słaba strona:** Osoba bez dostępu czeka pełne okno bez wyjaśnienia, a zgłoszenia do supportu stają się trudniejsze; dochodzi kod utrzymujący stały czas odpowiedzi i budżety dla nie-członków.
- **Tradeoff:** Kupujemy postawę antyenumeracyjną ceną czytelności i dodatkowej logiki czasu odpowiedzi.
- **Koszt budowy / utrzymania:** średni / średni.

### C — najzwinniejsza alternatywa

Neutralny kształt odpowiedzi bez wyrównywania czasu: identyczna treść dla członka i nie-członka, bez wspólnego deadline'u i bez budżetów dla adresów spoza kursu.

- **Silna strona:** Zamyka najprostszą enumerację — tę po treści odpowiedzi — praktycznie bez nowego kodu.
- **Słaba strona:** Różnica czasu odpowiedzi nadal zdradza członkostwo, a użytkownik traci czytelny komunikat; to połowa gwarancji B przy pełnym koszcie wsparcia.
- **Tradeoff:** Najgorsza proporcja z trzech, chyba że traktujemy ją jako krok przejściowy do B.
- **Koszt budowy / utrzymania:** niski / niski.

**Moja rekomendacja:** A dla spójności z istniejącym logowaniem. B, jeśli uznasz enumerację członkostwa za problem produktowy — wtedy razem z D04-C i z decyzją, co zrobić z enumerowalnym kanałem mailowym.

**Do sprawdzenia:** W06, W09.

**Finalny wybór wpisz w [karcie D05 executive briefu](decisions.md#d05).**

<a id="d06"></a>

## D06. Wybór metody logowania w CLI

**Status:** Domyślny e-mail i brak pytań poza TTY są ustalone; istnienie wyboru interaktywnego otwarte.

**Oparcie:** `architecture-review.md` §7.3 (flaga `--method`, kopia komunikatów, `AuthData.method`, obsługa SIGINT) oraz D6 w §10; `research.md` — „CLI auth client”, zachowanie nie-TTY, literał `check_your_inbox`, prior art gałęzi `unaited-csc-access`.

### A — obecny plan

Flaga `--method` z wartościami `email` i `circle`, domyślnie `email`. W TTY bez flagi CLI pokazuje wybór `@clack/prompts`. Poza TTY i w trybie JSON nic nie pyta: wymagane są `--email` oraz jawne `--method circle`. `AuthData` zyskuje opcjonalne pole `method`, które musi przetrwać konstruktor rotacji refresh.

- **Silna strona:** Osoba w terminalu znajdzie metodę bez czytania dokumentacji, a skrypty i CI zachowują się dokładnie jak dziś.
- **Słaba strona:** Nowy krok interaktywny trzeba pokryć testami w obu trybach, razem z anulowaniem przez SIGINT i kopertą JSON.
- **Tradeoff:** Odkrywalność w zamian za kilka nowych przypadków testowych i dodatkowe teksty.
- **Koszt budowy / utrzymania:** niski–średni / niski.

### B — najsolidniejsza alternatywa

A plus jawna propozycja kanału Circle po nieudanej albo wygasłej próbie mailowej — zawsze za potwierdzeniem człowieka, nigdy automatycznie i nigdy poza TTY.

- **Silna strona:** Podpowiedź pada w momencie, w którym problem faktycznie się ujawnia, czyli gdy mail nie przyszedł; kanał nie zmienia się po cichu.
- **Słaba strona:** Najwięcej stanów do pokrycia: kody wyjścia, koperta JSON, anulowanie, wygaśnięcie i ponowna próba. Rośnie też liczba tekstów do utrzymania w dokumentacji i w skillu przewodnika.
- **Tradeoff:** Najlepszy moment podpowiedzi kupiony największą powierzchnią UX i testów.
- **Koszt budowy / utrzymania:** średni / średni.

### C — najzwinniejsza alternatywa

Sama flaga `--method circle`, bez wyboru interaktywnego. Metodę wskazuje dokumentacja (README, skill przewodnika) oraz podpowiedź w treści błędu po nieudanym logowaniu mailem.

- **Silna strona:** Najmniejsza zmiana w CLI, identyczne zachowanie w TTY i poza nim, zero nowego kodu promptów.
- **Słaba strona:** Odkrywalność zależy wyłącznie od dokumentacji i podpowiedzi; część osób metody nie znajdzie i trafi do supportu.
- **Tradeoff:** Oszczędzamy na UX, przenosząc koszt na dokumentację i support.
- **Koszt budowy / utrzymania:** niski / niski.

**Moja rekomendacja:** A; C jako pierwszy etap, jeśli zależy Ci na najmniejszym wydaniu CLI. B dopiero po pilotażu i po wyniku W11.

**Do sprawdzenia:** W07, W11.

**Finalny wybór wpisz w [karcie D06 executive briefu](decisions.md#d06).**

<a id="d07"></a>

## D07. Limity, flaga roll-outu i token Circle

**Status:** Sekrety po stronie serwera i budżety przy stanie logowania są ustalone; liczba tokenów i szczegółowość limitów otwarte.

**Oparcie:** `architecture-review.md` §7.2 (bindingi, sekrety, `AUTH_CIRCLE_LOGIN`, hashe pilotażowe), §7.4 (transport i forma nagłówka) oraz D7 w §10; `research.md` — tokeny v2 per społeczność w EDU, budżety z `policy.ts`, precedens tri-state `EMAIL_DRIFT_MIGRATIONS`, „Rate-limit and flag ownership follow storage ownership”.

### A — obecny plan

Osobny sekret do wysyłki (`CIRCLE_BRAVE_V2_TOKEN`, w razie potrzeby kolejne per społeczność), budżety trzymane w magazynie logowania, tri-state `AUTH_CIRCLE_LOGIN` o wartościach `disabled`, `pilot`, `enabled` oraz lista hashy pilotażowych. Progi startowe przeniesione z `policy.ts` EDU.

- **Silna strona:** Token do wysyłki jest odseparowany od tokenu do rosteru, a kanał wyłącza się flagą bez wdrożenia i bez ruszania ścieżki mailowej.
- **Słaba strona:** Kolejny sekret do provisioningu, rotacji i audytu; wariant zakłada, że taki token da się uzyskać (W01).
- **Tradeoff:** Mniejszy promień rażenia w zamian za większą powierzchnię konfiguracji.
- **Koszt budowy / utrzymania:** średni / niski–średni.

### B — najsolidniejsza alternatywa

Token per społeczność, pełny zestaw okien budżetowych z EDU (kwadrans, godzina, doba, miesiąc; osobno konto, społeczność i IP) oraz flaga czytana świeżo przy każdym żądaniu, uzupełniona runbookiem rotacji i monitoringiem powodów odmowy.

- **Silna strona:** Najprecyzyjniejsza kontrola nadużyć i możliwość wyłączenia jednej społeczności bez ruszania pozostałych.
- **Słaba strona:** Dużo ruchomych części i liczby przeniesione z produktu o innym profilu ruchu; strojenie zacznie się i tak dopiero po pilotażu.
- **Tradeoff:** Kupujemy kontrolę ceną konfiguracji, której na starcie nie mamy jak uzasadnić danymi.
- **Koszt budowy / utrzymania:** wysoki / średni.

### C — najzwinniejsza alternatywa

Ponowne użycie `CIRCLE_API_TOKEN`, jeden zgrubny budżet per hash adresu w konwencji istniejących liczników i binarna flaga włącz/wyłącz.

- **Silna strona:** Zero nowych sekretów i najmniej konfiguracji na starcie; kanał można uruchomić zaraz po potwierdzeniu uprawnień tokenu.
- **Słaba strona:** Ten sam token obsługuje roster, usuwanie członków i wysyłkę, więc jego wyciek jest znacznie kosztowniejszy; zgrubny limit gorzej chroni pojedyncze konto, a binarna flaga nie daje etapu pilotażowego. Wariant zależy w całości od pozytywnego W01.
- **Tradeoff:** Oszczędzamy na sekretach i konfiguracji kosztem promienia rażenia i stopniowanego roll-outu.
- **Koszt budowy / utrzymania:** niski / średni.

**Moja rekomendacja:** A z progami z `policy.ts` EDU jako wartościami wyjściowymi do skorygowania po pilotażu. C tylko, jeśli W01 potwierdzi uprawnienie istniejącego tokenu i świadomie przyjmiesz wspólny promień rażenia.

**Do sprawdzenia:** W01, W05, W12.

**Finalny wybór wpisz w [karcie D07 executive briefu](decisions.md#d07).**

<a id="d08"></a>

## D08. Utwardzenie istniejącej ścieżki mailowej

**Status:** Nieużywanie `/auth/verify` dla Circle jest ustalone; los ścieżki mailowej otwarty.

**Oparcie:** `architecture-review.md` §1 (ograniczenie „email login stays as-is”), D8 w §10 i §12; `research.md` — „Protocol weaknesses relevant to any new channel”, Open Question 7, zablokowane kontraktem literały i pakiet zgodności wydanego CLI.

### A — obecny plan

`/auth/login`, `/auth/callback` i `/auth/verify` zostają dokładnie takie, jakie są, a kanał Circle nigdy z nich nie korzysta ani nie powiela ich semantyki.

- **Silna strona:** Najmniejsze ryzyko dla wydanego CLI 1.20.0; zablokowane kontraktem literały i kształty odpowiedzi pozostają nietknięte.
- **Słaba strona:** Pobranie tokenów po samym `session_id` i konsumpcja stanu zwykłym GET-em zostają w produkcie jako znany dług.
- **Tradeoff:** Wąski zakres i przewidywalne wydanie w zamian za utrzymanie długu.
- **Koszt budowy / utrzymania:** niski / niski.

### B — najsolidniejsza alternatywa

W tej samej zmianie ścieżka mailowa dostaje sekret do pollingu i potwierdzenie POST-em, dodane addytywnie tak, żeby wydany klient nadal działał (brak konsumpcji na GET, krótkie TTL, jednorazowość).

- **Silna strona:** Oba kanały mają porównywalne wiązanie i odporność na skanery linków; dług znika, gdy i tak pracujemy w tym obszarze.
- **Słaba strona:** Rośnie powierzchnia zgodności ze starym binarium i ryzyko pojedynczego wydania; pakiet testów zgodności wydanego CLI trzeba rozszerzyć o nowe ścieżki.
- **Tradeoff:** Kupujemy spójność bezpieczeństwa ceną szerszego, ryzykowniejszego wydania.
- **Koszt budowy / utrzymania:** średni–wysoki / niski.

### C — najzwinniejsza alternatywa

A plus test graniczny pilnujący, że przepływ Circle nie wywołuje `/auth/verify` ani nie odtwarza jego semantyki, oraz zapisana zmiana następcza na utwardzenie ścieżki mailowej.

- **Silna strona:** Zamyka realne ryzyko pomyłki implementacyjnej („odziedziczymy słabość przez skrót”) przy koszcie jednego testu.
- **Słaba strona:** Nie naprawia maila; wartość zależy od tego, czy zmiana następcza faktycznie zostanie otwarta i zrealizowana.
- **Tradeoff:** Oszczędzamy na zakresie, kupując wyłącznie ochronę przed regresją.
- **Koszt budowy / utrzymania:** niski / niski.

**Moja rekomendacja:** A w wydaniu C: test graniczny plus zapisana zmiana następcza. B tylko, jeśli uznasz słabość ścieżki mailowej za pilniejszą niż ryzyko szerszego wydania.

**Do sprawdzenia:** W06, W13.

**Finalny wybór wpisz w [karcie D08 executive briefu](decisions.md#d08).**

<a id="d09"></a>

## D09. Dowód z żywej wysyłki DM

**Status:** Nic nie zostało zweryfikowane na żywo; moment i zakres próby otwarte. Każda wysyłka wymaga osobnej zgody.

**Oparcie:** `architecture-review.md` §7.4 (forma nagłówka „confirmed during the authorized live verification, not assumed”), §9 („Manual (separately authorized)”) i §12; `research.md` — Open Questions 1–3 i 5, opis Circle Admin API v2 (401, 422, nieudokumentowany nadawca).

### A — obecny plan

Jedna nadzorowana wysyłka do konta pilotażowego przed finalizacją planu, po osobnej, jawnej zgodzie. Cel: potwierdzić uprawnienie tokenu do `POST /api/admin/v2/messages` i formę nagłówka (`Token` czy `Bearer`).

- **Silna strona:** Dwie najdroższe niewiadome znikają, zanim powstaną fazy planu i estymacje; wynik wprost domyka D07.
- **Słaba strona:** Wymaga zgody i dostępności operatora przed rozpoczęciem prac, a odpowiedzi o nadawcę i preferencje czatu przyjdą dopiero później.
- **Tradeoff:** Jedna realna wiadomość w zamian za pewność najważniejszego założenia transportu.
- **Koszt budowy / utrzymania:** niski / niski.

### B — najsolidniejsza alternatywa

Pełna matryca przed planem: uprawnienie, forma nagłówka, tożsamość nadawcy, samowysyłka, preferencje czatu, obie społeczności, a do tego fixture przechwytujący `app.circle.so` w prywatnym CI i przebiegi na Linuksie oraz Windowsie.

- **Silna strona:** Największa pewność przed napisaniem kodu i automatyczne pokrycie ścieżki Circle zamiast dowodu wyłącznie ręcznego.
- **Słaba strona:** Najwięcej czasu operatora i realnych wiadomości do realnych osób; część odpowiedzi (np. zachowanie przy nietypowych ustawieniach kont) i tak pozna się dopiero w pilotażu.
- **Tradeoff:** Kupujemy komplet dowodów ceną opóźnienia planu i zaangażowania operatora.
- **Koszt budowy / utrzymania:** średni / niski.

### C — najzwinniejsza alternatywa

Planujemy na podstawie dokumentacji i zachowania EDU, trzymając transport za wstrzykiwanym `fetch`, a próbę na żywo wykonujemy dopiero w fazie transportu.

- **Silna strona:** Prace ruszają od razu; forma nagłówka i wybór tokenu pozostają jednolinijkową zmianą konfiguracji, bo transport jest izolowany.
- **Słaba strona:** Jeśli okaże się, że żaden dostępny token nie może wysyłać wiadomości, faza transportu cofa się, a D07 trzeba podjąć od nowa — już w trakcie implementacji.
- **Tradeoff:** Oszczędzamy czas operatora, przyjmując ryzyko przerobienia fazy.
- **Koszt budowy / utrzymania:** niski / średni.

**Moja rekomendacja:** A: jedna próba zamyka dwie najdroższe niewiadome. C akceptowalne wyłącznie przy w pełni izolowanym transporcie; B, jeśli chcesz zamknąć przed planem także pytania o nadawcę, samowysyłkę i preferencje czatu.

**Do sprawdzenia:** W01–W03, W08.

**Finalny wybór wpisz w [karcie D09 executive briefu](decisions.md#d09).**

<a id="d10"></a>

## D10. Udział repozytorium EDU i forma ponownego użycia kodu

**Status:** Przy D01-A EDU nie wchodzi do ścieżki logowania CLI; forma ponownego użycia kodu otwarta.

**Oparcie:** `architecture-review.md` §3 (tradeoffs Design A: „EDU's transport, crypto and policy modules port nearly verbatim”), §4, §9 i D10 w §10; `research.md` — moduły `transport.ts`, `policy.ts`, `crypto.ts` w EDU oraz doświadczenie `circle-transition-bridge`.

### A — obecny plan

Przenosimy do Toolkitu moduły transportu, kryptografii i polityki w postaci bliskiej oryginałowi, zachowując nazwy i strukturę, żeby porównanie z EDU pozostało łatwe. W EDU zmienia się co najwyżej wskaźnik w dokumentacji.

- **Silna strona:** Zero wydań EDU, pełna kontrola Toolkitu nad własnym kanałem i czytelna ścieżka porównania z oryginałem podczas przeglądu.
- **Słaba strona:** Powstają dwie kopie reguł; poprawka bezpieczeństwa w jednym produkcie nie trafia automatycznie do drugiego.
- **Tradeoff:** Niezależność wydań kupiona duplikacją i ręczną synchronizacją poprawek.
- **Koszt budowy / utrzymania:** średni / średni.

### B — najsolidniejsza alternatywa

Wspólny, wersjonowany pakiet z transportem i polityką, konsumowany przez EDU i Toolkit.

- **Silna strona:** Jedno źródło klasyfikacji wyników wysyłki i progów; poprawka bezpieczeństwa wchodzi raz i obowiązuje w obu produktach.
- **Słaba strona:** Sprzężenie wydań dwóch repozytoriów, nowy artefakt do publikowania i wersjonowania oraz konieczność wydania EDU przy każdej zmianie kontraktu — przy zaledwie dwóch konsumentach to duży narzut.
- **Tradeoff:** Kupujemy spójność reguł ceną koordynacji wydań między produktami.
- **Koszt budowy / utrzymania:** wysoki / średni.

### C — najzwinniejsza alternatywa

Przenosimy tylko to, co naprawdę niesie regułę: klasyfikację wyników wysyłki oraz liczby TTL i budżetów. Klienta HTTP piszemy w konwencjach Toolkitu, a w komentarzu wskazujemy plik źródłowy i SHA EDU.

- **Silna strona:** Najmniej przeniesionego kodu i brak obcych konwencji w Toolkicie; mniej miejsc, w których dwie kopie mogą się rozjechać.
- **Słaba strona:** Zgodność reguł pilnowana ręcznie; szczegóły transportu (obsługa przekierowań, limity czasu) mogą się z czasem rozejść między produktami.
- **Tradeoff:** Oszczędzamy na przeniesionym kodzie, przyjmując ryzyko drobnych różnic w zachowaniu.
- **Koszt budowy / utrzymania:** niski / średni.

**Moja rekomendacja:** A/C: przenieść reguły, nie budować wspólnego pakietu dla dwóch konsumentów. B rozważyć przy trzecim produkcie albo po pierwszej poprawce bezpieczeństwa, która rozjechała się między repozytoriami.

**Do sprawdzenia:** W05, W08.

**Finalny wybór wpisz w [karcie D10 executive briefu](decisions.md#d10).**

<a id="verification"></a>

## Rzeczy do sprawdzenia — wymagany dowód

To rejestr dowodów do zebrania, nie lista warunków domyślnie spełnionych. Właściciel „operator” oznacza działanie wymagające zgody na realną wysyłkę, dostęp do produkcji lub dane supportu. Właściciel „agent” oznacza dowód z kodu i testów, którego nie trzeba od nikogo uzyskiwać. Żadna pozycja z udziałem operatora nie została wykonana.

| ID | Co sprawdzić i jaki wynik zapisać | Właściciel | Kiedy wynik jest potrzebny |
|---|---|---|---|
| W01 | Czy token Toolkitu może wywołać `POST /api/admin/v2/messages` i jakiej formy nagłówka wymaga (`Token` czy `Bearer`). Zapisać kod i treść odpowiedzi osobno dla `CIRCLE_API_TOKEN` i dla osobnego tokenu v2. Wymaga zgody na realną wysyłkę. | operator | Przed zamknięciem D07 i przed fazą transportu |
| W02 | Kto pojawia się jako nadawca wiadomości i czy DM na adres właściciela tokenu jest odrzucany. Zapisać widok po stronie odbiorcy oraz kod odpowiedzi API. | operator | Przed ustaleniem treści wiadomości i runbooka pilotażu |
| W03 | Czy preferencje czatu Circle (wyłączone wiadomości od członków) blokują DM wysyłany tokenem administracyjnym. Zapisać wynik dla konta z wyłączonymi wiadomościami. | operator | Przed włączeniem kanału dla społeczności |
| W04 | Atomowość wybranego magazynu pod workerd: równoległe zatwierdzenie i odbiór, podwójny odbiór, alarm wygaśnięcia, limit prób kodu, okna budżetów. Zapisać, który zapis przegrywa i co widzi klient. Mock nie jest dowodem. | agent | Przed zamknięciem fazy stanu i decyzji D03 |
| W05 | Klasyfikacja wyników transportu na wstrzykiwanym `fetch`: 4xx (w tym 429) jako odrzucenie, timeout i 5xx jako wynik nieznany, brak ponowienia, brak bearera, adresata i treści w logach. | agent | Przed zamknięciem fazy transportu |
| W06 | Testy tras Toolkitu: sprawdzenie `Origin` dla strony zatwierdzenia, kształt logu i strażnik PII, nowe kody błędów w `ERROR_CODE_MESSAGES` oraz zielony pakiet zgodności wydanego CLI 1.20.0 wobec kandydata API. | agent | Przed wydaniem Toolkitu |
| W07 | Testy CLI: `start` i `poll` ze `slow_down`, wygaśnięcie okna, przerwanie SIGINT, kody wyjścia i koperta JSON, round-trip `AuthData.method` przez konstruktor rotacji refresh, `--check` wygenerowanych typów, budżet startu w smoke. | agent | Przed wydaniem CLI |
| W08 | Czy prywatne skoordynowane CI utrzyma fixture przechwytujący `app.circle.so` obok przechwytywania Resend i wystawi ostatnią wiadomość pod `/__fixture/dm`; przebiegi na Linuksie i Windowsie, w publicznym CI sam receipt. | agent + operator | Przed deklaracją automatycznego pokrycia ścieżki Circle |
| W09 | Macierz uprawnień: v3-only, v4-only, oba, brak, konto po zwrocie; odebranie dostępu między `start` a zatwierdzeniem. Zapisać, że przy odmowie nic nie zostało wydane i że żaden grant nie powstał ani nie wrócił. | agent + operator | Przed włączeniem pilotażu |
| W10 | Czy `toolkit.przeprogramowani.pl` jest custom domain Workera i czy strona zatwierdzenia ma stabilny origin do sprawdzania `Origin` oraz nagłówków `no-store` i `no-referrer`. | operator | Przed budową strony zatwierdzenia |
| W11 | Liczba uczestników CLI, do których nie dociera mail — ze zgłoszeń supportu, osobno od potwierdzenia po stronie EDU. Wynik uzasadnia zakres roll-outu i poziom inwestycji w UX wyboru metody. | operator | Przed decyzją o zakresie roll-outu i przed D06-B |
| W12 | Zachowanie stopniowanego roll-outu: `AUTH_CIRCLE_LOGIN` w stanach `disabled`, `pilot`, `enabled` przy logowaniu w locie, wycofanie samą flagą, niedostępny magazyn stanu zamyka wyłącznie kanał Circle, a ścieżka mailowa działa dalej. Zapisać też, co zostaje po wyłączeniu (namespace i dane). | agent + operator | Przed pierwszym wdrożeniem i przed włączeniem pilotażu |
| W13 | Test graniczny: przepływ Circle nigdy nie wywołuje `/auth/verify` ani nie odtwarza jego semantyki. Zapisać też decyzję, czy utwardzenie ścieżki mailowej wchodzi tutaj, czy jako zmiana następcza. | agent | Przed zamknięciem D08 |

### Miejsce na wyniki weryfikacji

Kopiuj wiersz dla kolejnych wyników. Brak wpisu nie oznacza zaliczenia.

| ID W… | Wynik i odnośnik do dowodu | Data / osoba | Wpływ na decyzję D… |
|---|---|---|---|
| … | … | … | … |

## Zależności między wyborami

- **D01 + D03 + D10:** własność kanału rozstrzyga, gdzie żyje stan jednorazowy i czyj token wysyła wiadomość. Wybór D01-B pociąga D03-B (Postgres EDU) i praktycznie wymusza pełny most w D10; wybór D01-A zamyka tamte warianty i zostawia tylko pytanie o formę przeniesienia kodu.
- **D04 + D05:** moment sprawdzenia uprawnienia przesądza, co może powiedzieć odpowiedź `start`. Wczesna jawna odmowa i neutralna odpowiedź wykluczają się; D04-C ma sens wyłącznie razem z D05-B.
- **D03 + D07:** budżety muszą żyć tam, gdzie stan logowania — inaczej licznik i stan mogą się rozjechać przy równoległych żądaniach. Zmiana magazynu zmienia implementację limitów.
- **D07 + D09:** własności tokenu nie da się rozstrzygnąć bez dowodu na żywo. Negatywny wynik W01 eliminuje D07-C i przesuwa harmonogram fazy transportu.
- **D02 + D06:** siła wiązania decyduje o tym, co CLI musi wyświetlić i o czym mówi kopia komunikatów. Porównywanie kodu zamiast przepisywania zmienia zarówno stronę zatwierdzenia, jak i teksty w terminalu.
- **D02-B:** loopback z PKCE dokłada w CLI nasłuch HTTP i drugi protokół; to osobny zakres wydania, nie wariant do wybrania mimochodem przy tej zmianie.
- **D08-B:** utwardzenie ścieżki mailowej w tej samej zmianie rozszerza pakiet zgodności wydanego CLI i zmienia profil ryzyka wydania, niezależnie od wyborów w pozostałych kartach.

## Weryfikacja zewnętrznych założeń na dzień 2026-09-13

Specyfikacja Circle Admin API v2 opisuje `POST /api/admin/v2/messages` jako jedyną ścieżkę wysyłki, z adresatem w polu `user_email`; schemat bezpieczeństwa podaje `Token AUTH_TOKEN`, a quick start pokazuje `Bearer`. EDU używa formy `Token` skutecznie. To nie dowodzi, że którykolwiek token Toolkitu ma uprawnienie do wysyłki — W01 pozostaje otwarte. [Circle Admin API v2](https://api-headless.circle.so/api/admin/v2/swagger.yaml).

RFC 8628 rozdziela sekretny `device_code`, którego nie należy wyświetlać, od krótkiego `user_code`, którym operuje człowiek, i w §5.4 opisuje zdalny phishing: atakujący startuje przepływ i podsyła ofierze link zatwierdzający. Dlatego D02 traktuje sam link jako niewystarczający. [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628).

Dokumentacja Cloudflare opisuje Durable Objects jako pojedyncze instancje z transakcyjnym magazynem, a Workers KV wprost jako magazyn nieodpowiedni do operacji atomowych. To uzasadnia odrzucenie KV w D03, ale nie zastępuje dowodu z W04 dla wybranego wariantu. [Durable Objects](https://developers.cloudflare.com/durable-objects/) · [Jak działa Workers KV](https://developers.cloudflare.com/kv/concepts/how-kv-works/).

W tym kroku nie wykonano żadnej wysyłki, wdrożenia ani pomiaru na produkcji. Odnośniki do dokumentacji nie zastępują wyników W01–W13.

## Uzgodnienie dokumentów po wyborze

Finalne wybory i dyspozycję zapisujemy w [executive briefie](decisions.md). Dopiero po nich powstaje `plan.md` z fazami, kryteriami akceptacji i sekcją Progress, a `change.md` przestaje być w stanie `preparing`. Kontrakty do rejestracji po akceptacji (cztery trasy `/auth/circle/*` z kodami błędów, pole `AuthData.method`, enum stanów magazynu, nazwy flag) wskazuje `architecture-review.md` §11. Ten załącznik nie tworzy drugiej listy wykonania i niczego nie autoryzuje.
