import { getCollection, type CollectionEntry } from 'astro:content';
import { formatPrice, lowestPrice } from '../../lib/site';

export type Service = CollectionEntry<'services'>;

/** Najniższa cena zabiegu: `priceFrom` z opisu zabiegu, a gdy go brak – najniższa pozycja pierwszej kategorii cennika. */
export async function servicePriceFrom(service: Service): Promise<number | undefined> {
  if (service.data.priceFrom !== undefined) return service.data.priceFrom;
  const first = service.data.pricing[0];
  if (!first) return undefined;
  const categories = await getCollection('pricing');
  const category = categories.find((c) => c.id === first.id);
  return category ? lowestPrice(category.data) : undefined;
}

/** „od 129 zł” albo własna etykieta z `priceLabel`. */
export async function servicePriceText(service: Service): Promise<string | undefined> {
  if (service.data.priceLabel) return service.data.priceLabel;
  const from = await servicePriceFrom(service);
  return from === undefined ? undefined : `od\u00a0${formatPrice(from)}`;
}

/** Polska odmiana: 1 opinia, 2–4 opinie, 5+ opinii. */
export function pluralOpinions(n: number): string {
  if (n === 1) return 'opinia';
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? 'opinie' : 'opinii';
}
