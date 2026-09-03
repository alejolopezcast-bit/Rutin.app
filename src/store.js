/* Store: estado de la app + persistencia en localStorage.

   El estado tiene perfiles: cada perfil guarda sus propias rutinas, tareas e
   historial, y los ajustes son comunes al dispositivo. `Store.state` sigue
   exponiendo los datos del perfil activo, así que el resto de la app no
   necesita saber que hay varios. */
window.Store = (function () {
  const KEY = 'rutin.app.state.v1';
  const VERSION = 2;

  const DEFAULT_SETTINGS = {
    work: 25,
    short: 5,
    long: 15,
    longEvery: 4,
    autoChain: false,
    sound: true,
    notifications: false,
    theme: 'dark',
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function emptyProfileData() {
    return { routines: [], tasks: [], logs: [], pomodoros: [] };
  }

  function newProfile(name, emoji) {
    return { id: uid(), name: name || 'Yo', emoji: emoji || '🙂', createdAt: Date.now() };
  }

  function defaults() {
    const profile = newProfile('Yo', '🙂');
    return {
      version: VERSION,
      settings: { ...DEFAULT_SETTINGS },
      profiles: [profile],
      activeProfileId: profile.id,
      data: { [profile.id]: emptyProfileData() },
    };
  }

  /* Clave de día en horario local: YYYY-MM-DD (no usamos toISOString para no saltar de día por UTC). */
  function dayKey(date) {
    const d = date ? new Date(date) : new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function todayKey() {
    return dayKey(new Date());
  }

  /* Un Date a mediodía: así sumar días nunca se descuadra por el cambio de hora. */
  function dateFromKey(key) {
    return new Date(`${key}T12:00:00`);
  }

  function addDays(date, amount) {
    const d = new Date(date);
    d.setDate(d.getDate() + amount);
    return d;
  }

  /* Migra el formato antiguo (un solo usuario) al de perfiles. */
  function migrate(parsed) {
    const base = defaults();
    if (!parsed || typeof parsed !== 'object') return base;

    if (Array.isArray(parsed.profiles) && parsed.data) {
      const profiles = parsed.profiles.length ? parsed.profiles : base.profiles;
      const data = {};
      profiles.forEach((p) => {
        const saved = parsed.data[p.id] || {};
        data[p.id] = {
          routines: saved.routines || [],
          tasks: saved.tasks || [],
          logs: saved.logs || [],
          pomodoros: saved.pomodoros || [],
        };
      });
      const active = profiles.some((p) => p.id === parsed.activeProfileId)
        ? parsed.activeProfileId
        : profiles[0].id;
      return {
        version: VERSION,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        profiles,
        activeProfileId: active,
        data,
      };
    }

    // Formato v1: todo colgaba de la raíz. Lo metemos en el primer perfil.
    const profile = base.profiles[0];
    return {
      version: VERSION,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      profiles: [profile],
      activeProfileId: profile.id,
      data: {
        [profile.id]: {
          routines: parsed.routines || [],
          tasks: parsed.tasks || [],
          logs: parsed.logs || [],
          pomodoros: parsed.pomodoros || [],
        },
      },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      return migrate(JSON.parse(raw));
    } catch (err) {
      console.warn('No se pudo leer el estado guardado, empezamos de cero.', err);
      return defaults();
    }
  }

  let db = load();
  const listeners = new Set();

  function current() {
    if (!db.data[db.activeProfileId]) db.data[db.activeProfileId] = emptyProfileData();
    return db.data[db.activeProfileId];
  }

  /* Vista del perfil activo: el resto de la app lee de aquí como antes. */
  const state = {
    get settings() { return db.settings; },
    get routines() { return current().routines; },
    get tasks() { return current().tasks; },
    get logs() { return current().logs; },
    get pomodoros() { return current().pomodoros; },
    get profiles() { return db.profiles; },
    get activeProfileId() { return db.activeProfileId; },
  };

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (err) {
      console.warn('No se pudo guardar el estado.', err);
    }
  }

  function emit() {
    save();
    listeners.forEach((fn) => fn(state));
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /* ---------- Perfiles ---------- */

  function activeProfile() {
    return db.profiles.find((p) => p.id === db.activeProfileId) || db.profiles[0];
  }

  function getProfile(id) {
    return db.profiles.find((p) => p.id === id) || null;
  }

  function addProfile({ name, emoji }) {
    const profile = newProfile(String(name || '').trim().slice(0, 40), String(emoji || '').trim().slice(0, 8));
    db.profiles.push(profile);
    db.data[profile.id] = emptyProfileData();
    emit();
    return profile;
  }

  function updateProfile(id, { name, emoji }) {
    const profile = getProfile(id);
    if (!profile) return null;
    if (name !== undefined) profile.name = String(name).trim().slice(0, 40) || profile.name;
    if (emoji !== undefined) profile.emoji = String(emoji).trim().slice(0, 8) || profile.emoji;
    emit();
    return profile;
  }

  function removeProfile(id) {
    if (db.profiles.length <= 1) return false; // siempre queda uno
    db.profiles = db.profiles.filter((p) => p.id !== id);
    delete db.data[id];
    if (db.activeProfileId === id) db.activeProfileId = db.profiles[0].id;
    emit();
    return true;
  }

  /* Resumen corto de un perfil, para el selector. */
  function profileSummary(id) {
    const data = db.data[id];
    if (!data) return 'Vacío';
    const routines = data.routines.length;
    const sessions = data.logs.reduce((acc, l) => acc + (l.count || 0), 0);
    if (!routines) return 'Sin rutinas todavía';
    return `${routines} ${routines === 1 ? 'rutina' : 'rutinas'} · ${sessions} ${sessions === 1 ? 'sesión' : 'sesiones'}`;
  }

  function setActiveProfile(id) {
    if (!getProfile(id)) return false;
    db.activeProfileId = id;
    emit();
    return true;
  }

  /* ---------- Rutinas ---------- */

  function clampNumber(value, min, max, fallback) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  /* Normaliza y acota: también es la puerta de entrada de las rutinas
     compartidas por enlace, que vienen de fuera y no son de fiar. */
  function normalizeRoutine(data) {
    const mode = ['veces', 'tiempo', 'ambos'].includes(data.mode) ? data.mode : 'veces';
    const days = Array.isArray(data.days)
      ? Array.from(new Set(data.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort()
      : [];
    return {
      emoji: String(data.emoji || '✅').trim().slice(0, 8) || '✅',
      name: String(data.name || '').trim().slice(0, 60) || 'Sin nombre',
      mode,
      goalCount: clampNumber(data.goalCount, 1, 50, 1),
      minutes: clampNumber(data.minutes, 1, 600, 30),
      goalMinutes: clampNumber(data.goalMinutes !== undefined ? data.goalMinutes : data.minutes, 1, 1440, 30),
      days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
    };
  }

  function addRoutine(data) {
    const routine = { id: uid(), createdAt: Date.now(), ...normalizeRoutine(data) };
    current().routines.push(routine);
    emit();
    return routine;
  }

  function updateRoutine(id, data) {
    const routine = current().routines.find((r) => r.id === id);
    if (!routine) return null;
    Object.assign(routine, normalizeRoutine({ ...routine, ...data }));
    emit();
    return routine;
  }

  function removeRoutine(id) {
    const profile = current();
    profile.routines = profile.routines.filter((r) => r.id !== id);
    profile.logs = profile.logs.filter((l) => l.routineId !== id);
    emit();
  }

  function getRoutine(id) {
    return current().routines.find((r) => r.id === id) || null;
  }

  function isScheduled(routine, key) {
    const date = key ? dateFromKey(key) : new Date();
    return routine.days.includes(date.getDay());
  }

  /* ---------- Registros de sesiones ---------- */

  function logSession({ routineId, minutes = 0, count = 1, note = '' }) {
    const entry = {
      id: uid(),
      routineId,
      ts: Date.now(),
      date: todayKey(),
      minutes: Math.max(0, Math.round(minutes)),
      count: Math.max(0, count),
      note,
    };
    current().logs.push(entry);
    emit();
    return entry;
  }

  function removeLog(id) {
    const profile = current();
    profile.logs = profile.logs.filter((l) => l.id !== id);
    emit();
  }

  function logsOn(key, routineId) {
    return current().logs.filter((l) => l.date === key && (!routineId || l.routineId === routineId));
  }

  /* Índice fecha -> registros, para no recorrer todo el historial en cada día. */
  function logIndex() {
    const index = new Map();
    current().logs.forEach((l) => {
      if (!index.has(l.date)) index.set(l.date, []);
      index.get(l.date).push(l);
    });
    return index;
  }

  /* Progreso de una rutina en un día: veces, minutos, meta y si está completada. */
  function progress(routine, key, index) {
    const day = key || todayKey();
    const logs = index
      ? (index.get(day) || []).filter((l) => l.routineId === routine.id)
      : logsOn(day, routine.id);
    const count = logs.reduce((acc, l) => acc + (l.count || 0), 0);
    const minutes = logs.reduce((acc, l) => acc + (l.minutes || 0), 0);
    const byTime = routine.mode === 'tiempo';
    const target = byTime ? routine.goalMinutes : routine.goalCount;
    const value = byTime ? minutes : count;
    return {
      count,
      minutes,
      value,
      target,
      byTime,
      ratio: target > 0 ? Math.min(1, value / target) : 0,
      done: value >= target,
    };
  }

  /* Racha: días consecutivos cumpliendo, ignorando los días que no tocaban. */
  function streak(routine, index) {
    const idx = index || logIndex();
    let days = 0;
    let checked = 0;
    let cursor = new Date();
    while (checked < 400) {
      const key = dayKey(cursor);
      const isToday = key === todayKey();
      if (progress(routine, key, idx).done) {
        days += 1; // cumplida, tocara o no ese día
      } else if (isScheduled(routine, key) && !isToday) {
        break;     // día programado sin cumplir: se corta la racha (hoy aún hay margen)
      }
      cursor = addDays(cursor, -1);
      checked += 1;
    }
    return days;
  }

  /* ---------- Tareas ---------- */

  function addTask({ title, estPomodoros = 1 }) {
    const task = {
      id: uid(),
      title: String(title || '').trim().slice(0, 200),
      estPomodoros: clampNumber(estPomodoros, 0, 20, 0),
      donePomodoros: 0,
      done: false,
      createdAt: Date.now(),
      completedAt: null,
    };
    if (!task.title) return null;
    current().tasks.unshift(task);
    emit();
    return task;
  }

  function updateTask(id, data) {
    const task = current().tasks.find((t) => t.id === id);
    if (!task) return null;
    Object.assign(task, data);
    emit();
    return task;
  }

  function toggleTask(id) {
    const task = current().tasks.find((t) => t.id === id);
    if (!task) return null;
    task.done = !task.done;
    task.completedAt = task.done ? Date.now() : null;
    emit();
    return task;
  }

  function removeTask(id) {
    const profile = current();
    profile.tasks = profile.tasks.filter((t) => t.id !== id);
    emit();
  }

  function getTask(id) {
    return current().tasks.find((t) => t.id === id) || null;
  }

  function addPomodoroToTask(id) {
    const task = current().tasks.find((t) => t.id === id);
    if (!task) return;
    task.donePomodoros += 1;
    emit();
  }

  /* ---------- Pomodoros ---------- */

  function logPomodoro({ taskId = null, minutes }) {
    current().pomodoros.push({ id: uid(), ts: Date.now(), date: todayKey(), taskId, minutes: Math.round(minutes) });
    emit();
  }

  function pomodorosOn(key) {
    return current().pomodoros.filter((p) => p.date === key);
  }

  /* ---------- Informes ---------- */

  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function firstActivityKey() {
    const profile = current();
    const keys = profile.logs.map((l) => l.date).concat(profile.pomodoros.map((p) => p.date));
    if (!keys.length) return todayKey();
    return keys.reduce((min, k) => (k < min ? k : min), keys[0]);
  }

  /* Rango de fechas de un periodo ('dia' | 'mes' | 'anio' | 'todo'). */
  function rangeFor(period, reference) {
    const ref = reference ? new Date(reference) : new Date();
    if (period === 'dia') {
      const key = dayKey(ref);
      return { from: key, to: key, label: ref.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) };
    }
    if (period === 'mes') {
      const from = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const to = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      return { from: dayKey(from), to: dayKey(to), label: `${MONTHS[ref.getMonth()]} de ${ref.getFullYear()}` };
    }
    if (period === 'anio') {
      return { from: `${ref.getFullYear()}-01-01`, to: `${ref.getFullYear()}-12-31`, label: String(ref.getFullYear()) };
    }
    return { from: firstActivityKey(), to: todayKey(), label: 'Desde el principio' };
  }

  function eachDayKey(fromKey, toKey) {
    const keys = [];
    let cursor = dateFromKey(fromKey);
    const end = dateFromKey(toKey);
    while (cursor <= end && keys.length < 4000) {
      keys.push(dayKey(cursor));
      cursor = addDays(cursor, 1);
    }
    return keys;
  }

  /* Resumen de un rango: totales, cumplimiento y desglose por rutina. */
  function report(fromKey, toKey) {
    const profile = current();
    const index = logIndex();
    const today = todayKey();
    const keys = eachDayKey(fromKey, toKey).filter((k) => k <= today);

    let sessions = 0;
    let minutes = 0;
    let expected = 0;
    let completed = 0;
    const activeDays = new Set();

    const perRoutine = profile.routines.map((routine) => ({
      routine,
      count: 0,
      minutes: 0,
      daysDone: 0,
      daysScheduled: 0,
    }));
    const byId = new Map(perRoutine.map((row) => [row.routine.id, row]));

    keys.forEach((key) => {
      (index.get(key) || []).forEach((log) => {
        sessions += log.count || 0;
        minutes += log.minutes || 0;
        activeDays.add(key);
        const row = byId.get(log.routineId);
        if (row) {
          row.count += log.count || 0;
          row.minutes += log.minutes || 0;
        }
      });
      perRoutine.forEach((row) => {
        const scheduled = isScheduled(row.routine, key);
        const done = progress(row.routine, key, index).done;
        if (scheduled) { row.daysScheduled += 1; expected += 1; }
        if (done) { row.daysDone += 1; if (scheduled) completed += 1; }
      });
    });

    const pomodoros = profile.pomodoros.filter((p) => p.date >= fromKey && p.date <= toKey);

    return {
      from: fromKey,
      to: toKey,
      days: keys.length,
      sessions,
      minutes,
      pomodoros: pomodoros.length,
      pomodoroMinutes: pomodoros.reduce((acc, p) => acc + (p.minutes || 0), 0),
      activeDays: activeDays.size,
      expected,
      completed,
      rate: expected > 0 ? completed / expected : 0,
      perRoutine: perRoutine.sort((a, b) => b.daysDone - a.daysDone || b.minutes - a.minutes),
    };
  }

  /* Serie para el gráfico del informe: por horas, días o meses según el periodo. */
  function series(period, reference) {
    const profile = current();
    const range = rangeFor(period, reference);

    if (period === 'dia') {
      const buckets = Array.from({ length: 12 }, (_, i) => ({ label: `${i * 2}h`, sessions: 0, minutes: 0 }));
      profile.logs.filter((l) => l.date === range.from).forEach((l) => {
        const bucket = buckets[Math.min(11, Math.floor(new Date(l.ts).getHours() / 2))];
        bucket.sessions += l.count || 0;
        bucket.minutes += l.minutes || 0;
      });
      return buckets;
    }

    if (period === 'mes') {
      const index = logIndex();
      return eachDayKey(range.from, range.to).map((key) => {
        const logs = index.get(key) || [];
        return {
          key,
          label: String(dateFromKey(key).getDate()),
          sessions: logs.reduce((acc, l) => acc + (l.count || 0), 0),
          minutes: logs.reduce((acc, l) => acc + (l.minutes || 0), 0),
        };
      });
    }

    // 'anio' y 'todo' se agrupan por meses.
    const buckets = new Map();
    const from = range.from;
    const to = range.to;
    profile.logs.filter((l) => l.date >= from && l.date <= to).forEach((l) => {
      const month = l.date.slice(0, 7);
      if (!buckets.has(month)) buckets.set(month, { key: month, sessions: 0, minutes: 0 });
      const bucket = buckets.get(month);
      bucket.sessions += l.count || 0;
      bucket.minutes += l.minutes || 0;
    });

    const months = [];
    let cursor = new Date(dateFromKey(from).getFullYear(), dateFromKey(from).getMonth(), 1);
    const end = dateFromKey(to);
    while (cursor <= end && months.length < 240) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key) || { key, sessions: 0, minutes: 0 };
      const showYear = period === 'todo';
      months.push({ ...bucket, label: MONTHS[cursor.getMonth()].slice(0, 3) + (showYear ? ` ${String(cursor.getFullYear()).slice(2)}` : '') });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return months;
  }

  /* Cuadrícula de un mes para el calendario, con el cumplimiento de cada día. */
  function monthGrid(year, month) {
    const index = logIndex();
    const routines = current().routines;
    const today = todayKey();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);

    // La semana empieza en lunes: retrocedemos hasta el lunes anterior al día 1.
    const start = addDays(first, -((first.getDay() + 6) % 7));
    const cells = [];
    let cursor = new Date(start);

    while (cells.length < 42) {
      const key = dayKey(cursor);
      const logs = index.get(key) || [];
      const scheduled = routines.filter((r) => isScheduled(r, key));
      const done = routines.filter((r) => progress(r, key, index).done);
      cells.push({
        key,
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === month,
        isToday: key === today,
        isFuture: key > today,
        scheduled: scheduled.length,
        done: done.length,
        sessions: logs.reduce((acc, l) => acc + (l.count || 0), 0),
        minutes: logs.reduce((acc, l) => acc + (l.minutes || 0), 0),
        ratio: scheduled.length ? Math.min(1, done.length / scheduled.length) : (done.length ? 1 : 0),
      });
      cursor = addDays(cursor, 1);
      if (cells.length >= 35 && cursor > last) break; // 5 semanas bastan casi siempre
    }
    return { year, month, label: `${MONTHS[month]} de ${year}`, cells };
  }

  /* Detalle de un día concreto, para el panel del calendario. */
  function dayDetail(key) {
    const index = logIndex();
    const routines = current().routines;
    return {
      key,
      label: dateFromKey(key).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      pomodoros: current().pomodoros.filter((p) => p.date === key).length,
      routines: routines.map((routine) => ({
        routine,
        scheduled: isScheduled(routine, key),
        ...progress(routine, key, index),
      })),
    };
  }

  /* ---------- Compartir rutinas ---------- */

  /* Sólo viaja la definición de las rutinas: ni historial, ni tareas, ni nada personal. */
  function encodeShare(routines, fromName) {
    const payload = {
      v: 1,
      from: String(fromName || '').slice(0, 40),
      r: routines.map((r) => ({
        e: r.emoji, n: r.name, m: r.mode, gc: r.goalCount, mi: r.minutes, gm: r.goalMinutes, d: r.days,
      })),
    };
    const json = JSON.stringify(payload);
    // base64 con soporte para emojis, en variante URL-safe.
    const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeShare(code) {
    const normalized = String(code || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (!payload || !Array.isArray(payload.r)) throw new Error('El código no contiene rutinas');
    const routines = payload.r.slice(0, 50).map((r) => normalizeRoutine({
      emoji: r.e, name: r.n, mode: r.m, goalCount: r.gc, minutes: r.mi, goalMinutes: r.gm, days: r.d,
    }));
    if (!routines.length) throw new Error('El código no contiene rutinas');
    return { from: String(payload.from || '').slice(0, 40), routines };
  }

  /* Copia rutinas al perfil indicado (o al activo). Devuelve cuántas entraron. */
  function importRoutines(routines, profileId) {
    const targetId = profileId || db.activeProfileId;
    if (!db.data[targetId]) db.data[targetId] = emptyProfileData();
    const target = db.data[targetId];
    let added = 0;
    routines.forEach((data) => {
      const routine = normalizeRoutine(data);
      // No duplicamos una rutina que ya existe con el mismo nombre.
      if (target.routines.some((r) => r.name.toLowerCase() === routine.name.toLowerCase())) return;
      target.routines.push({ id: uid(), createdAt: Date.now(), ...routine });
      added += 1;
    });
    emit();
    return added;
  }

  /* ---------- Ajustes y datos ---------- */

  function setSettings(patch) {
    Object.assign(db.settings, patch);
    emit();
  }

  function exportData() {
    return JSON.stringify(db, null, 2);
  }

  function importData(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    const looksValid = parsed && typeof parsed === 'object'
      && (Array.isArray(parsed.routines) || Array.isArray(parsed.profiles));
    if (!looksValid) throw new Error('El archivo no tiene el formato de Rutin.app');
    db = migrate(parsed);
    emit();
  }

  function reset() {
    db = defaults();
    emit();
  }

  /* Rutina de ejemplo para arrancar con algo en pantalla. */
  function seed() {
    const samples = [
      { emoji: '🏋️', name: 'Gimnasio', mode: 'ambos', goalCount: 1, minutes: 60, goalMinutes: 60, days: [1, 2, 3, 4, 5] },
      { emoji: '💧', name: 'Beber agua', mode: 'veces', goalCount: 8, days: [0, 1, 2, 3, 4, 5, 6] },
      { emoji: '📚', name: 'Leer', mode: 'tiempo', minutes: 30, goalMinutes: 30, days: [0, 1, 2, 3, 4, 5, 6] },
      { emoji: '🧘', name: 'Meditar', mode: 'tiempo', minutes: 10, goalMinutes: 10, days: [0, 1, 2, 3, 4, 5, 6] },
    ];
    samples.forEach((s) => addRoutine(s));
    addTask({ title: 'Preparar informe semanal', estPomodoros: 3 });
    addTask({ title: 'Responder correos pendientes', estPomodoros: 1 });
  }

  return {
    get state() { return state; },
    subscribe,
    emit,
    uid,
    dayKey,
    dateFromKey,
    addDays,
    todayKey,
    MONTHS,
    activeProfile,
    getProfile,
    addProfile,
    updateProfile,
    removeProfile,
    setActiveProfile,
    profileSummary,
    addRoutine,
    updateRoutine,
    removeRoutine,
    getRoutine,
    isScheduled,
    logSession,
    removeLog,
    logsOn,
    logIndex,
    progress,
    streak,
    addTask,
    updateTask,
    toggleTask,
    removeTask,
    getTask,
    addPomodoroToTask,
    logPomodoro,
    pomodorosOn,
    rangeFor,
    eachDayKey,
    report,
    series,
    monthGrid,
    dayDetail,
    encodeShare,
    decodeShare,
    importRoutines,
    setSettings,
    exportData,
    importData,
    reset,
    seed,
  };
})();
