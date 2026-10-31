import { getCollection, type CollectionEntry } from 'astro:content';
import path from 'node:path';
import {
  CATEGORY_LABELS,
  absoluteUrl,
  applyDiscount,
  bookingUrl,
  findPriceItem,
  formatDate,
  formatPrice,
  getServices,
  getSettings,
  isActive,
  isoDate,
  type Settings,
} from './site';

/**
 * Wspólne źródło prawdy dla wszystkiego, co czytają maszyny:
 * markdownowe wersje stron (index.md), llms.txt, llms-full.txt, /api/site.json,
 * agent-skills oraz obrazy OG. Wszystko budowane z kolekcji treści w czasie buildu.
 */

type Site = URL | undefined;
type Service = CollectionEntry<'services'>;
type PricingCategory = CollectionEntry<'pricing'>;

export interface SitePage {
  /** Ścieżka bez base, z ukośnikiem na końcu: '/', '/cennik/', '/blog/x/'. */
  path: string;
  title: string;
  description: string;
  kind: 'home' | 'service' | 'static' | 'blog' | 'legal';
  /** Absolutna ścieżka pliku zdjęcia do obrazu OG (prawa strona). */
  image?: string;
  markdown: () => Promise<string>;
}

// ── Pomocnicze ────────────────────────────────────────────────────────────

const abs = (p: string, site: Site) => absoluteUrl(p, site);
const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
const money = (n: number) => nbsp(formatPrice(n));

/** Linki wewnętrzne w treści (`](/epilacja-shr/)`) → adresy absolutne. */
function absolutizeLinks(markdown: string, site: Site): string {
  return markdown.replace(/\]\((\/(?!\/)[^)\s]*)\)/g, (_m, p: string) => `](${abs(p, site)})`);
}

function hoursLines(settings: Settings): string[] {
  return settings.hours.map((h) => `- ${h.days}: ${h.closed || !h.open ? 'nieczynne' : `${h.open}–${h.close}`}`);
}

function imageFsPath(image: unknown): string | undefined {
  const fsPath = (image as { fsPath?: string } | undefined)?.fsPath;
  return fsPath?.split('?')[0];
}

const asset = (file: string) => path.resolve(process.cwd(), 'src/assets/images', file);

function priceItemLine(item: PricingCategory['data']['groups'][number]['items'][number]): string {
  const value = typeof item.price === 'number' ? money(item.price) : (item.priceText ?? '');
  const parts = [`- ${item.name}${value ? ` – ${value}` : ''}`];
  if (item.duration) parts.push(`(${item.duration})`);
  if (item.note) parts.push(`(${item.note})`);
  return parts.join(' ');
}

function discountLine(discount: PricingCategory['data']['discount']): string | undefined {
  if (!discount || !isActive(discount)) return undefined;
  const until = discount.validUntil ? ` (do ${formatDate(discount.validUntil)})` : '';
  const scope = discount.upTo ? 'do ' : '';
  return `${discount.label}: ${scope}−${discount.percent}%${until}. Cena po rabacie widoczna w Booksy.`;
}

function pricingMarkdown(category: PricingCategory, level = 2): string {
  const h = '#'.repeat(level);
  const d = category.data;
  const lines = [`${h} ${d.title}`, ''];
  if (d.intro) lines.push(d.intro, '');
  const discount = discountLine(d.discount);
  if (discount) lines.push(`_${discount}_`, '');
  for (const group of d.groups) {
    if (group.title) lines.push(`${'#'.repeat(level + 1)} ${group.title}`, '');
    lines.push(...group.items.map(priceItemLine), '');
  }
  if (d.note) lines.push(`_${d.note}_`, '');
  return lines.join('\n');
}

async function getPricing(): Promise<PricingCategory[]> {
  return (await getCollection('pricing')).sort((a, b) => a.data.order - b.data.order);
}

async function getPosts() {
  return (await getCollection('blog', (p) => !p.data.draft)).sort((a, b) => +b.data.pubDate - +a.data.pubDate);
}

async function getFaq() {
  return (await getCollection('faq')).sort((a, b) => a.data.order - b.data.order);
}

