/* Pruebas con el perfil de un iPhone (WebKit no está instalado aquí, así que usamos
   Chromium con el viewport, el user agent y el gesto táctil de un iPhone 14). */
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';
const SHOTS = process.env.SHOTS || 'tests/.screenshots';

(async () => {
  const browser = await chromium.launch();
  const iphone = devices['iPhone 14'];
  const context = await browser.newContext({ ...iphone, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  let pass = 0, fail = 0;
  const check = (label, cond, extra = '') => {
    if (cond) pass++; else fail++;
    console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}${extra ? ' :: ' + extra : ''}`);
  };

  await page.goto(BASE + '/index.html');
  await page.waitForTimeout(400);

  // --- Metadatos de iOS ---
  check('meta apple-mobile-web-app-capable', await page.locator('meta[name="apple-mobile-web-app-capable"]').count() === 1);
  check('apple-touch-icon PNG de 180', (await page.getAttribute('link[rel="apple-touch-icon"]', 'href')) === 'assets/icons/icon-180.png');
  check('viewport con viewport-fit=cover', (await page.getAttribute('meta[name=viewport]', 'content')).includes('viewport-fit=cover'));
  check('9 pantallas de arranque declaradas', await page.locator('link[rel="apple-touch-startup-image"]').count() === 9);

  // Los recursos declarados existen de verdad
  const links = await page.$$eval('link[rel="apple-touch-startup-image"], link[rel="apple-touch-icon"], link[rel=manifest]', els => els.map(e => e.getAttribute('href')));
  let missing = [];
  for (const href of links) {
    const res = await page.request.get(BASE + '/' + href);
    if (!res.ok()) missing.push(href);
  }
  check('todos los iconos y splashes se sirven', missing.length === 0, missing.join(', '));

  // --- Aviso de instalación (el UA de iPhone lo activa) ---
  check('se muestra el aviso de añadir a pantalla de inicio', await page.locator('#installHint').isVisible());
  await page.click('#installHintClose');
  check('el aviso se puede descartar', !(await page.locator('#installHint').isVisible()));
  await page.reload();
  await page.waitForTimeout(300);
  check('el aviso descartado no vuelve', !(await page.locator('#installHint').isVisible()));

  // --- Zoom al enfocar campos: Safari lo hace si la fuente < 16px ---
  await page.click('.tab[data-view="tareas"]');
  const fontSize = await page.locator('#taskTitle').evaluate((el) => getComputedStyle(el).fontSize);
  check('los campos usan 16px (sin zoom automático)', fontSize === '16px', fontSize);

  // --- Tamaño mínimo táctil ---
  await page.click('.tab[data-view="ajustes"]');
  await page.click('#seedBtn');
  await page.waitForTimeout(300);
  await page.click('.tab[data-view="hoy"]');
  await page.waitForTimeout(200);
  const box = await page.locator('.routine', { hasText: 'Beber agua' }).locator('[data-action="mark"]').boundingBox();
  check('los botones llegan a 44px de alto', box.height >= 44, Math.round(box.height) + 'px');

  // --- Hoja de duración (sustituye al prompt) ---
  const gym = page.locator('.routine', { hasText: 'Gimnasio' });
  await gym.locator('[data-action="custom"]').tap();
  await page.waitForTimeout(300);
  check('se abre la hoja de duración', await page.locator('#durationDialog').isVisible());
  check('la hoja propone duraciones', await page.locator('#durationChips .chip').count() >= 9);
  const sheetBox = await page.locator('#durationDialog').boundingBox();
  const viewport = page.viewportSize();
  check('la hoja se pega abajo y ocupa el ancho', Math.abs(sheetBox.width - viewport.width) < 2, `${Math.round(sheetBox.width)} vs ${viewport.width}`);
  await page.locator('#durationChips .chip', { hasText: '10 min' }).first().tap();
  await page.locator('#durationForm button[type=submit]').tap();
  await page.waitForTimeout(400);
  check('la sesión arranca con la duración elegida', (await page.locator('#focusTime').textContent()).trim() === '10:00');

  // --- La barra flotante no tapa la barra de inicio del iPhone ---
  const barBox = await page.locator('#focusBar').boundingBox();
  const bottomGap = viewport.height - (barBox.y + barBox.height);
  check('la barra deja hueco inferior (safe area)', bottomGap >= 12, Math.round(bottomGap) + 'px');

  // --- Recuperación tras estar en segundo plano ---
  // Simulamos el congelado de iOS: adelantamos el reloj guardado y disparamos el retorno.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('rutin.app.timer.v1'));
    raw.endsAt = Date.now() - 1000; // la sesión venció mientras el móvil estaba bloqueado
    localStorage.setItem('rutin.app.timer.v1', JSON.stringify(raw));
  });
  await page.reload();
  await page.waitForTimeout(500);
  check('la sesión vencida en segundo plano se registra', !(await page.locator('#focusBar').isVisible()));
  const gymText = await page.locator('.routine', { hasText: 'Gimnasio' }).locator('[data-countdown]').textContent();
  check('queda anotada con sus minutos', gymText.includes('1 de 1'), gymText);
  await page.click('.tab[data-view="informe"]');
  await page.waitForTimeout(250);
  const hist = await page.locator('#repHistory .item').first().textContent();
  check('el historial guarda los 10 minutos completos', hist.includes('10 min'), hist.replace(/\s+/g, ' ').trim());

  // --- Color de la barra de estado según el tema ---
  await page.click('.tab[data-view="hoy"]');
  const darkColor = await page.getAttribute('#themeColorMeta', 'content');
  await page.click('#themeToggle');
  await page.waitForTimeout(150);
  const lightColor = await page.getAttribute('#themeColorMeta', 'content');
  check('la barra de estado sigue al tema', darkColor === '#0f1115' && lightColor === '#f5f6fa', `${darkColor} -> ${lightColor}`);
  await page.click('#themeToggle');

  // --- Service worker y manifiesto ---
  const manifest = await (await page.request.get(BASE + '/manifest.json')).json();
  check('manifiesto en modo standalone', manifest.display === 'standalone');
  check('manifiesto con iconos PNG', manifest.icons.filter((i) => i.type === 'image/png').length === 3);
  const swReady = await page.evaluate(() => navigator.serviceWorker.ready.then(() => true).catch(() => false));
  check('el service worker se registra', swReady === true);

  await require('fs').promises.mkdir(SHOTS, { recursive: true }); await page.screenshot({ path: SHOTS + '/ios-hoy.png', fullPage: true });
  await page.locator('.routine', { hasText: 'Leer' }).locator('[data-action="custom"]').tap();
  await page.waitForTimeout(400);
  await require('fs').promises.mkdir(SHOTS, { recursive: true }); await page.screenshot({ path: SHOTS + '/ios-hoja.png' });

  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'Sin errores de consola.');
  console.log(`${pass} PASS, ${fail} FAIL`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
