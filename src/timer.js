/* Timer: motor único de sesiones activas (cuenta atrás de una rutina o pomodoro).
   Sólo hay una sesión a la vez; se guarda en localStorage para sobrevivir a recargas. */
window.Timer = (function () {
  const KEY = 'rutin.app.timer.v1';
  const TICK_MS = 250;

  let session = null;      // sesión activa (o null)
  let intervalId = null;
  const listeners = new Set();

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function emit() {
    listeners.forEach((fn) => fn(session));
  }

  function persist() {
    try {
      if (session) localStorage.setItem(KEY, JSON.stringify(session));
      else localStorage.removeItem(KEY);
    } catch (err) {
      console.warn('No se pudo guardar el temporizador.', err);
    }
  }

  function remaining() {
    if (!session) return 0;
    if (!session.running) return Math.max(0, session.remainingMs);
    return Math.max(0, session.endsAt - Date.now());
  }

  function ensureLoop() {
    if (!session || !session.running) return;
    acquireWakeLock();
    if (intervalId) return;
    intervalId = setInterval(tick, TICK_MS);
  }

  function stopLoop() {
    releaseWakeLock();
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = null;
  }

  function tick() {
    if (!session || !session.running) { stopLoop(); return; }
    if (remaining() <= 0) complete();
    else emit();
  }

  /* ---------- Avisos ---------- */

  let audioCtx = null;

  /* iOS sólo deja sonar el audio si el contexto se creó y arrancó desde un gesto
     del usuario, así que lo desbloqueamos en el primer toque y lo reutilizamos. */
  function unlockAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const source = audioCtx.createBufferSource();
      source.buffer = audioCtx.createBuffer(1, 1, 22050); // pitido mudo que abre la salida
      source.connect(audioCtx.destination);
      source.start(0);
    } catch (err) {
      /* sin audio se sigue pudiendo usar la app */
    }
  }

  function beep() {
    if (!Store.state.settings.sound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const ctx = audioCtx;
      const now = ctx.currentTime;
      [0, 0.22, 0.44].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(i === 2 ? 1046 : 784, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.2);
      });
    } catch (err) {
      /* el audio es un extra: si falla, seguimos */
    }
  }

  async function notify(title, body) {
    beep();
    if (!Store.state.settings.notifications) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const options = { body, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', tag: 'rutin-app' };
    try {
      // iOS no admite `new Notification()`: exige la del service worker.
      const registration = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (registration && registration.showNotification) {
        await registration.showNotification(title, options);
        return;
      }
      new Notification(title, options);
    } catch (err) {
      /* si el navegador no deja notificar, nos quedamos con el sonido */
    }
  }

  /* ---------- Pantalla encendida ---------- */

  let wakeLock = null;

  async function acquireWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (err) {
      /* el sistema puede negarlo (batería baja, pestaña oculta): no es grave */
    }
  }

  function releaseWakeLock() {
    if (!wakeLock) return;
    const current = wakeLock;
    wakeLock = null;
    current.release().catch(() => {});
  }

  /* ---------- Arranque de sesiones ---------- */

  function startRoutine(routine, minutes) {
    const mins = Math.max(1, Math.round(Number(minutes) || routine.minutes || 1));
    const totalMs = mins * 60000;
    session = {
      kind: 'rutina',
      phase: null,
      routineId: routine.id,
      taskId: null,
      emoji: routine.emoji || '⏳',
      label: routine.name,
      totalMs,
      remainingMs: totalMs,
      endsAt: Date.now() + totalMs,
      running: true,
      cycle: 0,
    };
    persist();
    ensureLoop();
    emit();
    return session;
  }

  function phaseMinutes(phase) {
    const s = Store.state.settings;
    if (phase === 'short') return s.short;
    if (phase === 'long') return s.long;
    return s.work;
  }

  function phaseLabel(phase) {
    if (phase === 'short') return 'Descanso corto';
    if (phase === 'long') return 'Descanso largo';
    return 'Concentración';
  }

  function startPomodoro({ taskId = null, phase = 'work', cycle = null } = {}) {
    const totalMs = Math.max(1, phaseMinutes(phase)) * 60000;
    const keepCycle = cycle !== null ? cycle : (session && session.kind === 'pomodoro' ? session.cycle : 0);
    session = {
      kind: 'pomodoro',
      phase,
      routineId: null,
      taskId,
      emoji: phase === 'work' ? '🍅' : '☕',
      label: phaseLabel(phase),
      totalMs,
      remainingMs: totalMs,
      endsAt: Date.now() + totalMs,
      running: true,
      cycle: keepCycle,
    };
    persist();
    ensureLoop();
    emit();
    return session;
  }

  /* ---------- Control ---------- */

  function pause() {
    if (!session || !session.running) return;
    session.remainingMs = remaining();
    session.running = false;
    stopLoop();
    persist();
    emit();
  }

  function resume() {
    if (!session || session.running) return;
    session.endsAt = Date.now() + session.remainingMs;
    session.running = true;
    persist();
    ensureLoop();
    emit();
  }

  function toggle() {
    if (!session) return;
    if (session.running) pause();
    else resume();
  }

  function elapsedMinutes() {
    if (!session) return 0;
    return Math.round((session.totalMs - remaining()) / 60000);
  }

  function clear() {
    session = null;
    stopLoop();
    persist();
    emit();
  }

  /* Termina antes de tiempo y registra lo que se lleva hecho. */
  function finishEarly() {
    if (!session) return null;
    const minutes = elapsedMinutes();
    const current = session;
    if (current.kind === 'rutina') {
      Store.logSession({ routineId: current.routineId, minutes, count: 1, note: 'parcial' });
    } else if (current.phase === 'work' && minutes > 0) {
      Store.logPomodoro({ taskId: current.taskId, minutes });
      if (current.taskId) Store.addPomodoroToTask(current.taskId);
    }
    clear();
    return { minutes, kind: current.kind };
  }

  function cancel() {
    clear();
  }

  /* Deja preparada la siguiente fase sin arrancarla (cuando no se encadena solo). */
  function announceNext(detail) {
    window.dispatchEvent(new CustomEvent('rutin:next-phase', { detail }));
    emit();
  }

  /* Sesión terminada de forma natural (llegó a cero). */
  function complete() {
    if (!session) return;
    const finished = session;
    stopLoop();

    if (finished.kind === 'rutina') {
      const minutes = Math.round(finished.totalMs / 60000);
      Store.logSession({ routineId: finished.routineId, minutes, count: 1 });
      const routine = Store.getRoutine(finished.routineId);
      clear();
      notify('¡Sesión completada!', `${routine ? routine.name : 'Rutina'} · ${minutes} min`);
      return;
    }

    // Pomodoro
    const settings = Store.state.settings;
    if (finished.phase === 'work') {
      const minutes = Math.round(finished.totalMs / 60000);
      Store.logPomodoro({ taskId: finished.taskId, minutes });
      if (finished.taskId) Store.addPomodoroToTask(finished.taskId);
      const cycle = finished.cycle + 1;
      const next = cycle % Math.max(2, settings.longEvery) === 0 ? 'long' : 'short';
      clear();
      notify('Pomodoro completado', `Toca ${phaseLabel(next).toLowerCase()} de ${phaseMinutes(next)} min`);
      if (settings.autoChain) startPomodoro({ taskId: finished.taskId, phase: next, cycle });
      else announceNext({ phase: next, taskId: finished.taskId, cycle });
      return;
    }

    const cycle = finished.cycle;
    clear();
    notify('Descanso terminado', 'Cuando quieras, vuelve a la carga 🍅');
    if (settings.autoChain) startPomodoro({ taskId: finished.taskId, phase: 'work', cycle });
    else announceNext({ phase: 'work', taskId: finished.taskId, cycle });
  }

  /* iOS congela el JavaScript al bloquear la pantalla o cambiar de app. Al volver
     recalculamos desde la marca de tiempo: si la sesión ya venció, la cerramos y
     avisamos de que se completó mientras no estabas. */
  function catchUp() {
    if (!session) return false;
    if (session.running && remaining() <= 0) {
      complete();
      return true;
    }
    if (session.running) ensureLoop();
    emit();
    return false;
  }

  /* Restaura una sesión guardada; si expiró mientras la app estaba cerrada, la cierra bien. */
  function restore() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || !saved.kind) return;
      session = saved;
      if (session.running && remaining() <= 0) complete();
      else if (session.running) ensureLoop();
      emit();
    } catch (err) {
      console.warn('No se pudo restaurar el temporizador.', err);
      localStorage.removeItem(KEY);
    }
  }

  return {
    subscribe,
    get session() { return session; },
    remaining,
    elapsedMinutes,
    unlockAudio,
    catchUp,
    startRoutine,
    startPomodoro,
    phaseMinutes,
    phaseLabel,
    pause,
    resume,
    toggle,
    finishEarly,
    cancel,
    restore,
  };
})();
