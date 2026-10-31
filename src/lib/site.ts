import { getEntry, getCollection, type CollectionEntry } from 'astro:content';

export type Settings = CollectionEntry<'settings'>['data'];

let cached: Settings | undefined;
export async function getSettings(): Promise<Settings> {
  if (cached) return cached;
  const entry = await getEntry('settings', 'site');
  if (!entry) throw new Error('Brak src/content/settings.yaml → klucz "site"');
  cached = entry.data;
  return cached;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Ścieżka wewnętrzna z prefiksem `base` (GitHub Pages) – `url('/cennik/')`. */
export function url(path = '/'): string {
  if (/^(https?:|mailto:|tel:|#)/.test(path)) return path;
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${clean}`;
}

/** Pełny adres absolutny (canonical, OG, JSON-LD). */
export function absoluteUrl(path: string, site: URL | undefined): string {
  return new URL(url(path), site ?? 'https://www.si-skin.pl').href;
}

/**
 * Link do Booksy z parametrami UTM – `placement` mówi, z którego miejsca
 * strony kliknięto (np. "hero", "cennik", "epilacja-shr"), co widać w GA4.
 */
export function bookingUrl(settings: Settings, placement: string): string {
  const u = new URL(settings.booking.url);
  u.searchParams.set('utm_source', settings.utm.source);
  u.searchParams.set('utm_medium', settings.utm.medium);
  u.searchParams.set('utm_campaign', settings.utm.campaign);
  u.searchParams.set('utm_content', placement);
  return u.href;
}

const plnFormatter = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 1270 → "1 270 zł", 191.2 → "191,20 zł" */
export function formatPrice(value: number): string {
  const hasFraction = Math.round(value * 100) % 100 !== 0;
  const text = hasFraction
    ? new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    : plnFormatter.format(value);
  return `${text.replace(/\u00a0|\u202f/g, '\u00a0')}\u00a0zł`;
}

export function applyDiscount(price: number, percent: number): number {
  return Math.round(price * (100 - percent)) / 100;
}

/** Czy promocja/rabat obowiązuje w dniu budowania strony. */
export function isActive(range: { validFrom?: Date; validUntil?: Date } | undefined, now = new Date()): boolean {
  if (!range) return true;
  if (range.validFrom && now < range.validFrom) return false;
  if (range.validUntil) {
    const end = new Date(range.validUntil);
    end.setHours(23, 59, 59, 999);
    if (now > end) return false;
  }
  return true;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export const CATEGORY_LABELS: Record<CollectionEntry<'services'>['data']['category'], string> = {
  laser: 'Laseroterapia',
  twarz: 'Zabiegi na twarz',
  estetyczna: 'Kosmetologia estetyczna & anti-aging',
};

export async function getServices() {
  const all = await getCollection('services');
  return all.sort((a, b) => a.data.order - b.data.order);
}

export async function getServicesByCategory() {
  const services = await getServices();
  return (Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((key) => ({
    key,
    label: CATEGORY_LABELS[key],
    items: services.filter((s) => s.data.category === key),
  }));
}

/** Najniższa cena w kategorii cennika (bez pozycji tekstowych). */
export function lowestPrice(category: CollectionEntry<'pricing'>['data']): number | undefined {
  const prices = category.groups.flatMap((g) => g.items.map((i) => i.price)).filter((p): p is number => typeof p === 'number');
  return prices.length ? Math.min(...prices) : undefined;
}

export function findPriceItem(categories: CollectionEntry<'pricing'>[], categoryId: string, itemName: string) {
  const cat = categories.find((c) => c.id === categoryId);
  const item = cat?.data.groups.flatMap((g) => g.items).find((i) => i.name === itemName);
  return cat && item ? { category: cat, item } : undefined;
}
