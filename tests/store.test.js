/* Pruebas de la lógica del store, sin navegador. */
const fs = require('fs');
const vm = require('vm');

function freshStore(initial) {
  const store = {};
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  if (initial) localStorage.setItem('rutin.app.state.v1', JSON.stringify(initial));
  const sandbox = { window: {}, localStorage, console, btoa, atob, TextEncoder, TextDecoder, Date, Math, JSON, Number, String, Array, Object, Map, Set, Uint8Array };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/store.js', 'utf8'), sandbox);
  return sandbox.window.Store;
}

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS — ' + label); }
  else { fail++; console.log('FAIL — ' + label + (extra ? ' :: ' + extra : '')); }
};

const key = (d) => { const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0'); return `${d.getFullYear()}-${m}-${day}`; };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };

// ---------- Migración desde el formato v1 ----------
const legacy = {
  version: 1,
  settings: { theme: 'light', work: 30 },
  routines: [{ id: 'r1', emoji: '🏋️', name: 'Gimnasio', mode: 'ambos', goalCount: 1, minutes: 60, goalMinutes: 60, days: [0,1,2,3,4,5,6], createdAt: 1 }],
  tasks: [{ id: 't1', title: 'Tarea vieja', estPomodoros: 2, donePomodoros: 0, done: false }],
  logs: [{ id: 'l1', routineId: 'r1', ts: Date.now(), date: daysAgo(0), minutes: 60, count: 1 }],
  pomodoros: [{ id: 'p1', ts: Date.now(), date: daysAgo(0), taskId: 't1', minutes: 25 }],
};
let S = freshStore(legacy);
check('migra rutinas del formato antiguo', S.state.routines.length === 1);
check('migra tareas', S.state.tasks.length === 1);
check('migra historial', S.state.logs.length === 1);
check('conserva los ajustes', S.state.settings.theme === 'light' && S.state.settings.work === 30);
check('crea un perfil por defecto', S.state.profiles.length === 1 && S.activeProfile().name === 'Yo');

// ---------- Perfiles aislados ----------
const otro = S.addProfile({ name: 'Ana', emoji: '👩' });
check('se puede crear otro perfil', S.state.profiles.length === 2);
S.setActiveProfile(otro.id);
check('el perfil nuevo empieza vacío', S.state.routines.length === 0 && S.state.logs.length === 0);
S.addRoutine({ name: 'Correr', mode: 'tiempo', minutes: 20, goalMinutes: 20, days: [1,3,5] });
check('las rutinas se guardan en el perfil activo', S.state.routines.length === 1);
S.setActiveProfile(S.state.profiles[0].id);
check('al volver, el otro perfil sigue intacto', S.state.routines.length === 1 && S.state.routines[0].name === 'Gimnasio');
check('no se puede borrar el último perfil', S.removeProfile(otro.id) === true && S.removeProfile(S.state.profiles[0].id) === false);

// ---------- Informes ----------
S = freshStore();
const gym = S.addRoutine({ emoji: '🏋️', name: 'Gimnasio', mode: 'veces', goalCount: 1, days: [0,1,2,3,4,5,6] });
const leer = S.addRoutine({ emoji: '📚', name: 'Leer', mode: 'tiempo', minutes: 30, goalMinutes: 30, days: [0,1,2,3,4,5,6] });
// historial: gimnasio hecho 3 días seguidos, leer sólo hoy
S.state.logs.push(
  { id: 'a', routineId: gym.id, ts: Date.now(), date: daysAgo(0), minutes: 0, count: 1 },
  { id: 'b', routineId: gym.id, ts: Date.now(), date: daysAgo(1), minutes: 0, count: 1 },
  { id: 'c', routineId: gym.id, ts: Date.now(), date: daysAgo(2), minutes: 0, count: 1 },
  { id: 'd', routineId: leer.id, ts: Date.now(), date: daysAgo(0), minutes: 45, count: 1 },
);

const hoy = S.report(daysAgo(0), daysAgo(0));
check('informe del día: sesiones', hoy.sessions === 2, String(hoy.sessions));
check('informe del día: minutos', hoy.minutes === 45, String(hoy.minutes));
check('informe del día: cumplimiento 2/2', hoy.completed === 2 && hoy.expected === 2 && hoy.rate === 1);

const tres = S.report(daysAgo(2), daysAgo(0));
check('informe de 3 días: cumplimiento 4/6', tres.completed === 4 && tres.expected === 6, `${tres.completed}/${tres.expected}`);
check('informe: desglose por rutina ordenado', tres.perRoutine[0].routine.name === 'Gimnasio' && tres.perRoutine[0].daysDone === 3);
check('informe: días con actividad', tres.activeDays === 3, String(tres.activeDays));

const futuro = S.report(daysAgo(0), key(new Date(Date.now() + 5 * 864e5)));
check('el informe no cuenta días futuros', futuro.days === 1, String(futuro.days));

const rangoMes = S.rangeFor('mes', new Date(2026, 1, 15));
check('rango de mes correcto (febrero 2026)', rangoMes.from === '2026-02-01' && rangoMes.to === '2026-02-28', `${rangoMes.from}..${rangoMes.to}`);
const rangoAnio = S.rangeFor('anio', new Date(2024, 5, 5));
check('rango de año correcto', rangoAnio.from === '2024-01-01' && rangoAnio.to === '2024-12-31');
check('rango "todo" arranca en la primera actividad', S.rangeFor('todo').from === daysAgo(2), S.rangeFor('todo').from);

check('serie de día en franjas de 2h', S.series('dia').length === 12);
check('serie de mes: un punto por día', S.series('mes', new Date(2026, 1, 10)).length === 28);
check('serie de año: 12 meses', S.series('anio', new Date(2026, 5, 5)).length === 12);

// ---------- Calendario ----------
const grid = S.monthGrid(2026, 1); // febrero 2026
check('el calendario empieza en lunes', S.dateFromKey(grid.cells[0].key).getDay() === 1);
check('el calendario cubre el mes entero', grid.cells.filter((c) => c.inMonth).length === 28);
const hoyCell = S.monthGrid(new Date().getFullYear(), new Date().getMonth()).cells.find((c) => c.isToday);
check('marca el día de hoy con su cumplimiento', hoyCell && hoyCell.done === 2 && hoyCell.ratio === 1);
const detalle = S.dayDetail(daysAgo(1));
check('el detalle del día lista las rutinas', detalle.routines.length === 2);
check('el detalle sabe cuál se cumplió', detalle.routines.find((r) => r.routine.name === 'Gimnasio').done === true);
check('...y cuál no', detalle.routines.find((r) => r.routine.name === 'Leer').done === false);

// ---------- Compartir ----------
const code = S.encodeShare(S.state.routines, 'Alejo');
check('el código es seguro para URL', !/[+/=]/.test(code));
const decoded = S.decodeShare(code);
check('se recuperan las rutinas compartidas', decoded.routines.length === 2 && decoded.from === 'Alejo');
check('sobrevive el emoji', decoded.routines[0].emoji === '🏋️');
check('no viaja el historial', JSON.stringify(decoded).indexOf('routineId') === -1);

const ana = S.addProfile({ name: 'Ana', emoji: '👩' });
const added = S.importRoutines(decoded.routines, ana.id);
check('las rutinas se importan al perfil elegido', added === 2);
S.setActiveProfile(ana.id);
check('el perfil receptor tiene las rutinas', S.state.routines.length === 2);
check('...pero no el historial del emisor', S.state.logs.length === 0);
check('reimportar no duplica', S.importRoutines(decoded.routines, ana.id) === 0);

// Entrada maliciosa: el código viene de fuera y no es de fiar
const evil = S.encodeShare([{ emoji: '😈'.repeat(50), name: '<img src=x onerror=alert(1)>'.repeat(20), mode: 'raro', goalCount: 1e9, minutes: -5, goalMinutes: 99999, days: [9, 'x', 3] }], 'x'.repeat(200));
const cleaned = S.decodeShare(evil);
check('acota el nombre recibido', cleaned.routines[0].name.length <= 60, String(cleaned.routines[0].name.length));
check('acota el emoji recibido', cleaned.routines[0].emoji.length <= 8);
check('acota los números fuera de rango', cleaned.routines[0].goalCount === 50 && cleaned.routines[0].minutes === 1 && cleaned.routines[0].goalMinutes === 1440);
check('descarta días inválidos', JSON.stringify(cleaned.routines[0].days) === '[3]', JSON.stringify(cleaned.routines[0].days));
check('acota el nombre del emisor', cleaned.from.length <= 40);
let threw = false;
try { S.decodeShare('esto-no-es-un-codigo'); } catch (e) { threw = true; }
check('un código inválido lanza error', threw);

// ---------- Copia de seguridad ----------
const backup = S.exportData();
S.reset();
check('reset deja un único perfil vacío', S.state.profiles.length === 1 && S.state.routines.length === 0);
S.importData(backup);
check('la copia restaura todos los perfiles', S.state.profiles.length === 2);
S.importData(JSON.stringify(legacy));
check('también importa copias del formato antiguo', S.state.routines.length === 1 && S.state.routines[0].name === 'Gimnasio');

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
