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
  let nextPhase = null;         // fase de pomodoro sugerida tras terminar una
  let durationRoutineId = null; // rutina esperando a que elijas duración
  let toastTimer = null;
  let calendarRef = new Date();     // mes que muestra el calendario
  let calendarSelected = null;      // día seleccionado en el calendario
  let reportPeriod = 'mes';         // dia | mes | anio | todo
  let reportRef = new Date();       // periodo que muestra el informe
  let shareSelection = new Set();   // rutinas marcadas para compartir
  let pendingShare = null;          // rutinas recibidas pendientes de aceptar

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

  /* Mayúscula sólo en la primera letra: "septiembre de 2026" -> "Septiembre de 2026".
     (text-transform: capitalize pondría también "De".) */
  function capitalize(text) {
    const value = String(text || '');
    return value.charAt(0).toUpperCase() + value.slice(1);
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

  /* ---------- Vista Calendario ---------- */

  const CAL_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  function renderCalendario() {
    const grid = Store.monthGrid(calendarRef.getFullYear(), calendarRef.getMonth());
    $('#calLabel').textContent = capitalize(grid.label);
    $('#calWeekdays').innerHTML = CAL_LETTERS.map((d) => `<span>${d}</span>`).join('');

    const today = Store.todayKey();
    $('#calGrid').innerHTML = grid.cells.map((cell) => {
      const classes = ['cal-day'];
      if (!cell.inMonth) classes.push('out');
      if (cell.isFuture) classes.push('future');
      if (cell.isToday) classes.push('is-today');
      if (cell.ratio >= 0.55) classes.push('is-strong'); // el tinte ya pide texto oscuro
      if (cell.ratio >= 1) classes.push('is-full');
      if (cell.key === (calendarSelected || today)) classes.push('is-selected');
      // El punto sólo marca los días con actividad que no llegó a completar nada:
      // el resto ya se ve en el relleno.
      const activityOnly = cell.sessions > 0 && cell.ratio === 0;
      const title = `${cell.day}: ${cell.done} de ${cell.scheduled || 0} rutinas`;
      return `<button type="button" class="${classes.join(' ')}" data-day="${cell.key}"
        style="--fill:${cell.isFuture ? 0 : cell.ratio}" title="${escapeHtml(title)}"
        ${cell.isFuture ? 'disabled' : ''}>
        <span>${cell.day}</span>
        ${activityOnly ? '<span class="dot"></span>' : ''}
      </button>`;
    }).join('');

    renderDayDetail();
  }

  function renderDayDetail() {
    const key = calendarSelected || Store.todayKey();
    const detail = Store.dayDetail(key);
    const hechas = detail.routines.filter((r) => r.done).length;
    const tocaban = detail.routines.filter((r) => r.scheduled).length;
    const minutos = detail.routines.reduce((acc, r) => acc + r.minutes, 0);

    const rows = detail.routines
      .slice()
      .sort((a, b) => (b.done - a.done) || (b.scheduled - a.scheduled))
      .map((row) => {
        const estado = row.done
          ? '<span class="badge ok">Hecho ✓</span>'
          : row.scheduled
            ? '<span class="badge">Pendiente</span>'
            : '<span class="badge">No tocaba</span>';
        const detalleTexto = row.byTime
          ? `${fmtMinutes(row.minutes)} de ${fmtMinutes(row.target)}`
          : `${row.count} de ${row.target}${row.minutes ? ` · ${fmtMinutes(row.minutes)}` : ''}`;
        return `<div class="item">
          <span class="routine-emoji">${escapeHtml(row.routine.emoji)}</span>
          <div class="item-main">
            <span class="item-title">${escapeHtml(row.routine.name)}</span>
            <span class="muted">${escapeHtml(detalleTexto)}</span>
          </div>
          ${estado}
        </div>`;
      }).join('');

    $('#calDetail').innerHTML = `
      <h2>${escapeHtml(capitalize(detail.label))}</h2>
      <p class="muted">${hechas} de ${tocaban} rutinas que tocaban · ${fmtMinutes(minutos)} · ${detail.pomodoros} pomodoros</p>
      ${rows || '<div class="empty">Sin rutinas todavía.</div>'}`;
  }

  /* ---------- Vista Informe ---------- */

  const PERIOD_TITLES = { dia: 'Actividad por franja horaria', mes: 'Actividad por día', anio: 'Actividad por mes', todo: 'Actividad por mes' };

  /* Mueve el periodo hacia delante o hacia atrás (un día, un mes o un año). */
  function shiftPeriod(direction) {
    const ref = new Date(reportRef);
    if (reportPeriod === 'dia') ref.setDate(ref.getDate() + direction);
    else if (reportPeriod === 'mes') ref.setMonth(ref.getMonth() + direction, 1);
    else if (reportPeriod === 'anio') ref.setFullYear(ref.getFullYear() + direction, 0, 1);
    else return;
    reportRef = ref;
  }

  function renderInforme() {
    $$('#periodChips .chip').forEach((chip) => chip.classList.toggle('is-active', chip.dataset.period === reportPeriod));

    const range = Store.rangeFor(reportPeriod, reportRef);
    const rep = Store.report(range.from, range.to);
    const today = Store.todayKey();

    $('#repLabel').textContent = capitalize(range.label);
    $('#repPrev').disabled = reportPeriod === 'todo';
    $('#repNext').disabled = reportPeriod === 'todo' || range.to >= today;

    $('#repSummary').innerHTML = [
      { value: `${Math.round(rep.rate * 100)}%`, label: `Cumplimiento (${rep.completed}/${rep.expected})` },
      { value: rep.sessions, label: 'Sesiones' },
      { value: fmtMinutes(rep.minutes), label: 'Tiempo dedicado' },
      { value: rep.pomodoros, label: 'Pomodoros' },
    ].map((s) => `<div class="stat"><b>${escapeHtml(s.value)}</b><span>${escapeHtml(s.label)}</span></div>`).join('');

    // Gráfico: minutos si los hay, y si no, número de sesiones.
    const data = Store.series(reportPeriod, reportRef);
    const useMinutes = data.some((d) => d.minutes > 0);
    const max = Math.max(1, ...data.map((d) => (useMinutes ? d.minutes : d.sessions)));
    $('#repChartTitle').textContent = PERIOD_TITLES[reportPeriod];
    $('#repChart').innerHTML = data.map((d) => {
      const value = useMinutes ? d.minutes : d.sessions;
      const height = Math.round((value / max) * 120) + 4;
      const isToday = d.key === today;
      return `<div class="bar ${isToday ? 'is-today' : ''}" title="${escapeHtml(d.label)}: ${d.sessions} sesiones · ${fmtMinutes(d.minutes)}">
        <div class="bar-fill ${value ? '' : 'dim'}" style="height:${height}px"></div>
        <small class="value">${value || ''}</small>
        <small>${escapeHtml(d.label)}</small>
      </div>`;
    }).join('');

    $('#repRoutines').innerHTML = rep.perRoutine.length
      ? rep.perRoutine.map((row) => {
        const pct = row.daysScheduled ? Math.round((row.daysDone / row.daysScheduled) * 100) : (row.daysDone ? 100 : 0);
        const resumen = [
          `${row.daysDone} de ${row.daysScheduled} días`,
          row.count ? `${row.count} ${row.count === 1 ? 'vez' : 'veces'}` : '',
          row.minutes ? fmtMinutes(row.minutes) : '',
        ].filter(Boolean).join(' · ');
        return `<div class="item">
          <span class="routine-emoji">${escapeHtml(row.routine.emoji)}</span>
          <div class="item-main">
            <span class="item-title">${escapeHtml(row.routine.name)}</span>
            <span class="muted">${escapeHtml(resumen)}</span>
            <div class="rep-bar"><i style="width:${Math.min(100, pct)}%"></i></div>
          </div>
          <span class="rep-pct">${pct}%</span>
        </div>`;
      }).join('')
      : '<div class="empty">Crea rutinas para ver el informe.</div>';

    const history = Store.state.logs
      .filter((l) => l.date >= range.from && l.date <= range.to)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 30);
    $('#repHistory').innerHTML = history.length
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
      : '<div class="empty">Sin registros en este periodo.</div>';
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
    $('#rShare').hidden = !routine;
    renderDayPicker();
    syncModeFields();
    $('#routineDialog').showModal();
    $('#rName').focus();
  }

  /* ---------- Perfiles ---------- */

  function renderProfileChip() {
    const profile = Store.activeProfile();
    if (!profile) return;
    $('#profileEmoji').textContent = profile.emoji;
    $('#profileName').textContent = profile.name;
  }

  function renderProfileList() {
    const activeId = Store.state.activeProfileId;
    const profiles = Store.state.profiles;
    $('#profileList').innerHTML = profiles.map((profile) => {
      const isActive = profile.id === activeId;
      return `<div class="item profile-row ${isActive ? 'is-active' : ''}" data-profile="${profile.id}">
        <span class="routine-emoji">${escapeHtml(profile.emoji)}</span>
        <div class="item-main">
          <span class="item-title">${escapeHtml(profile.name)}</span>
          <span class="muted">${Store.profileSummary(profile.id)}</span>
        </div>
        ${isActive ? '<span class="badge ok">En uso</span>' : '<button class="btn btn-ghost" data-action="use">Usar</button>'}
        <div class="item-actions">
          <button class="btn btn-ghost btn-icon" data-action="rename" title="Cambiar nombre">✏️</button>
          ${profiles.length > 1 ? '<button class="btn btn-ghost btn-icon" data-action="delete" title="Eliminar perfil">🗑</button>' : ''}
        </div>
      </div>`;
    }).join('');
  }

  function openProfileDialog() {
    renderProfileList();
    $('#pName').value = '';
    $('#pEmoji').value = '🙂';
    $('#profileDialog').showModal();
  }

  /* ---------- Compartir rutinas ---------- */

  function profileOptions(excludeActive) {
    const activeId = Store.state.activeProfileId;
    return Store.state.profiles
      .filter((p) => !excludeActive || p.id !== activeId)
      .map((p) => `<option value="${p.id}">${escapeHtml(p.emoji)} ${escapeHtml(p.name)}</option>`)
      .join('');
  }

  function renderShareList() {
    $('#shareList').innerHTML = Store.state.routines.map((routine) => `
      <label class="item" data-share-routine="${routine.id}">
        <input type="checkbox" ${shareSelection.has(routine.id) ? 'checked' : ''} />
        <span class="routine-emoji">${escapeHtml(routine.emoji)}</span>
        <div class="item-main"><span class="item-title">${escapeHtml(routine.name)}</span></div>
      </label>`).join('') || '<div class="empty">No tienes rutinas que compartir.</div>';
  }

  function openShareDialog(routineIds) {
    const all = Store.state.routines.map((r) => r.id);
    shareSelection = new Set(routineIds && routineIds.length ? routineIds : all);
    renderShareList();

    // El bloque de perfiles sólo tiene sentido si hay más de uno en el dispositivo.
    const others = profileOptions(true);
    $('#shareProfile').innerHTML = others;
    $('#shareProfileField').hidden = !others;
    $('#shareNative').hidden = !navigator.share;
    showShareOutput('');
    $('#shareDialog').showModal();
  }

  /* El campo del enlace sólo aparece cuando hay algo que copiar. */
  function showShareOutput(value) {
    $('#shareOutput').value = value;
    $('#shareOutputField').hidden = !value;
  }

  function selectedRoutines() {
    return Store.state.routines.filter((r) => shareSelection.has(r.id));
  }

  function toggleShareRoutine(id, checked) {
    if (checked) shareSelection.add(id);
    else shareSelection.delete(id);
  }

  function openReceiveDialog(payload) {
    pendingShare = payload;
    const total = payload.routines.length;
    $('#receiveFrom').textContent = payload.from
      ? `${payload.from} te comparte ${total} ${total === 1 ? 'rutina' : 'rutinas'}.`
      : `Has recibido ${total} ${total === 1 ? 'rutina' : 'rutinas'}.`;
    $('#receiveList').innerHTML = payload.routines.map((routine) => {
      const meta = routine.mode === 'tiempo'
        ? `Por tiempo · ${routine.goalMinutes} min al día`
        : routine.mode === 'ambos'
          ? `Por veces o por tiempo · ${routine.goalCount}/día · sesiones de ${routine.minutes} min`
          : `Por veces · ${routine.goalCount} al día`;
      return `<div class="item">
        <span class="routine-emoji">${escapeHtml(routine.emoji)}</span>
        <div class="item-main">
          <span class="item-title">${escapeHtml(routine.name)}</span>
          <span class="muted">${escapeHtml(meta)}</span>
        </div>
      </div>`;
    }).join('');
    $('#receiveProfile').innerHTML = profileOptions(false);
    $('#receiveProfile').value = Store.state.activeProfileId;
    $('#receiveDialog').showModal();
  }

  /* ---------- Hoja de duración ---------- */

  const DURATION_PRESETS = [5, 10, 15, 20, 25, 30, 45, 60, 90];

  function openDurationSheet(routine) {
    durationRoutineId = routine.id;
    $('#durationTitle').textContent = `${routine.emoji} ${routine.name}`;
    $('#durationInput').value = routine.minutes;
    const options = DURATION_PRESETS.includes(routine.minutes)
      ? DURATION_PRESETS
      : DURATION_PRESETS.concat(routine.minutes).sort((a, b) => a - b);
    $('#durationChips').innerHTML = options.map((m) => (
      `<button type="button" class="chip ${m === routine.minutes ? 'is-active' : ''}" data-minutes="${m}">${m} min</button>`
    )).join('');
    $('#durationDialog').showModal();
  }

  /* ---------- Aviso de instalación (iOS) ---------- */

  const HINT_KEY = 'rutin.app.install-hint-dismissed';

  function isStandalone() {
    return window.navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches;
  }

  function isIOS() {
    const ua = navigator.userAgent;
    // iPadOS se presenta como Mac, se distingue por tener pantalla táctil.
    return /iPad|iPhone|iPod/.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function renderInstallHint() {
    let dismissed = false;
    try { dismissed = localStorage.getItem(HINT_KEY) === '1'; } catch (err) { dismissed = false; }
    $('#installHint').hidden = dismissed || isStandalone() || !isIOS();
  }

  function dismissInstallHint() {
    try { localStorage.setItem(HINT_KEY, '1'); } catch (err) { /* modo privado */ }
    $('#installHint').hidden = true;
  }

  /* Tiñe la barra de estado del iPhone con el color del tema activo. */
  function syncThemeColor() {
    const meta = $('#themeColorMeta');
    if (meta) meta.setAttribute('content', Store.state.settings.theme === 'light' ? '#f5f6fa' : '#0f1115');
  }

  /* ---------- Render general ---------- */

  function render() {
    renderFocus();
    renderProfileChip();
    if (currentView === 'hoy') {
      renderSummary();
      renderRoutines();
      renderTodayTasks();
    } else if (currentView === 'tareas') {
      renderTasks();
    } else if (currentView === 'pomodoro') {
      renderPomodoro();
    } else if (currentView === 'calendario') {
      renderCalendario();
    } else if (currentView === 'informe') {
      renderInforme();
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
    capitalize,
    toast,
    setView,
    render,
    renderTick,
    openRoutineDialog,
    renderDayPicker,
    syncModeFields,
    openDurationSheet,
    openProfileDialog,
    renderProfileList,
    renderProfileChip,
    openShareDialog,
    renderShareList,
    showShareOutput,
    selectedRoutines,
    toggleShareRoutine,
    openReceiveDialog,
    shiftPeriod,
    renderInstallHint,
    dismissInstallHint,
    syncThemeColor,
    isStandalone,
    isIOS,
    get durationRoutineId() { return durationRoutineId; },
    set durationRoutineId(v) { durationRoutineId = v; },
    get calendarRef() { return calendarRef; },
    set calendarRef(v) { calendarRef = v; },
    get calendarSelected() { return calendarSelected; },
    set calendarSelected(v) { calendarSelected = v; },
    get reportPeriod() { return reportPeriod; },
    set reportPeriod(v) { reportPeriod = v; },
    get reportRef() { return reportRef; },
    set reportRef(v) { reportRef = v; },
    get pendingShare() { return pendingShare; },
    set pendingShare(v) { pendingShare = v; },
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
