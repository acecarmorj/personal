(function () {
  "use strict";

  const Store = window.ProFitnessStore;
  const Finance = window.ProFitnessFinance;
  if (!Store || !Finance) return;

  let state = Store.loadData();
  let authSession = Store.loadAuthSession();
  let studentSession = Store.loadStudentSession();
  let activeScreen = "home";
  let activeWorkoutDivision = "todos";
  let selectedAgendaDate = Store.todayISO();
  let pendingEnrollmentId = "";
  let enrollmentStarted = false;
  let scannerStream = null;
  let scannerActive = false;
  let detector = null;
  let workoutTimer = null;
  let restTimer = null;
  let restTimerEndsAt = 0;
  let gateCredential = null;
  let studentSyncPromise = null;
  let studentSyncTimer = null;
  let studentAuthTimer = null;
  let deferredInstallPrompt = null;

  const STUDENT_SYNC_QUEUE_PREFIX = Store.storageKey("student-sync-queue-v2");
  const STUDENT_LAST_SYNC_PREFIX = Store.storageKey("student-last-sync-v2");
  const STUDENT_SYNC_RESOURCES = ["workoutSessions", "exerciseSets"];
  const STUDENT_SYNC_INTERVAL_MS = 60000;

  const onboardingView = document.getElementById("onboardingView");
  const studentView = document.getElementById("studentView");
  const enrollmentWelcome = document.getElementById("enrollmentWelcome");
  const passwordChangeCard = document.getElementById("passwordChangeCard");
  const studentLoginForm = document.getElementById("studentLoginForm");
  const studentPasswordChangeForm = document.getElementById("studentPasswordChangeForm");
  const scannerModal = document.getElementById("scannerModal");
  const scannerVideo = document.getElementById("scannerVideo");
  const workoutSessionDialog = document.getElementById("workoutSessionDialog");
  const finishWorkoutDialog = document.getElementById("finishWorkoutDialog");
  const toast = document.getElementById("toast");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character]));
  }

  function safeNumber(value) {
    const parsed = Number(String(value ?? "").replace(",", ".").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value || "").match(/\d+/)?.[0] || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : Number(fallback || 1);
  }

  function parseRestSeconds(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(",", ".");
    const clock = normalized.match(/^(\d{1,2}):(\d{2})$/);
    if (clock) return Math.min(600, Number(clock[1]) * 60 + Number(clock[2]));
    const amount = Number.parseFloat(normalized.match(/[\d.]+/)?.[0] || "0");
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const seconds = /min/.test(normalized) ? amount * 60 : amount;
    return Math.min(600, Math.max(5, Math.round(seconds)));
  }

  function formatClock(totalSeconds) {
    const safeSeconds = Math.max(0, Math.ceil(Number(totalSeconds || 0)));
    return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
  }

  function normalizeText(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function dateAtNoon(value) {
    return new Date(`${String(value || Store.todayISO()).slice(0, 10)}T12:00:00`);
  }

  function toLocalISO(date) {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Sao_Paulo" }).format(date);
  }

  function formatDuration(minutes) {
    const safeMinutes = Math.max(0, Math.round(Number(minutes || 0)));
    const hours = Math.floor(safeMinutes / 60);
    const remaining = safeMinutes % 60;
    if (!hours) return `${remaining} min`;
    return `${hours}h${String(remaining).padStart(2, "0")}`;
  }

  function isStandaloneApp() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function renderInstallOption() {
    const button = document.getElementById("installStudentAppButton");
    const hint = document.getElementById("installStudentAppHint");
    if (!button || !hint) return;
    button.hidden = isStandaloneApp();
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    hint.textContent = deferredInstallPrompt
      ? "Abrir em tela cheia direto do seu celular"
      : isIOS
        ? "No Safari: Compartilhar e Adicionar a Tela de Inicio"
        : "Adicionar a tela inicial deste celular";
  }

  async function installStudentApp() {
    if (isStandaloneApp()) {
      showToast("O Pro Fitness ja esta aberto como aplicativo.");
      renderInstallOption();
      return;
    }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      renderInstallOption();
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    showToast(isIOS
      ? "No Safari, toque em Compartilhar e depois em Adicionar a Tela de Inicio."
      : "No menu do navegador, escolha Instalar app ou Adicionar a tela inicial.");
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 2800);
  }

  function stopRestTimer() {
    window.clearInterval(restTimer);
    restTimer = null;
    restTimerEndsAt = 0;
    const panel = document.getElementById("restTimerPanel");
    if (panel) panel.hidden = true;
  }

  function startRestTimer(seconds, nextExerciseName) {
    stopRestTimer();
    if (!seconds) return;
    const panel = document.getElementById("restTimerPanel");
    const value = document.getElementById("restTimerValue");
    const exercise = document.getElementById("restTimerExercise");
    if (!panel || !value || !exercise) return;
    restTimerEndsAt = Date.now() + seconds * 1000;
    exercise.textContent = nextExerciseName ? `Proxima: ${nextExerciseName}` : "Prepare a proxima serie";
    panel.hidden = false;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((restTimerEndsAt - Date.now()) / 1000));
      value.textContent = formatClock(remaining);
      panel.style.setProperty("--rest-progress", `${(remaining / seconds) * 100}%`);
      if (remaining > 0) return;
      stopRestTimer();
      if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
      showToast("Descanso concluido. Proxima serie!");
    };
    update();
    restTimer = window.setInterval(update, 500);
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  }

  function syncState() {
    state = Store.loadData();
    authSession = Store.loadAuthSession();
    studentSession = Store.loadStudentSession();
    if (!authSession || authSession.account?.role !== "student") {
      Store.clearStudentSession();
      studentSession = null;
    }
    if (studentSession && !Store.findStudent(state, studentSession.studentId)) {
      Store.clearStudentSession();
      studentSession = null;
    }
  }

  function persistState(nextState, options) {
    const settings = options || {};
    const previousState = state;
    state = Store.migrateData(nextState);
    Store.saveData(state);
    if (!Store.isLocalDemoSession(authSession)) enqueueStudentSyncOperations(buildStudentSyncOperations(previousState, state));
    renderStudentSyncStatus();
    if (settings.render !== false) render();
    if (settings.message) showToast(settings.message);
    flushStudentSyncQueue({ notify: false });
  }

  function getCurrentStudent() {
    return studentSession ? Store.findStudent(state, studentSession.studentId) : null;
  }

  function getInitials(name) {
    const parts = String(name || "PF").trim().split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] || "P") + (parts.length > 1 ? parts[parts.length - 1][0] : "F");
  }

  function setStudentSyncStatus(mode, text) {
    const dot = document.getElementById("studentSyncDot");
    const label = document.getElementById("studentSyncText");
    if (!dot || !label) return;
    dot.className = mode || "";
    label.textContent = text || "Dados locais";
  }

  function loadStudentSyncQueue() {
    try {
      const parsed = JSON.parse(localStorage.getItem(getStudentStorageKey(STUDENT_SYNC_QUEUE_PREFIX)) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => item?.resource && item?.recordId) : [];
    } catch (error) {
      return [];
    }
  }

  function saveStudentSyncQueue(queue) {
    localStorage.setItem(getStudentStorageKey(STUDENT_SYNC_QUEUE_PREFIX), JSON.stringify(Array.isArray(queue) ? queue : []));
    renderStudentSyncStatus();
  }

  function buildStudentSyncOperations(beforeState, afterState) {
    return Store.buildRemoteRecordOperations(beforeState, afterState, STUDENT_SYNC_RESOURCES).map((operation) => ({
      ...operation,
      id: Store.uid("SYNCALU"),
      accountId: authSession?.account?.id || "",
      studentId: authSession?.account?.personId || "",
      queuedAt: new Date().toISOString()
    }));
  }

  function enqueueStudentSyncOperations(operations) {
    if (!Array.isArray(operations) || !operations.length) return;
    const order = [];
    const byRecord = new Map();
    loadStudentSyncQueue().concat(operations).forEach((operation) => {
      const key = `${operation.resource}:${operation.recordId}`;
      if (!byRecord.has(key)) order.push(key);
      byRecord.set(key, operation);
    });
    saveStudentSyncQueue(order.map((key) => byRecord.get(key)).filter(Boolean));
  }

  function formatLastStudentSync() {
    const value = localStorage.getItem(getStudentStorageKey(STUDENT_LAST_SYNC_PREFIX));
    if (!value) return "Ainda nao enviado";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Ainda nao enviado";
    return `Sincronizado ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(parsed)}`;
  }

  function renderStudentSyncStatus(mode, customText) {
    const pending = loadStudentSyncQueue().length;
    const resolved = mode || (Store.isLocalDemoSession(authSession) ? "local" : pending ? "pending" : navigator.onLine === false ? "offline" : Store.isRemoteConfigured() ? "online" : "");
    const labels = {
      online: formatLastStudentSync(),
      pending: pending === 1 ? "1 envio pendente" : `${pending} envios pendentes`,
      offline: pending ? `${pending} salvo${pending === 1 ? "" : "s"} no celular` : "Sem internet",
      syncing: "Enviando dados",
      error: "Envio pendente",
      local: "Demonstracao local"
    };
    setStudentSyncStatus(resolved, customText || labels[resolved] || "Dados locais");
  }

  async function sendStudentSyncOperation(operation) {
    if (operation.action === "delete") {
      return Store.deleteRemoteRecord(operation.resource, operation.recordId, operation.data?.expectedUpdatedAt);
    }
    return Store.upsertRemoteRecord(operation.resource, operation.data);
  }

  async function flushStudentSyncQueue(options) {
    const settings = options || {};
    if (!authSession || authSession.account?.role !== "student") {
      renderStudentSyncStatus("", "Entre para sincronizar");
      return false;
    }
    if (studentSyncPromise) return studentSyncPromise;
    studentSyncPromise = (async () => {
      if (Store.isLocalDemoSession(authSession)) {
        saveStudentSyncQueue([]);
        renderStudentSyncStatus("local");
        return true;
      }
      if (!Store.isRemoteConfigured()) {
        renderStudentSyncStatus("", "Dados deste celular");
        return false;
      }
      if (navigator.onLine === false) {
        renderStudentSyncStatus("offline");
        return false;
      }
      if (!loadStudentSyncQueue().length) {
        renderStudentSyncStatus("online");
        return true;
      }
      renderStudentSyncStatus("syncing");
      let sent = 0;
      while (loadStudentSyncQueue().length) {
        const operation = loadStudentSyncQueue()[0];
        await sendStudentSyncOperation(operation);
        const latest = loadStudentSyncQueue();
        const index = latest.findIndex((item) => item.id === operation.id);
        if (index >= 0) {
          latest.splice(index, 1);
          saveStudentSyncQueue(latest);
        }
        sent += 1;
      }
      localStorage.setItem(getStudentStorageKey(STUDENT_LAST_SYNC_PREFIX), new Date().toISOString());
      renderStudentSyncStatus("online");
      if (settings.notify) showToast(sent ? `${sent} alteracao${sent === 1 ? "" : "es"} enviada${sent === 1 ? "" : "s"}.` : "Dados atualizados.");
      return true;
    })().catch((error) => {
      const queue = loadStudentSyncQueue();
      if (queue[0]) {
        queue[0] = { ...queue[0], lastError: error?.message || "Falha de sincronizacao", lastAttemptAt: new Date().toISOString() };
        saveStudentSyncQueue(queue);
      }
      renderStudentSyncStatus(navigator.onLine === false ? "offline" : "error");
      if (settings.notify) showToast(error?.code === "SYNC_CONFLICT" ? "Existe uma versao mais recente na academia. O envio ficou pendente." : "Dados preservados no celular. Tentaremos novamente.");
      return false;
    }).finally(() => {
      studentSyncPromise = null;
    });
    return studentSyncPromise;
  }

  async function refreshStudentFromRemote() {
    if (!authSession || authSession.account?.role !== "student" || Store.isLocalDemoSession(authSession) || !Store.isRemoteConfigured() || navigator.onLine === false || loadStudentSyncQueue().length) return false;
    const baseline = JSON.stringify(Store.loadData());
    try {
      renderStudentSyncStatus("syncing", "Atualizando dados");
      const remoteRaw = await Store.fetchStudentBootstrap();
      if (JSON.stringify(Store.loadData()) !== baseline || loadStudentSyncQueue().length) {
        renderStudentSyncStatus("pending");
        return false;
      }
      state = buildStudentState(remoteRaw);
      Store.saveData(state);
      localStorage.setItem(getStudentStorageKey(STUDENT_LAST_SYNC_PREFIX), new Date().toISOString());
      renderStudentSyncStatus("online");
      render();
      return true;
    } catch (error) {
      state = Store.loadData();
      renderStudentSyncStatus("error", "Dados deste celular");
      render();
      return false;
    }
  }

  function getStudentStorageKey(prefix) {
    return `${prefix}-${authSession?.account?.id || "anonymous"}`;
  }

  function buildStudentState(data) {
    const empty = Store.createEmptySnapshot();
    return Store.migrateData({
      ...empty,
      students: data?.student ? [data.student] : [],
      workouts: data?.workouts || [],
      exercises: data?.exercises || [],
      workoutSessions: data?.workoutSessions || [],
      exerciseSets: data?.exerciseSets || [],
      schedule: data?.schedule || [],
      checkins: data?.checkins || [],
      assessments: data?.assessments || [],
      payments: data?.payments || [],
      config: data?.config || []
    });
  }

  function statusPill(status, label) {
    return `<span class="status-pill ${escapeHtml(Store.getStatusTone(status))}">${escapeHtml(label || status)}</span>`;
  }

  function renderQr(target, payload, size) {
    target.innerHTML = "";
    if (!payload) {
      target.innerHTML = '<div class="empty-state">QR indisponivel no momento.</div>';
      return;
    }
    if (!window.QRCode) {
      target.innerHTML = `<div class="qr-detail-card">${escapeHtml(payload)}</div>`;
      return;
    }
    new window.QRCode(target, {
      text: payload,
      width: size || 210,
      height: size || 210,
      colorDark: "#20211f",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.M
    });
  }

  function parseEnrollmentCode(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) return null;
    if (raw.startsWith("PROFITNESS|ENROLL|")) {
      const parts = raw.split("|");
      if (parts.length >= 4) return { studentId: parts[2], token: parts[3] };
    }
    const student = state.students.find((item) => item.enrollmentToken === raw);
    return student ? { studentId: student.id, token: raw } : null;
  }

  function beginEnrollment(rawCode) {
    const parsed = parseEnrollmentCode(rawCode);
    const hint = document.getElementById("onboardingHint");
    if (!parsed) {
      hint.textContent = "Codigo de matricula nao reconhecido.";
      showToast("Confira o codigo informado.");
      return;
    }
    const student = Store.findStudent(state, parsed.studentId);
    if (!student || student.enrollmentToken !== parsed.token) {
      hint.textContent = "Este codigo nao corresponde a uma matricula valida.";
      return;
    }
    if (student.enrollmentStatus === "ativo") {
      hint.textContent = "Esta matricula ja foi ativada. O acesso por usuario e senha sera disponibilizado depois.";
      return;
    }
    pendingEnrollmentId = student.id;
    enrollmentStartActions.hidden = true;
    enrollmentCard.hidden = false;
    enrollmentForm.elements.studentId.value = student.id;
    enrollmentForm.elements.name.value = student.name || "";
    enrollmentForm.elements.phone.value = student.phone || "";
    enrollmentForm.elements.email.value = student.email || "";
    enrollmentForm.elements.birthDate.value = student.birthDate || "";
    enrollmentForm.elements.goal.value = student.goal || "";
    stopScanner();
  }

  function completeEnrollment(event) {
    event.preventDefault();
    if (!pendingEnrollmentId) return;
    const formData = Object.fromEntries(new FormData(event.currentTarget).entries());
    let nextState = Store.updateStudent(state, pendingEnrollmentId, {
      name: formData.name,
      phone: formData.phone,
      email: formData.email,
      birthDate: formData.birthDate,
      goal: formData.goal,
      enrollmentStatus: "ativo",
      enrollmentCompletedAt: Store.todayISO(),
      enrollmentToken: Store.createCode("MAT"),
      updatedAt: new Date().toISOString()
    });
    nextState = Store.appendLog(nextState, {
      action: "student-enrollment",
      studentId: pendingEnrollmentId,
      message: "Matricula concluida pelo aplicativo do aluno.",
      source: "app-aluno"
    });
    Store.saveStudentSession(pendingEnrollmentId);
    pendingEnrollmentId = "";
    enrollmentStarted = false;
    enrollmentCard.hidden = true;
    event.currentTarget.reset();
    studentSession = Store.loadStudentSession();
    persistState(nextState, { message: "Matricula concluida com sucesso." });
  }

  async function activateAuthenticatedStudent(session) {
    authSession = session;
    if (session?.account?.mustChangePassword) Store.clearStudentSession();
    else if (session?.account?.personId) {
      const packageData = await Store.fetchStudentBootstrap();
      state = buildStudentState(packageData);
      Store.saveData(state);
      Store.saveStudentSession(session.account.personId, { method: "password" });
    }
    studentSession = Store.loadStudentSession();
    activeScreen = "home";
    render();
  }

  async function loginStudent(login, password) {
    const feedback = document.getElementById("studentLoginFeedback");
    feedback.textContent = "Entrando com seguranca. Isso pode levar alguns segundos...";
    try {
      const session = await Store.loginRemote(login, password);
      if (session.account?.role !== "student") {
        await Store.logoutRemote();
        throw new Error("Esta conta nao pertence a um aluno.");
      }
      await activateAuthenticatedStudent(session);
      feedback.textContent = "";
    } catch (error) {
      feedback.textContent = error.message || "Nao foi possivel entrar.";
    }
  }


  function renderEnrollment() {
    const mustChange = Boolean(authSession?.account?.mustChangePassword);
    enrollmentWelcome.hidden = mustChange;
    passwordChangeCard.hidden = !mustChange;
  }

  function getWorkoutExerciseItems(workout) {
    if (Array.isArray(workout?.exerciseItems) && workout.exerciseItems.length) {
      return workout.exerciseItems.map((item, index) => ({
        id: item.id || `${workout.id}-ITEM-${index + 1}`,
        exerciseId: item.exerciseId || "",
        name: item.name || `Exercicio ${index + 1}`,
        sets: item.sets || workout.sets || "3",
        reps: item.reps || workout.reps || "10",
        load: item.load || workout.load || "",
        rest: item.rest || workout.rest || "60s",
        notes: item.notes || ""
      }));
    }
    return (Array.isArray(workout?.exercises) ? workout.exercises : [])
      .map((exercise, index) => ({
        id: `${workout.id}-ITEM-${index + 1}`,
        exerciseId: "",
        name: typeof exercise === "string" ? exercise : exercise?.name || `Exercicio ${index + 1}`,
        sets: workout.sets || "3",
        reps: workout.reps || "10",
        load: workout.load || "",
        rest: workout.rest || "60s",
        notes: ""
      }));
  }

  function getActiveWorkoutSession(studentId) {
    return Store.getStudentWorkoutSessions(state, studentId).find((item) => item.status === "em_andamento") || null;
  }

  function getActiveWorkouts(studentId) {
    return Store.getStudentWorkouts(state, studentId).filter((workout) => workout.status === "ativo");
  }

  function startWorkout(workoutId) {
    const student = getCurrentStudent();
    const workout = state.workouts.find((item) => item.id === workoutId && item.studentId === student?.id);
    if (!student || !workout) return;
    const existing = getActiveWorkoutSession(student.id);
    if (existing) {
      openWorkoutSession(existing.id);
      showToast(existing.workoutId === workout.id ? "Treino retomado." : "Finalize o treino em andamento antes de iniciar outro.");
      return;
    }

    const now = new Date().toISOString();
    const session = Store.createWorkoutSessionRecord({
      studentId: student.id,
      workoutId: workout.id,
      workoutTitle: workout.title,
      division: workout.division,
      startedAt: now,
      status: "em_andamento",
      updatedBy: student.name,
      source: "app-aluno"
    });
    const exerciseSets = [];
    getWorkoutExerciseItems(workout).forEach((item) => {
      const setCount = parsePositiveInteger(item.sets, 3);
      const targetReps = parsePositiveInteger(item.reps, 10);
      for (let setNumber = 1; setNumber <= setCount; setNumber += 1) {
        exerciseSets.push(Store.createExerciseSetRecord({
          sessionId: session.id,
          studentId: student.id,
          workoutId: workout.id,
          exerciseItemId: item.id,
          exerciseId: item.exerciseId,
          exerciseName: item.name,
          setNumber,
          targetReps: item.reps,
          actualReps: targetReps,
          targetLoad: item.load,
          actualLoad: safeNumber(item.load),
          status: "pendente",
          createdAt: now,
          updatedBy: student.name,
          source: "app-aluno"
        }));
      }
    });
    session.totalSets = exerciseSets.length;
    const nextState = Store.migrateData(state);
    nextState.workoutSessions.unshift(session);
    nextState.exerciseSets.push(...exerciseSets);
    persistState(nextState, { message: "Treino iniciado." });
    openWorkoutSession(session.id);
  }

  function renderSessionProgress(sessionId) {
    const sets = Store.getWorkoutSessionSets(state, sessionId);
    const completed = sets.filter((item) => item.status === "concluida").length;
    const counter = document.getElementById("sessionSetCounter");
    const bar = document.getElementById("sessionProgressBar");
    if (counter) counter.textContent = `${completed} de ${sets.length} series`;
    if (bar) bar.style.width = `${sets.length ? (completed / sets.length) * 100 : 0}%`;
  }

  function toggleExerciseSet(setId) {
    const exerciseSet = state.exerciseSets.find((item) => item.id === setId);
    if (!exerciseSet) return;
    const row = document.querySelector(`[data-set-row="${CSS.escape(setId)}"]`);
    const repsInput = row?.querySelector('[data-set-field="reps"]');
    const loadInput = row?.querySelector('[data-set-field="load"]');
    const completed = exerciseSet.status !== "concluida";
    const nextState = Store.migrateData(state);
    nextState.exerciseSets = nextState.exerciseSets.map((item) => item.id === setId
      ? Store.createExerciseSetRecord({
          ...item,
          actualReps: safeNumber(repsInput?.value ?? item.actualReps),
          actualLoad: safeNumber(loadInput?.value ?? item.actualLoad),
          status: completed ? "concluida" : "pendente",
          completedAt: completed ? new Date().toISOString() : "",
          updatedAt: new Date().toISOString()
      })
      : item);
    const sessionSets = nextState.exerciseSets.filter((item) => item.sessionId === exerciseSet.sessionId);
    const completedCount = sessionSets.filter((item) => item.status === "concluida").length;
    nextState.workoutSessions = nextState.workoutSessions.map((session) => session.id === exerciseSet.sessionId
      ? Store.createWorkoutSessionRecord({ ...session, completedSets: completedCount, totalSets: sessionSets.length, updatedAt: new Date().toISOString() })
      : session);
    persistState(nextState, { render: false });
    row?.classList.toggle("completed", completed);
    row?.querySelector("[data-complete-set]")?.setAttribute("aria-pressed", String(completed));
    renderSessionProgress(exerciseSet.sessionId);
    if (completed) {
      const nextPending = sessionSets.find((item) => item.status !== "concluida");
      if (nextPending) {
        const workout = state.workouts.find((item) => item.id === exerciseSet.workoutId);
        const exercise = getWorkoutExerciseItems(workout || {}).find((item) => item.id === exerciseSet.exerciseItemId || item.name === exerciseSet.exerciseName);
        startRestTimer(parseRestSeconds(exercise?.rest), nextPending.exerciseName);
      } else {
        stopRestTimer();
        showToast("Todas as series foram concluidas.");
      }
    }
  }

  function updateExerciseSetField(setId, field, value) {
    const nextState = Store.migrateData(state);
    nextState.exerciseSets = nextState.exerciseSets.map((item) => item.id === setId
      ? Store.createExerciseSetRecord({ ...item, [field]: safeNumber(value), updatedAt: new Date().toISOString() })
      : item);
    persistState(nextState, { render: false });
  }

  function renderWorkoutSession(session) {
    const workout = state.workouts.find((item) => item.id === session.workoutId);
    const items = getWorkoutExerciseItems(workout || {});
    const sets = Store.getWorkoutSessionSets(state, session.id);
    const previousSession = Store.getStudentWorkoutSessions(state, session.studentId)
      .filter((item) => item.id !== session.id && item.workoutId === session.workoutId && item.status === "concluida")
      .sort((left, right) => String(right.endedAt || right.startedAt).localeCompare(String(left.endedAt || left.startedAt)))[0];
    const previousSets = previousSession ? Store.getWorkoutSessionSets(state, previousSession.id) : [];
    const findPreviousSet = (currentSet) => previousSets.find((item) => (
      (currentSet.exerciseItemId && item.exerciseItemId === currentSet.exerciseItemId) || item.exerciseName === currentSet.exerciseName
    ) && Number(item.setNumber) === Number(currentSet.setNumber));
    const previousValue = (currentSet) => {
      const previous = findPreviousSet(currentSet);
      if (!previous) return "-";
      const load = Number(previous.actualLoad || 0);
      const reps = Number(previous.actualReps || 0);
      return `${load ? `${load.toLocaleString("pt-BR")} kg` : "Livre"} x ${reps || "-"}`;
    };
    document.getElementById("sessionDivisionLabel").textContent = `TREINO ${session.division || ""}`;
    document.getElementById("sessionTitle").textContent = session.workoutTitle || "Seu treino";
    document.getElementById("sessionExerciseList").innerHTML = items.length
      ? items.map((item, exerciseIndex) => {
          const itemSets = sets.filter((set) => set.exerciseItemId === item.id || (!set.exerciseItemId && set.exerciseName === item.name));
          return `<article class="session-exercise">
            <div class="session-exercise-head"><span class="exercise-order">${exerciseIndex + 1}</span><div><span class="exercise-kicker">${escapeHtml(item.sets)} SERIES &bull; DESCANSO ${escapeHtml(item.rest || "-")}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.notes || `${item.reps} repeticoes por serie`)}</p></div></div>
            <div class="set-table"><div class="set-table-head"><span>Serie</span><span>Anterior</span><span>Reps</span><span>Kg</span><span>Feita</span></div>${itemSets.map((set) => `<div class="set-row ${set.status === "concluida" ? "completed" : ""}" data-set-row="${escapeHtml(set.id)}">
              <span class="set-number">${set.setNumber}</span>
              <span class="set-previous">${escapeHtml(previousValue(set))}</span>
              <div class="set-field"><label>Repeticoes</label><input aria-label="Repeticoes da serie ${set.setNumber}" data-set-field="reps" inputmode="numeric" type="number" min="0" value="${Number(set.actualReps || 0)}" /></div>
              <div class="set-field"><label>Carga em kg</label><input aria-label="Carga da serie ${set.setNumber} em quilos" data-set-field="load" inputmode="decimal" type="number" min="0" step="0.5" value="${Number(set.actualLoad || 0)}" /></div>
              <button class="set-check" data-complete-set="${escapeHtml(set.id)}" type="button" aria-label="Marcar serie ${set.setNumber} como concluida" aria-pressed="${set.status === "concluida"}"></button>
            </div>`).join("")}</div>
          </article>`;
        }).join("")
      : '<div class="empty-state">A ficha ainda nao possui exercicios estruturados.</div>';
    renderSessionProgress(session.id);
    startWorkoutTimer(session.startedAt);
  }

  function startWorkoutTimer(startedAt) {
    window.clearInterval(workoutTimer);
    const target = document.getElementById("sessionTimer");
    const update = () => {
      const elapsed = Math.max(0, Date.now() - new Date(startedAt).getTime());
      const totalSeconds = Math.floor(elapsed / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      target.textContent = hours
        ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    };
    update();
    workoutTimer = window.setInterval(update, 1000);
  }

  function openWorkoutSession(sessionId) {
    const session = state.workoutSessions.find((item) => item.id === sessionId && item.status === "em_andamento");
    if (!session) return;
    renderWorkoutSession(session);
    openDialog(workoutSessionDialog);
  }

  function openFinishWorkout() {
    const student = getCurrentStudent();
    const session = getActiveWorkoutSession(student?.id);
    if (!session) return;
    const sets = Store.getWorkoutSessionSets(state, session.id);
    const completed = sets.filter((item) => item.status === "concluida").length;
    const remaining = Math.max(0, sets.length - completed);
    const summary = document.getElementById("finishWorkoutSummary");
    summary.className = `finish-workout-summary ${remaining ? "warning" : "complete"}`;
    summary.innerHTML = `<span>${completed} de ${sets.length} series concluidas</span><strong>${remaining ? `${remaining} serie${remaining === 1 ? " ainda nao foi marcada" : "s ainda nao foram marcadas"}.` : "Treino completo. Excelente trabalho!"}</strong>`;
    openDialog(finishWorkoutDialog);
  }

  function finishWorkout(event) {
    event.preventDefault();
    const student = getCurrentStudent();
    const session = getActiveWorkoutSession(student?.id);
    if (!student || !session) return;
    const formData = Object.fromEntries(new FormData(event.currentTarget).entries());
    const endedAt = new Date();
    const durationMinutes = Math.max(1, Math.round((endedAt.getTime() - new Date(session.startedAt).getTime()) / 60000));
    const sets = Store.getWorkoutSessionSets(state, session.id);
    const completedSets = sets.filter((item) => item.status === "concluida").length;
    const nextState = Store.migrateData(state);
    nextState.workoutSessions = nextState.workoutSessions.map((item) => item.id === session.id
      ? Store.createWorkoutSessionRecord({
          ...item,
          endedAt: endedAt.toISOString(),
          durationMinutes,
          status: "concluida",
          difficulty: formData.difficulty,
          pain: formData.pain,
          notes: formData.notes,
          totalSets: sets.length,
          completedSets,
          updatedAt: endedAt.toISOString()
        })
      : item);
    nextState.checkins.unshift(Store.createCheckinRecord({
      studentId: student.id,
      workoutId: session.workoutId,
      date: Store.todayISO(),
      time: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(endedAt),
      type: "workout",
      presenceSource: "app-aluno",
      difficulty: formData.difficulty,
      pain: formData.pain,
      notes: formData.notes || `${completedSets} de ${sets.length} series concluidas.`,
      updatedAt: endedAt.toISOString(),
      updatedBy: student.name,
      source: "app-aluno"
    }));
    closeDialog(finishWorkoutDialog);
    closeDialog(workoutSessionDialog);
    window.clearInterval(workoutTimer);
    stopRestTimer();
    event.currentTarget.reset();
    persistState(nextState, { message: `Treino finalizado: ${completedSets} series registradas.` });
    switchScreen("evolution");
  }

  function renderHome(student) {
    const activeSession = getActiveWorkoutSession(student.id);
    const workouts = getActiveWorkouts(student.id);
    const sessions = Store.getStudentWorkoutSessions(state, student.id).filter((item) => item.status === "concluida");
    const accessCheckins = Store.getStudentCheckins(state, student.id).filter((item) => item.type === "access");
    const recentLimit = Date.now() - 7 * 86400000;
    const weeklySessions = sessions.filter((item) => new Date(item.startedAt).getTime() >= recentLimit);
    const weeklyVisits = accessCheckins.filter((item) => new Date(item.checkedInAt || `${item.date}T12:00:00`).getTime() >= recentLimit);
    const weeklySets = state.exerciseSets.filter((item) => item.studentId === student.id && item.status === "concluida" && new Date(item.completedAt || item.updatedAt).getTime() >= recentLimit).length;
    const weeklyMinutes = weeklyVisits.reduce((sum, item) => {
      const start = new Date(item.checkedInAt).getTime();
      const end = new Date(item.checkedOutAt).getTime();
      return sum + (Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 60000) : 0);
    }, 0);
    document.getElementById("homeGreeting").textContent = new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite";
    document.getElementById("homeStudentName").textContent = student.name.split(" ")[0] || student.name;
    document.getElementById("homeDateLabel").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(new Date());
    document.getElementById("studentInitials").textContent = getInitials(student.name).toUpperCase();

    document.getElementById("homeSummary").innerHTML = [
      ["Visitas na semana", weeklyVisits.length],
      ["Treinos concluidos", weeklySessions.length],
      ["Series realizadas", weeklySets],
      ["Tempo na academia", `${Math.floor(weeklyMinutes / 60)}h${String(weeklyMinutes % 60).padStart(2, "0")}`]
    ].map(([label, value]) => `<article class="today-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");

    const nextWorkout = activeSession ? state.workouts.find((item) => item.id === activeSession.workoutId) : workouts[0];
    const nextWorkoutItems = getWorkoutExerciseItems(nextWorkout);
    const workoutDetail = activeSession
      ? `${activeSession.completedSets} de ${activeSession.totalSets} series concluidas`
      : `${nextWorkoutItems.length} exercicio${nextWorkoutItems.length === 1 ? "" : "s"}`;
    document.getElementById("homeWorkoutCard").innerHTML = nextWorkout
      ? `<div class="compact-workout-copy"><span class="section-kicker">${activeSession ? "TREINO EM ANDAMENTO" : "PROXIMO TREINO"}</span><h2>${escapeHtml(nextWorkout.title)}</h2><p>${escapeHtml(workoutDetail)}</p></div><button class="card-action compact-workout-action" data-start-workout="${escapeHtml(nextWorkout.id)}" type="button" aria-label="${activeSession ? "Continuar" : "Iniciar"} ${escapeHtml(nextWorkout.title)}">${activeSession ? "Continuar" : "Iniciar"}</button>`
      : '<div class="empty-state">Nenhum treino ativo liberado pelo professor.</div>';
  }

  function renderWorkouts(student) {
    const workouts = getActiveWorkouts(student.id);
    const divisions = [...new Set(workouts.map((item) => String(item.division || "-").toUpperCase()))];
    const activeSession = getActiveWorkoutSession(student.id);
    document.getElementById("workoutCount").textContent = `${workouts.length} ativo${workouts.length === 1 ? "" : "s"}`;
    document.getElementById("workoutDivisionFilter").innerHTML = ["todos", ...divisions].map((division) => `<button class="${activeWorkoutDivision === division ? "active" : ""}" data-workout-division="${escapeHtml(division)}" type="button">${division === "todos" ? "Todos" : division}</button>`).join("");
    const activeCard = document.getElementById("activeSessionCard");
    activeCard.hidden = !activeSession;
    activeCard.innerHTML = activeSession ? `<div class="feature-card-head"><div><span class="section-kicker">TREINO EM ANDAMENTO</span><h2>${escapeHtml(activeSession.workoutTitle)}</h2><p>Iniciado ${escapeHtml(Store.formatDateTime(activeSession.startedAt))} &bull; ${activeSession.completedSets} de ${activeSession.totalSets} series.</p></div><button class="card-action" data-open-session="${escapeHtml(activeSession.id)}" type="button">Continuar</button></div>` : "";
    const filtered = activeWorkoutDivision === "todos" ? workouts : workouts.filter((item) => String(item.division || "-").toUpperCase() === activeWorkoutDivision);
    document.getElementById("workoutCards").innerHTML = filtered.length
      ? filtered.map((workout) => {
          const items = getWorkoutExerciseItems(workout);
          const setCount = items.reduce((sum, item) => sum + parsePositiveInteger(item.sets, 3), 0);
          const history = Store.getStudentWorkoutSessions(state, student.id).find((session) => session.workoutId === workout.id && session.status === "concluida");
          return `<article class="workout-card"><div class="workout-card-head"><div><span class="section-kicker">FICHA ATIVA</span><h2>${escapeHtml(workout.title)}</h2><p>${escapeHtml(workout.muscleGroup || workout.notes || "Treino orientado")}</p></div><span class="division-mark">${escapeHtml(workout.division || "-")}</span></div><div class="workout-card-summary"><div><span>Exercicios</span><strong>${items.length}</strong></div><div><span>Series</span><strong>${setCount}</strong></div><div><span>Ultimo treino</span><strong>${history ? Store.formatDate(history.startedAt) : "-"}</strong></div></div><button class="primary-action full" data-start-workout="${escapeHtml(workout.id)}" type="button">${activeSession?.workoutId === workout.id ? "Continuar treino" : "Iniciar treino"}</button></article>`;
        }).join("")
      : '<div class="empty-state">Nenhuma ficha encontrada para esta divisao.</div>';
  }

  function getStudentModalities(student) {
    const config = state.config?.[0] || {};
    const planName = normalizeText(student.plan);
    const configuredPlan = (Array.isArray(config.plans) ? config.plans : []).find((plan) => normalizeText(plan.name) === planName);
    const modalities = new Set(["musculacao"]);
    (configuredPlan?.extraModalities || []).forEach((item) => modalities.add(normalizeText(item)));
    ["natacao", "hidroginastica", "karate", "jiu-jitsu", "ballet", "zumba", "funcional", "musculacao"].forEach((modality) => {
      if (planName.includes(modality)) modalities.add(modality);
    });
    return modalities;
  }

  function weeklyClassMatchesStudent(item, student) {
    const modalities = getStudentModalities(student);
    const category = normalizeText(item.category || item.title);
    if (modalities.has(category)) return true;
    if (category === "hidro" && modalities.has("hidroginastica")) return true;
    return [...modalities].some((modality) => category.includes(modality) || normalizeText(item.title).includes(modality));
  }

  function getAgendaItemsForDate(student, dateValue) {
    const target = dateAtNoon(dateValue);
    const weekDay = target.getDay();
    const exact = state.schedule.filter((item) => item.studentId === student.id && String(item.date || "").slice(0, 10) === dateValue);
    const recurring = state.schedule.filter((item) => {
      const isWeekly = item.scheduleKind === "weekly-class" || item.recurring === true || item.recurring === "true" || item.type === "group";
      return isWeekly && Number(item.dayOfWeek) === weekDay && item.status !== "cancelada" && item.status !== "inativo" && weeklyClassMatchesStudent(item, student);
    });
    return [...exact, ...recurring].map((item) => ({
      ...item,
      effectiveDate: dateValue,
      effectiveTime: item.startTime || item.time || "",
      effectiveTitle: item.title || (item.type === "online" ? "Aula online" : "Acompanhamento individual")
    })).sort((left, right) => String(left.effectiveTime).localeCompare(String(right.effectiveTime)));
  }

  function getNextAgendaItem(student) {
    for (let offset = 0; offset <= 14; offset += 1) {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      const dateValue = toLocalISO(date);
      const items = getAgendaItemsForDate(student, dateValue);
      if (items.length) return items[0];
    }
    return null;
  }

  function getPresenceDuration(checkin) {
    const start = new Date(checkin.checkedInAt).getTime();
    const end = new Date(checkin.checkedOutAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    const minutes = Math.round((end - start) / 60000);
    return minutes > 0 && minutes <= 960 ? minutes : 0;
  }

  function renderPresence(student) {
    const accessEntries = Store.getStudentCheckins(state, student.id)
      .filter((item) => item.type === "access" && item.checkedInAt)
      .sort((left, right) => String(right.checkedInAt).localeCompare(String(left.checkedInAt)));
    const cutoff = Date.now() - 30 * 86400000;
    const recent = accessEntries.filter((item) => new Date(item.checkedInAt).getTime() >= cutoff);
    const completed = recent.filter((item) => getPresenceDuration(item) > 0);
    const totalMinutes = completed.reduce((sum, item) => sum + getPresenceDuration(item), 0);
    const average = completed.length ? Math.round(totalMinutes / completed.length) : 0;
    const current = accessEntries.find((item) => !item.checkedOutAt || item.presenceStatus === "inside");
    document.getElementById("presenceSummary").innerHTML = [
      ["Visitas em 30 dias", recent.length, "registros"],
      ["Tempo total", formatDuration(totalMinutes), "na academia"],
      ["Permanencia media", formatDuration(average), "por visita"],
      ["Agora", current ? "Na academia" : "Fora", current ? `desde ${Store.formatTime(String(current.checkedInAt).slice(11, 16))}` : "ultima saida registrada"]
    ].map(([label, value, detail]) => `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`).join("");
    document.getElementById("presenceHistory").innerHTML = accessEntries.length
      ? accessEntries.slice(0, 6).map((item) => {
          const duration = getPresenceDuration(item);
          return `<article class="history-row"><div class="history-row-head"><div><h3>${escapeHtml(Store.formatDate(item.checkedInAt || item.date))}</h3><p>Entrada ${escapeHtml(Store.formatTime(String(item.checkedInAt || item.time).slice(11, 16) || item.time))}${item.checkedOutAt ? ` &bull; Saida ${escapeHtml(Store.formatTime(String(item.checkedOutAt).slice(11, 16)))}` : ""}</p></div>${statusPill(item.checkedOutAt ? "realizada" : "aviso", item.checkedOutAt ? formatDuration(duration) : "Em andamento")}</div></article>`;
        }).join("")
      : '<div class="empty-state">Nenhuma entrada registrada pela academia.</div>';
  }

  function renderSchedule(student) {
    const selected = dateAtNoon(selectedAgendaDate);
    const monday = new Date(selected);
    const offset = selected.getDay() === 0 ? -6 : 1 - selected.getDay();
    monday.setDate(selected.getDate() + offset);
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date;
    });
    document.getElementById("agendaWeekStrip").innerHTML = weekDays.map((date) => {
      const iso = toLocalISO(date);
      return `<button class="week-day ${iso === selectedAgendaDate ? "active" : ""}" data-agenda-date="${iso}" type="button"><span>${new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "")}</span><strong>${date.getDate()}</strong></button>`;
    }).join("");
    const items = getAgendaItemsForDate(student, selectedAgendaDate);
    document.getElementById("agendaSelectedWeekday").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(selected).toUpperCase();
    document.getElementById("agendaSelectedDate").textContent = selectedAgendaDate === Store.todayISO()
      ? "Hoje"
      : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(selected);
    document.getElementById("agendaDayCount").textContent = `${items.length} atividade${items.length === 1 ? "" : "s"}`;
    document.getElementById("scheduleCards").innerHTML = items.length
      ? items.map((item) => `<article class="agenda-card"><time class="agenda-time">${escapeHtml(Store.formatTime(item.effectiveTime))}</time><div><div class="history-row-head"><h3>${escapeHtml(item.effectiveTitle)}</h3>${statusPill(item.status || "marcada", item.status || "marcada")}</div><p>${escapeHtml(item.teacherName || "Professor a confirmar")} &bull; ${escapeHtml(item.location || (item.type === "online" ? "Online" : "Pro Fitness"))}${item.endTime ? ` &bull; ate ${escapeHtml(Store.formatTime(item.endTime))}` : ""}</p></div></article>`).join("")
      : '<div class="empty-state">Nenhuma atividade do seu plano neste dia.</div>';
    const nextItem = getNextAgendaItem(student);
    document.getElementById("homeScheduleCard").innerHTML = nextItem
      ? `<div class="feature-card-head"><div><span class="section-kicker">PROXIMA ATIVIDADE</span><h2>${escapeHtml(nextItem.effectiveTitle)}</h2></div>${statusPill(nextItem.status || "marcada", Store.formatDate(nextItem.effectiveDate))}</div><p>${escapeHtml(Store.formatTime(nextItem.effectiveTime))} &bull; ${escapeHtml(nextItem.teacherName || "Professor a confirmar")} &bull; ${escapeHtml(nextItem.location || "Pro Fitness")}</p><button class="card-action" data-screen="agenda" type="button">Ver agenda</button>`
      : '<div class="empty-state">Nenhuma atividade futura encontrada para o seu plano.</div>';
    renderPresence(student);
  }

  function renderEvolution(student) {
    const periodDays = Number(document.getElementById("evolutionPeriod").value || 30);
    const cutoff = Date.now() - periodDays * 86400000;
    const sessions = Store.getStudentWorkoutSessions(state, student.id)
      .filter((item) => item.status === "concluida" && new Date(item.startedAt).getTime() >= cutoff);
    const sets = state.exerciseSets
      .filter((item) => item.studentId === student.id && item.status === "concluida" && new Date(item.completedAt || item.updatedAt).getTime() >= cutoff)
      .sort((left, right) => String(left.completedAt || left.updatedAt).localeCompare(String(right.completedAt || right.updatedAt)));
    const visits = Store.getStudentCheckins(state, student.id)
      .filter((item) => item.type === "access" && new Date(item.checkedInAt || `${item.date}T12:00:00`).getTime() >= cutoff);
    const workoutMinutes = sessions.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0);
    const expectedSets = sessions.reduce((sum, item) => sum + Number(item.totalSets || 0), 0);
    const completionRate = expectedSets ? Math.round((sets.length / expectedSets) * 100) : 0;
    document.getElementById("evolutionMetricGrid").innerHTML = [
      ["Treinos", sessions.length, `ultimos ${periodDays} dias`],
      ["Series", sets.length, "concluidas"],
      ["Tempo treinando", formatDuration(workoutMinutes), "sessoes registradas"],
      ["Aproveitamento", `${Math.min(100, completionRate)}%`, `${visits.length} visita${visits.length === 1 ? "" : "s"}`]
    ].map(([label, value, detail]) => `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`).join("");

    const weekGroups = Array.from({ length: 6 }, (_, reverseIndex) => {
      const index = 5 - reverseIndex;
      const now = new Date();
      const weekStart = new Date(now);
      const mondayOffset = now.getDay() === 0 ? -6 : 1 - now.getDay();
      weekStart.setDate(now.getDate() + mondayOffset - index * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      const count = Store.getStudentWorkoutSessions(state, student.id).filter((session) => {
        const time = new Date(session.startedAt).getTime();
        return session.status === "concluida" && time >= weekStart.getTime() && time < weekEnd.getTime();
      }).length;
      return { label: `${String(weekStart.getDate()).padStart(2, "0")}/${String(weekStart.getMonth() + 1).padStart(2, "0")}`, count };
    });
    const maximumWeek = Math.max(...weekGroups.map((item) => item.count), 1);
    document.getElementById("workoutConsistencyChart").innerHTML = weekGroups.map((item) => `<div class="bar-column"><strong>${item.count}</strong><i style="height:${Math.max(4, (item.count / maximumWeek) * 100)}px"></i><span>${escapeHtml(item.label)}</span></div>`).join("");

    const byExercise = new Map();
    sets.forEach((exerciseSet) => {
      const key = exerciseSet.exerciseId || normalizeText(exerciseSet.exerciseName);
      if (!byExercise.has(key)) byExercise.set(key, { name: exerciseSet.exerciseName, sets: [], loads: [] });
      const group = byExercise.get(key);
      group.sets.push(exerciseSet);
      if (Number(exerciseSet.actualLoad) > 0) group.loads.push(Number(exerciseSet.actualLoad));
    });
    const exerciseGroups = [...byExercise.values()].map((group) => {
      const firstLoad = group.loads[0] || 0;
      const lastLoad = group.loads[group.loads.length - 1] || 0;
      const maxLoad = Math.max(...group.loads, 0);
      return { ...group, firstLoad, lastLoad, maxLoad, difference: lastLoad - firstLoad };
    }).sort((left, right) => right.sets.length - left.sets.length).slice(0, 8);
    const maximumSets = Math.max(...exerciseGroups.map((item) => item.sets.length), 1);
    document.getElementById("exerciseProgressList").innerHTML = exerciseGroups.length
      ? exerciseGroups.map((group) => `<article class="exercise-progress-row"><div><h3>${escapeHtml(group.name)}</h3><p>${group.sets.length} series no periodo${group.difference ? ` &bull; ${group.difference > 0 ? "+" : ""}${group.difference.toLocaleString("pt-BR")} kg desde o primeiro registro` : ""}</p><div class="progress-track"><i style="--progress:${(group.sets.length / maximumSets) * 100}%"></i></div></div><div class="exercise-progress-value">${group.maxLoad ? `${group.maxLoad.toLocaleString("pt-BR")} kg` : "-"}<small>maior carga</small></div></article>`).join("")
      : '<div class="empty-state">Conclua as series do treino para acompanhar sua evolucao por exercicio.</div>';

    const assessments = (state.assessments || []).filter((item) => item.studentId === student.id).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const latest = assessments[0];
    const previous = assessments[1];
    const physicalMetrics = [
      ["Peso", latest?.weight, "kg", previous?.weight], ["IMC", latest?.imc, "", previous?.imc], ["Gordura", latest?.bodyFat, "%", previous?.bodyFat], ["Cintura", latest?.waist, "cm", previous?.waist]
    ];
    document.getElementById("physicalEvolutionGrid").innerHTML = latest ? physicalMetrics.map(([label, value, unit, previousValue]) => {
      const difference = Number(value || 0) - Number(previousValue || 0);
      return `<article><span>${escapeHtml(label)}</span><strong>${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}</strong><small>${previous && difference ? `${difference > 0 ? "+" : ""}${difference.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} desde ${Store.formatDate(previous.date)}` : `avaliado em ${Store.formatDate(latest.date)}`}</small></article>`;
    }).join("") : '<div class="empty-state">Sua primeira avaliacao fisica ainda nao foi registrada.</div>';
    document.getElementById("physicalEvolutionHistory").innerHTML = assessments.slice(0, 5).map((assessment) => `<article class="history-row"><div><strong>${escapeHtml(Store.formatDate(assessment.date))}</strong><span>${Number(assessment.weight || 0).toLocaleString("pt-BR")} kg · IMC ${Number(assessment.imc || 0).toLocaleString("pt-BR")}</span></div><span>${assessment.bodyFat ? `${Number(assessment.bodyFat).toLocaleString("pt-BR")}% gordura` : "Avaliacao fisica"}</span></article>`).join("");
  }

  function formatPaymentReference(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) return value || "Competencia nao informada";
    return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${match[1]}-${match[2]}-01T12:00:00`));
  }

  function getPaymentStatusLabel(status) {
    return ({ pago: "Pago", pendente: "Pendente", parcial: "Pagamento parcial", vencido: "Vencido", cancelado: "Cancelado", "sem-cobranca": "Sem cobranca" })[status] || status;
  }

  function getPaymentRules() {
    const config = state.config?.[0] || {};
    const rawDays = Array.isArray(config.paymentAlertDays)
      ? config.paymentAlertDays
      : String(config.paymentAlertDays || "7,3,0").split(/[;,\s]+/);
    return {
      alertDays: rawDays.map(Number).filter((item) => Number.isFinite(item) && item >= 0).sort((a, b) => b - a),
      graceDays: Math.max(0, Number(config.paymentGraceDays || 0)),
      blockAccess: config.blockAccessOnOverdue !== false && config.blockAccessOnOverdue !== "false",
      whatsappNumber: String(config.whatsappNumber || config.supportPhone || "5522988233216").replace(/\D/g, "")
    };
  }

  function getPaymentAlert(payment) {
    if (!payment) return { visible: false };
    const status = Finance.effectivePaymentStatus(payment, Store.todayISO());
    if (["pago", "cancelado"].includes(status)) return { visible: false };
    const dueDate = dateAtNoon(payment.dueDate);
    const today = dateAtNoon(Store.todayISO());
    const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
    const rules = getPaymentRules();
    const balance = Finance.outstandingAmount(payment);
    if (daysUntilDue < 0 || status === "vencido") {
      const overdueDays = Math.max(1, Math.abs(daysUntilDue));
      return {
        visible: true,
        tone: "danger",
        title: "Mensalidade vencida",
        detail: `${overdueDays} dia${overdueDays === 1 ? "" : "s"} de atraso &bull; saldo ${Store.currency(balance)}.`
      };
    }
    const maximumAlert = Math.max(...rules.alertDays, 0);
    if (daysUntilDue <= maximumAlert) {
      return {
        visible: true,
        tone: "warning",
        title: daysUntilDue === 0 ? "Mensalidade vence hoje" : `Mensalidade vence em ${daysUntilDue} dia${daysUntilDue === 1 ? "" : "s"}`,
        detail: `Vencimento ${Store.formatDate(payment.dueDate)} &bull; saldo ${Store.currency(balance)}.`
      };
    }
    if (status === "parcial") {
      return { visible: true, tone: "warning", title: "Pagamento parcial", detail: `Saldo restante ${Store.currency(balance)}.` };
    }
    return { visible: false };
  }

  function renderPayments(student) {
    const payments = Store.getStudentPayments(state, student.id);
    const payment = Store.getCurrentPayment(state, student.id);
    const status = payment ? Finance.effectivePaymentStatus(payment, Store.todayISO()) : "sem-cobranca";
    const balance = payment ? Finance.outstandingAmount(payment) : 0;
    const displayedValue = payment ? (status === "pago" ? Finance.paidAmount(payment) : balance) : 0;
    const paymentMetaItems = payment
      ? [
          ["Vencimento", Store.formatDate(payment.dueDate)],
          ...(status === "pago"
            ? [["Forma", payment.method || "Nao informada"]]
            : [
                ["Valor original", Store.currency(Finance.netAmount(payment))],
                ["Pago", Store.currency(Finance.paidAmount(payment))],
                ["Saldo", Store.currency(balance)]
              ])
        ]
      : [];
    document.getElementById("paymentHero").innerHTML = payment
      ? `<div class="payment-card-head"><span class="section-kicker">${escapeHtml(formatPaymentReference(payment.reference).toUpperCase())}</span>${statusPill(status, getPaymentStatusLabel(status))}</div><div class="payment-compact-main"><strong class="payment-value">${escapeHtml(Store.currency(displayedValue))}</strong><span>${status === "pago" ? "Confirmado pela academia" : "Saldo desta mensalidade"}</span></div><div class="payment-meta-grid">${paymentMetaItems.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`
      : '<span class="section-kicker">MENSALIDADE</span><h2>Sem cobranca cadastrada</h2><p>Procure a academia se esperava encontrar uma mensalidade aqui.</p>';

    const alert = getPaymentAlert(payment);
    const alertCard = document.getElementById("paymentAlertCard");
    const homeAlert = document.getElementById("homePaymentAlert");
    [alertCard, homeAlert].forEach((target) => {
      target.hidden = !alert.visible;
      target.className = `notice-card ${alert.tone === "danger" ? "danger" : ""}`;
      target.innerHTML = alert.visible ? `<strong>${escapeHtml(alert.title)}</strong><p>${escapeHtml(alert.detail)}</p>` : "";
    });

    document.getElementById("paymentHistory").innerHTML = payments.length
      ? payments.slice(0, 12).map((item) => {
          const itemStatus = Finance.effectivePaymentStatus(item, Store.todayISO());
          return `<article class="history-row"><div class="history-row-head"><div><h3>${escapeHtml(formatPaymentReference(item.reference))}</h3><p>Vencimento ${escapeHtml(Store.formatDate(item.dueDate))}${itemStatus === "pago" && item.paidAt ? ` &bull; pago em ${escapeHtml(Store.formatDate(item.paidAt))}` : ""}</p></div><div>${statusPill(itemStatus, getPaymentStatusLabel(itemStatus))}</div></div><div class="payment-meta-grid"><div><span>Valor</span><strong>${escapeHtml(Store.currency(Finance.netAmount(item)))}</strong></div><div><span>${itemStatus === "pago" ? "Forma" : "Saldo"}</span><strong>${escapeHtml(itemStatus === "pago" ? item.method || "-" : Store.currency(Finance.outstandingAmount(item)))}</strong></div></div></article>`;
        }).join("")
      : '<div class="empty-state">Nenhuma mensalidade encontrada.</div>';

    const rules = getPaymentRules();
    const message = encodeURIComponent(`Ola, sou ${student.name}. Gostaria de falar sobre minha mensalidade na Pro Fitness.`);
    const whatsapp = document.getElementById("paymentWhatsappButton");
    whatsapp.href = rules.whatsappNumber ? `https://wa.me/${rules.whatsappNumber}?text=${message}` : "#";
  }

  function renderProfile(student) {
    const access = Store.getAccessState(state, student.id);
    const enrollmentNumber = student.enrollmentNumber || authSession?.account?.login || "-";
    document.getElementById("profileCard").innerHTML = `<div class="profile-head"><span class="profile-avatar">${escapeHtml(getInitials(student.name).toUpperCase())}</span><div><span class="section-kicker">MEU PERFIL</span><h2>${escapeHtml(student.name)}</h2><p>${escapeHtml(student.plan || "Plano nao informado")}</p></div></div><div class="profile-data"><div><span>Telefone</span><strong>${escapeHtml(student.phone || "-")}</strong></div><div><span>E-mail</span><strong>${escapeHtml(student.email || "-")}</strong></div><div><span>Objetivo</span><strong>${escapeHtml(student.goal || "-")}</strong></div><div><span>Matricula</span><strong>${escapeHtml(enrollmentNumber)}</strong></div></div>`;
    document.getElementById("moreProfileCard").innerHTML = `<span class="more-profile-avatar">${escapeHtml(getInitials(student.name).toUpperCase())}</span><span class="more-profile-copy"><span>ALUNO PRO FITNESS</span><strong>${escapeHtml(student.name)}</strong><small>Matricula ${escapeHtml(enrollmentNumber)} &bull; ${escapeHtml(student.plan || "Plano nao informado")}</small></span><span class="more-profile-status ${access.blocked ? "blocked" : "ok"}">${escapeHtml(access.label)}</span>`;

    const rules = getPaymentRules();
    const message = encodeURIComponent(`Ola, sou ${student.name}. Preciso de ajuda com o aplicativo Pro Fitness.`);
    document.getElementById("moreWhatsappButton").href = rules.whatsappNumber ? `https://wa.me/${rules.whatsappNumber}?text=${message}` : "#";
  }

  function renderGateQr(student) {
    const access = Store.getAccessState(state, student.id);
    const validCredential = gateCredential?.payload && new Date(gateCredential.expiresAt).getTime() > Date.now();
    renderQr(document.getElementById("gateQrContainer"), access.allowsGate && validCredential ? gateCredential.payload : "", 220);
    const detail = validCredential ? `Codigo de uso unico, valido ate ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(gateCredential.expiresAt))}.` : access.reason;
    document.getElementById("gateAccessDetails").innerHTML = `<div class="qr-detail-card">${statusPill(access.status, access.label)}<p>${escapeHtml(detail)}</p></div>`;
  }

  async function refreshGateCredential() {
    const student = getCurrentStudent();
    if (!student) return;
    try {
      gateCredential = await Store.requestGateTokenRemote();
      if (!gateCredential.allowed) showToast(gateCredential.reason || "Acesso indisponivel.");
      renderGateQr(student);
    } catch (error) {
      gateCredential = null;
      renderGateQr(student);
      showToast(error.message || "Nao foi possivel gerar o QR.");
    }
  }

  function switchScreen(screen) {
    const target = document.querySelector(`[data-screen-panel="${CSS.escape(screen)}"]`) ? screen : "home";
    const navigationTarget = ["evolution", "payments"].includes(target) ? "more" : target;
    activeScreen = target;
    document.querySelectorAll("[data-screen-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.screenPanel === target));
    document.querySelectorAll(".bottom-nav-item[data-screen]").forEach((button) => {
      const active = button.dataset.screen === navigationTarget;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderStudentArea(student) {
    renderHome(student);
    renderWorkouts(student);
    renderSchedule(student);
    renderEvolution(student);
    renderPayments(student);
    renderProfile(student);
    renderGateQr(student);
    switchScreen(activeScreen);
  }

  function render() {
    syncState();
    const student = getCurrentStudent();
    onboardingView.hidden = Boolean(student);
    studentView.hidden = !student;
    if (!student) {
      renderEnrollment();
      return;
    }
    renderStudentArea(student);
  }

  async function stopScanner() {
    scannerActive = false;
    if (scannerStream) scannerStream.getTracks().forEach((track) => track.stop());
    scannerStream = null;
    scannerVideo.srcObject = null;
    closeDialog(scannerModal);
  }

  async function scanLoop() {
    if (!scannerActive || !detector) return;
    try {
      if (scannerVideo.readyState >= 2) {
        const codes = await detector.detect(scannerVideo);
        if (codes.length) {
          await stopScanner();
          beginEnrollment(codes[0].rawValue);
          return;
        }
      }
    } catch (error) {
      document.getElementById("scannerHint").textContent = "Nao foi possivel ler automaticamente. Informe o codigo manualmente.";
    }
    window.requestAnimationFrame(scanLoop);
  }

  async function startScanner() {
    if (!navigator.mediaDevices?.getUserMedia || !("BarcodeDetector" in window)) {
      showToast("Leitura automatica indisponivel. Use o codigo manual.");
      return;
    }
    try {
      detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      scannerVideo.srcObject = scannerStream;
      scannerActive = true;
      openDialog(scannerModal);
      window.requestAnimationFrame(scanLoop);
    } catch (error) {
      showToast("Nao foi possivel abrir a camera.");
    }
  }

  function handleStudentAuthInvalid(message) {
    authSession = null;
    studentSession = null;
    state = Store.migrateData(Store.createEmptySnapshot());
    onboardingView.hidden = false;
    studentView.hidden = true;
    const feedback = document.getElementById("studentLoginFeedback");
    if (feedback) feedback.textContent = message || "Sua sessao terminou. Entre novamente.";
    render();
  }

  async function validateStudentSession() {
    if (!authSession || Store.isLocalDemoSession(authSession)) return authSession;
    try {
      authSession = await Store.validateAuthSessionRemote({ allowOffline: true });
      return authSession;
    } catch (error) {
      handleStudentAuthInvalid(error.message);
      return null;
    }
  }

  function attachEvents() {
    document.getElementById("closeScannerButton").addEventListener("click", stopScanner);
    studentLoginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (event.currentTarget.dataset.busy === "true") return;
      const form = new FormData(event.currentTarget);
      Store.setFormBusy(event.currentTarget, true, "Entrando...");
      try {
        await loginStudent(form.get("login"), form.get("password"));
      } finally {
        Store.setFormBusy(event.currentTarget, false);
      }
    });
    studentPasswordChangeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (event.currentTarget.dataset.busy === "true") return;
      Store.setFormBusy(event.currentTarget, true, "Salvando...");
      const form = new FormData(event.currentTarget);
      const currentPassword = String(form.get("currentPassword") || "");
      const newPassword = String(form.get("newPassword") || "");
      const feedback = document.getElementById("passwordChangeFeedback");
      if (newPassword !== String(form.get("confirmPassword") || "")) {
        feedback.textContent = "A confirmacao da nova senha nao confere.";
        return;
      }
      try {
        const session = await Store.changePasswordRemote(currentPassword, newPassword);
        event.currentTarget.reset();
        feedback.textContent = "";
        await activateAuthenticatedStudent(session);
        showToast("Senha alterada com sucesso.");
      } catch (error) {
        feedback.textContent = error.message || "Nao foi possivel alterar a senha.";
      } finally {
        Store.setFormBusy(event.currentTarget, false);
      }
    });
    document.getElementById("cancelPasswordChange").addEventListener("click", async () => {
      await Store.logoutRemote();
      Store.clearStudentSession();
      syncState();
      render();
    });

    document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => closeDialog(document.getElementById(button.dataset.closeDialog))));
    document.getElementById("openProfileButton").addEventListener("click", () => openDialog(document.getElementById("profileDialog")));
    document.getElementById("openMoreProfileButton").addEventListener("click", () => openDialog(document.getElementById("profileDialog")));
    document.getElementById("installStudentAppButton").addEventListener("click", installStudentApp);
    document.getElementById("logoutButton").addEventListener("click", async () => { await Store.logoutRemote(); Store.clearStudentSession(); authSession = null; studentSession = null; closeDialog(document.getElementById("profileDialog")); render(); showToast("Sessao encerrada neste celular."); });
    document.getElementById("bottomGateQrButton").addEventListener("click", async () => { openDialog(document.getElementById("gateQrDialog")); await refreshGateCredential(); });
    document.getElementById("refreshGateQrButton").addEventListener("click", refreshGateCredential);

    document.getElementById("studentView").addEventListener("click", (event) => {
      const navigationButton = event.target.closest("[data-screen]");
      if (navigationButton) switchScreen(navigationButton.dataset.screen);
      const startButton = event.target.closest("[data-start-workout]");
      if (startButton) startWorkout(startButton.dataset.startWorkout);
      const sessionButton = event.target.closest("[data-open-session]");
      if (sessionButton) openWorkoutSession(sessionButton.dataset.openSession);
      const divisionButton = event.target.closest("[data-workout-division]");
      if (divisionButton) { activeWorkoutDivision = divisionButton.dataset.workoutDivision; const student = getCurrentStudent(); if (student) renderWorkouts(student); }
      const agendaButton = event.target.closest("[data-agenda-date]");
      if (agendaButton) { selectedAgendaDate = agendaButton.dataset.agendaDate; const student = getCurrentStudent(); if (student) renderSchedule(student); }
    });

    document.getElementById("sessionExerciseList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-complete-set]");
      if (button) toggleExerciseSet(button.dataset.completeSet);
    });
    document.getElementById("sessionExerciseList").addEventListener("change", (event) => {
      const row = event.target.closest("[data-set-row]");
      if (!row || !event.target.dataset.setField) return;
      updateExerciseSetField(row.dataset.setRow, event.target.dataset.setField === "reps" ? "actualReps" : "actualLoad", event.target.value);
    });
    document.getElementById("closeWorkoutSessionButton").addEventListener("click", () => { window.clearInterval(workoutTimer); stopRestTimer(); closeDialog(workoutSessionDialog); render(); });
    document.getElementById("finishWorkoutButton").addEventListener("click", openFinishWorkout);
    document.getElementById("skipRestTimerButton").addEventListener("click", stopRestTimer);
    document.getElementById("finishWorkoutForm").addEventListener("submit", finishWorkout);
    document.getElementById("evolutionPeriod").addEventListener("change", () => { const student = getCurrentStudent(); if (student) renderEvolution(student); });
    document.getElementById("agendaTodayButton").addEventListener("click", () => { selectedAgendaDate = Store.todayISO(); const student = getCurrentStudent(); if (student) renderSchedule(student); });
    document.getElementById("studentSyncButton").addEventListener("click", async () => {
      const flushed = await flushStudentSyncQueue({ notify: true });
      if (flushed && !loadStudentSyncQueue().length) await refreshStudentFromRemote();
    });
    window.addEventListener("storage", () => { syncState(); render(); renderStudentSyncStatus(); });
    window.addEventListener("online", async () => {
      renderStudentSyncStatus("pending", "Internet restabelecida");
      if (!(await validateStudentSession())) return;
      const flushed = await flushStudentSyncQueue({ notify: false });
      if (flushed && !loadStudentSyncQueue().length) await refreshStudentFromRemote();
    });
    window.addEventListener("offline", () => renderStudentSyncStatus("offline"));
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState === "visible" && await validateStudentSession()) flushStudentSyncQueue({ notify: false });
    });
    window.addEventListener("profitness:auth-invalid", (event) => handleStudentAuthInvalid(event.detail?.message));
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      renderInstallOption();
    });
    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      renderInstallOption();
      showToast("Pro Fitness instalado com sucesso.");
    });
    studentSyncTimer = window.setInterval(() => flushStudentSyncQueue({ notify: false }), STUDENT_SYNC_INTERVAL_MS);
    studentAuthTimer = window.setInterval(() => validateStudentSession(), 60000);
    window.addEventListener("beforeunload", () => {
      if (studentSyncTimer) window.clearInterval(studentSyncTimer);
      if (studentAuthTimer) window.clearInterval(studentAuthTimer);
      if (workoutTimer) window.clearInterval(workoutTimer);
      if (restTimer) window.clearInterval(restTimer);
    });
  }

  attachEvents();
  renderInstallOption();
  renderStudentSyncStatus();
  (async function initializeStudentApp() {
    Store.applyRuntimeEnvironment();
    if (authSession && !Store.isLocalDemoSession(authSession) && navigator.onLine !== false) {
      onboardingView.hidden = false;
      studentView.hidden = true;
      document.getElementById("studentLoginFeedback").textContent = "Validando sessao...";
    } else {
      render();
    }
    if (!(await validateStudentSession()) && authSession) return;
    syncState();
    if (authSession?.account?.role === "student" && !authSession.account.mustChangePassword && !studentSession && authSession.account.personId) {
      try {
        await activateAuthenticatedStudent(authSession);
        syncState();
      } catch (error) {
        document.getElementById("studentLoginFeedback").textContent = error.message || "Nao foi possivel carregar os dados do aluno.";
      }
    }
    const flushed = authSession ? await flushStudentSyncQueue({ notify: false }) : false;
    state = Store.loadData();
    if (authSession && flushed && !loadStudentSyncQueue().length) await refreshStudentFromRemote();
    render();
    renderStudentSyncStatus();
  })();
})();
