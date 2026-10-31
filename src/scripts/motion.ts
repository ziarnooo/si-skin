/**
 * Ruch strony – vanilla, bez zależności.
 *  - [data-reveal] / [data-inview]  → klasa .is-in (raz), [data-stagger] układa kolejność
 *  - html[data-scrolled]            → stan nagłówka po przewinięciu
 *  - html[data-past-hero]           → pasek mobilny (po przewinięciu pierwszego ekranu)
 *  - html[data-footer-visible]      → pasek mobilny chowa się przy stopce
 *  - [data-magnetic]                → delikatne „przyciąganie” (tylko mysz, max 6 px)
 *  - [data-tilt]                    → pochylenie karty za kursorem (max 6°)
 *  - [data-mouse-parallax]          → warstwy [data-depth] przesuwane za kursorem
 *  - [data-scroll-progress]         → zmienna --scroll (0→1) w trakcie przewijania
 *  - [data-words]                   → tekst dzielony na słowa, które „zapalają się” ze scrollem
 * Wszystko poza odsłanianiem i stanami nagłówka wyłączone przy prefers-reduced-motion.
 */

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => Array.from(document.querySelectorAll<T>(sel));

/* ── Odsłanianie ─────────────────────────────────────────────── */
function initReveal() {
  for (const parent of $$('[data-stagger]')) {
    const step = Number(parent.dataset.stagger) || 1;
    let i = 0;
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.hasAttribute('data-reveal') && !child.style.getPropertyValue('--i')) {
        child.style.setProperty('--i', String(i * step));
      }
      i++;
    }
  }

  const targets = $$('[data-reveal], [data-inview]');
  if (!targets.length) return;
  if (reduced || !('IntersectionObserver' in window)) {
    for (const el of targets) el.classList.add('is-in');
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  for (const el of targets) io.observe(el);
}

/* ── Stany globalne zależne od scrolla ───────────────────────── */
function initScrollState() {
  let heroEnd = Math.min(innerHeight * 0.8, 720);
  let ticking = false;

  const apply = () => {
    ticking = false;
    const y = scrollY;
    root.toggleAttribute('data-scrolled', y > 12);
    root.toggleAttribute('data-past-hero', y > heroEnd);
  };
  addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    },
    { passive: true },
  );
  addEventListener(
    'resize',
    () => {
      heroEnd = Math.min(innerHeight * 0.8, 720);
    },
    { passive: true },
  );
  apply();

  const footer = document.querySelector('[data-site-footer]');
  if (footer && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      root.toggleAttribute('data-footer-visible', entry.isIntersecting);
    }).observe(footer);
  }
}

/* ── Zmienna --scroll + słowa ────────────────────────────────── */
function splitWords(el: HTMLElement) {
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return;
  const words = text.split(' ');
  const frag = document.createDocumentFragment();
  words.forEach((word, k) => {
    const span = document.createElement('span');
    span.className = 'w';
    span.style.setProperty('--k', String(k));
    span.textContent = word;
    frag.append(span, k < words.length - 1 ? ' ' : '');
  });
  el.textContent = '';
  el.append(frag);
  el.style.setProperty('--n', String(words.length));
  el.setAttribute('data-words-ready', '');
}

function initScrollProgress() {
  if (reduced) return;
  for (const el of $$('[data-words]')) {
    splitWords(el);
    el.setAttribute('data-scroll-progress', '');
  }
  const els = $$('[data-scroll-progress]');
  if (!els.length || !('IntersectionObserver' in window)) return;

  const visible = new Set<HTMLElement>();
  let ticking = false;

  const update = () => {
    ticking = false;
    const vh = innerHeight;
    // odczyty → zapisy w osobnych pętlach (bez layout thrash)
    const reads: Array<[HTMLElement, number]> = [];
    for (const el of visible) {
      const r = el.getBoundingClientRect();
      const start = vh * 0.9;
      const end = vh * 0.4;
      reads.push([el, clamp((start - r.top) / (start - end + r.height))]);
    }
    for (const [el, p] of reads) el.style.setProperty('--scroll', p.toFixed(3));
  };
  const request = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) visible.add(el);
        else {
          visible.delete(el);
          // zamroź na wartości skrajnej, gdy element wyjechał górą/dołem
          el.style.setProperty('--scroll', e.boundingClientRect.top < 0 ? '1' : '0');
        }
      }
      request();
    },
    { rootMargin: '10% 0px 10% 0px' },
  );
  for (const el of els) {
    el.style.setProperty('--scroll', '0');
    io.observe(el);
  }
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request, { passive: true });
}

