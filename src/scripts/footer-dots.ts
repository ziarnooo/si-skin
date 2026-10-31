/**
 * Stopka: gigantyczne SISKIN jako siatka kropek (canvas) z „latarką” pod kursorem.
 *  - kształt liter = ścieżki z SVG w DOM (ten sam viewBox/przycięcie), próbkowane na offscreen canvas,
 *  - w spoczynku kropki są blade; w promieniu kursora rozjaśniają się, rosną i lekko odpychają się sprężyną,
 *  - dotyk: automatyczny „przejazd” światła po wejściu w widok + reakcja na dotyk/przeciąganie,
 *  - prefers-reduced-motion: statyczne, w pełni odsłonięte kropki,
 *  - lazy init (IntersectionObserver), rAF stoi poza ekranem i gdy sprężyny się uspokoją.
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

  const REST_ALPHA = 0.2;
  const BUCKETS = 10;
  const SAMPLE = 4; // próbek na komórkę (na oś) przy odczycie kształtu

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

  /* Stan siatki */
  let W = 0;
  let H = 0;
  let dpr = 1;
  let spacing = 5;
  let radius = 240; // promień latarki (px CSS)
  let n = 0;
  let bx = new Float32Array(0);
  let by = new Float32Array(0);
  let cov = new Float32Array(0);
  let ox = new Float32Array(0);
  let oy = new Float32Array(0);
  let vxs = new Float32Array(0);
  let vys = new Float32Array(0);
  let li = new Float32Array(0);
  let color = '#b08d52';

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
    color = getComputedStyle(stage).color || color;

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
    const cvl: number[] = [];
    const cellArea = SAMPLE * SAMPLE * 255;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let sum = 0;
        for (let sy = 0; sy < SAMPLE; sy++) {
          const rowOff = ((j * SAMPLE + sy) * sw + i * SAMPLE) * 4 + 3;
          for (let sx = 0; sx < SAMPLE; sx++) sum += data[rowOff + sx * 4];
        }
        const c = sum / cellArea;
        if (c > 0.28) {
          bxl.push((i + 0.5) * spacing);
          byl.push((j + 0.5) * spacing);
          cvl.push(Math.min(1, 0.55 + c * 0.6));
        }
      }
    }
    n = bxl.length;
    bx = Float32Array.from(bxl);
    by = Float32Array.from(byl);
    cov = Float32Array.from(cvl);
    ox = new Float32Array(n);
    oy = new Float32Array(n);
    vxs = new Float32Array(n);
    vys = new Float32Array(n);
    li = new Float32Array(n);
    if (reduced) li.fill(1);
    built = true;
    stage.setAttribute('data-dots', '');
    draw();
  }

  /* ---------- rysowanie ---------- */
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = color;
    const r0 = spacing * 0.27;
    const paths: Path2D[] = [];
    for (let b = 0; b < BUCKETS; b++) paths.push(new Path2D());
    const top = BUCKETS - 1;
    for (let k = 0; k < n; k++) {
      const l = li[k];
      const b = Math.min(top, Math.round(l * top));
      const r = r0 * cov[k] * (1 + 0.5 * l);
      const x = bx[k] + ox[k];
      const y = by[k] + oy[k];
      paths[b].moveTo(x + r, y);
      paths[b].arc(x, y, r, 0, Math.PI * 2);
    }
    for (let b = 0; b < BUCKETS; b++) {
      ctx.globalAlpha = REST_ALPHA + (1 - REST_ALPHA) * (b / top);
      ctx.fill(paths[b]);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- animacja ---------- */
  function frame(now: number) {
    raf = 0;
    if (!visible || !built) return;
    const dt = Math.min(64, last ? now - last : 16.7);
    last = now;
    const f = dt / 16.667;

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
    if (torchOn) {
      if (Math.abs(px - tx) + Math.abs(py - ty) < 0.5) {
        tx = px;
        ty = py;
      } else {
        tx += (px - tx) * follow;
        ty += (py - ty) * follow;
      }
    }
    const lx = tx - rect.left;
    const ly = ty - rect.top;
    const R = radius;
    const R2 = R * R;

    const kIn = 1 - Math.exp(-dt / 90);
    const kOut = 1 - Math.exp(-dt / 320);
    const damp = Math.pow(0.8, f);
    const stiff = 0.13 * f;
    const push = spacing * 1.5;

    let active = false;
    for (let k = 0; k < n; k++) {
      let target = 0;
      let tox = 0;
      let toy = 0;
      if (torchOn) {
        const dx = bx[k] - lx;
        const dy = by[k] - ly;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2);
          const q = d / R;
          const s = 1 - q;
          target = s * s * (3 - 2 * s); // smoothstep: miękki zanik do krawędzi
          if (d > 0.001) {
            const mag = push * target * q * 1.6;
            tox = (dx / d) * mag;
            toy = (dy / d) * mag;
          }
        }
      }
      const l = li[k];
      const nl = l + (target - l) * (target > l ? kIn : kOut);
      li[k] = nl;

      const ax = (tox - ox[k]) * stiff;
      const ay = (toy - oy[k]) * stiff;
      const nvx = (vxs[k] + ax) * damp;
      const nvy = (vys[k] + ay) * damp;
      vxs[k] = nvx;
      vys[k] = nvy;
      ox[k] += nvx * f;
      oy[k] += nvy * f;

      if (
        Math.abs(nl - target) > 0.004 ||
        Math.abs(ox[k] - tox) > 0.02 ||
        Math.abs(oy[k] - toy) > 0.02 ||
        Math.abs(nvx) > 0.01 ||
        Math.abs(nvy) > 0.01
      ) {
        active = true;
      }
    }

    draw();

    const torchMoving = torchOn && Math.abs(px - tx) + Math.abs(py - ty) >= 0.5;
    if (active || torchMoving || sweepStart >= 0) {
      raf = requestAnimationFrame(frame);
    } else {
      /* wszystko uspokojone – zeruj resztki i stań */
      if (!torchOn) {
        for (let k = 0; k < n; k++) {
          li[k] = 0;
          ox[k] = oy[k] = vxs[k] = vys[k] = 0;
        }
        draw();
      }
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
  function onMove(e: PointerEvent) {
    setPointer(e);
  }
  function onUp(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(release, 700);
  }
  function onLeaveDoc() {
    release();
  }

  function listen() {
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('blur', onLeaveDoc);
    document.documentElement.addEventListener('mouseleave', onLeaveDoc);
  }
  function unlisten() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('scroll', wake);
    window.removeEventListener('blur', onLeaveDoc);
    document.documentElement.removeEventListener('mouseleave', onLeaveDoc);
  }

  /* ---------- widoczność + lazy init ---------- */
  let resizeObserver: ResizeObserver | undefined;
  function start() {
    build();
    resizeObserver = new ResizeObserver(() => {
      if (stage.clientWidth && stage.clientWidth !== W) {
        build();
        wake();
      }
    });
    resizeObserver.observe(stage);
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
        built ? go() : setTimeout(go, 60);
      },
      { threshold: 0.35 },
    );
    sweepIO.observe(canvas);
  }
}
