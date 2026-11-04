# Si Skin – strona gabinetu (Astro)

Szybka, statyczna strona gabinetu kosmetologii estetycznej i laseroterapii Si Skin (Wrocław).
Astro 7, czysty TypeScript/CSS bez frameworków UI, publikacja na GitHub Pages
(`https://ziarnooo.github.io/si-skin/`). Wersja robocza przed przeniesieniem na `www.si-skin.pl`.

## Uruchomienie lokalne

Wymagany Node `>=22.23.4` (patrz `engines` w `package.json`).

```sh
npm install
npm run dev        # podgląd na http://localhost:4321/si-skin/
npm run build      # build do ./dist
npm run preview    # podgląd zbudowanej strony
```

## Jak edytować treści (panel /admin)

Wszystkie treści leżą w `src/content/` i można je edytować dwojako: w plikach albo w panelu
**`<adres strony>/admin/`** (Sveltia CMS) – po polsku, z podpowiedziami przy każdym polu.
Panel zapisuje zmiany jako commity w repozytorium `ziarnooo/si-skin` (gałąź `main`),
a GitHub Actions publikuje stronę po ok. 1–3 minutach.

### Logowanie tokenem (PAT)

1. Wejdź na GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. *Resource owner*: konto `ziarnooo`; *Repository access*: **Only select repositories → `si-skin`**.
3. *Permissions → Repository permissions*: **Contents: Read and write** (reszta bez zmian).
4. Ustaw wygaśnięcie (np. 1 rok), wygeneruj token i skopiuj go (pokazywany jest raz).
5. Otwórz `/admin/`, wybierz **Sign in with GitHub using a token** (logowanie tokenem) i wklej token.
   Token zostaje tylko w przeglądarce – nie wysyłaj go nikomu i nie wpisuj do plików.

### Co gdzie jest w panelu

| Zakładka | Plik | Uwagi |
| --- | --- | --- |
| Ustawienia strony | `src/content/settings.yaml` | telefon, adres, godziny, link Booksy, analityka |
| Zabiegi | `src/content/services/*.md` | każdy plik = podstrona (adres = nazwa pliku) |
| Cennik | `src/content/pricing.yaml` | ceny w zł brutto, rabaty z datą ważności |
| Promocje | `src/content/promotions.yaml` | cena po rabacie liczy się sama z cennika |
| Zespół, Opinie, FAQ | `team.yaml`, `reviews.yaml`, `faq.yaml` | |
| Blog | `src/content/blog/*.md` | pole „Wersja robocza” ukrywa artykuł |
| Strony | `src/content/pages/*.md` | regulamin, polityka prywatności |

Dobre praktyki:

- Błąd w danych (np. litera zamiast ceny) zatrzyma build z czytelnym komunikatem zamiast publikować uszkodzoną stronę –
  poprzednia wersja strony zostaje wtedy online.
- Linki do innych stron w tekstach wpisuj jako `/epilacja-shr/` (bez domeny i bez `/si-skin`) – prefiks dokleja się automatycznie.
- Panel przepisuje pliki YAML w ujednoliconym formacie, więc komentarze z początku plików mogą zniknąć po pierwszym zapisie – to normalne.
- Identyfikatory (`epilacja-shr`, `r01`…) łączą dane między plikami. Istniejących nie zmieniaj.
- Dodanie **nowej kategorii cennika**: dodaj ją w zakładce „Cennik”, a żeby można ją było wybrać przy zabiegu lub promocji,
  dopisz jedną linię z jej identyfikatorem do list `options` w `public/admin/config.yml`.
- Zmieniasz schemat danych (`src/content.config.ts`)? Zaktualizuj też `public/admin/config.yml`.

## Wygląd – `src/styles/tokens.css`

Kolory, fonty, odstępy, zaokrąglenia, cienie i czasy animacji są zdefiniowane **wyłącznie** w
[`src/styles/tokens.css`](src/styles/tokens.css) jako zmienne CSS. Komponenty używają tylko `var(--…)`.
Zmiana palety lub zaokrągleń w tym jednym pliku zmienia całą stronę (także obrazy udostępniania OG,
które czytają kolory z tego pliku).

## Przeniesienie na domenę si-skin.pl

Adres i ścieżka bazowa są konfigurowane zmiennymi środowiskowymi (`astro.config.mjs`) – kod nie zawiera zaszytych ścieżek.

1. W repozytorium na GitHubie: **Settings → Secrets and variables → Actions → Variables** →
   `SITE_URL` = `https://www.si-skin.pl`, `BASE_PATH` = `/`.
2. Dodaj plik `public/CNAME` z jedną linią: `www.si-skin.pl`.
3. **Settings → Pages → Custom domain**: `www.si-skin.pl`, włącz *Enforce HTTPS*. U rejestratora ustaw
   rekord `CNAME` `www` → `ziarnooo.github.io` (oraz przekierowanie domeny głównej na `www`).
4. Uruchom workflow ręcznie (Actions → *Deploy to GitHub Pages* → Run workflow).
5. Sprawdź, że `analytics.productionHost` w ustawieniach to dokładnie `www.si-skin.pl`.

Stare adresy z WordPressa (`/o-mnie/` itd.) przekierowania zdefiniowane są w `astro.config.mjs` (`redirects`);
dodaj tam kolejne, jeśli zależy Wam na zachowaniu starych linków.

## Analityka i zgody (cookies)