function faqMarkdown(items: { q: string; a: string }[], level = 2): string {
  const h = '#'.repeat(level);
  return items.map((i) => `${h} ${i.q}\n\n${i.a}\n`).join('\n');
}

function bookingBlock(settings: Settings, placement: string): string {
  return [
    '## Umów wizytę',
    '',
    `Rezerwacja online w Booksy: ${bookingUrl(settings, placement)}`,
    `Telefon: ${settings.phone} (${settings.phoneHref})`,
    '',
  ].join('\n');
}

function contactBlock(settings: Settings): string {
  const a = settings.address;
  return [
    `- Adres: ${a.street}, ${a.postalCode} ${a.city}${a.district ? ` (${a.district})` : ''}`,
    `- Telefon: ${settings.phone}`,
    `- E-mail: ${settings.email}`,
    `- Mapa: ${settings.mapsUrl}`,
    `- Instagram: ${settings.social.instagram}`,
    `- Facebook: ${settings.social.facebook}`,
    '- Godziny otwarcia:',
    ...hoursLines(settings).map((l) => `  ${l}`),
  ].join('\n');
}

// ── Markdown: usługi ──────────────────────────────────────────────────────

function serviceMarkdown(service: Service, pricing: PricingCategory[], settings: Settings, site: Site): string {
  const d = service.data;
  const lines = [`# ${d.title}`, '', `> ${d.lead}`, ''];
  const facts = [`- Kategoria: ${CATEGORY_LABELS[d.category]}`];
  if (d.duration) facts.push(`- Czas zabiegu: ${d.duration}`);
  if (typeof d.priceFrom === 'number') facts.push(`- Cena od: ${money(d.priceFrom)}`);
  else if (d.priceLabel) facts.push(`- Cena: ${d.priceLabel}`);
  facts.push(`- Strona: ${abs(`/${service.id}/`, site)}`);
  lines.push(...facts, '');

  if (service.body?.trim()) lines.push(absolutizeLinks(service.body, site).trim(), '');
  if (d.highlights.length) lines.push('## Najważniejsze', '', ...d.highlights.map((h) => `- ${h}`), '');
  if (d.sessions) {
    lines.push('## Seria zabiegów', '', `- Liczba wizyt: ${d.sessions.count}`, `- Odstępy: ${d.sessions.interval}`);
    if (d.sessions.note) lines.push(`- ${d.sessions.note}`);
    lines.push('');
  }
  for (const section of d.details) {
    lines.push(`## ${section.title}`, '');
    if (section.text) lines.push(section.text, '');
    if (section.items.length) lines.push(...section.items.map((i) => `- ${i}`), '');
  }
  if (d.notice) lines.push(`> ${d.notice}`, '');

  const categories = d.pricing.map((ref) => pricing.find((c) => c.id === ref.id)).filter((c): c is PricingCategory => !!c);
  if (categories.length) {
    lines.push('## Cennik', '');
    for (const c of categories) lines.push(pricingMarkdown(c, 3));
  }
  if (d.faq.length) lines.push('## Najczęstsze pytania', '', faqMarkdown(d.faq, 3));
  lines.push(bookingBlock(settings, `agent-${service.id}`));
  return lines.join('\n');
}

// ── Lista stron ───────────────────────────────────────────────────────────

const STATIC_PAGES: { path: string; title: string; description: string; image: string }[] = [
  { path: '/zabiegi/', title: 'Zabiegi', description: 'Pełna oferta gabinetu Si Skin we Wrocławiu: laseroterapia, zabiegi na twarz i kosmetologia estetyczna.', image: 'gabinet-2.jpg' },
  { path: '/cennik/', title: 'Cennik', description: 'Aktualny cennik zabiegów Si Skin we Wrocławiu: depilacja laserowa SHR, naczynka, przebarwienia i inne.', image: 'specjalistka-laser.jpg' },
  { path: '/promocje/', title: 'Promocje', description: 'Aktualne promocje i zniżki w gabinecie Si Skin we Wrocławiu.', image: 'promocje-przyjaciolki.jpg' },
  { path: '/karty-podarunkowe/', title: 'Karty podarunkowe', description: 'Personalizowany voucher podarunkowy na zabieg lub wybraną kwotę, ważny 6 miesięcy.', image: 'voucher.jpg' },
  { path: '/kontakt/', title: 'Kontakt', description: 'Si Skin, ul. Królewiecka 121/3, Wrocław. Telefon, godziny otwarcia i rezerwacja online.', image: 'gabinet-drzwi.jpg' },
  { path: '/o-nas/', title: 'O nas', description: 'Poznaj zespół i gabinet Si Skin – kosmetologia estetyczna i laseroterapia we Wrocławiu.', image: 'weronika-grincewicz.jpg' },
  { path: '/blog/', title: 'Blog', description: 'Porady i wiedza o laseroterapii, depilacji laserowej i pielęgnacji skóry od kosmetolożek Si Skin.', image: 'liscie-cien.jpg' },
];

