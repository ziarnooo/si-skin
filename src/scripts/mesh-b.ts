/**
 * Hero B – miękki, żywy „miąższ”: metabale w tonach marki (WebGL, ~0.4 px CSS na piksel).
 * Kolory czytane z tokenów (--m0…--m4 na korzeniu hero). Reakcja na mysz.
 * Start na idle (LCP = tekst), pauza poza ekranem / w tle karty, statyczna klatka przy reduced-motion.
 */
const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 r,m;uniform float t;uniform vec3 c[5];
float B(vec2 p,vec2 q,float s){vec2 d=p-q;return exp(-dot(d,d)/(s*s));}
void main(){
  float a=r.x/r.y;
  vec2 p=gl_FragCoord.xy/r.y;
  p+=.05*vec2(sin(p.y*3.+t*.4),cos(p.x*2.6-t*.33));
  float w1=B(p,vec2(.22*a+.1*sin(t*.21),.74+.1*cos(t*.17)),.36);
  float w2=B(p,vec2(.84*a+.1*cos(t*.19),.3+.12*sin(t*.23)),.42);
  float w3=B(p,vec2(.52*a+.14*sin(t*.13+1.),.55+.1*cos(t*.2)),.32);
  float w4=B(p,vec2(.12*a+.08*cos(t*.27),.16+.06*sin(t*.31)),.3);
  float w5=B(p,m*vec2(a,1.),.24);
  float f=w1+w2+w3+w5;
  vec3 col=c[0];
  col=mix(col,c[1],w3*.9);
  col=mix(col,c[2],w1*.7);
  col=mix(col,c[3],w2*.75);
  col=mix(col,c[4],w4*.8);
  col=mix(col,mix(c[3],c[2],.5),w5*.5);
  col+=c[4]*(smoothstep(.5,.56,f)-smoothstep(.56,.64,f))*.14;
  col+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/160.;
  gl_FragColor=vec4(col,1.);
}`;

const rgb = (s: string): number[] => {
  const h = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(s.trim());
  const v = h ? h.slice(1).map((x) => parseInt(x, 16)) : (s.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
  return v.map((x) => x / 255);
};

function init(root: HTMLElement, cv: HTMLCanvasElement): void {
  const gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return;
  const pr = gl.createProgram()!;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    gl.attachShader(pr, s);
  };
  sh(gl.VERTEX_SHADER, VERT);
  sh(gl.FRAGMENT_SHADER, FRAG);
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const ap = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(ap);
  gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
  const u = (n: string) => gl.getUniformLocation(pr, n);
  const ur = u('r'), um = u('m'), ut = u('t');
  const cs = getComputedStyle(root);
  gl.uniform3fv(u('c'), new Float32Array([0, 1, 2, 3, 4].flatMap((i) => rgb(cs.getPropertyValue('--m' + i)))));

  let t = 6, mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5, ptr = false, px = 0, py = 0;
  const fit = () => {
    const cw = Math.max(1, root.clientWidth);
    const w = Math.max(2, Math.min(720, Math.round(cw * 0.4)));
    const h = Math.max(2, Math.round((root.clientHeight * w) / cw));
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(ur, w, h);
    }
  };
  const draw = () => {
    gl.uniform1f(ut, t);
    gl.uniform2f(um, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const ro = new ResizeObserver(() => { fit(); draw(); });

  fit();
  draw();
  cv.classList.add('is-ready');
  ro.observe(root);

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let raf = 0, last = 0, vis = true;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;
    if (!ptr) {
      tx = 0.5 + 0.28 * Math.sin(t * 0.2);
      ty = 0.5 + 0.22 * Math.cos(t * 0.27);
    }
    const k = 1 - Math.exp(-dt * 3);
    mx += (tx - mx) * k;
    my += (ty - my) * k;
    const nx = +((mx - 0.5) * 2).toFixed(3), ny = +((0.5 - my) * 2).toFixed(3);
    if (Math.abs(nx - px) > 0.002 || Math.abs(ny - py) > 0.002) {
      px = nx; py = ny;
      root.style.setProperty('--mx', String(nx));
      root.style.setProperty('--my', String(ny));
    }
    draw();
  };
  const sync = () => {
    const on = vis && !document.hidden;
    root.toggleAttribute('data-paused', !on);
    if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    else if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; sync(); }).observe(root);
  document.addEventListener('visibilitychange', sync);
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const b = root.getBoundingClientRect();
    tx = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width));
    ty = Math.min(1, Math.max(0, 1 - (e.clientY - b.top) / b.height));
    ptr = true;
  }, { passive: true });
  root.addEventListener('pointerleave', () => { ptr = false; });
  cv.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    vis = false;
    sync();
    cv.classList.remove('is-ready');
  });
  sync();
}

export function mountMeshB(): void {
  const root = document.querySelector<HTMLElement>('[data-mesh-b]');
  const cv = root?.querySelector<HTMLCanvasElement>('canvas');
  if (!root || !cv) return;
  const run = () => init(root, cv);
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 300);
}
