import type { APIRoute, GetStaticPaths } from 'astro';
import { create, type Font } from 'fontkitten';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getSitePages } from '../../lib/agent';
import { getSettings } from '../../lib/site';

export const prerender = true;

/**
 * Obrazy Open Graph 1200×630. Nazewnictwo (używa go SEO.astro przez `ogImagePath()` z lib/schema.ts):
 *   /            → /og/index.png
 *   /cennik/     → /og/cennik.png
 *   /blog/x/     → /og/blog/x.png
 *   (awaryjny)   → /og/default.png
 * Kolory czytamy z src/styles/tokens.css, tytuł rysujemy ścieżkami z fontu Noto Serif Display
 * (librsvg nie ładuje osadzonych fontów, ścieżki działają wszędzie tak samo).
 */

const W = 1200;
const H = 630;
const root = process.cwd();

interface OgProps {
  title: string;
  image?: string;
}

export const getStaticPaths = (async () => {
  const pages = await getSitePages(undefined);
  const settings = await getSettings();
  const fallbackImage = path.resolve(root, 'src/assets/images/gabinet-1.jpg');
  return [
    ...pages.map((page) => ({
      params: { slug: page.path === '/' ? 'index' : page.path.replace(/^\/|\/$/g, '') },
      props: { title: page.path === '/' ? settings.tagline : page.title, image: page.image } satisfies OgProps,
    })),
    { params: { slug: 'default' }, props: { title: settings.tagline, image: fallbackImage } satisfies OgProps },
  ];
}) satisfies GetStaticPaths;

let cache: { font: Font; colors: Record<string, string>; logo: string } | undefined;
async function resources() {
  if (cache) return cache;
  const [fontFile, css, logo] = await Promise.all([
    readFile(path.resolve(root, 'src/assets/fonts/NotoSerifDisplay-Regular.ttf')),
    readFile(path.resolve(root, 'src/styles/tokens.css'), 'utf8'),
    readFile(path.resolve(root, 'src/assets/brand/logo.svg'), 'utf8'),
  ]);
  const colors: Record<string, string> = {};
  for (const [, name, value] of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) colors[name!] = value!;
  cache = { font: create(fontFile) as Font, colors, logo };
  return cache;
}

function measure(font: Font, text: string, size: number): number {
  const scale = size / font.unitsPerEm;
  return font.glyphsForString(text).reduce((sum, g) => sum + g.advanceWidth, 0) * scale;
}

function wrap(font: Font, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(font, next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Tekst jako ścieżki SVG (bez kerningu – wystarcza przy dużym kroju szeryfowym). */
function textPaths(font: Font, text: string, x: number, baseline: number, size: number, fill: string): string {
  const scale = size / font.unitsPerEm;
  let cursor = x;
  let out = '';
  for (const glyph of font.glyphsForString(text)) {
    const d = glyph.path.toSVG();
    if (d) out += `<path transform="translate(${cursor.toFixed(2)} ${baseline}) scale(${scale} ${-scale})" d="${d}"/>`;
    cursor += glyph.advanceWidth * scale;
  }
  return `<g fill="${fill}">${out}</g>`;
}

const roundedMask = (w: number, h: number, r: number) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`);

export const GET: APIRoute = async ({ props }) => {
  const { title, image } = props as OgProps;
  const settings = await getSettings();
  const { font, colors, logo } = await resources();
  const olive = colors['olive']!;

  // Zdjęcie po prawej: karta z zaokrąglonymi rogami.
  const card = { x: 650, y: 60, w: 490, h: 510, r: 44 };
  let photo: Buffer;
  try {
    if (!image) throw new Error('no image');
    photo = await sharp(image).resize(card.w, card.h, { fit: 'cover', position: 'attention' }).png().toBuffer();
  } catch {
    photo = await sharp({ create: { width: card.w, height: card.h, channels: 4, background: colors['khaki-pale']! } }).png().toBuffer();
  }
  const roundedPhoto = await sharp(photo)
    .composite([{ input: roundedMask(card.w, card.h, card.r), blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Logo w oliwce marki.
  const logoPng = await sharp(Buffer.from(logo.replace(/currentColor/g, olive)))
    .resize({ height: 92 })
    .png()
    .toBuffer();

  // Tytuł: największy rozmiar, przy którym mieści się w 4 liniach.
  const maxWidth = 530;
  let size = 76;
  let lines = wrap(font, title, size, maxWidth);
  while (lines.length > 4 && size > 44) {
    size -= 6;
    lines = wrap(font, title, size, maxWidth);
  }
  const lineHeight = size * 1.12;
  const startY = 270 + size;
  const titleSvg = lines.map((line, i) => textPaths(font, line, 70, Math.round(startY + i * lineHeight), size, colors['ink']!)).join('');
  const eyebrow = textPaths(font, `${settings.name} · ${settings.address.city}`.toUpperCase(), 70, 560, 22, colors['accent-text']!);

  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${titleSvg}${eyebrow}<rect x="70" y="236" width="64" height="2" fill="${colors['khaki']!}"/></svg>`,
  );

  const png = await sharp({ create: { width: W, height: H, channels: 4, background: colors['cream']! } })
    .composite([
      { input: overlay },
      { input: logoPng, left: 70, top: 70 },
      { input: roundedPhoto, left: card.x, top: card.y },
    ])
    .png({ palette: true, quality: 85, compressionLevel: 9 })
    .toBuffer();

  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};

