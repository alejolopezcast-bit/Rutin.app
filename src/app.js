/* App: arranque y conexión de eventos. */
(function () {
  const { $, $$, toast } = UI;

  /* ---------- Tema y cabecera ---------- */

  function applyTheme() {
    document.documentElement.dataset.theme = Store.state.settings.theme === 'light' ? 'light' : 'dark';
    UI.syncThemeColor();
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

  $('#installHintClose').addEventListener('click', () => UI.dismissInstallHint());

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

      case 'custom':
        UI.openDurationSheet(routine);
        break;

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

  /* ---------- Hoja de duración ---------- */

  const durationDialog = $('#durationDialog');

  $('#durationChips').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-minutes]');
    if (!chip) return;
    $('#durationInput').value = chip.dataset.minutes;
    $$('#durationChips .chip').forEach((c) => c.classList.toggle('is-active', c === chip));
  });

  $$('#durationDialog [data-close]').forEach((btn) => btn.addEventListener('click', () => durationDialog.close()));

  $('#durationForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const routine = Store.getRoutine(UI.durationRoutineId);
    const minutes = Math.round(Number($('#durationInput').value));
    if (!routine || !minutes || minutes < 1) { toast('Pon un número de minutos válido'); return; }
    durationDialog.close();
    UI.durationRoutineId = null;
    startRoutineTimer(routine, minutes);
  });

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

  /* ---------- Calendario ---------- */

  function moveMonth(amount) {
    const ref = new Date(UI.calendarRef);
    ref.setMonth(ref.getMonth() + amount, 1);
    UI.calendarRef = ref;
    UI.render();
  }

  $('#calPrev').addEventListener('click', () => moveMonth(-1));
  $('#calNext').addEventListener('click', () => moveMonth(1));

  $('#calToday').addEventListener('click', () => {
    UI.calendarRef = new Date();
    UI.calendarSelected = Store.todayKey();
    UI.render();
  });

  $('#calGrid').addEventListener('click', (event) => {
    const cell = event.target.closest('[data-day]');
    if (!cell || cell.disabled) return;
    UI.calendarSelected = cell.dataset.day;
    UI.render();
  });

  /* ---------- Informe ---------- */

  $$('#periodChips .chip').forEach((chip) => chip.addEventListener('click', () => {
    UI.reportPeriod = chip.dataset.period;
    UI.reportRef = new Date();
    UI.render();
  }));

  $('#repPrev').addEventListener('click', () => { UI.shiftPeriod(-1); UI.render(); });
  $('#repNext').addEventListener('click', () => { UI.shiftPeriod(1); UI.render(); });

  /* ---------- Historial (borrar registros) ---------- */

  $('#repHistory').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="delete-log"]');
    const row = event.target.closest('[data-log]');
    if (!button || !row) return;
    Store.removeLog(row.dataset.log);
    toast('Registro borrado');
  });

  /* ---------- Perfiles ---------- */

  const profileDialog = $('#profileDialog');

  $('#profileBtn').addEventListener('click', () => UI.openProfileDialog());
  $('#manageProfilesBtn').addEventListener('click', () => UI.openProfileDialog());
  $$('#profileDialog [data-close]').forEach((btn) => btn.addEventListener('click', () => profileDialog.close()));

  $('#profileList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    const row = event.target.closest('[data-profile]');
    if (!button || !row) return;
    const id = row.dataset.profile;
    const profile = Store.getProfile(id);
    if (!profile) return;

    if (button.dataset.action === 'use') {
      Store.setActiveProfile(id);
      UI.renderProfileList();
      toast(`Ahora usas el perfil de ${profile.name}`);
      return;
    }
    if (button.dataset.action === 'rename') {
      const name = window.prompt('Nombre del perfil', profile.name);
      if (name === null) return;
      Store.updateProfile(id, { name });
      UI.renderProfileList();
      return;
    }
    if (button.dataset.action === 'delete') {
      if (!window.confirm(`¿Eliminar el perfil de ${profile.name} con todas sus rutinas e historial?`)) return;
      Store.removeProfile(id);
      UI.renderProfileList();
      toast('Perfil eliminado');
    }
  });

  $('#profileForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('#pName').value.trim();
    if (!name) return;
    const profile = Store.addProfile({ name, emoji: $('#pEmoji').value.trim() || '🙂' });
    $('#pName').value = '';
    UI.renderProfileList();
    toast(`Perfil de ${profile.name} creado`);
  });

  /* ---------- Compartir rutinas ---------- */

  const shareDialog = $('#shareDialog');
  const receiveDialog = $('#receiveDialog');

  $('#shareRoutinesBtn').addEventListener('click', () => {
    if (!Store.state.routines.length) { toast('Todavía no tienes rutinas que compartir'); return; }
    UI.openShareDialog();
  });

  $('#rShare').addEventListener('click', () => {
    const id = UI.editingRoutineId;
    $('#routineDialog').close();
    UI.openShareDialog(id ? [id] : []);
  });

  $$('#shareDialog [data-close], #receiveDialog [data-close]').forEach((btn) => (
    btn.addEventListener('click', () => btn.closest('dialog').close())
  ));

  $('#shareList').addEventListener('change', (event) => {
    const row = event.target.closest('[data-share-routine]');
    if (!row) return;
    UI.toggleShareRoutine(row.dataset.shareRoutine, event.target.checked);
    UI.showShareOutput(''); // el enlace anterior ya no vale
  });

  /* El enlace lleva las rutinas dentro, en el fragmento: nunca llega a ningún servidor. */
  function shareCode() {
    const routines = UI.selectedRoutines();
    if (!routines.length) { toast('Elige al menos una rutina'); return null; }
    return Store.encodeShare(routines, Store.activeProfile().name);
  }

  function shareLink(code) {
    return `${location.origin}${location.pathname}#compartir=${code}`;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      return false; // Safari lo bloquea fuera de un gesto; queda el texto a la vista
    }
  }

  $('#shareLink').addEventListener('click', async () => {
    const code = shareCode();
    if (!code) return;
    const link = shareLink(code);
    UI.showShareOutput(link);
    toast(await copyToClipboard(link) ? 'Enlace copiado' : 'Copia el enlace de abajo');
  });

  $('#shareCode').addEventListener('click', async () => {
    const code = shareCode();
    if (!code) return;
    UI.showShareOutput(code);
    toast(await copyToClipboard(code) ? 'Código copiado' : 'Copia el código de abajo');
  });

  $('#shareNative').addEventListener('click', async () => {
    const code = shareCode();
    if (!code) return;
    const count = UI.selectedRoutines().length;
    try {
      await navigator.share({
        title: 'Rutinas de Rutin.app',
        text: `Te comparto ${count} ${count === 1 ? 'rutina' : 'rutinas'} de Rutin.app`,
        url: shareLink(code),
      });
    } catch (err) {
      /* el usuario canceló el menú de compartir */
    }
  });

  $('#shareToProfile').addEventListener('click', () => {
    const routines = UI.selectedRoutines();
    if (!routines.length) { toast('Elige al menos una rutina'); return; }
    const targetId = $('#shareProfile').value;
    const target = Store.getProfile(targetId);
    if (!target) return;
    const added = Store.importRoutines(routines, targetId);
    shareDialog.close();
    toast(added
      ? `${added} ${added === 1 ? 'rutina enviada' : 'rutinas enviadas'} a ${target.name}`
      : `${target.name} ya tenía esas rutinas`);
  });

  $('#receiveConfirm').addEventListener('click', () => {
    const payload = UI.pendingShare;
    if (!payload) return;
    const targetId = $('#receiveProfile').value;
    const added = Store.importRoutines(payload.routines, targetId);
    UI.pendingShare = null;
    receiveDialog.close();
    if (added) {
      if (targetId === Store.state.activeProfileId) UI.setView('hoy');
      toast(`${added} ${added === 1 ? 'rutina añadida' : 'rutinas añadidas'}`);
    } else {
      toast('Ya tenías esas rutinas');
    }
  });

  /* Acepta tanto un código suelto como el enlace completo. */
  function readShare(text) {
    const value = String(text || '').trim();
    const match = value.match(/#compartir=([A-Za-z0-9_-]+)/);
    return Store.decodeShare(match ? match[1] : value);
  }

  $('#importCodeForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = $('#importCodeInput').value;
    if (!value.trim()) return;
    try {
      UI.openReceiveDialog(readShare(value));
      $('#importCodeInput').value = '';
    } catch (err) {
      toast('Ese código no es válido');
    }
  });

  /* Al abrir la app con un enlace compartido, proponemos importar. Si la app ya
     estaba abierta, el enlace sólo cambia el hash y no recarga: de ahí el hashchange. */
  function checkSharedLink() {
    const match = location.hash.match(/^#compartir=([A-Za-z0-9_-]+)$/);
    if (!match) return;
    // Limpiamos la URL para que al recargar no vuelva a saltar el diálogo.
    history.replaceState(null, '', location.pathname + location.search);
    try {
      UI.openReceiveDialog(readShare(match[1]));
    } catch (err) {
      toast('El enlace compartido no es válido');
    }
  }

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
    else if (UI.isIOS() && !UI.isStandalone()) toast('En iPhone hay que añadirla a la pantalla de inicio');
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

  /* iOS congela la pestaña al bloquear el móvil o cambiar de app: al volver hay que
     recalcular la cuenta atrás y avisar si terminó mientras tanto. */
  function resumeFromBackground() {
    if (document.hidden) return;
    const finished = Timer.catchUp();
    UI.render();
    if (finished) toast('Se completó una sesión mientras no mirabas ✓');
  }

  document.addEventListener('visibilitychange', resumeFromBackground);
  window.addEventListener('pageshow', resumeFromBackground);
  window.addEventListener('focus', resumeFromBackground);

  /* El primer toque desbloquea el audio (requisito de Safari en iOS). */
  function unlockOnce() {
    Timer.unlockAudio();
    window.removeEventListener('pointerdown', unlockOnce);
    window.removeEventListener('touchstart', unlockOnce);
    window.removeEventListener('keydown', unlockOnce);
  }
  window.addEventListener('pointerdown', unlockOnce);
  window.addEventListener('touchstart', unlockOnce);
  window.addEventListener('keydown', unlockOnce);

  /* ---------- Arranque ---------- */

  applyTheme();
  renderTodayLabel();
  UI.renderInstallHint();
  Timer.restore();
  UI.render();
  checkSharedLink();
  window.addEventListener('hashchange', checkSharedLink);

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
