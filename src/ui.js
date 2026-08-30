/* UI: pinta las vistas y conecta los eventos con Store y Timer. */
window.UI = (function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // la semana empieza en lunes

  let currentView = 'hoy';
  let taskFilter = 'pendientes';
  let editingRoutineId = null;
  let dialogDays = [];
  let nextPhase = null; // fase de pomodoro sugerida tras terminar una
  let toastTimer = null;

  /* ---------- Utilidades ---------- */

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function fmtClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function fmtMinutes(mins) {
    if (!mins) return '0 min';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!h) return `${m} min`;
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function setView(view) {
    currentView = view;
    $$('.tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.view === view));
    $$('.view').forEach((section) => { section.hidden = section.id !== `view-${view}`; });
    render();
  }

  /* ---------- Barra de foco (temporizador activo) ---------- */

  function renderFocus() {
    const bar = $('#focusBar');
    const session = Timer.session;
    document.body.classList.toggle('has-session', !!session);
    if (!session) {
      bar.hidden = true;
      document.title = 'Rutin.app — Rutinas, tareas y pomodoros';
      return;
    }
    const remaining = Timer.remaining();
    const ratio = session.totalMs > 0 ? remaining / session.totalMs : 0;
    bar.hidden = false;
    $('#focusEmoji').textContent = session.emoji;
    $('#focusLabel').textContent = session.kind === 'rutina' ? 'Sesión en marcha' : session.label;
    $('#focusTime').textContent = fmtClock(remaining);
    $('#focusRingArc').style.strokeDashoffset = String(100 - ratio * 100);
    $('#focusToggle').textContent = session.running ? 'Pausar' : 'Reanudar';

    let sub = '';
    if (session.kind === 'rutina') {
      sub = session.label;
    } else if (session.taskId) {
      const task = Store.getTask(session.taskId);
      sub = task ? task.title : '';
    }
    if (!session.running) sub = sub ? `${sub} · en pausa` : 'En pausa';
    $('#focusSub').textContent = sub;
    document.title = `${fmtClock(remaining)} · ${session.kind === 'rutina' ? session.label : session.label}`;
  }

  /* ---------- Vista Hoy ---------- */

  function renderSummary() {
    const today = Store.todayKey();
    const routines = Store.state.routines;
    const scheduled = routines.filter((r) => Store.isScheduled(r, today));
    const completed = scheduled.filter((r) => Store.progress(r, today).done).length;
    const logs = Store.logsOn(today);
    const minutes = logs.reduce((acc, l) => acc + (l.minutes || 0), 0);
    const sessions = logs.reduce((acc, l) => acc + (l.count || 0), 0);
    const pomos = Store.pomodorosOn(today).length;

    $('#daySummary').innerHTML = [
      { value: `${completed}/${scheduled.length}`, label: 'Rutinas de hoy' },
      { value: sessions, label: 'Sesiones hechas' },
      { value: fmtMinutes(minutes), label: 'Tiempo dedicado' },
      { value: pomos, label: 'Pomodoros' },
    ].map((s) => `<div class="stat"><b>${escapeHtml(s.value)}</b><span>${s.label}</span></div>`).join('');
  }

  function routineCard(routine) {
    const today = Store.todayKey();
    const p = Store.progress(routine, today);
    const scheduledToday = Store.isScheduled(routine, today);
    const session = Timer.session;
    const isRunning = !!session && session.kind === 'rutina' && session.routineId === routine.id;

    const goalText = routine.mode === 'tiempo'
      ? `Meta: ${fmtMinutes(routine.goalMinutes)} · sesiones de ${routine.minutes} min`
      : routine.mode === 'ambos'
        ? `Meta: ${routine.goalCount} ${routine.goalCount === 1 ? 'vez' : 'veces'} · sesiones de ${routine.minutes} min`
        : `Meta: ${routine.goalCount} ${routine.goalCount === 1 ? 'vez' : 'veces'} al día`;

    const progressText = p.byTime
      ? `${fmtMinutes(p.minutes)} de ${fmtMinutes(p.target)}`
      : `${p.count} de ${p.target}${p.minutes ? ` · ${fmtMinutes(p.minutes)}` : ''}`;

    const badges = [];
    if (isRunning) badges.push('<span class="badge run">En marcha</span>');
    else if (p.done) badges.push('<span class="badge ok">Hecho ✓</span>');
    if (!scheduledToday) badges.push('<span class="badge">Hoy no toca</span>');
    const st = Store.streak(routine);
    if (st > 1) badges.push(`<span class="badge">🔥 ${st} días</span>`);

    const actions = [];
    if (isRunning) {
      actions.push(`<button class="btn btn-ghost" data-action="toggle-timer">${session.running ? 'Pausar' : 'Reanudar'}</button>`);
      actions.push('<button class="btn btn-primary" data-action="finish-timer">Terminar</button>');
    } else {
      if (routine.mode === 'veces' || routine.mode === 'ambos') {
        actions.push(`<button class="btn btn-primary" data-action="mark">${escapeHtml(routine.emoji)} Hecho</button>`);
      }
      if (routine.mode === 'tiempo' || routine.mode === 'ambos') {
        actions.push(`<button class="btn ${routine.mode === 'tiempo' ? 'btn-primary' : 'btn-ghost'}" data-action="start">▶ ${routine.minutes} min</button>`);
        actions.push('<button class="btn btn-ghost btn-icon" data-action="custom" title="Otra duración">⏱</button>');
      }
    }
    if (p.count || p.minutes) {
      actions.push('<button class="btn btn-ghost btn-icon" data-action="undo" title="Deshacer último registro">↺</button>');
    }

    return `
      <article class="routine ${p.done ? 'is-done' : ''} ${isRunning ? 'is-running' : ''}" data-routine="${routine.id}">
        <button class="routine-edit" data-action="edit" title="Editar rutina" aria-label="Editar rutina">⋯</button>
        <div class="routine-top">
          <span class="routine-emoji">${escapeHtml(routine.emoji)}</span>
          <div>
            <div class="routine-name">${escapeHtml(routine.name)}</div>
            <div class="routine-goal">${escapeHtml(goalText)}</div>
          </div>
        </div>
        <div class="progress"><i style="width:${Math.round(p.ratio * 100)}%"></i></div>
        <div class="routine-goal" data-countdown>${isRunning ? `Quedan ${fmtClock(Timer.remaining())}` : escapeHtml(progressText)}</div>
        ${badges.length ? `<div>${badges.join(' ')}</div>` : ''}
        <div class="routine-actions">${actions.join('')}</div>
      </article>`;
  }

  function renderRoutines() {
    const list = $('#routineList');
    const today = Store.todayKey();
    const routines = Store.state.routines.slice().sort((a, b) => {
      const sa = Store.isScheduled(a, today) ? 0 : 1;
      const sb = Store.isScheduled(b, today) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      const da = Store.progress(a, today).done ? 1 : 0;
      const db = Store.progress(b, today).done ? 1 : 0;
      if (da !== db) return da - db;
      return a.createdAt - b.createdAt;
    });

    if (!routines.length) {
      list.innerHTML = `<div class="empty">
        Todavía no tienes rutinas.<br />
        Crea una con <b>+ Nueva rutina</b> o carga la de ejemplo desde Ajustes.
      </div>`;
      return;
    }
    list.innerHTML = routines.map(routineCard).join('');
  }

  function taskItem(task) {
    const pomos = task.estPomodoros
      ? `${task.donePomodoros}/${task.estPomodoros} 🍅`
      : `${task.donePomodoros} 🍅`;
    return `
      <div class="item ${task.done ? 'is-done' : ''}" data-task="${task.id}">
        <input type="checkbox" ${task.done ? 'checked' : ''} data-action="toggle" aria-label="Marcar tarea" />
        <div class="item-main">
          <span class="item-title">${escapeHtml(task.title)}</span>
          <span class="muted">${pomos}</span>
        </div>
        <div class="item-actions">
          <button class="btn btn-ghost btn-icon" data-action="focus" title="Trabajar con pomodoro">🍅</button>
          <button class="btn btn-ghost btn-icon" data-action="delete" title="Eliminar tarea">🗑</button>
        </div>
      </div>`;
  }

  function renderTodayTasks() {
    const pending = Store.state.tasks.filter((t) => !t.done).slice(0, 5);
    $('#todayTasks').innerHTML = pending.length
      ? pending.map(taskItem).join('')
      : '<div class="empty">No tienes tareas pendientes. 🎉</div>';
  }

  /* ---------- Vista Tareas ---------- */

  function renderTasks() {
    const tasks = Store.state.tasks.filter((t) => (
      taskFilter === 'todas' ? true : taskFilter === 'hechas' ? t.done : !t.done
    ));
    $$('#taskFilters .chip').forEach((chip) => chip.classList.toggle('is-active', chip.dataset.filter === taskFilter));
    $('#taskList').innerHTML = tasks.length
      ? tasks.map(taskItem).join('')
      : '<div class="empty">Nada por aquí.</div>';
  }

  /* ---------- Vista Pomodoro ---------- */

  function renderPomodoro() {
    const session = Timer.session;
    const active = session && session.kind === 'pomodoro' ? session : null;
    const phase = active ? active.phase : (nextPhase ? nextPhase.phase : 'work');
    const remaining = active ? Timer.remaining() : Timer.phaseMinutes(phase) * 60000;
    const total = active ? active.totalMs : remaining;
    const ratio = total > 0 ? remaining / total : 1;

    $('#pomoTime').textContent = fmtClock(remaining);
    $('#pomoPhase').textContent = Timer.phaseLabel(phase);
    $('#pomoArc').style.strokeDashoffset = String(100 - ratio * 100);

    const startBtn = $('#pomoStart');
    if (active) startBtn.textContent = active.running ? 'Pausar' : 'Reanudar';
    else startBtn.textContent = phase === 'work' ? 'Empezar pomodoro' : `Empezar ${Timer.phaseLabel(phase).toLowerCase()}`;

    const select = $('#pomoTask');
    const selected = select.value;
    const pending = Store.state.tasks.filter((t) => !t.done);
    select.innerHTML = ['<option value="">— Sin tarea —</option>']
      .concat(pending.map((t) => `<option value="${t.id}">${escapeHtml(t.title)}</option>`))
      .join('');
    const wanted = active ? active.taskId : (nextPhase ? nextPhase.taskId : selected);
    if (wanted && pending.some((t) => t.id === wanted)) select.value = wanted;
    select.disabled = !!active;

    const doneToday = Store.pomodorosOn(Store.todayKey()).length;
    const minutesToday = Store.pomodorosOn(Store.todayKey()).reduce((acc, p) => acc + p.minutes, 0);
    $('#pomoMeta').textContent = `Hoy: ${doneToday} pomodoro${doneToday === 1 ? '' : 's'} · ${fmtMinutes(minutesToday)} concentrado`;
    $('#pomoBreak').hidden = !!active;
  }

  /* ---------- Vista Progreso ---------- */

  function renderStats() {
    const today = Store.todayKey();
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = Store.dayKey(d);
      const logs = Store.logsOn(key);
      days.push({
        key,
        label: DAY_NAMES[d.getDay()],
        minutes: logs.reduce((acc, l) => acc + (l.minutes || 0), 0),
        sessions: logs.reduce((acc, l) => acc + (l.count || 0), 0),
        pomodoros: Store.pomodorosOn(key).length,
        isToday: key === today,
      });
    }

    const weekSessions = days.reduce((acc, d) => acc + d.sessions, 0);
    const weekMinutes = days.reduce((acc, d) => acc + d.minutes, 0);
    const weekPomos = days.reduce((acc, d) => acc + d.pomodoros, 0);
    const bestStreak = Store.state.routines.reduce((max, r) => Math.max(max, Store.streak(r)), 0);

    $('#statsSummary').innerHTML = [
      { value: weekSessions, label: 'Sesiones (7 días)' },
      { value: fmtMinutes(weekMinutes), label: 'Tiempo (7 días)' },
      { value: weekPomos, label: 'Pomodoros (7 días)' },
      { value: `🔥 ${bestStreak}`, label: 'Mejor racha' },
    ].map((s) => `<div class="stat"><b>${escapeHtml(s.value)}</b><span>${s.label}</span></div>`).join('');

    const max = Math.max(1, ...days.map((d) => d.minutes || d.sessions * 10));
    $('#weekChart').innerHTML = days.map((d) => {
      const value = d.minutes || d.sessions * 10;
      const height = Math.round((value / max) * 110) + 4;
      return `<div class="bar" title="${d.sessions} sesiones · ${fmtMinutes(d.minutes)}">
        <div class="bar-fill ${value ? '' : 'dim'}" style="height:${height}px"></div>
        <small>${d.label}${d.isToday ? ' •' : ''}</small>
        <small>${d.minutes ? `${d.minutes}m` : d.sessions || ''}</small>
      </div>`;
    }).join('');

    const routines = Store.state.routines;
    $('#streakList').innerHTML = routines.length
      ? routines.map((r) => {
        const st = Store.streak(r);
        const week = days.filter((d) => Store.progress(r, d.key).done).length;
        return `<div class="item">
          <span class="routine-emoji">${escapeHtml(r.emoji)}</span>
          <div class="item-main">
            <span class="item-title">${escapeHtml(r.name)}</span>
            <span class="muted">${week} de los últimos 7 días</span>
          </div>
          <span class="badge">🔥 ${st}</span>
        </div>`;
      }).join('')
      : '<div class="empty">Crea rutinas para ver tus rachas.</div>';

    const history = Store.state.logs.slice().sort((a, b) => b.ts - a.ts).slice(0, 25);
    $('#historyList').innerHTML = history.length
      ? history.map((l) => {
        const r = Store.getRoutine(l.routineId);
        const when = new Date(l.ts);
        const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
        return `<div class="item" data-log="${l.id}">
          <span class="routine-emoji">${escapeHtml(r ? r.emoji : '📌')}</span>
          <div class="item-main">
            <span class="item-title">${escapeHtml(r ? r.name : 'Rutina eliminada')}</span>
            <span class="muted">${l.date} · ${time}${l.minutes ? ` · ${fmtMinutes(l.minutes)}` : ''}${l.note ? ` · ${escapeHtml(l.note)}` : ''}</span>
          </div>
          <button class="btn btn-ghost btn-icon" data-action="delete-log" title="Borrar registro">🗑</button>
        </div>`;
      }).join('')
      : '<div class="empty">Aún no hay registros.</div>';
  }

  /* ---------- Vista Ajustes ---------- */

  function renderSettings() {
    const s = Store.state.settings;
    $('#setWork').value = s.work;
    $('#setShort').value = s.short;
    $('#setLong').value = s.long;
    $('#setLongEvery').value = s.longEvery;
    $('#setAuto').checked = !!s.autoChain;
    $('#setSound').checked = !!s.sound;
    $('#setNotif').checked = !!s.notifications;
  }

  /* ---------- Diálogo de rutina ---------- */

  function renderDayPicker() {
    $('#rDays').innerHTML = DAY_ORDER.map((d) => (
      `<button type="button" class="day-btn ${dialogDays.includes(d) ? 'is-on' : ''}" data-day="${d}">${DAY_NAMES[d]}</button>`
    )).join('');
  }

  function syncModeFields() {
    const mode = ($('#rMode input:checked') || {}).value || 'veces';
    $('#fieldGoalCount').hidden = mode === 'tiempo';
    $('#fieldMinutes').hidden = mode === 'veces';
    $('#fieldGoalMinutes').hidden = mode !== 'tiempo';
  }

  function openRoutineDialog(routine) {
    editingRoutineId = routine ? routine.id : null;
    $('#routineDialogTitle').textContent = routine ? 'Editar rutina' : 'Nueva rutina';
    $('#rEmoji').value = routine ? routine.emoji : '✅';
    $('#rName').value = routine ? routine.name : '';
    $('#rGoalCount').value = routine ? routine.goalCount : 1;
    $('#rMinutes').value = routine ? routine.minutes : 30;
    $('#rGoalMinutes').value = routine ? routine.goalMinutes : 30;
    const mode = routine ? routine.mode : 'veces';
    $$('#rMode input').forEach((input) => { input.checked = input.value === mode; });
    dialogDays = routine ? routine.days.slice() : [0, 1, 2, 3, 4, 5, 6];
    $('#rDelete').hidden = !routine;
    renderDayPicker();
    syncModeFields();
    $('#routineDialog').showModal();
    $('#rName').focus();
  }

  /* ---------- Render general ---------- */

  function render() {
    renderFocus();
    if (currentView === 'hoy') {
      renderSummary();
      renderRoutines();
      renderTodayTasks();
    } else if (currentView === 'tareas') {
      renderTasks();
    } else if (currentView === 'pomodoro') {
      renderPomodoro();
    } else if (currentView === 'stats') {
      renderStats();
    } else if (currentView === 'ajustes') {
      renderSettings();
    }
  }

  /* Sólo refresca lo que cambia cada tick (evita repintar listas enteras 4 veces por segundo). */
  function renderTick() {
    renderFocus();
    if (currentView === 'pomodoro') renderPomodoro();
    if (currentView === 'hoy') {
      const session = Timer.session;
      const card = session && session.kind === 'rutina' ? $(`[data-routine="${session.routineId}"]`) : null;
      const label = card ? card.querySelector('[data-countdown]') : null;
      if (label) label.textContent = `Quedan ${fmtClock(Timer.remaining())}`;
    }
  }

  return {
    $,
    $$,
    escapeHtml,
    fmtClock,
    fmtMinutes,
    toast,
    setView,
    render,
    renderTick,
    openRoutineDialog,
    renderDayPicker,
    syncModeFields,
    get currentView() { return currentView; },
    get editingRoutineId() { return editingRoutineId; },
    set editingRoutineId(v) { editingRoutineId = v; },
    get dialogDays() { return dialogDays; },
    set dialogDays(v) { dialogDays = v; },
    get taskFilter() { return taskFilter; },
    set taskFilter(v) { taskFilter = v; },
    get nextPhase() { return nextPhase; },
    set nextPhase(v) { nextPhase = v; },
    DAY_NAMES,
    DAY_ORDER,
  };
})();
