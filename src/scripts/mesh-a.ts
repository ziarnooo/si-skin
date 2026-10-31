/*
 * Hero A — „miąższ” (miękki, powoli płynący gradient) na WebGL + paralaksa kart.
 * Cały kod startuje w requestIdleCallback, więc nigdy nie opóźnia LCP.
 *  - pauza poza ekranem i w ukrytej karcie,
 *  - prefers-reduced-motion: jedna statyczna klatka, bez paralaksy,
 *  - DPR ograniczony, rysowanie ~30 fps (gradient jest miękki, a oszczędzamy baterię),
 *  - kolory czytane z tokenów CSS (--mesh-0…4 na elemencie hero).
 */

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 r;uniform float t;uniform vec2 m;
uniform vec3 a,b,c,d,e;
float h(vec2 q){return fract(sin(dot(q,vec2(12.9898,78.233)))*43758.5453);}
float blob(vec2 p,vec2 o,float s){vec2 q=p-o;return exp(-dot(q,q)*s);}
void main(){
  vec2 p=(gl_FragCoord.xy/r)*2.-1.;
  float k=t*.16;
  p+=.14*vec2(sin(p.y*2.4+k*2.),cos(p.x*2.1-k*1.6));
  p+=.06*vec2(sin(p.y*5.+k*3.1),cos(p.x*4.6-k*2.7));
  vec2 q=m*.3;
  vec3 col=a;
  col=mix(col,b,.95*blob(p,vec2(-.7+.3*sin(k*1.1),.35+.25*cos(k*.8))+q*.8,1.05));
  col=mix(col,c,.7*blob(p,vec2(.9+.15*cos(k*.7),.1+.3*sin(k*.9+1.))+q*1.2,1.6));
  col=mix(col,d,.7*blob(p,vec2(.15+.4*sin(k*.6+2.),-.6+.2*cos(k*1.2))+q*.5,2.));
  col=mix(col,e,.85*blob(p,vec2(-.05+.3*cos(k*.5),.55+.15*sin(k*.7))+q*.3,1.4));
  col=mix(col,d,.28*blob(p,m*.85,4.5));
  col+=(h(gl_FragCoord.xy)-.5)/255.;
  gl_FragColor=vec4(col,1.);
}`;

const STILL_TIME = 6;
const FRAME_MS = 32;

function toRgb(value: string): [number, number, number] {
  let v = value.trim();
  if (v[0] === '#') {
    if (v.length === 4) v = '#' + [...v.slice(1)].map((ch) => ch + ch).join('');
    const n = parseInt(v.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const m = v.match(/[\d.]+/g);
  return m && m.length >= 3 ? [+m[0] / 255, +m[1] / 255, +m[2] / 255] : [1, 1, 1];
}

function shader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

function createMesh(canvas: HTMLCanvasElement, hero: HTMLElement) {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  });
  if (!gl) return null;
  const vs = shader(gl, gl.VERTEX_SHADER, VERT);
  const fs = shader(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const style = getComputedStyle(hero);
  (['a', 'b', 'c', 'd', 'e'] as const).forEach((name, i) => {
    gl.uniform3fv(gl.getUniformLocation(prog, name), toRgb(style.getPropertyValue(`--mesh-${i}`)));
  });
  const uR = gl.getUniformLocation(prog, 'r');
  const uT = gl.getUniformLocation(prog, 't');
  const uM = gl.getUniformLocation(prog, 'm');

  return {
    resize() {
      // Gradient jest miękki — połowa rozdzielczości, DPR ≤ 1.5.
      const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.5;
      const w = Math.max(2, Math.round(hero.clientWidth * scale));
      const h = Math.max(2, Math.round(hero.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
    },
    draw(t: number, mx: number, my: number) {
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, t);
      gl.uniform2f(uM, mx, -my);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

function init() {
  const hero = document.querySelector<HTMLElement>('[data-hero-a]');
  if (!hero) return;
  const canvas = hero.querySelector<HTMLCanvasElement>('canvas');
  const cards = [...hero.querySelectorAll<HTMLElement>('[data-depth]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');

  let mesh = canvas ? createMesh(canvas, hero) : null;
  let onScreen = true;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let t = STILL_TIME;
  let tx = 0, ty = 0, mx = 0, my = 0;

  const paint = () => {
    mesh?.draw(t, reduced.matches ? 0 : mx, reduced.matches ? 0 : my);
  };

  const place = () => {
    const on = !reduced.matches && fine.matches;
    for (const el of cards) {
      const d = on ? Number(el.dataset.depth) || 0 : 0;
      el.style.transform = d ? `translate3d(${(-mx * d).toFixed(2)}px,${(-my * d).toFixed(2)}px,0)` : '';
    }
  };

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(now - last, 100);
    last = now;
    const k = 1 - Math.exp(-dt / 240);
    mx += (tx - mx) * k;
    my += (ty - my) * k;
    place();
    if (mesh) {
      t += dt / 1000;
      acc += dt;
      if (acc >= FRAME_MS) {
        acc = 0;
        paint();
      }
    }
  };

  const sync = () => {
    const run = onScreen && !document.hidden && !reduced.matches && (mesh !== null || (cards.length > 0 && fine.matches));
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (reduced.matches) {
      tx = ty = mx = my = 0;
      t = STILL_TIME;
      place();
      if (mesh) {
        mesh.resize();
        paint();
      }
    }
  };

  if (mesh && canvas) {
    mesh.resize();
    paint();
    canvas.classList.add('is-ready');
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      mesh = null;
      canvas.classList.remove('is-ready');
      sync();
    });
    new ResizeObserver(() => {
      mesh?.resize();
      if (mesh && !raf) paint();
    }).observe(hero);
  }

  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    tx = (e.clientX / window.innerWidth) * 2 - 1;
    ty = (e.clientY / window.innerHeight) * 2 - 1;
  });
  hero.addEventListener('pointerleave', () => {
    tx = ty = 0;
  });

  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  }).observe(hero);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  fine.addEventListener('change', () => {
    place();
    sync();
  });
  sync();
}

if ('requestIdleCallback' in window) requestIdleCallback(init, { timeout: 1500 });
else setTimeout(init, 200);