export async function getSitePages(site: Site): Promise<SitePage[]> {
  const settings = await getSettings();
  const [services, pricing, faq, posts, legal, team, promotions] = await Promise.all([
    getServices(),
    getPricing(),
    getFaq(),
    getPosts(),
    getCollection('pages'),
    getCollection('team'),
    getCollection('promotions'),
  ]);

  const home: SitePage = {
    path: '/',
    title: `${settings.name} – ${settings.tagline}`,
    description: settings.description,
    kind: 'home',
    image: asset('gabinet-1.jpg'),
    markdown: async () => {
      const lines = [`# ${settings.name} – ${settings.tagline}`, '', `> ${settings.description}`, '', '## Zabiegi', ''];
      for (const s of services) {
        lines.push(`- [${s.data.navTitle}](${abs(`/${s.id}/`, site)}): ${s.data.excerpt}`);
      }
      lines.push(
        '',
        '## Informacje',
        '',
        `- [Cennik](${abs('/cennik/', site)})`,
        `- [Promocje](${abs('/promocje/', site)})`,
        `- [Karty podarunkowe](${abs('/karty-podarunkowe/', site)})`,
        `- [O nas](${abs('/o-nas/', site)})`,
        `- [Blog](${abs('/blog/', site)})`,
        `- [Kontakt](${abs('/kontakt/', site)})`,
        '',
        '## Kontakt',
        '',
        contactBlock(settings),
        '',
        `Oceny klientów: ${settings.rating.value.toFixed(1)}/5 w ${settings.rating.source} (${settings.rating.count} opinii, stan na ${isoDate(settings.rating.checkedAt)}) – ${settings.rating.url}`,
        '',
        bookingBlock(settings, 'agent-home'),
      );
      return lines.join('\n');
    },
  };

  const servicePages: SitePage[] = services.map((s) => ({
    path: `/${s.id}/`,
    title: s.data.title,
    description: s.data.seo.description,
    kind: 'service',
    image: imageFsPath(s.data.image),
    markdown: async () => serviceMarkdown(s, pricing, settings, site),
  }));

  const staticMarkdown: Record<string, () => string> = {
    '/zabiegi/': () => {
      const lines = ['# Zabiegi', ''];
      for (const key of Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]) {
        const items = services.filter((s) => s.data.category === key);
        if (!items.length) continue;
        lines.push(`## ${CATEGORY_LABELS[key]}`, '');
        for (const s of items) {
          const price = typeof s.data.priceFrom === 'number' ? ` – od ${money(s.data.priceFrom)}` : '';
          lines.push(`- [${s.data.navTitle}](${abs(`/${s.id}/`, site)})${price}: ${s.data.excerpt}`);
        }
        lines.push('');
      }
      return lines.join('\n');
    },
    '/cennik/': () =>
      [
        '# Cennik',
        '',
        'Ceny w zł brutto. Rabaty Booksy są liczone przy rezerwacji online.',
        '',
        ...pricing.map((c) => pricingMarkdown(c)),
        bookingBlock(settings, 'agent-cennik'),
      ].join('\n'),
    '/promocje/': () => {
      const lines = ['# Promocje', ''];
      for (const p of promotions.map((e) => e.data).sort((a, b) => a.order - b.order)) {
        if (!isActive(p)) continue;
        lines.push(`## ${p.title} (${p.badge})`, '', p.summary, '');
        if (p.steps.length) lines.push('Jak skorzystać:', '', ...p.steps.map((s, i) => `${i + 1}. ${s}`), '');
        if (p.terms.length) lines.push('Warunki:', '', ...p.terms.map((t) => `- ${t}`), '');
        const example = p.example && p.percent ? findPriceItem(pricing, p.example.category, p.example.item) : undefined;
        if (example?.item.price && p.percent) {
          lines.push(`Przykład: ${example.item.name} – ${money(example.item.price)} → ${money(applyDiscount(example.item.price, p.percent))}.`, '');
        }
      }
      return lines.join('\n');
    },
    '/karty-podarunkowe/': () =>
      [
        '# Karty podarunkowe',
        '',
        'Personalizowany voucher podarunkowy na wybrany zabieg lub kwotę, ważny przez 6 miesięcy. Kartę kupisz bezpośrednio w gabinecie.',
        '',
        faqMarkdown(faq.filter((f) => f.data.category === 'karty').map((f) => f.data), 2),
        bookingBlock(settings, 'agent-karty'),
      ].join('\n'),
    '/kontakt/': () => ['# Kontakt', '', contactBlock(settings), '', bookingBlock(settings, 'agent-kontakt')].join('\n'),
    '/o-nas/': () => {
      const lines = ['# O nas', '', settings.description, ''];
      for (const m of team.map((e) => e.data).sort((a, b) => a.order - b.order)) {
        lines.push(`## ${m.name} – ${m.role}`, '');
        if (m.specializations.length) lines.push(`Specjalizacje: ${m.specializations.join(', ')}`, '');
        if (m.bio) lines.push(m.bio.replace(/\s+/g, ' ').trim(), '');
      }
      return lines.join('\n');
    },
    '/blog/': () =>
      [
        '# Blog',
        '',
        ...posts.map((p) => `- [${p.data.title}](${abs(`/blog/${p.id}/`, site)}) (${isoDate(p.data.pubDate)}): ${p.data.description}`),
        '',
      ].join('\n'),
  };

  const staticPages: SitePage[] = STATIC_PAGES.map((p) => ({
    path: p.path,
    title: p.title,
    description: p.description,
    kind: 'static',
    image: asset(p.image),
    markdown: async () => staticMarkdown[p.path]!(),
  }));

  const blogPages: SitePage[] = posts.map((p) => ({
    path: `/blog/${p.id}/`,
    title: p.data.title,
    description: p.data.description,
    kind: 'blog',
    image: imageFsPath(p.data.image),
    markdown: async () =>
      [
        `# ${p.data.title}`,
        '',
        `> ${p.data.description}`,
        '',
        `Opublikowano: ${isoDate(p.data.pubDate)}${p.data.updatedDate ? ` · zaktualizowano: ${isoDate(p.data.updatedDate)}` : ''}`,
        '',
        absolutizeLinks(p.body ?? '', site).trim(),
        '',
      ].join('\n'),
  }));

  const legalPages: SitePage[] = legal.map((p) => ({
    path: `/${p.id}/`,
    title: p.data.title,
    description: p.data.description,
    kind: 'legal',
    image: asset('gabinet-3.jpg'),
    markdown: async () => [`# ${p.data.title}`, '', absolutizeLinks(p.body ?? '', site).trim(), ''].join('\n'),
  }));

  return [home, ...servicePages, ...staticPages, ...blogPages, ...legalPages];
}

