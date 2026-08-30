/* App: arranque y conexión de eventos. */
(function () {
  const { $, $$, toast } = UI;

  /* ---------- Tema y cabecera ---------- */

  function applyTheme() {
    document.documentElement.dataset.theme = Store.state.settings.theme === 'light' ? 'light' : 'dark';
  }

  function renderTodayLabel() {
    const formatted = new Date().toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    $('#todayLabel').textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  /* ---------- Navegación ---------- */

  $$('.tab').forEach((tab) => tab.addEventListener('click', () => UI.setView(tab.dataset.view)));
  $$('[data-goto]').forEach((btn) => btn.addEventListener('click', () => UI.setView(btn.dataset.goto)));

  $('#themeToggle').addEventListener('click', () => {
    Store.setSettings({ theme: Store.state.settings.theme === 'light' ? 'dark' : 'light' });
    applyTheme();
  });

  /* ---------- Barra de foco ---------- */

  $('#focusToggle').addEventListener('click', () => Timer.toggle());

  $('#focusDone').addEventListener('click', () => {
    const result = Timer.finishEarly();
    if (!result) return;
    toast(result.kind === 'rutina'
      ? `Sesión registrada · ${result.minutes} min`
      : `Pomodoro guardado · ${result.minutes} min`);
  });

  $('#focusCancel').addEventListener('click', () => {
    Timer.cancel();
    toast('Sesión cancelada, no se registró nada');
  });

  /* ---------- Rutinas ---------- */

  $('#addRoutineBtn').addEventListener('click', () => UI.openRoutineDialog(null));

  $('#routineList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    const card = event.target.closest('[data-routine]');
    if (!button || !card) return;
    const routine = Store.getRoutine(card.dataset.routine);
    if (!routine) return;

    switch (button.dataset.action) {
      case 'edit':
        UI.openRoutineDialog(routine);
        break;

      case 'mark': {
        Store.logSession({ routineId: routine.id, count: 1, minutes: 0 });
        const p = Store.progress(routine);
        toast(p.done ? `¡${routine.name} completada hoy! 🎉` : `${routine.name}: ${p.count}/${p.target}`);
        break;
      }

      case 'start':
        startRoutineTimer(routine, routine.minutes);
        break;

      case 'custom': {
        const answer = window.prompt(`¿Cuántos minutos de ${routine.name}?`, String(routine.minutes));
        if (answer === null) return;
        const minutes = Math.round(Number(answer));
        if (!minutes || minutes < 1) { toast('Pon un número de minutos válido'); return; }
        startRoutineTimer(routine, minutes);
        break;
      }

      case 'undo': {
        const todayLogs = Store.logsOn(Store.todayKey(), routine.id).sort((a, b) => b.ts - a.ts);
        if (!todayLogs.length) return;
        Store.removeLog(todayLogs[0].id);
        toast('Último registro deshecho');
        break;
      }

      case 'toggle-timer':
        Timer.toggle();
        break;

      case 'finish-timer': {
        const result = Timer.finishEarly();
        if (result) toast(`Sesión registrada · ${result.minutes} min`);
        break;
      }

      default:
        break;
    }
  });

  function startRoutineTimer(routine, minutes) {
    const active = Timer.session;
    if (active && active.running) {
      const label = active.kind === 'rutina' ? active.label : active.label.toLowerCase();
      if (!window.confirm(`Ya tienes una sesión en marcha (${label}). ¿La sustituimos?`)) return;
    }
    Timer.startRoutine(routine, minutes);
    toast(`${routine.emoji} ${routine.name}: ${minutes} min en marcha`);
  }

  /* ---------- Diálogo de rutina ---------- */

  const dialog = $('#routineDialog');

  $('#rMode').addEventListener('change', UI.syncModeFields);

  $('#rDays').addEventListener('click', (event) => {
    const button = event.target.closest('[data-day]');
    if (!button) return;
    const day = Number(button.dataset.day);
    UI.dialogDays = UI.dialogDays.includes(day)
      ? UI.dialogDays.filter((d) => d !== day)
      : UI.dialogDays.concat(day);
    UI.renderDayPicker();
  });

  $$('#routineDialog [data-close]').forEach((btn) => btn.addEventListener('click', () => dialog.close()));

  $('#rDelete').addEventListener('click', () => {
    const id = UI.editingRoutineId;
    if (!id) return;
    const routine = Store.getRoutine(id);
    if (!window.confirm(`¿Eliminar "${routine.name}" y su historial?`)) return;
    Store.removeRoutine(id);
    dialog.close();
    toast('Rutina eliminada');
  });

  $('#routineForm').addEventListener('submit', (event) => {
    const name = $('#rName').value.trim();
    if (!name) return; // el navegador ya muestra el aviso de campo obligatorio
    if (!UI.dialogDays.length) {
      event.preventDefault();
      toast('Elige al menos un día');
      return;
    }
    const data = {
      emoji: $('#rEmoji').value.trim() || '✅',
      name,
      mode: ($('#rMode input:checked') || {}).value || 'veces',
      goalCount: Number($('#rGoalCount').value),
      minutes: Number($('#rMinutes').value),
      goalMinutes: Number($('#rGoalMinutes').value),
      days: UI.dialogDays.slice(),
    };
    if (data.mode !== 'tiempo') data.goalMinutes = data.minutes;
    if (UI.editingRoutineId) {
      Store.updateRoutine(UI.editingRoutineId, data);
      toast('Rutina actualizada');
    } else {
      Store.addRoutine(data);
      toast('Rutina creada');
    }
    UI.editingRoutineId = null;
  });

  /* ---------- Tareas ---------- */

  $('#taskForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const title = $('#taskTitle').value;
    const task = Store.addTask({ title, estPomodoros: $('#taskEst').value });
    if (!task) return;
    $('#taskTitle').value = '';
    $('#taskEst').value = '1';
    $('#taskTitle').focus();
  });

  $$('#taskFilters .chip').forEach((chip) => chip.addEventListener('click', () => {
    UI.taskFilter = chip.dataset.filter;
    UI.render();
  }));

  function handleTaskClick(event) {
    const control = event.target.closest('[data-action]');
    const row = event.target.closest('[data-task]');
    if (!control || !row) return;
    const id = row.dataset.task;

    if (control.dataset.action === 'toggle') {
      const task = Store.toggleTask(id);
      if (task && task.done) toast('¡Tarea completada! ✓');
      return;
    }
    if (control.dataset.action === 'delete') {
      Store.removeTask(id);
      toast('Tarea eliminada');
      return;
    }
    if (control.dataset.action === 'focus') {
      startPomodoro('work', id);
      UI.setView('pomodoro');
    }
  }

  $('#taskList').addEventListener('click', handleTaskClick);
  $('#todayTasks').addEventListener('click', handleTaskClick);

  /* ---------- Pomodoro ---------- */

  function startPomodoro(phase, taskId) {
    const active = Timer.session;
    if (active && active.running && !window.confirm('Ya hay una sesión en marcha. ¿La sustituimos?')) return;
    Timer.startPomodoro({ phase, taskId: taskId || null, cycle: UI.nextPhase ? UI.nextPhase.cycle : null });
    UI.nextPhase = null;
  }

  $('#pomoStart').addEventListener('click', () => {
    const active = Timer.session;
    if (active && active.kind === 'pomodoro') { Timer.toggle(); return; }
    const phase = UI.nextPhase ? UI.nextPhase.phase : 'work';
    startPomodoro(phase, $('#pomoTask').value || null);
  });

  $('#pomoBreak').addEventListener('click', () => startPomodoro('short', null));

  $('#pomoTask').addEventListener('change', () => UI.render());

  window.addEventListener('rutin:next-phase', (event) => {
    UI.nextPhase = event.detail;
    const label = Timer.phaseLabel(event.detail.phase);
    toast(`Toca: ${label.toLowerCase()}`);
    UI.render();
  });

  /* ---------- Historial (borrar registros) ---------- */

  $('#historyList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="delete-log"]');
    const row = event.target.closest('[data-log]');
    if (!button || !row) return;
    Store.removeLog(row.dataset.log);
    toast('Registro borrado');
  });

  /* ---------- Ajustes ---------- */

  const numberSettings = { setWork: 'work', setShort: 'short', setLong: 'long', setLongEvery: 'longEvery' };
  Object.entries(numberSettings).forEach(([elementId, key]) => {
    $(`#${elementId}`).addEventListener('change', (event) => {
      const value = Math.max(1, Math.round(Number(event.target.value) || 1));
      Store.setSettings({ [key]: value });
    });
  });

  $('#setAuto').addEventListener('change', (e) => Store.setSettings({ autoChain: e.target.checked }));
  $('#setSound').addEventListener('change', (e) => Store.setSettings({ sound: e.target.checked }));

  $('#setNotif').addEventListener('change', async (e) => {
    if (!e.target.checked) { Store.setSettings({ notifications: false }); return; }
    if (!('Notification' in window)) {
      e.target.checked = false;
      toast('Este navegador no admite notificaciones');
      return;
    }
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    const granted = permission === 'granted';
    e.target.checked = granted;
    Store.setSettings({ notifications: granted });
    if (!granted) toast('No se concedió el permiso de notificaciones');
  });

  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([Store.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rutin-app-${Store.todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast('Copia descargada');
  });

  $('#importInput').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      Store.importData(await file.text());
      applyTheme();
      toast('Datos importados');
    } catch (err) {
      toast('No se pudo importar: archivo no válido');
    }
    event.target.value = '';
  });

  $('#seedBtn').addEventListener('click', () => {
    Store.seed();
    UI.setView('hoy');
    toast('Rutina de ejemplo cargada');
  });

  $('#resetBtn').addEventListener('click', () => {
    if (!window.confirm('Esto borra rutinas, tareas e historial de este navegador. ¿Seguro?')) return;
    Timer.cancel();
    Store.reset();
    applyTheme();
    toast('Todo borrado');
  });

  /* ---------- Suscripciones ---------- */

  Store.subscribe(() => UI.render());

  let lastSignature = '';
  Timer.subscribe((session) => {
    const signature = session
      ? `${session.kind}|${session.phase}|${session.routineId}|${session.taskId}|${session.running}`
      : 'idle';
    if (signature !== lastSignature) {
      lastSignature = signature;
      UI.render();
    } else {
      UI.renderTick();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) UI.render();
  });

  /* ---------- Arranque ---------- */

  applyTheme();
  renderTodayLabel();
  Timer.restore();
  UI.render();

  // Cambio de día con la app abierta: refresca el resumen cada minuto.
  let lastDay = Store.todayKey();
  setInterval(() => {
    const today = Store.todayKey();
    if (today !== lastDay) {
      lastDay = today;
      renderTodayLabel();
      UI.render();
    }
  }, 60000);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin conexión offline, no pasa nada */ });
  }
})();
