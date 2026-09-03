const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';
const SHOTS = process.env.SHOTS || 'tests/.screenshots';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let pass = 0, fail = 0;
  const check = (label, cond, extra = '') => {
    if (cond) pass++; else fail++;
    console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}${extra ? ' :: ' + extra : ''}`);
  };

  await page.goto(BASE + '/index.html');
  await page.waitForTimeout(300);

  // Estado inicial vacío
  check('vista Hoy muestra estado vacío', await page.locator('#routineList .empty').isVisible());
  check('las demás vistas están ocultas', !(await page.locator('#view-tareas').isVisible()) && !(await page.locator('#view-stats').isVisible()));

  // Cargar rutina de ejemplo desde Ajustes
  await page.click('.tab[data-view="ajustes"]');
  await page.click('#seedBtn');
  await page.waitForTimeout(200);
  const cards = await page.locator('.routine').count();
  check('rutina de ejemplo crea 4 tarjetas', cards === 4, 'cards=' + cards);

  // Marcar por veces: "Beber agua" (meta 8)
  const water = page.locator('.routine', { hasText: 'Beber agua' });
  await water.locator('[data-action="mark"]').click();
  await water.locator('[data-action="mark"]').click();
  await page.waitForTimeout(150);
  const waterText = await page.locator('.routine', { hasText: 'Beber agua' }).locator('[data-countdown]').textContent();
  check('marcar por veces suma sesiones', waterText.includes('2 de 8'), waterText);

  // Deshacer
  await page.locator('.routine', { hasText: 'Beber agua' }).locator('[data-action="undo"]').click();
  await page.waitForTimeout(150);
  const waterText2 = await page.locator('.routine', { hasText: 'Beber agua' }).locator('[data-countdown]').textContent();
  check('deshacer resta una sesión', waterText2.includes('1 de 8'), waterText2);

  // Gimnasio: modo "ambos" -> botón Hecho + botón de tiempo
  const gym = page.locator('.routine', { hasText: 'Gimnasio' });
  check('gym tiene botón de marcar', await gym.locator('[data-action="mark"]').count() === 1);
  check('gym tiene botón de cuenta atrás', await gym.locator('[data-action="start"]').count() === 1);

  // Cuenta atrás personalizada de 1 minuto (hoja de duración)
  await gym.locator('[data-action="custom"]').click();
  await page.waitForTimeout(200);
  check('la hoja de duración se abre', await page.locator('#durationDialog').isVisible());
  await page.fill('#durationInput', '1');
  await page.click('#durationForm button[type=submit]');
  await page.waitForTimeout(400);
  check('la barra de foco aparece al arrancar', await page.locator('#focusBar').isVisible());
  const t0 = await page.locator('#focusTime').textContent();
  await page.waitForTimeout(2200);
  const t1 = await page.locator('#focusTime').textContent();
  check('la cuenta atrás va bajando', t0.trim() === '01:00' && /^00:5[5-8]$/.test(t1.trim()), t0 + ' -> ' + t1);

  // Pausar / reanudar
  await page.click('#focusToggle');
  const paused = await page.locator('#focusTime').textContent();
  await page.waitForTimeout(700);
  check('pausar congela el reloj', (await page.locator('#focusTime').textContent()) === paused, paused);
  await page.click('#focusToggle');
  await page.waitForTimeout(400);

  // La sesión sobrevive a una recarga
  await page.reload();
  await page.waitForTimeout(400);
  check('la sesión se restaura tras recargar', await page.locator('#focusBar').isVisible());

  // Terminar y registrar
  await page.click('#focusDone');
  await page.waitForTimeout(300);
  check('la barra de foco se oculta al terminar', !(await page.locator('#focusBar').isVisible()));
  const gymText = await page.locator('.routine', { hasText: 'Gimnasio' }).locator('[data-countdown]').textContent();
  check('la sesión cronometrada queda registrada', gymText.includes('1 de 1'), gymText);

  // Tareas
  await page.click('.tab[data-view="tareas"]');
  await page.fill('#taskTitle', 'Comprar pan');
  await page.fill('#taskEst', '2');
  await page.click('#taskForm button[type=submit]');
  await page.waitForTimeout(150);
  check('la tarea nueva aparece la primera', (await page.locator('#taskList .item-title').first().textContent()) === 'Comprar pan');

  // Enfocar tarea -> abre pomodoro con la tarea seleccionada
  await page.locator('#taskList .item', { hasText: 'Comprar pan' }).locator('[data-action="focus"]').click();
  await page.waitForTimeout(400);
  check('el botón 🍅 abre la vista Pomodoro', await page.locator('#view-pomodoro').isVisible() && !(await page.locator('#view-tareas').isVisible()));
  const sub = await page.locator('#focusSub').textContent();
  check('el pomodoro se asocia a la tarea', sub.includes('Comprar pan'), sub);
  const pomoTime = await page.locator('#pomoTime').textContent();
  check('el pomodoro arranca en 25 min', /^2[45]:\d\d$/.test(pomoTime.trim()), pomoTime);

  await page.click('#focusCancel');
  await page.waitForTimeout(200);

  // Completar tarea
  await page.click('.tab[data-view="tareas"]');
  await page.locator('#taskList .item', { hasText: 'Comprar pan' }).locator('input[type=checkbox]').click();
  await page.waitForTimeout(200);
  check('la tarea marcada sale de Pendientes', await page.locator('#taskList .item', { hasText: 'Comprar pan' }).count() === 0);
  await page.click('.chip[data-filter="hechas"]');
  await page.waitForTimeout(150);
  check('la tarea aparece en Hechas', await page.locator('#taskList .item', { hasText: 'Comprar pan' }).count() === 1);

  // Informe
  await page.click('.tab[data-view="informe"]');
  await page.waitForTimeout(250);
  check('el informe dibuja el gráfico del mes', await page.locator('#repChart .bar').count() >= 28);
  check('el historial tiene registros', await page.locator('#repHistory .item').count() > 0);
  check('el informe desglosa las rutinas', await page.locator('#repRoutines .item').count() === 4);

  // Crear rutina desde el diálogo
  await page.click('.tab[data-view="hoy"]');
  await page.click('#addRoutineBtn');
  await page.fill('#rName', 'Correr');
  await page.fill('#rEmoji', '🏃');
  await page.check('#rMode input[value="tiempo"]');
  await page.waitForTimeout(100);
  check('el modo por tiempo oculta el campo de veces', await page.locator('#fieldGoalCount').isHidden());
  await page.fill('#rMinutes', '20');
  await page.fill('#rGoalMinutes', '40');
  await page.click('#routineForm button[type=submit]');
  await page.waitForTimeout(250);
  const runCard = page.locator('.routine', { hasText: 'Correr' });
  check('la rutina nueva se crea', await runCard.count() === 1);
  check('la rutina por tiempo no tiene botón de marcar', await runCard.locator('[data-action="mark"]').count() === 0);
  const runBtn = await runCard.locator('[data-action="start"]').textContent();
  check('el botón muestra los minutos de sesión', runBtn.includes('20 min'), runBtn);

  // Tema
  await page.click('#themeToggle');
  check('el tema cambia a claro', (await page.getAttribute('html', 'data-theme')) === 'light');
  await page.click('#themeToggle');

  // Persistencia general
  await page.reload();
  await page.waitForTimeout(300);
  check('los datos siguen ahí tras recargar', await page.locator('.routine').count() === 5);

  await require('fs').promises.mkdir(SHOTS, { recursive: true }); await page.screenshot({ path: SHOTS + '/hoy.png', fullPage: true });
  await page.click('.tab[data-view="pomodoro"]');
  await page.waitForTimeout(200);
  await require('fs').promises.mkdir(SHOTS, { recursive: true }); await page.screenshot({ path: SHOTS + '/pomodoro.png' });
  await page.click('.tab[data-view="informe"]');
  await page.waitForTimeout(250);
  await require('fs').promises.mkdir(SHOTS, { recursive: true }); await page.screenshot({ path: SHOTS + '/informe.png', fullPage: true });
  await page.click('.tab[data-view="calendario"]');
  await page.waitForTimeout(250);
  await require('fs').promises.mkdir(SHOTS, { recursive: true }); await page.screenshot({ path: SHOTS + '/calendario.png', fullPage: true });

  console.log(errors.length ? 'ERRORES DE CONSOLA:\n' + errors.join('\n') : 'Sin errores de consola.');
  console.log(`${pass} PASS, ${fail} FAIL`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
