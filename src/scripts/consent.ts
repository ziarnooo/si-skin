/**
 * Zgody na cookies: baner wstrzykiwany dopiero po załadowaniu strony (nie wpływa na LCP),
 * wybór zapisany w localStorage z wersją (zmiana CONSENT_VERSION = pytamy ponownie).
 * Każdy element z `[data-consent-open]` otwiera ustawienia ponownie.
 */
import { applyConsent, initAnalytics, type AnalyticsConfig, type ConsentState } from './analytics';

const STORAGE_KEY = 'siskin-consent';
const CONSENT_VERSION = 1;

interface StoredConsent extends ConsentState {
  v: number;
  ts: number;
}

function readConsent(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredConsent;
    return data.v === CONSENT_VERSION ? data : null;
  } catch {
    return null;
  }
}

function saveConsent(state: ConsentState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: CONSENT_VERSION, ts: Date.now(), ...state }));
  } catch {
    /* tryb prywatny / zablokowany storage – wybór obowiązuje do końca wizyty */
  }
}

function readConfig(): { analytics?: AnalyticsConfig } {
  const el = document.getElementById('si-config');
  try {
    return el?.textContent ? JSON.parse(el.textContent) : {};
  } catch {
    return {};
  }
}

const config = readConfig();
let current: ConsentState = readConsent() ?? { analytics: false, marketing: false };
let root: HTMLElement | null = null;
let opener: HTMLElement | null = null;

function closeBanner(restoreFocus: boolean): void {
  if (!root) return;
  const el = root;
  root = null;
  el.classList.remove('is-in');
  window.setTimeout(() => el.remove(), 260);
  if (restoreFocus && opener?.isConnected) opener.focus();
  opener = null;
}

function choose(state: ConsentState): void {
  current = state;
  saveConsent(state);
  applyConsent(state);
  closeBanner(true);
}

function showBanner(view: 'main' | 'settings', focus: boolean): void {
  if (root) return;
  const template = document.getElementById('consent-template') as HTMLTemplateElement | null;
  const el = template?.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
  if (!el) return;

  const main = el.querySelector<HTMLElement>('[data-consent-view="main"]')!;
  const settings = el.querySelector<HTMLElement>('[data-consent-view="settings"]')!;
  const analytics = el.querySelector<HTMLInputElement>('input[name="analytics"]')!;
  const marketing = el.querySelector<HTMLInputElement>('input[name="marketing"]')!;
  analytics.checked = current.analytics;
  marketing.checked = current.marketing;

  const focusables = {
    main: () => el.querySelector<HTMLElement>('[data-consent="settings"]'),
    settings: () => settings.querySelector<HTMLElement>('input:not(:disabled)'),
  };
  const setView = (name: 'main' | 'settings') => {
    main.hidden = name !== 'main';
    settings.hidden = name !== 'settings';
    focusables[name]()?.focus();
  };

  el.addEventListener('click', (event) => {
    const action = (event.target as Element).closest<HTMLElement>('[data-consent]')?.dataset.consent;
    if (action === 'all') choose({ analytics: true, marketing: true });
    else if (action === 'necessary') choose({ analytics: false, marketing: false });
    else if (action === 'save') choose({ analytics: analytics.checked, marketing: marketing.checked });
    else if (action === 'settings') setView('settings');
    else if (action === 'back') setView('main');
  });

  el.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && readConsent()) closeBanner(true);
  });

  main.hidden = view !== 'main';
  settings.hidden = view !== 'settings';
  document.body.appendChild(el);
  // Dwie klatki: najpierw element w DOM, potem klasa – dzięki temu działa przejście.
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
  root = el;
  if (focus) focusables[view]()?.focus({ preventScroll: true });
}

function whenIdle(fn: () => void): void {
  const run = () => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 600));
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}

if (config.analytics) initAnalytics(config.analytics);

const stored = readConsent();
if (stored) applyConsent(stored);
else whenIdle(() => showBanner('main', false));

document.addEventListener('click', (event) => {
  const trigger = (event.target as Element).closest<HTMLElement>('[data-consent-open]');
  if (!trigger) return;
  event.preventDefault();
  if (root) return;
  opener = trigger;
  showBanner('settings', true);
});
