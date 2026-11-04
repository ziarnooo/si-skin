# Si Skin – handoff (stan na 04.11.2026)

Nowa strona gabinetu Si Skin (Wrocław) zamiast starego WordPressa na www.si-skin.pl.

- Live (podgląd): https://ziarnooo.github.io/si-skin/
- Repo: https://github.com/ziarnooo/si-skin (publiczne, branch `main`, deploy automatyczny przez GitHub Actions → Pages)
- Porównanie dwóch wersji hero („oktagon”): `/si-skin/dev/hero-a/` i `/si-skin/dev/hero-b/` (wygrał B, noindex)

## Jak wznowić pracę
1. `cd ~/Documents/repositories/Si-skin && git pull && npm install`
2. Podgląd: `npx astro build && npx astro preview --port 4322` → http://localhost:4322/si-skin/
   (`astro dev` też działa; w headless Chrome animacje potrafią „wisieć” na screenshotach – do testów wizualnych używaj zbudowanej wersji)
3. Nowa sesja z AI: „Przeczytaj HANDOFF.md i README.md, kontynuujemy Si Skin”.

## Stack i struktura
- Astro 7 (static), vanilla TS, zero frameworków UI. Markdown: Sätteri (`astro.config.mjs`), `compressHTML: false` (inaczej ginęły spacje przed linkami).
- `SITE_URL` / `BASE_PATH` (env) – domyślnie `https://ziarnooo.github.io` + `/si-skin`. Przy przenosinach na domenę: `SITE_URL=https://www.si-skin.pl`, `BASE_PATH=/` (zmienne repo w Settings → Variables).
- **Style globalne:** `src/styles/tokens.css` (kolory, fonty, odstępy, easingi) – jedyne miejsce zmiany wyglądu; `src/styles/global.css` (klasy bazowe).
- **Treści (edycja bez kodu przez `/admin` – Sveltia CMS, logowanie tokenem GitHub, instrukcja w README):**
  - `src/content/settings.yaml` – telefon, adres, godziny, Booksy, ocena, social, GA4/Pixel, UTM
  - `src/content/services/*.md` – podstrony zabiegów (adres = nazwa pliku)
  - `src/content/pricing.yaml` – cennik (źródło: Booksy 31.10.2026)
  - `promotions.yaml`, `team.yaml`, `reviews.yaml`, `faq.yaml`, `blog/*.md`, `pages/*.md` (prawne)
  - Schematy: `src/content.config.ts` (błąd w danych = build się zatrzyma z czytelnym komunikatem)
- Komponenty: `src/components/` (Header, Footer + `src/scripts/footer-dots.ts`, PageHero, PriceTable, Promotions, FAQ, Reviews…), hero: `src/components/hero/HeroB.astro` (+ `Hero.astro` wybiera wariant).
- Skrypty: `motion.ts` (reveal, magnetyczne przyciski, scroll), `consent.ts` + `analytics.ts` (GA4 i Pixel tylko po zgodzie i tylko na `productionHost`), `webmcp.ts`.
- SEO/agenci: JSON-LD (`src/lib/schema.ts`), OG obrazki generowane (`/og/*.png`), `robots.txt`, `llms.txt`, `llms-full.txt`, wersje `.md` stron, `/api/site.json`, `/.well-known/agent-skills`, `/.well-known/api-catalog`, `public/_headers` (dla Cloudflare/Netlify).
- Research starej strony i Booksy: `_scrape/pages/*.md`, `_scrape/booksy*.txt`.

## Wyniki
- Lighthouse (mobile, live): 100/100/100/100 na home, cenniku, epilacji.
- isitagentready.com: na github.io poziom 0, bo skaner szuka plików w root domeny – po przeniesieniu na si-skin.pl z `BASE_PATH=/` powinny przejść robots/sitemap/agent-skills/api-catalog; Link headers i markdown negotiation wymagają Cloudflare.

