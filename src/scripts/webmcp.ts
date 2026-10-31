/**
 * WebMCP: jeśli przeglądarka udostępnia `modelContext`, rejestrujemy kilka narzędzi
 * tylko do odczytu (usługi, ceny, kontakt, link do rezerwacji). Dane pochodzą z /api/site.json
 * (generowanego przy buildzie), pobieranego dopiero w czasie bezczynności.
 * Brak wsparcia w przeglądarce = ten plik nic nie robi.
 */

interface ToolResult {
  content: { type: 'text'; text: string }[];
}

interface ModelTool {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<ToolResult> | ToolResult;
}

interface ModelContext {
  registerTool?: (tool: ModelTool) => unknown;
}

interface SiteData {
  contact: unknown;
  hours: unknown;
  booking: unknown;
  services: unknown[];
  pricing: { id: string; title: string; serviceSlug: string | null }[];
}

const text = (data: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const none = { type: 'object', properties: {}, additionalProperties: false };

function findModelContext(): ModelContext | undefined {
  const doc = document as Document & { modelContext?: ModelContext };
  const nav = navigator as Navigator & { modelContext?: ModelContext };
  return [doc.modelContext, nav.modelContext].find((ctx) => typeof ctx?.registerTool === 'function');
}

async function register(modelContext: ModelContext, siteJsonUrl: string): Promise<void> {
  const response = await fetch(siteJsonUrl);
  if (!response.ok) return;
  const data = (await response.json()) as SiteData;
  const readOnly = { readOnlyHint: true };

  const tools: ModelTool[] = [
    {
      name: 'get_services',
      description: 'Lista zabiegów gabinetu Si Skin we Wrocławiu (nazwa, kategoria, czas, cena od, adres podstrony).',
      inputSchema: none,
      annotations: readOnly,
      execute: () => text(data.services),
    },
    {
      name: 'get_prices',
      description: 'Cennik zabiegów w PLN brutto. Opcjonalnie tylko jedna kategoria (identyfikator, nazwa lub slug zabiegu).',
      inputSchema: {
        type: 'object',
        properties: { category: { type: 'string', description: 'np. epilacja-shr, zamykanie-naczynek albo fragment nazwy' } },
        additionalProperties: false,
      },
      annotations: readOnly,
      execute: ({ category }) => {
        const query = typeof category === 'string' ? category.trim().toLowerCase() : '';
        const pricing = query
          ? data.pricing.filter((c) => [c.id, c.title, c.serviceSlug ?? ''].some((v) => v.toLowerCase().includes(query)))
          : data.pricing;
        return text(pricing);
      },
    },
    {
      name: 'get_contact_and_hours',
      description: 'Adres, telefon, e-mail, media społecznościowe i godziny otwarcia gabinetu.',
      inputSchema: none,
      annotations: readOnly,
      execute: () => text({ contact: data.contact, hours: data.hours }),
    },
    {
      name: 'get_booking_link',
      description: 'Link do rezerwacji wizyty online w Booksy oraz telefon. Rezerwacji nie da się dokonać z poziomu narzędzia — użytkownik finalizuje ją w Booksy.',
      inputSchema: none,
      annotations: readOnly,
      execute: () => text(data.booking),
    },
  ];

  for (const tool of tools) modelContext.registerTool!(tool);
}

const modelContext = findModelContext();
const siteJsonUrl = (() => {
  try {
    return JSON.parse(document.getElementById('si-config')?.textContent ?? '{}').siteJson as string | undefined;
  } catch {
    return undefined;
  }
})();

if (modelContext && siteJsonUrl) {
  const run = () => void register(modelContext, siteJsonUrl).catch(() => undefined);
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}
