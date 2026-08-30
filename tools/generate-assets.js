/* Genera los PNG que iOS necesita (iconos y pantallas de arranque) a partir del SVG.
   Uso: NODE_PATH=$(npm root -g) node tools/generate-assets.js  */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const LOGO = fs.readFileSync(path.join(ROOT, 'assets/icon.svg'), 'utf8');
const BG = '#0f1115';
const INK = '#1a1206';

/* El cronómetro suelto, sin el fondo redondeado del favicon. */
const GLYPH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="34" r="17" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"
          stroke-dasharray="80 27" transform="rotate(-90 32 34)"/>
  <path d="M32 24v11l7 5" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="28" y="10" width="8" height="6" rx="2" fill="${INK}"/>
</svg>`;

/* Fondo a sangre: iOS recorta el icono con su propia máscara redondeada, así que
   no debe llevar ni esquinas redondeadas ni transparencia propias. */
const GRADIENT = 'linear-gradient(135deg, #ff6b52, #ffb457)';

/* Iconos: cuadrado completo, sin transparencia (iOS aplica su propia máscara redondeada). */
const ICONS = [
  { file: 'assets/icons/icon-180.png', size: 180 },   // apple-touch-icon
  { file: 'assets/icons/icon-192.png', size: 192 },
  { file: 'assets/icons/icon-512.png', size: 512 },
  { file: 'assets/icons/icon-maskable-512.png', size: 512, safe: true },
];

/* Pantallas de arranque de los iPhone más habituales (ancho x alto lógicos y densidad). */
const SPLASHES = [
  { w: 440, h: 956, r: 3 }, // 16 Pro Max / 15 Pro Max
  { w: 430, h: 932, r: 3 }, // 14 Pro Max / 15 Plus
  { w: 402, h: 874, r: 3 }, // 16 Pro
  { w: 393, h: 852, r: 3 }, // 14 Pro / 15 / 16
  { w: 390, h: 844, r: 3 }, // 12 / 13 / 14
  { w: 428, h: 926, r: 3 }, // 12-14 Plus/Max
  { w: 414, h: 896, r: 2 }, // XR / 11
  { w: 375, h: 812, r: 3 }, // X / XS / 11 Pro / 13 mini
  { w: 375, h: 667, r: 2 }, // SE 2ª y 3ª generación
];

function iconPage(size, safe) {
  // 'safe' deja el glifo dentro de la zona segura del recorte maskable de Android.
  const inner = Math.round(size * (safe ? 0.52 : 0.72));
  return `<!doctype html><meta charset="utf-8">
    <style>
      html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
      body{background:${GRADIENT};display:grid;place-items:center}
      .glyph{width:${inner}px;height:${inner}px}
      svg{width:100%;height:100%;display:block}
    </style>
    <div class="glyph">${GLYPH}</div>`;
}

function splashPage(w, h) {
  return `<!doctype html><meta charset="utf-8">
    <style>
      html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden}
      body{background:${BG};display:grid;place-items:center;align-content:center;gap:22px;
           font:600 20px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#e8ecf4}
      svg{width:96px;height:96px;display:block}
      p{margin:0;letter-spacing:-.01em}
      small{color:#94a0b8;font-weight:500;font-size:13px}
    </style>
    <div style="display:grid;justify-items:center;gap:14px">
      ${LOGO}
      <p>Rutin.app</p>
      <small>Rutinas · Tareas · Pomodoros</small>
    </div>`;
}

(async () => {
  const browser = await chromium.launch();
  const written = [];

  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
    await page.setContent(iconPage(icon.size, icon.safe));
    await page.screenshot({ path: path.join(ROOT, icon.file), omitBackground: false });
    await page.close();
    written.push(icon.file);
  }

  const media = [];
  for (const s of SPLASHES) {
    const file = `assets/splash/splash-${s.w}x${s.h}@${s.r}x.png`;
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.r });
    await page.setContent(splashPage(s.w, s.h));
    await page.screenshot({ path: path.join(ROOT, file) });
    await page.close();
    written.push(file);
    media.push(`<link rel="apple-touch-startup-image" href="${file}" media="(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.r})" />`);
  }

  fs.writeFileSync(path.join(ROOT, 'tools/startup-images.html'), media.join('\n') + '\n');
  await browser.close();
  console.log('Generados:\n' + written.join('\n'));
})();