/* ── Interakcje z kursorem (tylko mysz) ──────────────────────── */
function initMagnetic() {
  const MAX = 6;
  for (const el of $$('[data-magnetic]')) {
    let rect: DOMRect | null = null;
    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    let raf = 0;

    const tick = () => {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      el.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
      if (Math.abs(tx - x) > 0.05 || Math.abs(ty - y) > 0.05) raf = requestAnimationFrame(tick);
      else {
        raf = 0;
        if (tx === 0 && ty === 0) el.style.removeProperty('translate');
      }
    };
    const run = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      // rect bazowy – bez aktualnego przesunięcia
      rect = new DOMRect(r.left - x, r.top - y, r.width, r.height);
    });
    el.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse' || !rect) return;
        const nx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
        const ny = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
        tx = clamp(nx, -1, 1) * MAX;
        ty = clamp(ny, -1, 1) * MAX * 0.8;
        run();
      },
      { passive: true },
    );
    el.addEventListener('pointerleave', () => {
      rect = null;
      tx = 0;
      ty = 0;
      run();
    });
  }
}

function initTilt() {
  const MAX = 6;
  for (const el of $$('[data-tilt]')) {
    let rect: DOMRect | null = null;
    let rx = 0;
    let ry = 0;
    let trx = 0;
    let try_ = 0;
    let raf = 0;

    const tick = () => {
      rx += (trx - rx) * 0.14;
      ry += (try_ - ry) * 0.14;
      el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      if (Math.abs(trx - rx) > 0.02 || Math.abs(try_ - ry) > 0.02) raf = requestAnimationFrame(tick);
      else {
        raf = 0;
        if (trx === 0 && try_ === 0) el.style.removeProperty('transform');
      }
    };
    const run = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      rect = el.getBoundingClientRect();
      el.style.willChange = 'transform';
    });
    el.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse' || !rect) return;
        const nx = clamp((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = clamp((e.clientY - rect.top) / rect.height) * 2 - 1;
        try_ = nx * MAX;
        trx = -ny * MAX;
        el.style.setProperty('--mx', `${((nx + 1) * 50).toFixed(1)}%`);
        el.style.setProperty('--my', `${((ny + 1) * 50).toFixed(1)}%`);
        run();
      },
      { passive: true },
    );
    el.addEventListener('pointerleave', () => {
      rect = null;
      trx = 0;
      try_ = 0;
      run();
      el.style.removeProperty('will-change');
    });
  }
}

function initMouseParallax() {
  for (const box of $$('[data-mouse-parallax]')) {
    const strength = Number(box.dataset.mouseParallax) || 16;
    const layers = Array.from(box.querySelectorAll<HTMLElement>('[data-depth]')).map((el) => ({
      el,
      depth: Number(el.dataset.depth) || 0.5,
      x: 0,
      y: 0,
    }));
    if (!layers.length) continue;

    let rect: DOMRect | null = null;
    let nx = 0;
    let ny = 0;
    let raf = 0;
    let inView = false;

    new IntersectionObserver(([e]) => (inView = e.isIntersecting)).observe(box);

    const tick = () => {
      let moving = false;
      for (const l of layers) {
        const gx = -nx * strength * l.depth;
        const gy = -ny * strength * l.depth;
        l.x += (gx - l.x) * 0.08;
        l.y += (gy - l.y) * 0.08;
        l.el.style.translate = `${l.x.toFixed(2)}px ${l.y.toFixed(2)}px`;
        if (Math.abs(gx - l.x) > 0.05 || Math.abs(gy - l.y) > 0.05) moving = true;
      }
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    const run = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    box.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') rect = box.getBoundingClientRect();
    });
    box.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse' || !rect || !inView) return;
        nx = clamp((e.clientX - rect.left) / rect.width) * 2 - 1;
        ny = clamp((e.clientY - rect.top) / rect.height) * 2 - 1;
        run();
      },
      { passive: true },
    );
    box.addEventListener('pointerleave', () => {
      rect = null;
      nx = 0;
      ny = 0;
      run();
    });
  }
}

/* ── Start ───────────────────────────────────────────────────── */
initReveal();
initScrollState();
if (!reduced) {
  initScrollProgress();
  if (finePointer) {
    initMagnetic();
    initTilt();
    initMouseParallax();
  }
}
