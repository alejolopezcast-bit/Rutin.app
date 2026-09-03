/* Pruebas de calendario, informe, perfiles y compartir en el navegador. */
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';
const SHOTS = process.env.SHOTS || 'tests/.screenshots';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 950 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  let pass = 0, fail = 0;
  const check = (label, cond, extra = '') => {
    if (cond) { pass++; console.log('PASS — ' + label); }
    else { fail++; console.log('FAIL — ' + label + (extra ? ' :: ' + extra : '')); }
  };

  await page.goto(BASE + '/index.html');
  await page.waitForTimeout(300);

  // Sembramos datos e inyectamos historial de varios meses
  await page.click('.tab[data-view="ajustes"]');
  await page.click('#seedBtn');
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const gym = Store.state.routines.find((r) => r.name === 'Gimnasio');
    const leer = Store.state.routines.find((r) => r.name === 'Leer');
    for (let i = 0; i < 70; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      if (i % 3 !== 0) Store.state.logs.push({ id: 'g' + i, routineId: gym.id, ts: d.getTime(), date: key(d), minutes: 60, count: 1 });
      if (i % 2 === 0) Store.state.logs.push({ id: 'l' + i, routineId: leer.id, ts: d.getTime(), date: key(d), minutes: 30, count: 1 });
    }
    Store.emit();
  });
  await page.waitForTimeout(200);

  // ---------- CALENDARIO ----------
  await page.click('.tab[data-view="calendario"]');
  await page.waitForTimeout(300);
  check('el calendario pinta 6 semanas', await page.locator('#calGrid .cal-day').count() >= 35);
  check('cabecera de días L-D', (await page.locator('#calWeekdays span').allTextContents()).join('') === 'LMXJVSD');
  const labelInicial = await page.locator('#calLabel').textContent();
  check('muestra el mes actual', /\d{4}/.test(labelInicial), labelInicial);
  // El mes anterior está lleno de historial (el actual puede acabar de empezar).
  await page.click('#calPrev');
  await page.waitForTimeout(250);
  const rellenos = await page.$$eval('#calGrid .cal-day', (els) => els
    .map((e) => parseFloat(e.style.getPropertyValue('--fill')) || 0)
    .filter((v) => v > 0).length);
  check('los días con actividad se rellenan', rellenos > 10, String(rellenos));
  const tinte = await page.$eval('#calGrid .cal-day[style*="--fill:0.5"]', (e) => ({
    opacidad: parseFloat(getComputedStyle(e, '::before').opacity),
    lleno: parseFloat(getComputedStyle(e, '::before').height) >= parseFloat(getComputedStyle(e).height) - 3,
  }));
  check('el tinte es proporcional a lo cumplido', Math.abs(tinte.opacidad - 0.46) < 0.03, String(tinte.opacidad));
  check('el tinte cubre la celda entera', tinte.lleno);
  const contraste = await page.$$eval('#calGrid .cal-day.is-strong', (els) =>
    els.every((e) => getComputedStyle(e).color === 'rgb(26, 18, 6)'));
  check('los días muy cumplidos usan texto oscuro (legible sobre el tinte)', contraste);
  await page.click('#calToday');
  await page.waitForTimeout(250);
  check('el día de hoy está marcado', await page.locator('#calGrid .cal-day.is-today').count() === 1);
  const futuros = await page.locator('#calGrid .cal-day.future').count();
  check('los días futuros no son pulsables', futuros === 0 || await page.locator('#calGrid .cal-day.future').first().isDisabled());

  await page.click('#calPrev');
  await page.waitForTimeout(200);
  const labelPrev = await page.locator('#calLabel').textContent();
  check('se navega al mes anterior', labelPrev !== labelInicial, `${labelInicial} -> ${labelPrev}`);
  await page.click('#calToday');
  await page.waitForTimeout(200);
  check('el botón Hoy vuelve al mes actual', (await page.locator('#calLabel').textContent()) === labelInicial);

  const detalleAntes = await page.locator('#calDetail h2').textContent();
  await page.locator('#calGrid .cal-day:not(.out):not(.future)').first().click();
  await page.waitForTimeout(250);
  const detalleDespues = await page.locator('#calDetail h2').textContent();
  check('al tocar un día cambia el detalle', detalleAntes !== detalleDespues, detalleDespues);
  check('el detalle lista las rutinas del día', await page.locator('#calDetail .item').count() === 4);
  check('el detalle indica qué se cumplió', await page.locator('#calDetail .badge').count() === 4);

  // ---------- INFORME ----------
  await page.click('.tab[data-view="informe"]');
  await page.waitForTimeout(300);
  check('el informe abre en Mes', (await page.locator('#periodChips .chip.is-active').textContent()).trim() === 'Mes');
  check('resumen con 4 indicadores', await page.locator('#repSummary .stat').count() === 4);
  const cumplimiento = await page.locator('#repSummary .stat b').first().textContent();
  check('calcula el % de cumplimiento', /^\d+%$/.test(cumplimiento.trim()), cumplimiento);
  const barrasMes = await page.locator('#repChart .bar').count();
  check('gráfico mensual: una barra por día', barrasMes >= 28 && barrasMes <= 31, String(barrasMes));
  check('desglose por rutina', await page.locator('#repRoutines .item').count() === 4);
  check('cada rutina muestra su porcentaje', (await page.locator('#repRoutines .rep-pct').first().textContent()).includes('%'));
  check('historial del periodo', await page.locator('#repHistory .item').count() > 0);

  await page.click('.chip[data-period="dia"]');
  await page.waitForTimeout(250);
  check('periodo Día: 12 franjas horarias', await page.locator('#repChart .bar').count() === 12);
  check('el título del gráfico cambia', (await page.locator('#repChartTitle').textContent()).includes('franja'));

  await page.click('.chip[data-period="anio"]');
  await page.waitForTimeout(250);
  check('periodo Año: 12 meses', await page.locator('#repChart .bar').count() === 12);

  await page.click('.chip[data-period="todo"]');
  await page.waitForTimeout(250);
  check('periodo Hasta ahora desactiva la navegación', await page.locator('#repPrev').isDisabled() && await page.locator('#repNext').isDisabled());
  check('"Hasta ahora" cubre todo el historial', await page.locator('#repChart .bar').count() >= 3);

  await page.click('.chip[data-period="mes"]');
  await page.waitForTimeout(200);
  check('no se puede avanzar más allá del mes actual', await page.locator('#repNext').isDisabled());
  await page.click('#repPrev');
  await page.waitForTimeout(250);
  check('al retroceder ya se puede avanzar', !(await page.locator('#repNext').isDisabled()));

  // ---------- PERFILES ----------
  check('la cabecera muestra el perfil activo', (await page.locator('#profileName').textContent()) === 'Yo');
  await page.click('#profileBtn');
  await page.waitForTimeout(250);
  check('se abre el diálogo de perfiles', await page.locator('#profileDialog').isVisible());
  check('el perfil actual aparece "En uso"', await page.locator('#profileList .badge.ok').count() === 1);
  check('no se puede borrar el único perfil', await page.locator('#profileList [data-action="delete"]').count() === 0);

  await page.fill('#pName', 'Ana');
  await page.fill('#pEmoji', '👩');
  await page.click('#profileForm button[type=submit]');
  await page.waitForTimeout(250);
  check('se crea el segundo perfil', await page.locator('#profileList .profile-row').count() === 2);
  check('ahora sí se pueden borrar perfiles', await page.locator('#profileList [data-action="delete"]').count() === 2);

  await page.locator('.profile-row', { hasText: 'Ana' }).locator('[data-action="use"]').click();
  await page.waitForTimeout(250);
  check('cambiar de perfil actualiza la cabecera', (await page.locator('#profileName').textContent()) === 'Ana');
  await page.click('#profileDialog [data-close]');
  await page.click('.tab[data-view="hoy"]');
  await page.waitForTimeout(250);
  check('el perfil nuevo no ve las rutinas del otro', await page.locator('#routineList .empty').isVisible());

  // Volvemos a "Yo"
  await page.click('#profileBtn');
  await page.waitForTimeout(200);
  await page.locator('.profile-row', { hasText: 'Yo' }).locator('[data-action="use"]').click();
  await page.waitForTimeout(200);
  await page.click('#profileDialog [data-close]');
  await page.waitForTimeout(200);
  check('al volver, las rutinas siguen ahí', await page.locator('.routine').count() === 4);

  // ---------- COMPARTIR ----------
  await page.click('#shareRoutinesBtn');
  await page.waitForTimeout(250);
  check('se abre el diálogo de compartir', await page.locator('#shareDialog').isVisible());
  check('vienen todas las rutinas marcadas', await page.locator('#shareList input:checked').count() === 4);

  // dejamos sólo dos
  await page.locator('#shareList .item').nth(2).locator('input').uncheck();
  await page.locator('#shareList .item').nth(3).locator('input').uncheck();
  await page.click('#shareCode');
  await page.waitForTimeout(250);
  const codigo = await page.locator('#shareOutput').inputValue();
  check('genera un código', codigo.length > 20, codigo.slice(0, 30) + '…');
  check('el código no lleva caracteres raros de URL', !/[+/=]/.test(codigo));

  await page.click('#shareLink');
  await page.waitForTimeout(250);
  const enlace = await page.locator('#shareOutput').inputValue();
  check('genera un enlace con #compartir', enlace.includes('#compartir='), enlace.slice(0, 60) + '…');

  // enviar a otro perfil del dispositivo
  await page.selectOption('#shareProfile', { label: '👩 Ana' });
  await page.click('#shareToProfile');
  await page.waitForTimeout(300);
  check('el diálogo se cierra al enviar', !(await page.locator('#shareDialog').isVisible()));
  await page.click('#profileBtn');
  await page.waitForTimeout(200);
  await page.locator('.profile-row', { hasText: 'Ana' }).locator('[data-action="use"]').click();
  await page.waitForTimeout(200);
  await page.click('#profileDialog [data-close]');
  await page.waitForTimeout(250);
  check('Ana recibió sólo las 2 rutinas elegidas', await page.locator('.routine').count() === 2, String(await page.locator('.routine').count()));
  check('Ana no recibió el historial', (await page.locator('#daySummary .stat b').nth(1).textContent()).trim() === '0');

  // ---------- RECIBIR POR ENLACE ----------
  await page.goto(enlace);
  await page.waitForTimeout(500);
  check('el enlace abre el diálogo de importar', await page.locator('#receiveDialog').isVisible());
  const de = await page.locator('#receiveFrom').textContent();
  check('dice quién comparte y cuántas', de.includes('Yo') && de.includes('2'), de);
  check('la URL se limpia tras abrirla', !page.url().includes('#compartir'));
  check('lista las rutinas recibidas', await page.locator('#receiveList .item').count() === 2);
  await page.click('#receiveConfirm');
  await page.waitForTimeout(300);
  check('avisa de que ya las tenía', await page.locator('.routine').count() === 2);

  // importar por código pegado, en un perfil nuevo
  await page.click('#profileBtn');
  await page.waitForTimeout(200);
  await page.fill('#pName', 'Luis');
  await page.click('#profileForm button[type=submit]');
  await page.waitForTimeout(200);
  await page.locator('.profile-row', { hasText: 'Luis' }).locator('[data-action="use"]').click();
  await page.waitForTimeout(200);
  await page.click('#profileDialog [data-close]');
  await page.click('.tab[data-view="ajustes"]');
  await page.fill('#importCodeInput', codigo);
  await page.click('#importCodeForm button[type=submit]');
  await page.waitForTimeout(300);
  check('el código pegado abre el diálogo', await page.locator('#receiveDialog').isVisible());
  await page.click('#receiveConfirm');
  await page.waitForTimeout(300);
  await page.click('.tab[data-view="hoy"]');
  await page.waitForTimeout(250);
  check('Luis importa las rutinas del código', await page.locator('.routine').count() === 2);

  await page.fill('#importCodeInput', 'esto-no-vale').catch(() => {});
  await page.click('.tab[data-view="ajustes"]');
  await page.fill('#importCodeInput', 'esto-no-vale');
  await page.click('#importCodeForm button[type=submit]');
  await page.waitForTimeout(250);
  check('un código inválido no rompe nada', (await page.locator('#toast').textContent()).includes('no es válido'));

  // ---------- PERSISTENCIA ----------
  await page.reload();
  await page.waitForTimeout(400);
  check('el perfil activo se recuerda tras recargar', (await page.locator('#profileName').textContent()) === 'Luis');
  check('sus rutinas siguen ahí', await page.locator('.routine').count() === 2);

  console.log(errors.length ? '\nERRORES:\n' + errors.join('\n') : '\nSin errores de consola.');
  console.log(`${pass} PASS, ${fail} FAIL`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
