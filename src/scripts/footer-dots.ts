/**
 * Stopka: gigantyczne SISKIN jako siatka kropek (canvas) z „latarką” pod kursorem.
 *  - kształt liter = ścieżki z SVG w DOM (ten sam viewBox/przycięcie), próbkowane na offscreen canvas,
 *  - spoczynek: kropki liter tylko odrobinę ciemniejsze od tła stopki (tłoczenie),
 *  - w promieniu kursora (smoothstep) kropki liter robią się złote (jaśniejsze złoto w centrum),
 *    a w tle (poza literami) pojawiają się rzadkie, mrugające zielone kropki — gęściej przy kursorze,
 *  - rozmiar kropek stały, bez przesunięć,
 *  - dotyk: automatyczny „przejazd” światła po wejściu w widok + reakcja na dotyk/przeciąganie,
 *  - prefers-reduced-motion: statyczne litery w przygaszonym złocie, bez szumu,
 *  - lazy init (IntersectionObserver), rAF stoi poza ekranem i gdy wszystko wygaśnie.
 */

const stage = document.querySelector<HTMLElement>('[data-footer-dots]');
const canvas = stage?.querySelector<HTMLCanvasElement>('canvas.dots');
const svg = stage?.querySelector<SVGSVGElement>('svg');
const ctx = canvas?.getContext('2d');

if (stage && canvas && svg && ctx) init(stage, canvas, svg, ctx);