// ── JSON dla agentów (/api/site.json, WebMCP) ─────────────────────────────

export async function getSiteData(site: Site) {
  const settings = await getSettings();
  const [services, pricing, promotions] = await Promise.all([getServices(), getPricing(), getCollection('promotions')]);

  return {
    name: settings.name,
    legalName: settings.legalName,
    description: settings.description,
    language: 'pl-PL',
    url: abs('/', site),
    contact: {
      phone: settings.phone,
      phoneHref: settings.phoneHref,
      email: settings.email,
      address: { ...settings.address },
      mapsUrl: settings.mapsUrl,
      instagram: settings.social.instagram,
      facebook: settings.social.facebook,
    },
    hours: settings.hours.map((h) => ({
      days: h.days,
      dayOfWeek: h.schema,
      opens: h.closed ? null : (h.open ?? null),
      closes: h.closed ? null : (h.close ?? null),
      closed: h.closed,
    })),
    booking: {
      url: bookingUrl(settings, 'agent'),
      label: settings.booking.label,
      provider: 'Booksy',
      note: 'Rezerwacja online w Booksy lub telefonicznie; wizyty tylko po wcześniejszej rezerwacji.',
    },
    services: services.map((s) => ({
      slug: s.id,
      name: s.data.title,
      shortName: s.data.navTitle,
      category: s.data.category,
      categoryLabel: CATEGORY_LABELS[s.data.category],
      summary: s.data.excerpt,
      duration: s.data.duration ?? null,
      priceFrom: s.data.priceFrom ?? null,
      pricingCategories: s.data.pricing.map((r) => r.id),
      url: abs(`/${s.id}/`, site),
      markdown: abs(`/${s.id}/index.md`, site),
    })),
    pricing: pricing.map((c) => ({
      id: c.id,
      title: c.data.title,
      serviceSlug: c.data.service ?? null,
      note: c.data.note ?? null,
      discount: c.data.discount && isActive(c.data.discount)
        ? {
            label: c.data.discount.label,
            percent: c.data.discount.percent,
            upTo: c.data.discount.upTo,
            validUntil: c.data.discount.validUntil ? isoDate(c.data.discount.validUntil) : null,
          }
        : null,
      currency: 'PLN',
      groups: c.data.groups.map((g) => ({
        title: g.title ?? null,
        items: g.items.map((i) => ({
          name: i.name,
          price: i.price ?? null,
          priceText: i.priceText ?? null,
          duration: i.duration ?? null,
          note: i.note ?? null,
        })),
      })),
    })),
    promotions: promotions
      .map((e) => e.data)
      .filter((p) => isActive(p))
      .sort((a, b) => a.order - b.order)
      .map((p) => ({ title: p.title, badge: p.badge, summary: p.summary, validUntil: p.validUntil ? isoDate(p.validUntil) : null })),
  };
}

