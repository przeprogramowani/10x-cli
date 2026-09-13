# Logowanie do 10x-cli wiadomością Circle — executive brief do decyzji

Data: 2026-09-13 · Zakres: `10x-cli` i `10x-toolkit` (udział `przeprogramowani-edu` jest jedną z decyzji) · Etap: po przeglądzie architektury, przed planem.

[Przegląd architektury](architecture-review.md) · [Research](research.md) · [Framing](frame.md) · [Szczegółowe warianty i rejestr weryfikacji](decisions-details.md)

`plan.md` jeszcze nie istnieje i powstanie dopiero po tych decyzjach. Dlatego wariant „A — obecny” oznacza rekomendację z przeglądu architektury, a nie zapisany plan. Nic w tym dokumencie nie jest zatwierdzone: żadna wiadomość Circle nie została wysłana, żadne wdrożenie ani wydanie nie zostało wykonane.

## Cel i sytuacja

Chcemy, żeby uczestnik, do którego nie dociera magic link na maila, mógł udowodnić przez konto Circle, które już posiada, że *ten* terminal może otrzymać kredencjały CLI Toolkitu — bez tworzenia i bez przywracania jakiegokolwiek dostępu do kursu.

Problem z doręczaniem maili potwierdził operator po stronie EDU; tam odpowiedzią był link wysyłany prywatną wiadomością Circle. Badanie trzech repozytoriów pokazało, że tej ścieżki nie da się po prostu przenieść: EDU wystawia ciasteczko przeglądarki, a nie parę JWT plus refresh, i nie ma żadnego kanału zaufania z Toolkitem. Circle nie jest dostawcą tożsamości; DM jest kanałem dostarczenia, nie podpisaną asercją.

Druga rzecz, której framing nie zakładał wprost: dzisiejsze logowanie mailem wiąże zatwierdzenie z terminalem bardzo słabo — pobranie tokenów autoryzuje sam `session_id`, a link z maila niesie oba identyfikatory. Nowy kanał nie może tego odziedziczyć, więc przepływ potrzebuje własnego wiązania z terminalem, który poprosił o logowanie.

Trzecia rzecz jest operacyjna: Toolkit nie ma dziś ani transportu wiadomości, ani magazynu atomowego. Bindingi to trzy przestrzenie KV i jeden bucket R2, a KV jest udokumentowane jako nieodpowiednie do stanu jednorazowego. Największy koszt tej zmiany nie leży w samej wysyłce DM, tylko w pierwszym transakcyjnym magazynie stanu po stronie Toolkitu i w tym, czyje są token, limity i flaga roll-outu.

## Co jest już ustalone

- **Logowanie mailem bez zmian:** wydane CLI 1.20.0 działa dalej, literał `check_your_inbox`, kształty `/auth/verify` i semantyka refresh pozostają nietknięte.
- **Kredencjał:** istniejący JWT HS256 Toolkitu plus refresh z rotacją rodziny. `/api/me/courses`, odblokowania modułów i jawny wybór edycji projektu bez zmian.
- **Dowód Circle nie nadaje uprawnień:** nigdy nie tworzy ani nie przywraca grantu; uprawnienie czytamy na żywo z `CLI_10X3_MEMBERSHIP_KV`.
- **Sekrety Circle tylko po stronie serwera:** w logach nie ma bearera, adresata ani treści wiadomości.
- **Klasyfikacja wysyłki jak w EDU:** 4xx to odrzucenie, timeout i 5xx to wynik nieznany; nigdy automatycznej ponownej wysyłki ani cichego przełączenia na e-mail.
- **Stan jednorazowy wymaga dowodu atomowości:** `get` plus `delete` na KV takim dowodem nie jest.
- **Odrzucone na wejściu:** ciasteczko EDU jako kredencjał CLI, sam identyfikator żądania jako uprawnienie, dowolne callback URL.

## Najważniejsze wybory na teraz

