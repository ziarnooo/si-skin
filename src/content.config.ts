import { defineCollection, reference } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Wszystkie treści strony żyją w `src/content/`.
 * Edytujesz je w panelu /admin (Sveltia CMS) albo bezpośrednio w plikach.
 * Schematy poniżej pilnują, żeby literówka w danych nie zepsuła strony –
 * build zatrzyma się z czytelnym błędem zamiast opublikować uszkodzoną treść.
 */

const faqItem = z.object({ q: z.string(), a: z.string() });

/** Zabiegi – każdy plik .md to osobna podstrona (adres = nazwa pliku). */
const services = defineCollection({
  loader: glob({ base: './src/content/services', pattern: '*.md' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      navTitle: z.string(),
      category: z.enum(['laser', 'twarz', 'estetyczna']),
      order: z.number(),
      featured: z.boolean().default(false),
      seo: z.object({ title: z.string(), description: z.string() }),
      excerpt: z.string(),
      lead: z.string(),
      image: image(),
      imageAlt: z.string(),
      gallery: z.array(z.object({ src: image(), alt: z.string() })).default([]),
      priceFrom: z.number().optional(),
      priceLabel: z.string().optional(),
      duration: z.string().optional(),
      pricing: z.array(reference('pricing')).default([]),
      highlights: z.array(z.string()).default([]),
      sessions: z
        .object({ count: z.string(), interval: z.string(), note: z.string().optional() })
        .optional(),
      details: z
        .array(
          z.object({
            title: z.string(),
            text: z.string().optional(),
            items: z.array(z.string()).default([]),
          }),
        )
        .default([]),
      faq: z.array(faqItem).default([]),
      notice: z.string().optional(),
      video: z.object({ id: z.string(), title: z.string() }).optional(),
    }),
});

const priceItem = z.object({
  name: z.string(),
  price: z.number().optional(),
  priceText: z.string().optional(),
  duration: z.string().optional(),
  note: z.string().optional(),
});

/** Cennik – kategorie w kolejności `order`. Ceny w zł brutto (liczby). */
const pricing = defineCollection({
  loader: file('src/content/pricing.yaml'),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    service: z.string().optional(),
    intro: z.string().optional(),
    note: z.string().optional(),
    discount: z
      .object({
        percent: z.number().min(1).max(90),
        upTo: z.boolean().default(false),
        label: z.string(),
        validUntil: z.coerce.date().optional(),
      })
      .optional(),
    groups: z.array(z.object({ title: z.string().optional(), items: z.array(priceItem) })),
  }),
});

/** Promocje – rabat liczony automatycznie na przykładowej cenie z cennika. */
const promotions = defineCollection({
  loader: file('src/content/promotions.yaml'),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    badge: z.string(),
    percent: z.number().optional(),
    summary: z.string(),
    steps: z.array(z.string()).default([]),
    terms: z.array(z.string()).default([]),
    example: z
      .object({ category: z.string(), item: z.string() })
      .optional(),
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().optional(),
    highlight: z.boolean().default(false),
  }),
});

const team = defineCollection({
  loader: file('src/content/team.yaml'),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.string(),
      order: z.number(),
      specializations: z.array(z.string()).default([]),
      bio: z.string().optional(),
      photo: image().optional(),
      photoAlt: z.string().optional(),
    }),
});

const reviews = defineCollection({
  loader: file('src/content/reviews.yaml'),
  schema: z.object({
    author: z.string(),
    text: z.string(),
    service: z.string().optional(),
    rating: z.number().min(1).max(5).default(5),
    source: z.enum(['Booksy', 'Google', 'Facebook']).default('Booksy'),
    featured: z.boolean().default(false),
  }),
});

const faq = defineCollection({
  loader: file('src/content/faq.yaml'),
  schema: z.object({
    category: z.enum(['pierwsza-wizyta', 'depilacja', 'promocje', 'ogolne', 'karty']),
    order: z.number(),
    q: z.string(),
    a: z.string(),
  }),
});

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '*.md' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      image: image(),
      imageAlt: z.string(),
      service: z.string().optional(),
      draft: z.boolean().default(false),
    }),
});

/** Strony prawne / proste podstrony tekstowe. */
const pages = defineCollection({
  loader: glob({ base: './src/content/pages', pattern: '*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    updatedDate: z.coerce.date().optional(),
  }),
});

/** Ustawienia globalne (kontakt, godziny, social media, rezerwacje, analityka). */
const settings = defineCollection({
  loader: file('src/content/settings.yaml'),
  schema: z.object({
    name: z.string(),
    legalName: z.string(),
    tagline: z.string(),
    description: z.string(),
    phone: z.string(),
    phoneHref: z.string(),
    email: z.string(),
    address: z.object({
      street: z.string(),
      postalCode: z.string(),
      city: z.string(),
      district: z.string().optional(),
      lat: z.number(),
      lng: z.number(),
    }),
    mapsUrl: z.string().url(),
    hours: z.array(z.object({ days: z.string(), open: z.string().optional(), close: z.string().optional(), closed: z.boolean().default(false), schema: z.array(z.string()) })),
    booking: z.object({ url: z.string().url(), label: z.string() }),
    rating: z.object({ value: z.number(), count: z.number(), source: z.string(), url: z.string().url(), checkedAt: z.coerce.date() }),
    social: z.object({ instagram: z.string().url(), instagramHandle: z.string(), facebook: z.string().url(), youtube: z.string().url().optional() }),
    analytics: z.object({
      productionHost: z.string(),
      ga4: z.string().optional(),
      metaPixel: z.string().optional(),
    }),
    utm: z.object({ source: z.string(), medium: z.string(), campaign: z.string() }),
  }),
});

export const collections = { services, pricing, promotions, team, reviews, faq, blog, pages, settings };
