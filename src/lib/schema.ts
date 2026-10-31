import type { CollectionEntry } from 'astro:content';
import { absoluteUrl, isoDate, type Settings } from './site';

/**
 * Dane strukturalne (JSON-LD) dla Google i agentów AI.
 * Wszystkie funkcje zwracają zwykłe obiekty z `@context` — wrzucamy je do `jsonLd` w <Base>.
 * Celowo NIE dodajemy `aggregateRating` do LocalBusiness: opinie z Booksy publikujemy
 * jako treść strony, ale Google traktuje własne oceny firmy jako "self-serving".
 */

const CONTEXT = 'https://schema.org';

/** Ścieżka obrazka OG dla danej strony: '/' → /og/index.png, '/cennik/' → /og/cennik.png */
export function ogImagePath(path: string): string {
  const slug = path.replace(/^\/+|\/+$/g, '');
  return `/og/${slug || 'index'}.png`;
}

export function businessId(site?: URL): string {
  return `${absoluteUrl('/', site)}#salon`;
}

export function localBusinessSchema(settings: Settings, site?: URL, options: { priceRange?: string } = {}) {
  const sameAs = [settings.social.instagram, settings.social.facebook, settings.booking.url];

  const openingHoursSpecification = settings.hours
    .filter((h) => !h.closed && h.open && h.close)
    .map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h.schema,
      opens: h.open,
      closes: h.close,
    }));

  return {
    '@context': CONTEXT,
    '@type': 'BeautySalon',
    '@id': businessId(site),
    name: settings.name,
    legalName: settings.legalName,
    description: settings.description,
    slogan: settings.tagline,
    url: absoluteUrl('/', site),
    image: absoluteUrl(ogImagePath('/'), site),
    logo: absoluteUrl('/favicon.svg', site),
    telephone: settings.phoneHref,
    email: settings.email,
    priceRange: options.priceRange ?? '$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: settings.address.street,
      postalCode: settings.address.postalCode,
      addressLocality: settings.address.city,
      addressCountry: 'PL',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: settings.address.lat,
      longitude: settings.address.lng,
    },
    openingHoursSpecification,
    hasMap: settings.mapsUrl,
    areaServed: { '@type': 'City', name: settings.address.city },
    sameAs,
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[], site?: URL) {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path, site),
    })),
  };
}

export function faqSchema(items: { q: string; a: string }[]) {
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export function serviceSchema(
  service: CollectionEntry<'services'>,
  offers: { name: string; price?: number }[],
  site?: URL,
) {
  const path = `/${service.id}/`;
  return {
    '@context': CONTEXT,
    '@type': 'Service',
    '@id': `${absoluteUrl(path, site)}#service`,
    name: service.data.title,
    serviceType: service.data.navTitle,
    description: service.data.seo.description,
    url: absoluteUrl(path, site),
    image: absoluteUrl(ogImagePath(path), site),
    provider: { '@id': businessId(site) },
    areaServed: { '@type': 'City', name: 'Wrocław' },
    offers: offers.map((offer) => ({
      '@type': 'Offer',
      name: offer.name,
      priceCurrency: 'PLN',
      ...(typeof offer.price === 'number' ? { price: offer.price } : {}),
      url: absoluteUrl(path, site),
    })),
  };
}

export function articleSchema(post: CollectionEntry<'blog'>, site?: URL) {
  const path = `/blog/${post.id}/`;
  return {
    '@context': CONTEXT,
    '@type': 'Article',
    headline: post.data.title,
    description: post.data.description,
    url: absoluteUrl(path, site),
    mainEntityOfPage: absoluteUrl(path, site),
    image: absoluteUrl(ogImagePath(path), site),
    datePublished: isoDate(post.data.pubDate),
    dateModified: isoDate(post.data.updatedDate ?? post.data.pubDate),
    inLanguage: 'pl-PL',
    author: { '@type': 'Organization', '@id': businessId(site), name: 'Si Skin', url: absoluteUrl('/', site) },
    publisher: { '@type': 'Organization', '@id': businessId(site), name: 'Si Skin', url: absoluteUrl('/', site) },
  };
}