// ── llms.txt / llms-full.txt ──────────────────────────────────────────────

export async function buildLlmsTxt(site: Site): Promise<string> {
  const settings = await getSettings();
  const pages = await getSitePages(site);
  const link = (p: SitePage) => `- [${p.title}](${abs(p.path === '/' ? '/index.md' : `${p.path}index.md`, site)}): ${p.description}`;
  const section = (title: string, kind: SitePage['kind'] | 'info') =>
    [
      `## ${title}`,
      '',
      ...pages.filter((p) => (kind === 'info' ? p.kind === 'static' && p.path !== '/blog/' : p.kind === kind)).map(link),
      '',
    ].join('\n');

  return [
    `# ${settings.name}`,
    '',
    `> ${settings.description} Adres: ${settings.address.street}, ${settings.address.postalCode} ${settings.address.city}. Rezerwacje: ${settings.booking.url}`,
    '',
    'Strona w języku polskim. Każda podstrona ma wersję w Markdown pod adresem `<ścieżka>/index.md`. Dane strukturalne: /api/site.json.',
    '',
    section('Zabiegi', 'service'),
    section('Informacje', 'info'),
    '## Blog',
    '',
    link(pages.find((p) => p.path === '/blog/')!),
    ...pages.filter((p) => p.kind === 'blog').map(link),
    '',
    '## Optional',
    '',
    `- [Pełna treść dla modeli (llms-full.txt)](${abs('/llms-full.txt', site)}): cały cennik, zabiegi, FAQ i kontakt w jednym pliku`,
    `- [Dane strukturalne (JSON)](${abs('/api/site.json', site)}): usługi, ceny, godziny, link do rezerwacji`,
    ...pages.filter((p) => p.kind === 'legal').map(link),
    '',
  ].join('\n');
}

