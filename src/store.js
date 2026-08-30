/* Store: estado de la app + persistencia en localStorage.
   Un único objeto `state` que se guarda en cada cambio y avisa a los suscriptores. */
window.Store = (function () {
  const KEY = 'rutin.app.state.v1';

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

  function defaults() {
    return { version: 1, settings: { ...DEFAULT_SETTINGS }, routines: [], tasks: [], logs: [], pomodoros: [] };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw);
      const base = defaults();
      return {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...(parsed.settings || {}) },
        routines: parsed.routines || [],
        tasks: parsed.tasks || [],
        logs: parsed.logs || [],
        pomodoros: parsed.pomodoros || [],
      };
    } catch (err) {
      console.warn('No se pudo leer el estado guardado, empezamos de cero.', err);
      return defaults();
    }
  }

  let state = load();
  const listeners = new Set();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
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

  /* ---------- Rutinas ---------- */

  function normalizeRoutine(data) {
    const mode = ['veces', 'tiempo', 'ambos'].includes(data.mode) ? data.mode : 'veces';
    const days = Array.isArray(data.days) && data.days.length ? data.days.slice().sort() : [0, 1, 2, 3, 4, 5, 6];
    return {
      emoji: data.emoji || '✅',
      name: (data.name || '').trim() || 'Sin nombre',
      mode,
      goalCount: Math.max(1, Number(data.goalCount) || 1),
      minutes: Math.max(1, Number(data.minutes) || 30),
      goalMinutes: Math.max(1, Number(data.goalMinutes) || Number(data.minutes) || 30),
      days,
    };
  }

  function addRoutine(data) {
    const routine = { id: uid(), createdAt: Date.now(), order: state.routines.length, ...normalizeRoutine(data) };
    state.routines.push(routine);
    emit();
    return routine;
  }

  function updateRoutine(id, data) {
    const routine = state.routines.find((r) => r.id === id);
    if (!routine) return null;
    Object.assign(routine, normalizeRoutine({ ...routine, ...data }));
    emit();
    return routine;
  }

  function removeRoutine(id) {
    state.routines = state.routines.filter((r) => r.id !== id);
    state.logs = state.logs.filter((l) => l.routineId !== id);
    emit();
  }

  function getRoutine(id) {
    return state.routines.find((r) => r.id === id) || null;
  }

  function isScheduled(routine, key) {
    const date = key ? new Date(`${key}T12:00:00`) : new Date();
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
    state.logs.push(entry);
    emit();
    return entry;
  }

  function removeLog(id) {
    state.logs = state.logs.filter((l) => l.id !== id);
    emit();
  }

  function logsOn(key, routineId) {
    return state.logs.filter((l) => l.date === key && (!routineId || l.routineId === routineId));
  }

  /* Progreso de una rutina en un día: veces, minutos, meta y si está completada. */
  function progress(routine, key) {
    const day = key || todayKey();
    const logs = logsOn(day, routine.id);
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

  /* Racha: días consecutivos cumplidos hacia atrás, ignorando los días no programados. */
  function streak(routine) {
    let days = 0;
    let checked = 0;
    const cursor = new Date();
    while (checked < 400) {
      const key = dayKey(cursor);
      const isToday = key === todayKey();
      if (progress(routine, key).done) {
        days += 1; // cumplida, tocara o no ese día
      } else if (isScheduled(routine, key) && !isToday) {
        break;     // día programado sin cumplir: se corta la racha (hoy aún hay margen)
      }
      cursor.setDate(cursor.getDate() - 1);
      checked += 1;
    }
    return days;
  }

  /* ---------- Tareas ---------- */

  function addTask({ title, estPomodoros = 1 }) {
    const task = {
      id: uid(),
      title: (title || '').trim(),
      estPomodoros: Math.max(0, Number(estPomodoros) || 0),
      donePomodoros: 0,
      done: false,
      createdAt: Date.now(),
      completedAt: null,
    };
    if (!task.title) return null;
    state.tasks.unshift(task);
    emit();
    return task;
  }

  function updateTask(id, data) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return null;
    Object.assign(task, data);
    emit();
    return task;
  }

  function toggleTask(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return null;
    task.done = !task.done;
    task.completedAt = task.done ? Date.now() : null;
    emit();
    return task;
  }

  function removeTask(id) {
    state.tasks = state.tasks.filter((t) => t.id !== id);
    emit();
  }

  function getTask(id) {
    return state.tasks.find((t) => t.id === id) || null;
  }

  function addPomodoroToTask(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    task.donePomodoros += 1;
    emit();
  }

  /* ---------- Pomodoros ---------- */

  function logPomodoro({ taskId = null, minutes }) {
    state.pomodoros.push({ id: uid(), ts: Date.now(), date: todayKey(), taskId, minutes: Math.round(minutes) });
    emit();
  }

  function pomodorosOn(key) {
    return state.pomodoros.filter((p) => p.date === key);
  }

  /* ---------- Ajustes y datos ---------- */

  function setSettings(patch) {
    Object.assign(state.settings, patch);
    emit();
  }

  function exportData() {
    return JSON.stringify(state, null, 2);
  }

  function importData(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.routines)) {
      throw new Error('El archivo no tiene el formato de Rutin.app');
    }
    const base = defaults();
    state = {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      routines: parsed.routines || [],
      tasks: parsed.tasks || [],
      logs: parsed.logs || [],
      pomodoros: parsed.pomodoros || [],
    };
    emit();
  }

  function reset() {
    state = defaults();
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
    todayKey,
    addRoutine,
    updateRoutine,
    removeRoutine,
    getRoutine,
    isScheduled,
    logSession,
    removeLog,
    logsOn,
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
    setSettings,
    exportData,
    importData,
    reset,
    seed,
  };
})();