## Hosting / DNS (obecnie)
- Rejestrator: cyber_Folks (domena opłacona do 22.02.2027).
- DNS i hosting WordPressa: Zenbox (ns1/ns2.zenbox.pl, serwer s41.zenbox.pl, IP 2.57.138.201). Poczta: MX zenbox – NIE ruszać.
- Przeniesienie na GitHub Pages: w panelu Zenbox rekord A `si-skin.pl` → 185.199.108.153 / 109.153 / 110.153 / 111.153, CNAME `www` → `ziarnooo.github.io`; w repo dodać domenę (Settings → Pages) + zmienne `SITE_URL`, `BASE_PATH=/`.

## Odpowiedzi klientki (wprowadzone 04.11.2026)
- Telefon 516 070 508, godziny pn–pt 9–20, sob. 8–15, Instagram @siskin.wroclaw, e-mail siskin.contact@gmail.com.
- Oliwia już nie pracuje. Jessica Waszajło – pisownia potwierdzona, zdjęcie klientka dośle (dodać `photo`/`photoAlt` w `team.yaml`).
- Brak pakietów depilacji, rabat „do −20%” w Booksy nieaktualny (usunięty `discount` z cennika), „60–70% włosków po 1. zabiegu” potwierdzone przez producenta (wróciło na stronę).
- Makijaż permanentny brwi wycofany (usunięte: podstrona, cennik, 3 wpisy blogowe, zdjęcia). Korekcja zmarszczek mimicznych tylko w Booksy (usunięta z cennika strony). Pozostały cennik = Booksy.
- proXN III = „Retinol & Ksantohumol”, pakiet 5× przebarwienia jak w Booksy, usta 999 zł stała cena, SSR – przeciwwskazania jak SHR.
- Promocje: Si-Polecajka (dawniej Przyjaciółka-Polecajka, −15% jednorazowo), Si-Opinia (3 opinie łącznie, okazane w gabinecie), Si-Selfie; rabaty nie łączą się. Karta stałego klienta i promocja miesięczna – brak.
- Dane firmy: SI SKIN Kamil Grincewicz, ul. Królewiecka 121/3, 54-117 Wrocław, NIP 8943230657 (REGON nie podany – usunięty z dokumentów). Zadatków nie przyjmujemy.

## Otwarte pytania do klientki
1. Zdjęcie Jessiki Waszajło (w drodze).
2. REGON firmy Kamila Grincewicza (jeśli ma być w dokumentach) + przegląd prawnika.
3. Zgoda na cytowanie opinii z Booksy.
4. Hosting docelowy (GitHub Pages vs Cloudflare), dostęp do panelu Zenbox, czy poczta @si-skin.pl jest używana.
5. Dostęp do GA4 G-ELD8QLFE5T i Meta Pixel 1107742104573331.

## Następne kroki
- Dodać zdjęcie Jessiki po otrzymaniu; podmienić zdjęcia, które prześle klientka.
- Przenieść domenę (sekcja DNS), potem sprawdzić isitagentready + Lighthouse na si-skin.pl.
- Po przeniesieniu: Google Search Console (sitemap `sitemap-index.xml`), sprawdzić zdarzenie `booking_click` w GA4.
- Opcjonalnie: zdjęcia zespołu, więcej artykułów na blogu, `/.well-known/ai-catalog.json` (ARD).

## Konwencje pracy
- Treści po polsku, komunikacja zespołowa („my”), bez pauz „—” (tylko „–”, nigdy na początku zdania), bez dekoracyjnych kresek przed eyebrow.
- Nie wymyślać faktów/cen – źródła: Booksy, stara strona, odpowiedzi klientki.
- Kolory tylko przez tokeny; animacje krótkie, ease-out, z `prefers-reduced-motion`; pilnować Lighthouse 100 (LCP = tekst/zdjęcie bez ukrywania przez animację).