| Wybór | Dlaczego ma znaczenie | Rekomendacja |
|---|---|---|
| [D01 — własność kanału](#d01) | Decyduje, ile repozytoriów zmieniamy i czy awaria EDU albo Supabase blokuje logowanie CLI. | Toolkit właścicielem; EDU wyłącznie jako kod do przeniesienia. |
| [D02 — wiązanie z terminalem](#d02) | To jedyna właściwość, która odróżnia ten przepływ od kliknięcia w link z maila. | Przepisywany `user_code` plus bearer z fragmentu linku. |
| [D03 — magazyn stanu](#d03) | Pierwszy transakcyjny magazyn w Toolkicie to realny zakres operacyjny, nie detal. | Durable Object per logowanie; KV odpada z definicji. |
| [D07 — token, limity i flaga](#d07) | Ustala promień rażenia sekretu Circle i to, czym wyłączamy kanał bez wdrożenia. | Osobny token do wysyłki, budżety przy stanie logowania, flaga tri-state. |
| [D09 — próba na żywo](#d09) | Bez niej cała faza transportu stoi na niesprawdzonym założeniu o uprawnieniach tokenu. | Jedna nadzorowana wysyłka, po osobnej zgodzie, przed finalizacją planu. |

Rekomendacje są wyborem proporcji między gwarancjami, kosztem i zakresem. Nie są estymacją czasu ani zgodą na wysyłkę wiadomości, wdrożenie czy wydanie.

## Jak korzystać z kart

Każda karta zaczyna się od opisu sytuacji i tego, co się stanie, jeśli nikt tej decyzji nie podejmie. Dalej jest status (co jest już ustalone, a co otwarte) i trzy warianty: **A — obecny** (rekomendacja z przeglądu architektury), **B — najsolidniejszy** (najwięcej gwarancji), **C — najzwinniejszy** (najoszczędniejsza realizacja tego samego zachowania). Kolumna „koszt / kompromis” mówi, z czego rezygnujemy w zamian za korzyść.

Wariant B nie jest automatycznie lepszy na dziś, a C nie jest rezygnacją z bezpieczeństwa. Twarde ustalenia z sekcji „Co jest już ustalone” obowiązują we wszystkich trzech wariantach i żaden z nich ich nie łagodzi. Tam, gdzie przegląd wymieniał więcej opcji niż trzy (na przykład sam link w DM albo loopback z PKCE przy wiązaniu terminala), odrzucone możliwości opisano w kontekście karty lub w słabej stronie wariantu w [załączniku](decisions-details.md).

<a id="d01"></a>

## D01. Kto jest właścicielem logowania przez Circle

Dowód tożsamości może należeć do Toolkitu, który i tak wydaje JWT i refresh, albo do EDU, które ma już działającą wysyłkę DM, atomowe RPC w Postgresie, budżety, flagi i mechanizm pilotażu. Wybór przesądza o liczbie zmienianych repozytoriów, o tym, czy powstaje nowy kontrakt zaufania między usługami, i o tym, co dzieje się z logowaniem CLI, gdy EDU albo Supabase są niedostępne. Bez tej decyzji nie wiadomo, gdzie żyje stan logowania ani czyim tokenem wychodzi wiadomość.

**Status:** Ustalone: kredencjałem pozostaje para JWT plus refresh z Toolkitu, a dowód Circle nie nadaje uprawnień. Otwarte: kto prowadzi kanał.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Toolkit dostaje własne trasy `/auth/circle/*`, własny stan logowania i własny token Circle; EDU bez zmian. | Jedna władza uwierzytelniania, brak nowego zaufania między usługami, dwa repozytoria zamiast trzech. | Toolkit buduje transport DM, magazyn atomowy i stronę zatwierdzenia od zera. |
| B — najsolidniejszy | EDU pozostaje dowodem tożsamości i po swoim potwierdzeniu przekazuje podpisaną asercję do nowego endpointu Toolkitu. | Ponowne użycie sprawdzonych RPC z blokadami wierszy, budżetów, flag i pilotażu; jeden zestaw tokenów Circle. | Nowy kontrakt zaufania i klucz do rotacji; awaria EDU lub Supabase blokuje logowanie CLI; trzy skoordynowane wdrożenia. |
| C — najzwinniejszy | Toolkit właścicielem, ale bez warstw na zapas: jeden moduł kanału, stałe przeniesione z EDU, bez wspólnego pakietu i bez abstrakcji na przyszłych dostawców. | Najmniej nowego kodu przy tej samej granicy zaufania co A. | Kolejny kanał albo drugi produkt wymusi refaktor; reguły dublują się względem EDU. |

**Rekomendacja:** A w realizacji w duchu C: Toolkit jako właściciel, bez budowania platformy dostawców tożsamości. B tylko wtedy, gdy świadomie przyjmujesz EDU i Supabase w ścieżce logowania CLI.

**Do sprawdzenia:** W01, W04. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d01).

**Twoja finalna decyzja:** A (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=A; basis=7d72cacf4376; version=1; updated=2026-09-13T08:56:52.624Z -->

<a id="d02"></a>

## D02. Czym wiążemy zatwierdzenie z terminalem, który o nie poprosił

Link w DM dowodzi tylko tego, że ktoś odebrał wiadomość na koncie Circle. Sam link nie mówi, że osoba zatwierdzająca patrzy na terminal, który poprosił o logowanie — to dokładnie przypadek zdalnego phishingu z RFC 8628 §5.4, dlatego wariant „sam link w DM” został odrzucony już w przeglądzie. Zostaje pytanie, jak mocno wiążemy zatwierdzenie z terminalem i ile kroków dokładamy człowiekowi.

**Status:** Ustalone: sam link nie wystarcza, a `device_code` nigdy nie opuszcza kanału terminal–API. Otwarte: forma drugiego dowodu.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Strona zatwierdzenia prosi o przepisanie krótkiego `user_code` z terminala; bearer z fragmentu linku dowodzi odbioru DM. | Dwa niezależne dowody: odbiór wiadomości i obecność przy terminalu; działa z telefonu, przez SSH i w devcontainerze. | Jeden krok więcej niż automatyczne potwierdzenie w EDU; trzeba obsłużyć limit prób i pomyłki. |
| B — najsolidniejszy | Do A dochodzi tryb przeglądarkowy z loopbackiem i PKCE tam, gdzie przeglądarka jest na tej samej maszynie; kod pozostaje ścieżką uniwersalną. | Najmocniejsze możliwe wiązanie w scenariuszu lokalnym i gotowe miejsce na wybór metody oraz przyszłych dostawców. | Dwa protokoły do utrzymania, nasłuch `node:http` w CLI i większa powierzchnia ataku w scenariuszu, którego ta zmiana nie dotyczy. |
| C — najzwinniejszy | Strona pokazuje kod, a człowiek tylko porównuje go z terminalem i zatwierdza (wariant A1 z przeglądu). | Najmniej kroków dla użytkownika i najprostsza strona przy tej samej liczbie endpointów. | Pośpieszne porównanie przepuszcza żądanie atakującego; słabsze wiązanie w funkcji, której celem jest odzyskanie dostępu. |

**Rekomendacja:** A. C dopiero wtedy, gdy pilotaż pokaże, że przepisywanie kodu jest realną barierą; B jako osobna, późniejsza zmiana, nie warunek wydania.

**Do sprawdzenia:** W07, W10. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d02).

**Twoja finalna decyzja:** własny: Idźmy w sam link, nie musimy się przesadnie zabezpieczać, circle jest trudno dostępne, najwyżej to wzmocnimy w przyszłosci (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=custom; basis=d4241c0f2faa; version=1; updated=2026-09-13T08:56:52.629Z -->

<a id="d03"></a>

## D03. Gdzie trzymamy stan jednorazowy logowania

Wysyłka, zatwierdzenie i odbiór tokenów muszą zajść dokładnie raz, także przy równoległych żądaniach. Toolkit ma dziś wyłącznie KV bez compare-and-swap, a KV jest wprost udokumentowane jako nieodpowiednie do stanu jednorazowego, więc „zostajemy na KV” nie jest wariantem. To najdroższa operacyjnie część zmiany: Toolkit dostaje pierwszy magazyn transakcyjny w historii tego Workera.

**Status:** Ustalone: potrzebny jest dowód atomowości, nie `get` plus `delete`. Otwarte: który magazyn.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Durable Object per logowanie ze SQLite, drugi DO na budżety, binding i migracja w `wrangler.toml`. | Pojedyncza instancja i transakcyjny zapis; `alarm()` sam wygasza i czyści stan. | Pierwszy DO w Toolkicie: nowy binding, migracja klas i harness testowy pod workerd. |
| B — najsolidniejszy | Stan logowania w Postgresie EDU, przez RPC z blokadami wierszy, których współbieżność jest już udowodniona testami SQL i skryptem weryfikacyjnym. | Najmocniejszy dowód atomowości dostępny dziś w organizacji, razem z gotowymi budżetami i GC. | Wymusza D01-B: EDU i Supabase wchodzą do ścieżki logowania CLI, a Toolkit i tak potrzebuje własnego stanu urządzenia. |
| C — najzwinniejszy | D1 z warunkowym `UPDATE … WHERE state = ?` i liczbą zmienionych wierszy jako testem przejścia. | Zwykły SQL i prostsze testy niż klasa DO, bez migracji klas i nowego modelu współbieżności. | D1 daje transakcje tylko na poziomie batcha, więc każde przejście musi być jednym warunkowym zapisem; łatwo o cichy błąd przy dwóch zapisach naraz. |

**Rekomendacja:** A: Durable Object jest w Workerze najbliższym odpowiednikiem blokad wierszy. C rozważyć tylko, jeśli W04 pokaże, że koszt harnessu DO jest nieproporcjonalny do zysku.

**Do sprawdzenia:** W04, W12. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d03).

**Twoja finalna decyzja:** B (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=B; basis=9255ebb007de; version=1; updated=2026-09-13T08:56:52.632Z -->

<a id="d04"></a>

## D04. Czy logowanie przez Circle wymaga aktywnego kursu

Logowanie mailem odmawia dziś osobie bez żadnego aktywnego kursu i przelicza `courses` z KV przy callbacku oraz przy refreshu. Kanał Circle może zachować tę semantykę albo wpuszczać samą tożsamość z pustą listą kursów, jak zakładał wycofany plan brokera. Decyzja przesądza, co dokładnie znaczy odpowiedź `200` z `/auth/circle/start` i w ilu miejscach czytamy `CLI_10X3_MEMBERSHIP_KV`.

**Status:** Ustalone: dowód Circle nigdy nie tworzy ani nie przywraca grantu, a uprawnienie czytamy na żywo. Otwarte: ile razy i w którym momencie.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Wymagamy co najmniej jednego aktywnego kursu przy `start` i czytamy KV ponownie przy zatwierdzeniu oraz przy wydaniu tokenu. | Ta sama reguła co w logowaniu mailem; odebranie dostępu w trakcie kończy się odmową bez wydania kredencjału. | Dwa lub trzy odczyty KV na logowanie i konieczność zgrania z kształtem odpowiedzi `start` z D05. |
| B — najsolidniejszy | Sprawdzenie przy każdym przejściu (start, wysyłka, zatwierdzenie, wydanie), z kodami powodów w logu i zamknięciem kanału, gdy odczyt KV się nie powiedzie. | Najwęższe okno między sprawdzeniem a wydaniem tokenu i pełna diagnostyka odmowy dla supportu. | Więcej odczytów i ścieżek błędu; niedostępne KV zamyka logowanie także tam, gdzie dziś by przeszło. |
| C — najzwinniejszy | Jedno sprawdzenie w chwili wydania tokenu; `start` pozostaje neutralny i nie ujawnia członkostwa. | Najmniej odczytów i naturalna spójność z neutralną odpowiedzią z D05. | Osoba bez dostępu przechodzi całą ścieżkę i dowiaduje się o odmowie na końcu, zużywając budżet wysyłki. |

**Rekomendacja:** A. C tylko razem z D05-B, jeśli wybierzesz neutralną odpowiedź; B, gdy pojawi się wymóg audytowy.

**Do sprawdzenia:** W09. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d04).

**Twoja finalna decyzja:** A (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** Dla CLI wymagamy dostępu do 10xdevs-3 i/lub 10xdevs-4

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=A; basis=b731c42f5c84; version=1; updated=2026-09-13T08:56:52.642Z -->

<a id="d05"></a>

## D05. Co odpowiadamy osobie spoza kursu

`POST /auth/circle/start` może odpowiedzieć jawnym `403 no_access`, jak dzisiejsze logowanie mailem, albo neutralnym `200`, jak EDU, żeby nie potwierdzać członkostwa w społeczności. Logowanie mailem jest dziś enumerowalne, więc neutralność w jednym kanale nie zamyka enumeracji w całym produkcie. To wybór między czytelnością dla użytkownika i supportu a zamknięciem kanału wycieku informacji o członkostwie.

**Status:** Ustalone: kontrakt `start` jest nowy, więc obie odpowiedzi są dopuszczalne bez łamania zgodności wydanego CLI. Otwarte: która.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Jawny `403 no_access` przy `start`, z kodem błędu i podpowiedzią w CLI. | Spójność z logowaniem mailem i jednoznaczna diagnoza dla użytkownika oraz supportu. | Kanał potwierdza członkostwo; enumeracja pozostaje możliwa, dokładnie tak jak dziś na mailu. |
| B — najsolidniejszy | Neutralne `200` z `delivery: "unknown"` dla wszystkich, wspólny deadline odpowiedzi i budżety naliczane także osobom spoza kursu. | Brak różnicy w treści i w czasie odpowiedzi; najbliżej postawy EDU wobec enumeracji. | Osoba bez dostępu czeka pełne okno bez wyjaśnienia; dochodzi kod utrzymujący stały czas odpowiedzi i trudniejsze zgłoszenia. |
| C — najzwinniejszy | Neutralny kształt odpowiedzi bez wyrównywania czasu: ta sama treść dla członka i nie-członka, bez dodatkowego deadline'u. | Zamyka najprostszą enumerację po treści odpowiedzi prawie bez nowego kodu. | Kanał boczny w czasie odpowiedzi zostaje; połowa gwarancji B przy pełnym koszcie wsparcia. |

**Rekomendacja:** A dla spójności z istniejącym logowaniem. B, jeśli uznasz enumerację członkostwa za problem produktowy — wtedy razem z D04-C.

**Do sprawdzenia:** W06, W09. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d05).

**Twoja finalna decyzja:** A (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=A; basis=eae0e0d8726b; version=1; updated=2026-09-13T08:56:52.646Z -->

<a id="d06"></a>

## D06. Jak użytkownik wybiera metodę logowania

Dziś `10x auth` ma jedną ścieżkę, a w trybie nie-TTY nigdy nie pyta i wymaga `--email`. Nowa metoda musi być odkrywalna dla osoby, do której nie dochodzi mail, i jednocześnie niewidoczna dla skryptów i CI. Bez tej decyzji nie wiadomo, co CLI robi, gdy nikt nie poda flagi, ani jak wygląda podpowiedź po nieudanej próbie mailowej.

**Status:** Ustalone: domyślną metodą jest e-mail, a tryb nie-TTY oraz JSON nigdy nie pytają i wymagają jawnych flag. Otwarte: czy istnieje wybór interaktywny.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Flaga `--method` z wartościami `email` i `circle` plus wybór `@clack/prompts` w TTY, gdy flagi nie podano. | Odkrywalność w terminalu bez zmiany zachowania skryptów i potoków. | Nowy krok interaktywny do pokrycia testami w obu trybach i dodatkowe teksty do utrzymania. |
| B — najsolidniejszy | A plus jawna propozycja kanału Circle po nieudanej lub wygasłej próbie mailowej, zawsze za potwierdzeniem, nigdy automatycznie. | Trafia w moment, w którym problem faktycznie się ujawnia, i nie zmienia kanału po cichu. | Najwięcej przypadków do pokrycia (kody wyjścia, koperta JSON, anulowanie) i najwięcej kopii do utrzymania. |
| C — najzwinniejszy | Sama flaga `--method circle`, bez wyboru interaktywnego; podpowiedź w treści błędu i w dokumentacji. | Najmniejsza zmiana w CLI i identyczne zachowanie w TTY oraz poza nim. | Odkrywalność zależy od dokumentacji i podpowiedzi; część osób metody nie znajdzie. |

**Rekomendacja:** A; C jako pierwszy etap, jeśli zależy Ci na najmniejszym wydaniu CLI. B dopiero po pilotażu, gdy W11 pokaże skalę problemu.

**Do sprawdzenia:** W07, W11. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d06).

**Twoja finalna decyzja:** A (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=A; basis=7f15f507f828; version=1; updated=2026-09-13T08:56:52.648Z -->

<a id="d07"></a>

## D07. Czyje są limity, flaga roll-outu i token Circle

Wysyłka DM wymaga tokenu Circle v2, a kanał wymaga budżetów i przełącznika roll-outu. EDU trzyma osobne tokeny per społeczność, własne budżety w Postgresie i flagi w bazie; Toolkit ma jeden token administracyjny do rosteru, którego uprawnienie do wysyłki wiadomości jest niezweryfikowane. Decyzja ustala promień rażenia sekretu i to, kto co rotuje oraz czym wyłącza kanał bez wdrożenia.

**Status:** Ustalone: sekrety Circle zostają po stronie serwera, a budżety mają żyć tam, gdzie stan logowania. Otwarte: ile tokenów i jak szczegółowe limity.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Osobny sekret do wysyłki (`CIRCLE_BRAVE_V2_TOKEN`), budżety w magazynie logowania, tri-state `AUTH_CIRCLE_LOGIN` i hashe pilotażowe. | Odseparowany promień rażenia i wyłączenie kanału bez wdrożenia. | Kolejny sekret do provisioningu i rotacji plus zależność od wyniku W01. |
| B — najsolidniejszy | Token per społeczność, pełny zestaw okien budżetowych z EDU (kwadrans, godzina, doba, miesiąc; konto, społeczność, IP) i flaga czytana przy każdym żądaniu, z runbookiem rotacji. | Najprecyzyjniejsza kontrola nadużyć i możliwość wyłączenia pojedynczej społeczności. | Dużo ruchomych części i liczby przeniesione z innego produktu, zanim poznamy własny ruch. |
| C — najzwinniejszy | Ponowne użycie `CIRCLE_API_TOKEN`, jeden zgrubny budżet per hash adresu w konwencji obecnych liczników i binarna flaga włącz/wyłącz. | Zero nowych sekretów i najmniej konfiguracji na starcie kanału. | Wspólny token do rosteru i wysyłki to większy promień rażenia; zgrubny limit słabiej chroni pojedyncze konto; wariant zależy w całości od W01. |

**Rekomendacja:** A, z progami z `policy.ts` EDU jako wartościami wyjściowymi do skorygowania po pilotażu. C tylko, jeśli W01 potwierdzi uprawnienie istniejącego tokenu i świadomie przyjmiesz wspólny promień rażenia.

**Do sprawdzenia:** W01, W05, W12. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d07).

**Twoja finalna decyzja:** B (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=B; basis=7e1bd1df6765; version=1; updated=2026-09-13T08:56:52.636Z -->

<a id="d08"></a>

## D08. Czy przy okazji utwardzamy logowanie mailem

Dzisiejsza ścieżka mailowa ma dwie znane słabości: `GET /auth/verify` autoryzuje sam `session_id`, a link z maila niesie oba identyfikatory i konsumuje stan zwykłym GET-em. Kanał Circle tego nie odziedziczy, ale osobnym pytaniem jest, czy naprawiamy ścieżkę mailową w tej samej zmianie. To wybór między zakresem i ryzykiem wydania a naprawą długu, gdy i tak pracujemy w tym obszarze.

**Status:** Ustalone: kanał Circle nie używa `/auth/verify` ani jego semantyki. Otwarte: los istniejącej ścieżki mailowej.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Zostawiamy `/auth/login`, `/auth/callback` i `/auth/verify` bez zmian i nigdy nie używamy ich dla Circle. | Najmniejsze ryzyko dla wydanego CLI 1.20.0 i dla zablokowanych kontraktem literałów. | Znane słabości maila zostają; dług wraca jako osobna zmiana. |
| B — najsolidniejszy | W tej samej zmianie dokładamy do ścieżki mailowej sekret do pollingu i potwierdzenie POST-em, addytywnie i zgodnie z wydanym klientem. | Obie ścieżki mają to samo wiązanie i odporność na skanery linków. | Rośnie powierzchnia zgodności ze starym binarium i ryzyko jednego wydania; pakiet testów zgodności trzeba rozszerzyć. |
| C — najzwinniejszy | A plus test graniczny pilnujący, że przepływ Circle nigdy nie dotyka `/auth/verify`, i zapisana zmiana następcza na utwardzenie maila. | Zamyka realne ryzyko pomyłki implementacyjnej niemal bez kosztu. | Nadal nie naprawia maila; wartość zależy od tego, czy zmiana następcza faktycznie powstanie. |

**Rekomendacja:** A w wydaniu C: test graniczny plus zapisana zmiana następcza. B tylko, jeśli uznasz słabość ścieżki mailowej za pilniejszą niż ryzyko szerszego wydania.

**Do sprawdzenia:** W06, W13. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d08).

**Twoja finalna decyzja:** A (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=A; basis=053482bc9dba; version=1; updated=2026-09-13T08:56:52.652Z -->

<a id="d09"></a>

## D09. Kiedy sprawdzamy transport na żywo

Nie wiemy, czy którykolwiek token Toolkitu może wysłać DM, jakiej formy nagłówka wymaga (`Token` czy `Bearer`), kto pojawi się jako nadawca i czy wiadomość do adresu właściciela tokenu jest odrzucana. Błędne założenie unieważnia całą fazę transportu i może zmienić D07. Każda próba na żywo wymaga osobnej zgody, bo wysyła realną wiadomość do realnej osoby.

**Status:** Ustalone: przegląd niczego tu nie potwierdził i żadna wiadomość nie została wysłana. Otwarte: moment i zakres próby.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Jedna nadzorowana wysyłka do konta pilotażowego przed finalizacją planu, po osobnej zgodzie. | Dwie najdroższe niewiadome (uprawnienie i forma nagłówka) znikają, zanim powstanie plan i estymacja. | Wymaga zgody i dostępności operatora przed rozpoczęciem prac. |
| B — najsolidniejszy | Pełna matryca przed planem: uprawnienie, nagłówek, nadawca, samowysyłka, preferencje czatu, obie społeczności, plus fixture DM w prywatnym CI i przebiegi na Linuksie oraz Windowsie. | Największa pewność przed napisaniem kodu i automatyczne pokrycie zamiast dowodu wyłącznie ręcznego. | Najwięcej czasu operatora i realnych wiadomości; część odpowiedzi i tak przyjdzie dopiero z pilotażu. |
| C — najzwinniejszy | Planujemy na podstawie dokumentacji, trzymając transport za wstrzykiwanym `fetch`, a próbę na żywo robimy dopiero w fazie transportu. | Prace ruszają od razu, a forma nagłówka i token pozostają jednolinijkową zmianą konfiguracji. | Brak uprawnienia odkryty w trakcie implementacji cofa fazę transportu i może zmienić D07. |

**Rekomendacja:** A: jedna próba zamyka dwie najdroższe niewiadome. C akceptowalne wyłącznie przy w pełni izolowanym transporcie; B, jeśli chcesz zamknąć przed planem także pytania o nadawcę i preferencje czatu.

**Do sprawdzenia:** W01–W03, W08. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d09).

**Twoja finalna decyzja:** A (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=A; basis=dc36fcb604e0; version=1; updated=2026-09-13T08:56:52.639Z -->

<a id="d10"></a>

## D10. Ile z EDU przenosimy i czy EDU w ogóle się zmienia

EDU ma działający transport DM, klasyfikację wyników wysyłki, stałe polityki i mechanizm pilotażu. Możemy je skopiować, wyciągnąć do wspólnego pakietu albo uzależnić się od EDU w czasie działania — to ostatnie jest tożsame z D01-B i nie wraca tu jako osobna opcja. Decyzja dotyczy tego, czy powstaje wspólny kod i czy EDU wymaga własnego wydania.

**Status:** Ustalone: przy D01-A EDU nie wchodzi do ścieżki logowania CLI. Otwarte: forma ponownego użycia kodu.

| Wariant | Podejście | Główna korzyść | Koszt / kompromis |
|---|---|---|---|
| A — obecny | Port modułów transportu, kryptografii i polityki do Toolkitu; w EDU tylko wskaźnik w dokumentacji. | Zero wydań EDU i pełna kontrola Toolkitu nad własnym kanałem. | Dwie kopie reguł; poprawka w jednym produkcie nie trafia automatycznie do drugiego. |
| B — najsolidniejszy | Wspólny, wersjonowany pakiet z transportem i polityką, używany przez oba produkty. | Jedno źródło klasyfikacji wyników i progów; poprawka bezpieczeństwa wchodzi raz. | Sprzężenie wydań dwóch repozytoriów i nowy artefakt do publikowania przy zaledwie dwóch konsumentach. |
| C — najzwinniejszy | Przenosimy tylko regułę klasyfikacji wyników oraz liczby TTL i budżetów, a klienta HTTP piszemy w konwencjach Toolkitu; EDU bez zmian, z komentarzem wskazującym źródło i SHA. | Najmniej przeniesionego kodu i brak obcych konwencji w Toolkicie. | Ręczne pilnowanie zgodności reguł; szczegóły transportu mogą się z czasem rozjechać. |

**Rekomendacja:** A/C: przenieść reguły, nie budować wspólnego pakietu dla dwóch konsumentów. B rozważyć przy trzecim produkcie albo po pierwszej rozjechanej poprawce bezpieczeństwa.

**Do sprawdzenia:** W05, W08. [Szczegóły i uzasadnienie wariantów](decisions-details.md#d10).

**Twoja finalna decyzja:** A (zaakceptowano)

**Uzasadnienie, akceptowane ograniczenia i warunki:** …

**Data / osoba:** 2026-09-13 / Marcin Czarkowski
<!-- decision-room: status=accepted; variant=A; basis=a812a97224ff; version=1; updated=2026-09-13T08:56:52.655Z -->

## Co trzeba sprawdzić przed realizacją i wydaniem

Nie wszystkie niewiadome wymagają Twojej decyzji. Część to dowody z kodu i testów, które zbierze zespół; część wymaga zgody na realną wysyłkę lub dostęp do produkcji. Pełny rejestr W01–W13, z oczekiwanym wynikiem, właścicielem i momentem, jest w [załączniku](decisions-details.md#verification).

| Obszar | Co pozostaje niewiadome | Kiedy potrzebujemy odpowiedzi |
|---|---|---|
| Token Circle | Czy token Toolkitu może wysłać DM i jakiej formy nagłówka wymaga. | Przed zamknięciem D07 i przed fazą transportu. |
| Zachowanie Circle | Tożsamość nadawcy, samowysyłka, preferencje czatu blokujące wiadomości. | Przed treścią wiadomości, runbookiem i włączeniem kanału. |
| Magazyn stanu | Dowód atomowości wybranego magazynu przy równoległych zatwierdzeniu i odbiorze. | Przed zamknięciem fazy stanu i decyzji D03. |
| Dowody E2E | Czy prywatne CI utrzyma fixture DM zamiast dowodu wyłącznie ręcznego. | Przed deklaracją automatycznego pokrycia ścieżki Circle. |
| Uprawnienia | Macierz v3-only, v4-only, oba, brak i konto po zwrocie; odebranie dostępu w trakcie logowania. | Przed włączeniem pilotażu. |
| Strona zatwierdzenia | Czy `toolkit.przeprogramowani.pl` jest custom domain Workera i daje stabilny origin. | Przed budową strony zatwierdzenia. |
| Skala problemu | Liczba uczestników CLI, do których nie dociera mail. | Przed decyzją o zakresie roll-outu i o UX wyboru metody. |

## Koszty i ograniczenia, które warto zaakceptować świadomie

- Kanał Circle dokłada trzecią zależność w ścieżce logowania. Awaria Circle wyłącza tylko ten kanał; logowanie mailem działa dalej, a flaga pozwala zamknąć kanał bez wdrożenia.
- Niejednoznaczna wysyłka pozostaje niejednoznaczna: przy timeoucie lub 5xx CLI czeka pełne okno, a decyzję o kolejnym kroku podejmuje człowiek. Nie ma automatycznego ponowienia ani cichego przejścia na e-mail.
- Pierwszy transakcyjny magazyn w Toolkicie to realny zakres operacyjny — nowy binding, migracja i harness testowy — niezależnie od wybranego wariantu D03.
- Przepisanie kodu z terminala to jeden krok więcej niż automatyczne potwierdzenie w EDU. To cena wiązania zatwierdzenia z terminalem, nie niedoróbka UX.
- Osobny token do wysyłki oznacza kolejny sekret do rotacji; wspólny token oznacza większy promień rażenia. Trzeciej możliwości nie ma.
- Pozostawienie ścieżki mailowej bez zmian utrzymuje jej znane słabości: pobranie tokenów po samym `session_id` i konsumpcję stanu zwykłym GET-em.
- Progi limitów przeniesione z EDU są punktem wyjścia dla innego ruchu niż nasz; pierwsza korekta przyjdzie dopiero z danych pilotażu.

## Dyspozycja po przeglądzie

**Zakres pierwszego wydania:** …

**Wybrane warianty do przeniesienia do planu:** …

**Decyzje odroczone i warunki powrotu:** …

**Najważniejsze dowody do zebrania przed kodowaniem:** …

**Pozostałe uwagi:** …

Po wypełnieniu tych pól powstanie `plan.md` z fazami, kryteriami akceptacji i sekcją Progress. Ten brief niczego nie wdraża, nie autoryzuje wysyłki wiadomości ani wydania; szczegółowe porównania wariantów i rejestr dowodów są w [załączniku](decisions-details.md).