export async function buildLlmsFullTxt(site: Site): Promise<string> {
  const settings = await getSettings();
  const [pages, pricing, faq] = await Promise.all([getSitePages(site), getPricing(), getFaq()]);
  const byPath = (p: string) => pages.find((x) => x.path === p)!;
  const posts = pages.filter((p) => p.kind === 'blog');

  return [
    `# ${settings.name} – pełna treść serwisu`,
    '',
    `> ${settings.description}`,
    '',
    `Źródło: ${abs('/', site)} · wygenerowano z zawartości strony podczas publikacji. Język: polski. Ceny w zł brutto.`,
    '',
    '# Kontakt i godziny',
    '',
    contactBlock(settings),
    '',
    bookingBlock(settings, 'agent-llms'),
    '# Zabiegi',
    '',
    ...(await Promise.all(pages.filter((p) => p.kind === 'service').map(async (p) => (await p.markdown()).replace(/^#/gm, '##')))),
    '# Cennik',
    '',
    ...pricing.map((c) => pricingMarkdown(c)),
    (await byPath('/promocje/').markdown()).replace(/^#/gm, '##'),
    '# Najczęstsze pytania',
    '',
    faqMarkdown(faq.map((f) => f.data)),
    '# Artykuły na blogu',
    '',
    ...posts.map((p) => `- [${p.title}](${abs(`${p.path}index.md`, site)}): ${p.description}`),
    '',
  ].join('\n');
}

// ── Agent skills ──────────────────────────────────────────────────────────

export const SKILLS = [
  { name: 'book-appointment', description: 'Jak umówić wizytę w gabinecie Si Skin (Wrocław) przez Booksy lub telefon.' },
  { name: 'read-prices', description: 'Jak odczytać aktualny cennik i dostępne zabiegi Si Skin w formie maszynowej.' },
] as const;

export async function buildSkillMarkdown(name: (typeof SKILLS)[number]['name'], site: Site): Promise<string> {
  const settings = await getSettings();
  const skill = SKILLS.find((s) => s.name === name)!;
  const header = ['---', `name: ${skill.name}`, `description: ${skill.description}`, '---', ''];

  if (name === 'book-appointment') {
    return [
      ...header,
      `# Umawianie wizyty w ${settings.name}`,
      '',
      'Gabinet nie ma publicznego API rezerwacji – rezerwacje przyjmujemy przez Booksy lub telefonicznie. Agent nie może sam zarezerwować terminu; jego zadaniem jest przekazać użytkownikowi właściwy link i potrzebne informacje.',
      '',
      '## Kroki',
      '',
      `1. Ustal zabieg: pobierz listę z ${abs('/api/site.json', site)} (pole \`services\`) lub z ${abs('/zabiegi/index.md', site)}.`,
      '2. Sprawdź cenę i czas zabiegu w polu `pricing` tego samego JSON-a (ceny w PLN brutto; pozycje z `priceText` nie mają stałej ceny).',
      `3. Podaj użytkownikowi link do rezerwacji: ${bookingUrl(settings, 'agent-skill')}`,
      `4. Alternatywa: telefon ${settings.phone} (${settings.phoneHref}), godziny otwarcia poniżej.`,
      '5. Przypomnij, że wizyty realizujemy wyłącznie po wcześniejszej rezerwacji, a w dniu zabiegu depilacji laserowej włosy powinny mieć 2–3 mm odrostu.',
      '',
      '## Godziny otwarcia',
      '',
      ...hoursLines(settings),
      '',
      '## Adres',
      '',
      `${settings.address.street}, ${settings.address.postalCode} ${settings.address.city} – ${settings.mapsUrl}`,
      '',
    ].join('\n');
  }

  return [
    ...header,
    `# Odczyt cennika ${settings.name}`,
    '',
    '## Źródła (wszystkie statyczne, bez uwierzytelniania)',
    '',
    `- ${abs('/api/site.json', site)} – JSON: usługi, ceny, godziny, promocje, link do rezerwacji.`,
    `- ${abs('/cennik/index.md', site)} – cennik w Markdown.`,
    `- ${abs('/llms-full.txt', site)} – pełna treść serwisu.`,
    '',
    '## Zasady interpretacji',
    '',
    '- `price` to cena w PLN brutto; gdy brak, użyj `priceText` (np. „bezpłatnie”).',
    '- `discount` oznacza rabat widoczny w Booksy; przy `upTo: true` jest to rabat „do” podanej wartości, nie gwarantowany dla każdej pozycji.',
    '- Ceny w cenniku są cenami bazowymi, aktualnymi na dzień publikacji strony. Ostateczną cenę potwierdza Booksy.',
    '',
  ].join('\n');
}
