/goal Zbuduj i zweryfikuj lokalną aplikację webową „10x Decision Room” do analizy decyzji i ich finalnej akceptacji przez użytkownika. Dostarcz działającą aplikację, nie sam plan ani makietę.

Najpierw przeczytaj pełną specyfikację zlecenia:
/Users/admin/code/10x-cli-v4-delivery/context/changes/10xdevs4-cli-access/prompts/decision-room-spec.md
Traktuj ją jako rozwinięcie tego polecenia, łącznie z granicami zapisu, UX, designem i kryteriami odbioru.

Źródła w katalogu:
/Users/admin/code/10x-cli-v4-delivery/context/changes/10xdevs4-cli-access/
Przeczytaj decisions.md (executive brief i finalne wybory), decisions-details.md (warianty, zależności, W01–W20), plan.md, plan-brief.md, research.md i reviews/plan-review.md. To kontekst aplikacji, NIE plan do zaimplementowania w 10x-cli.

Utwórz osobny projekt /Users/admin/code/10x-decision-room i zmianę 10x-decision-room; zachowaj istniejące pliki i cudze zmiany. Przeprowadź CSC: 10x-new → 10x-research → 10x-plan → 10x-plan-review → /10x-goal-implement 10x-decision-room → 10x-impl-review. Implementer uruchom dopiero po stworzeniu i przeglądzie własnego planu aplikacji. Wybieraj rekomendowane, proporcjonalne opcje bez pytań o realizację. Skills: /Users/admin/.codex/skills/<nazwa>/SKILL.md. Autonomia dotyczy budowy narzędzia, NIE akceptacji decyzji D01–D16.

Design: Cosmic Hub, executive brief przed technikaliami. Użyj 10x-visualize-it, jeśli dostępny; potwierdzona baza to /Users/admin/.claude/skills/visualize-it/SKILL.md i jej references. Aktualne źródła Cosmic Hub, fonty oraz zasady adaptacji statycznego skilla do lokalnej aplikacji są w specyfikacji.

Wymagany rzeczywisty przepływ: akcja w UI → model → ograniczony patch → walidacja intencji i wersji → Markdown → ponowny odczyt UI. decisions.md jest źródłem finalnych wyborów. Wybór wariantu lub rekomendacja modelu nie oznacza akceptacji. Zachowaj szkice, obsłuż błędy, równoległe edycje, restart i powtórzenia żądań. Żadnych atrap modelu ani dodatkowego autorytatywnego stanu w localStorage/JSON. Nie zmieniaj merytoryki źródeł, nie wdrażaj 10x-cli/toolkit i nie publikuj niczego zewnętrznie.

DONE: aplikacja działa lokalnie; wszystkie Automated kryteria własnego planu przechodzą; test w przeglądarce na KOPIACH dokumentów potwierdza realny model, zapis Markdown i zachowanie stanu po reloadzie/restarcie; sprawdzono konflikty, desktop/mobile i klawiaturę; review nie ma nierozwiązanych krytycznych problemów. Moje realne decyzje pozostają nietknięte. W głównym raporcie podaj URL/polecenie startu, adapter modelu, wyniki gate’ów, commity faz i ewentualne Manual punkty. Nie kończ jako sukces bez dowodu działania pełnego przepływu. Przy rzeczywistej blokadzie zastosuj STOP i raport wznowienia zgodny ze skillem.