function init(
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  svg: SVGSVGElement,
  ctx: CanvasRenderingContext2D,
) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(hover: none)').matches;

  const BUCKETS = 12;
  const TOP = BUCKETS - 1;
  const SAMPLE = 4; // próbek na komórkę (na oś) przy odczycie kształtu
  const REST_BLACK_MIX = 0.25; // ile czerni domieszać do zieleni stopki w spoczynku
  const REDUCED_LEVEL = 0.6; // poziom „złota” liter przy reduced motion
  const NOISE_GREEN_ALPHA = 0.85;
  const NOISE_SAGE_ALPHA = 0.3;

  /* viewBox + ścieżki liter z SVG (transformacja grupy z logo.svg: translate(0,1027) scale(.1,-.1)) */
  const [vx, vy, vw, vh] = (svg.getAttribute('viewBox') ?? '0 0 1434 172').split(/\s+/).map(Number);
  const group = svg.querySelector('g');
  const groupTransform = group?.getAttribute('transform') ?? '';
  const tr = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/.exec(groupTransform);
  const sc = /scale\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/.exec(groupTransform);
  const gtx = tr ? Number(tr[1]) : 0;
  const gty = tr ? Number(tr[2]) : 0;
  const gsx = sc ? Number(sc[1]) : 1;
  const gsy = sc ? Number(sc[2]) : 1;
  const paths = [...svg.querySelectorAll('path')].map((p) => new Path2D(p.getAttribute('d') ?? ''));

  /* ---------- kolory z tokenów CSS ---------- */
  type RGB = [number, number, number];
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  function token(name: string): RGB {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!pctx || !v) return [0, 0, 0];
    pctx.clearRect(0, 0, 1, 1);
    pctx.fillStyle = v;
    pctx.fillRect(0, 0, 1, 1);
    const d = pctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }
  const mix = (a: RGB, b: RGB, t: number): RGB => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const css = (c: RGB) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

  let letterColors: string[] = [];
  let greenColor = '';
  let sageColor = '';
  function buildPalette() {
    const deep = token('--color-green-deep');
    const gold = token('--color-gold');
    const goldLight = token('--color-gold-light');
    const rest = mix(deep, [0, 0, 0], REST_BLACK_MIX);
    letterColors = [];
    for (let b = 0; b < BUCKETS; b++) {
      const t = b / TOP;
      let c = mix(rest, gold, Math.min(1, t * 1.15));
      if (t > 0.6) c = mix(c, goldLight, ((t - 0.6) / 0.4) * 0.7);
      letterColors.push(css(c));
    }
    greenColor = css(token('--color-green'));
    sageColor = css(token('--color-sage'));
  }

  /* ---------- stan siatki ---------- */
  let W = 0;
  let H = 0;
  let dpr = 1;
  let spacing = 5;
  let radius = 240; // promień latarki (px CSS)
  let n = 0;
  let bx = new Float32Array(0);
  let by = new Float32Array(0);
  let kind = new Uint8Array(0); // 0 = litera, 1 = szum zielony, 2 = szum szałwiowy
  let thr = new Float32Array(0); // próg pojawienia się (szum)
  let ph = new Float32Array(0); // faza mrugania
  let sp = new Float32Array(0); // prędkość mrugania (rad/s)
  let li = new Float32Array(0); // wygładzone oświetlenie 0..1
  let ef = new Float32Array(0); // efektywny poziom do rysowania (z mrugnięciem)

  /* Kursor / latarka */
  let px = 0; // pozycja docelowa (viewport)
  let py = 0;
  let hasPointer = false;
  let tx = 0; // wygładzona pozycja latarki (viewport)
  let ty = 0;
  let torchOn = false; // czy latarka ma być zapalona (jest wskaźnik / trwa przejazd)
  let releaseTimer = 0;
  let sweepStart = -1;
  const SWEEP_MS = 2600;

  let visible = false;
  let built = false;
  let raf = 0;
  let last = 0;

  /* ---------- budowa siatki ---------- */
  function build() {
    W = stage.clientWidth;
    if (!W) return;
    H = (W * vh) / vw;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    buildPalette();

    const target = Math.min(6, Math.max(3.5, W / 250));
    const cols = Math.max(1, Math.round(W / target));
    spacing = W / cols;
    const rows = Math.max(1, Math.round(H / spacing));
    radius = Math.min(280, Math.max(180, W * 0.22));

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    /* Próbkowanie kształtu: offscreen o rozdzielczości SAMPLE×SAMPLE na komórkę */
    const sw = cols * SAMPLE;
    const sh = rows * SAMPLE;
    const off = document.createElement('canvas');
    off.width = sw;
    off.height = sh;
    const octx = off.getContext('2d', { willReadFrequently: true });
    if (!octx) return;
    octx.setTransform(sw / vw, 0, 0, sh / vh, 0, 0);
    octx.translate(-vx, -vy);
    octx.translate(gtx, gty);
    octx.scale(gsx, gsy);
    octx.fillStyle = '#000';
    for (const p of paths) octx.fill(p);
    const data = octx.getImageData(0, 0, sw, sh).data;

    const bxl: number[] = [];
    const byl: number[] = [];
    const kl: number[] = [];
    const cellArea = SAMPLE * SAMPLE * 255;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let sum = 0;
        for (let sy = 0; sy < SAMPLE; sy++) {
          const rowOff = ((j * SAMPLE + sy) * sw + i * SAMPLE) * 4 + 3;
          for (let sx = 0; sx < SAMPLE; sx++) sum += data[rowOff + sx * 4];
        }
        const c = sum / cellArea;
        if (c > 0.35) {
          bxl.push((i + 0.5) * spacing);
          byl.push((j + 0.5) * spacing);
          kl.push(0);
        } else if (!reduced && c < 0.08) {
          /* tło: tylko komórki wyraźnie poza literami */
          bxl.push((i + 0.5) * spacing);
          byl.push((j + 0.5) * spacing);
          kl.push(Math.random() < 0.22 ? 2 : 1);
        }
      }
    }
    n = bxl.length;
    bx = Float32Array.from(bxl);
    by = Float32Array.from(byl);
    kind = Uint8Array.from(kl);
    thr = new Float32Array(n);
    ph = new Float32Array(n);
    sp = new Float32Array(n);
    li = new Float32Array(n);
    ef = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      /* próg: im wyższy, tym bliżej kursora dopiero kropka się pojawi → gęstość rośnie ku środkowi, zawsze rzadko */
      thr[k] = 0.3 + Math.random() * 2.4;
      ph[k] = Math.random() * Math.PI * 2;
      sp[k] = 1.5 + Math.random() * 3.5;
    }
    if (reduced) {
      li.fill(REDUCED_LEVEL);
      ef.fill(REDUCED_LEVEL);
    }
    built = true;
    stage.setAttribute('data-dots', '');
    draw();
  }

  /* ---------- rysowanie (kropki grupowane w koszyki kolor/alfa) ---------- */
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const r = spacing * 0.3;
    const letters: Path2D[] = [];
    const greens: Path2D[] = [];
    const sages: Path2D[] = [];
    for (let b = 0; b < BUCKETS; b++) {
      letters.push(new Path2D());
      greens.push(new Path2D());
      sages.push(new Path2D());
    }
    for (let k = 0; k < n; k++) {
      const b = Math.round(ef[k] * TOP);
      const x = bx[k];
      const y = by[k];
      const kd = kind[k];
      if (kd === 0) {
        letters[b].moveTo(x + r, y);
        letters[b].arc(x, y, r, 0, Math.PI * 2);
      } else if (b > 0) {
        const p = kd === 1 ? greens[b] : sages[b];
        p.moveTo(x + r, y);
        p.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    ctx.globalAlpha = 1;
    for (let b = 0; b < BUCKETS; b++) {
      ctx.fillStyle = letterColors[b];
      ctx.fill(letters[b]);
    }
    ctx.fillStyle = greenColor;
    for (let b = 1; b < BUCKETS; b++) {
      ctx.globalAlpha = (b / TOP) * NOISE_GREEN_ALPHA;
      ctx.fill(greens[b]);
    }
    ctx.fillStyle = sageColor;
    for (let b = 1; b < BUCKETS; b++) {
      ctx.globalAlpha = (b / TOP) * NOISE_SAGE_ALPHA;
      ctx.fill(sages[b]);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- animacja ---------- */
  function frame(now: number) {
    raf = 0;
    if (!visible || !built) return;
    const dt = Math.min(64, last ? now - last : 16.7);
    last = now;

    /* przejazd światła (dotyk) */
    const rect = canvas.getBoundingClientRect();
    if (sweepStart >= 0) {
      const t = (now - sweepStart) / SWEEP_MS;
      if (t >= 1) {
        sweepStart = -1;
        torchOn = false;
        hasPointer = false;
      } else {
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        px = rect.left - radius * 0.6 + e * (rect.width + radius * 1.2);
        py = rect.top + rect.height * 0.5;
        tx = px;
        ty = py;
        torchOn = true;
        hasPointer = true;
      }
    }

    /* wygładzenie pozycji latarki */
    const follow = 1 - Math.exp(-dt / 55);
    let torchMoving = false;
    if (torchOn) {
      if (Math.abs(px - tx) + Math.abs(py - ty) < 0.5) {
        tx = px;
        ty = py;
      } else {
        tx += (px - tx) * follow;
        ty += (py - ty) * follow;
        torchMoving = true;
      }
    }
    const lx = tx - rect.left;
    const ly = ty - rect.top;
    const R = radius;
    const R2 = R * R;
    /* latarka „świeci” tylko, gdy jej koło zahacza o napis – poza tym nic nie liczymy w pętli */
    const lit = torchOn && lx > -R && lx < W + R && ly > -R && ly < H + R;

    const kIn = 1 - Math.exp(-dt / 100);
    const kOut = 1 - Math.exp(-dt / 380);
    const time = now * 0.001;

    let active = false;
    for (let k = 0; k < n; k++) {
      let target = 0;
      if (lit) {
        const dx = bx[k] - lx;
        const dy = by[k] - ly;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const s = 1 - Math.sqrt(d2) / R;
          target = s * s * (3 - 2 * s); // smoothstep: miękki zanik do krawędzi
        }
      }
      const l = li[k];
      let nl = l + (target - l) * (target > l ? kIn : kOut);
      if (nl < 0.003 && target === 0) nl = 0;
      li[k] = nl;
      if (nl !== target && Math.abs(nl - target) > 0.004) active = true;

      if (nl === 0) {
        ef[k] = 0;
        continue;
      }
      const flick = 0.5 + 0.5 * Math.sin(time * sp[k] + ph[k]);
      if (kind[k] === 0) {
        ef[k] = nl * (1 - 0.2 * flick);
      } else {
        /* szum: pojawia się, gdy oświetlenie przekroczy indywidualny próg, i mruga */
        const a = (nl - thr[k]) / 0.12 + 1;
        const presence = a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a);
        ef[k] = presence * (0.4 + 0.6 * flick);
      }
    }

    draw();

    /* petla trwa, gdy latarka coś oświetla (mruganie), przesuwa się, trwa przejazd lub jeszcze gasną kropki */
    if (lit || active || torchMoving || sweepStart >= 0) {
      raf = requestAnimationFrame(frame);
    } else {
      last = 0;
    }
  }

  function wake() {
    if (!raf && visible && built && !reduced) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  /* ---------- wejścia: mysz / dotyk ---------- */
  function setPointer(e: PointerEvent) {
    if (sweepStart >= 0) sweepStart = -1;
    clearTimeout(releaseTimer);
    px = e.clientX;
    py = e.clientY;
    if (!torchOn || !hasPointer) {
      tx = px;
      ty = py;
    }
    hasPointer = true;
    torchOn = true;
    wake();
  }
  function release() {
    clearTimeout(releaseTimer);
    hasPointer = false;
    torchOn = false;
    wake();
  }
  function onUp(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(release, 700);
  }

  function listen() {
    window.addEventListener('pointermove', setPointer, { passive: true });
    window.addEventListener('pointerdown', setPointer, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('blur', release);
    document.documentElement.addEventListener('mouseleave', release);
  }
  function unlisten() {
    window.removeEventListener('pointermove', setPointer);
    window.removeEventListener('pointerdown', setPointer);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('scroll', wake);
    window.removeEventListener('blur', release);
    document.documentElement.removeEventListener('mouseleave', release);
  }

  /* ---------- widoczność + lazy init ---------- */
  function start() {
    build();
    new ResizeObserver(() => {
      if (stage.clientWidth && stage.clientWidth !== W) {
        build();
        wake();
      }
    }).observe(stage);
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        visible = entry.isIntersecting;
        if (visible) {
          if (!built) start();
          if (!reduced) {
            listen();
            wake();
          }
        } else if (!reduced) {
          unlisten();
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
          last = 0;
        }
      }
    },
    { rootMargin: '240px 0px' },
  );
  io.observe(stage);

  /* Dotyk: jednorazowy „przejazd” światła, gdy napis realnie wjedzie w widok */
  if (coarse && !reduced) {
    const sweepIO = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        sweepIO.disconnect();
        const go = () => {
          if (!built) return;
          sweepStart = performance.now();
          wake();
        };
        if (built) go();
        else setTimeout(go, 60);
      },
      { threshold: 0.35 },
    );
    sweepIO.observe(canvas);
  }
}