- Baner zgód (`ConsentBanner.astro`, `src/scripts/consent.ts`) pojawia się po załadowaniu strony (nie wpływa na LCP).
  Wybór („Akceptuj wszystkie”, „Tylko niezbędne” albo własne ustawienia) zapisuje się w `localStorage`
  z numerem wersji – zmiana `CONSENT_VERSION` w `consent.ts` ponownie zapyta wszystkich odwiedzających.
  Link/przycisk z atrybutem `data-consent-open` (np. w stopce) otwiera ustawienia ponownie.
- Google Analytics 4 i Meta Pixel (`src/scripts/analytics.ts`) ładują się **tylko** gdy hostname strony =
  `analytics.productionHost` **i** odwiedzający wyraził zgodę (analityczne → GA4, marketingowe → Meta Pixel).
  Na `github.io` i lokalnie nie ładuje się nic. Google Consent Mode v2 startuje z wartościami „denied”.
- Śledzone zdarzenia: kliknięcia przycisków rezerwacji (`booking_click` z polami `placement`, `service`, `link_url`,
  w Meta: `Schedule`) oraz kliknięcia numeru telefonu i e-maila (`contact_click`).
- Identyfikatory GA4/Pixel i domena produkcyjna są w `settings.yaml` (sekcja `analytics`).

## Dla wyszukiwarek i agentów AI

Wszystko poniżej jest generowane przy buildzie z tych samych treści co strona:

| Zasób | Co to |
| --- | --- |
| `robots.txt` | zgoda dla wszystkich botów, jawnie dla OAI-SearchBot, Claude-SearchBot, PerplexityBot, GPTBot, ClaudeBot, Google-Extended; `Content-Signal: search=yes, ai-input=yes, ai-train=no`; mapa strony |
| `sitemap-index.xml` | mapa strony (integracja Astro) |
| `llms.txt`, `llms-full.txt` | spis stron i pełna treść (zabiegi, ceny, kontakt, godziny, FAQ) dla modeli |
| `<ścieżka>/index.md`, `/index.md` | wersja Markdown każdej podstrony (wskazana w `<link rel="alternate" type="text/markdown">`) |
| `/api/site.json` | usługi, ceny, godziny, kontakt i link do rezerwacji jako JSON |
| `/.well-known/agent-skills/index.json` + `*/SKILL.md` | opis umiejętności (jak umówić wizytę, jak czytać cennik) z sumą SHA-256 |
| `/.well-known/api-catalog` | katalog (RFC 9727) wskazujący `/api/site.json` |
| WebMCP (`src/scripts/webmcp.ts`) | w przeglądarkach z `modelContext` rejestruje narzędzia tylko do odczytu: `get_services`, `get_prices`, `get_contact_and_hours`, `get_booking_link` |
| JSON-LD | `BeautySalon`, `Service`, `Article`, `FAQPage`, `BreadcrumbList` (`src/lib/schema.ts`); bez `aggregateRating` – opinie z Booksy pokazujemy jako treść, nie jako własną ocenę w danych strukturalnych |

Strona **nie** udostępnia API rezerwacji, serwera MCP/A2A ani OAuth – rezerwacja odbywa się w Booksy lub telefonicznie,
a narzędzia agentów są wyłącznie do odczytu.

### Obrazy udostępniania (OG)

`src/pages/og/[...slug].png.ts` generuje obraz 1200×630 dla każdej strony (kolory z `tokens.css`, tytuł krojem Noto Serif Display z `src/assets/fonts`,
zdjęcie strony po prawej). Nazewnictwo: `/` → `/og/index.png`, `/cennik/` → `/og/cennik.png`, `/blog/x/` → `/og/blog/x.png`,
awaryjnie `/og/default.png`. Ścieżkę buduje funkcja `ogImagePath()` z `src/lib/schema.ts`.

### Hosting a nagłówki HTTP

GitHub Pages **nie pozwala ustawiać własnych nagłówków** (`Link`, `Content-Type` dla `.md`, cache) ani negocjacji treści
(`Accept: text/markdown`), a `robots.txt` i `/.well-known/` działają tylko na domenie głównej – dlatego po przeniesieniu
na `www.si-skin.pl` (`BASE_PATH=/`) wszystko jest pod właściwymi adresami.
Plik `public/_headers` jest gotowy dla **Cloudflare Pages** (lub Netlify): ustawia nagłówki `Link`
(`api-catalog`, `describedby`), typy MIME plików Markdown i cache. Cloudflare Pages jest rekomendowanym docelowym hostingiem –
daje te nagłówki, darmowy CDN i możliwość dodania negocjacji Markdown (`Accept: text/markdown`) przez Worker/Transform Rules.
Przeniesienie nie wymaga zmian w kodzie: build `npm run build`, katalog wyjściowy `dist`, zmienne `SITE_URL` i `BASE_PATH=/`.

## Struktura

```text
src/
  content/        treści (YAML/Markdown) – edytowane w /admin
  content.config.ts  schematy treści
  components/     komponenty Astro (Header, Footer, SEO, ConsentBanner…)
  layouts/        Base.astro
  lib/            site.ts (ustawienia, URL-e), schema.ts (JSON-LD), agent.ts (Markdown/JSON dla agentów)
  pages/          strony oraz endpointy (robots.txt, llms*.txt, index.md, og, api, .well-known)
  scripts/        motion, consent, analytics, webmcp, tła hero
  styles/         tokens.css (jedyne źródło wyglądu), global.css
  assets/         obrazy, logo, font do obrazów OG (licencja OFL w src/assets/fonts)
public/admin/     panel Sveltia CMS (index.html + config.yml)
.github/workflows/deploy.yml   publikacja na GitHub Pages
```
