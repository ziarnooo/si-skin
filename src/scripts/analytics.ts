/**
 * Analityka: GA4 + Meta Pixel – ładowane leniwie, tylko na domenie produkcyjnej
 * (settings.analytics.productionHost) i tylko po zgodzie użytkownika.
 * Konfiguracja przychodzi z Astro przez <script type="application/json" id="si-config">,
 * nic nie jest zaszyte w kodzie.
 */

export interface AnalyticsConfig {
  productionHost: string;
  ga4?: string;
  metaPixel?: string;
}

export interface ConsentState {
  analytics: boolean;
  marketing: boolean;
}

type Gtag = (...args: unknown[]) => void;
type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[][]; loaded?: boolean; version?: string; push?: unknown };

interface AnalyticsWindow extends Window {
  dataLayer?: unknown[];
  gtag?: Gtag;
  fbq?: Fbq;
  _fbq?: Fbq;
  [key: `ga-disable-${string}`]: boolean | undefined;
}

const w = window as unknown as AnalyticsWindow;

let config: AnalyticsConfig | undefined;
let state: ConsentState = { analytics: false, marketing: false };
let gaLoaded = false;
let pixelLoaded = false;
let listening = false;

function isProduction(): boolean {
  return !!config && location.hostname === config.productionHost;
}

function loadScript(src: string): void {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

/** gtag.js wymaga `arguments` w dataLayer, a nie zwykłej tablicy. */
function ensureGtag(): Gtag {
  if (w.gtag) return w.gtag;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  // Consent Mode v2 – wszystko domyślnie odrzucone, zanim cokolwiek się załaduje.
  w.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500,
  });
  return w.gtag;
}

function consentMode(s: ConsentState) {
  return {
    analytics_storage: s.analytics ? 'granted' : 'denied',
    ad_storage: s.marketing ? 'granted' : 'denied',
    ad_user_data: s.marketing ? 'granted' : 'denied',
    ad_personalization: s.marketing ? 'granted' : 'denied',
  };
}

function deleteCookies(prefixes: string[]): void {
  const hosts = [location.hostname, `.${location.hostname}`, `.${location.hostname.replace(/^www\./, '')}`];
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (!name || !prefixes.some((p) => name.startsWith(p))) continue;
    for (const domain of hosts) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}`;
    }
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

function startGa(id: string): void {
  const gtag = ensureGtag();
  gtag('consent', 'update', consentMode(state));
  if (!gaLoaded) {
    gaLoaded = true;
    gtag('js', new Date());
    gtag('config', id);
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
  }
}

function startPixel(id: string): void {
  if (pixelLoaded) {
    w.fbq?.('consent', 'grant');
    return;
  }
  pixelLoaded = true;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.push = fbq;
  w.fbq = w._fbq = fbq;
  loadScript('https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', id);
  fbq('track', 'PageView');
}

/** Wołane przy starcie strony i po każdej zmianie zgody. */
export function applyConsent(next: ConsentState): void {
  const prev = state;
  state = next;
  if (!isProduction() || !config) return;

  if (config.ga4) {
    if (next.analytics) startGa(config.ga4);
    else if (gaLoaded || prev.analytics) {
      w.gtag?.('consent', 'update', consentMode(next));
      w[`ga-disable-${config.ga4}`] = true;
      deleteCookies(['_ga', '_gid', '_gat']);
    }
    if (next.analytics && gaLoaded) w[`ga-disable-${config.ga4}`] = false;
  }

  if (config.metaPixel) {
    if (next.marketing) startPixel(config.metaPixel);
    else if (pixelLoaded) {
      w.fbq?.('consent', 'revoke');
      deleteCookies(['_fbp', '_fbc']);
    }
  }
}

function onClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;

  const booking = event.target.closest<HTMLAnchorElement>('a[data-booking]');
  if (booking) {
    if (state.analytics && w.gtag) {
      w.gtag('event', 'booking_click', {
        placement: booking.dataset.booking,
        service: booking.dataset.service,
        link_url: booking.href,
        transport_type: 'beacon',
      });
    }
    if (state.marketing && w.fbq) w.fbq('track', 'Schedule');
    return;
  }

  const contact = event.target.closest<HTMLAnchorElement>('a[href^="tel:"], a[href^="mailto:"]');
  if (contact && state.analytics && w.gtag) {
    w.gtag('event', 'contact_click', {
      contact_type: contact.protocol === 'tel:' ? 'phone' : 'email',
      link_url: contact.getAttribute('href'),
      transport_type: 'beacon',
    });
  }
}

/** Rejestruje delegowane śledzenie kliknięć (nic nie wysyła bez zgody). */
export function initAnalytics(cfg: AnalyticsConfig): void {
  config = cfg;
  if (!isProduction() || listening) return;
  listening = true;
  document.addEventListener('click', onClick, { passive: true });
}
