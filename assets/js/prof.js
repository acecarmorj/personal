(function () {
  "use strict";

  const Store = window.ProFitnessStore;
  const Finance = window.ProFitnessFinance;
  if (!Store || !Finance) {
    return;
  }

  const WEEK_DAYS = [
    { value: 0, label: "Domingo", short: "Dom" },
    { value: 1, label: "Segunda-feira", short: "Seg" },
    { value: 2, label: "Terca-feira", short: "Ter" },
    { value: 3, label: "Quarta-feira", short: "Qua" },
    { value: 4, label: "Quinta-feira", short: "Qui" },
    { value: 5, label: "Sexta-feira", short: "Sex" },
    { value: 6, label: "Sabado", short: "Sab" }
  ];
  const WEEKLY_NOTE_PREFIX = "WEEKLY_CLASS:";
  const PROFESSOR_SYNC_QUEUE_PREFIX = Store.storageKey("professor-sync-queue-v2");
  const PROFESSOR_LAST_SYNC_PREFIX = Store.storageKey("professor-last-sync-v2");
  const PROFESSOR_SYNC_INTERVAL_MS = 60000;
  const PROFESSOR_SYNC_RESOURCES = ["students", "assessments", "workouts", "schedule", "payments", "movements", "checkins", "staffTimeEntries"];
  const ACTIVE_PROFESSOR_KEY = Store.storageKey("active-professor-v1");
  const PROFESSOR_DEVICE_KEY = Store.storageKey("professor-device-v1");

  let state = Store.loadData();
  let authSession = Store.loadAuthSession();
  let activeView = "inicio";
  let selectedStudentId = "";
  let activeStudentModule = "ficha";
  let studentEditing = false;
  let creatingProfessorStudent = false;
  let toastTimer = null;
  let workoutExerciseDraft = [];
  let professorSyncPromise = null;
  let professorAutoSyncTimer = null;
  let staffClockTimer = null;
  let professorIdleTimer = null;
  let professorAuthTimer = null;
  let professorLastActivity = Date.now();

  function professorAccountKey(prefix) {
    return `${prefix}-${authSession?.account?.id || "anonymous"}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  }

  function todayLocalISO() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }

  function dayDifference(fromDate, toDate) {
    const from = new Date(`${fromDate}T12:00:00`);
    const to = new Date(`${toDate}T12:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return 0;
    }
    return Math.max(0, Math.floor((to - from) / 86400000));
  }


  function safeNumber(value) {
    const parsed = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatNumber(value, digits) {
    const parsed = safeNumber(value);
    return parsed.toLocaleString("pt-BR", {
      minimumFractionDigits: digits ?? 0,
      maximumFractionDigits: digits ?? 1
    });
  }

  function loadProfessorSyncQueue() {
    try {
      const parsed = JSON.parse(localStorage.getItem(professorAccountKey(PROFESSOR_SYNC_QUEUE_PREFIX)) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => item && item.resource && item.recordId) : [];
    } catch (error) {
      return [];
    }
  }

  function saveProfessorSyncQueue(queue) {
    localStorage.setItem(professorAccountKey(PROFESSOR_SYNC_QUEUE_PREFIX), JSON.stringify(Array.isArray(queue) ? queue : []));
    renderProfessorSyncStatus();
  }

  function getProfessorPendingCount() {
    return loadProfessorSyncQueue().length;
  }

  function recordsAreEqual(left, right) {
    return JSON.stringify(left || null) === JSON.stringify(right || null);
  }

  function buildProfessorSyncOperations(beforeState, afterState) {
    const operations = [];
    PROFESSOR_SYNC_RESOURCES.forEach((resource) => {
      const beforeItems = Array.isArray(beforeState?.[resource]) ? beforeState[resource] : [];
      const afterItems = Array.isArray(afterState?.[resource]) ? afterState[resource] : [];
      const beforeMap = new Map(beforeItems.filter((item) => item?.id).map((item) => [String(item.id), item]));
      const afterMap = new Map(afterItems.filter((item) => item?.id).map((item) => [String(item.id), item]));

      afterMap.forEach((record, recordId) => {
        if (!beforeMap.has(recordId) || !recordsAreEqual(beforeMap.get(recordId), record)) {
          operations.push({
            id: Store.uid("SYNC"),
            accountId: authSession?.account?.id || "",
            action: "upsert",
            resource,
            recordId,
            data: Store.clone(record),
            queuedAt: new Date().toISOString()
          });
        }
      });

      beforeMap.forEach((record, recordId) => {
        if (!afterMap.has(recordId)) {
          operations.push({
            id: Store.uid("SYNC"),
            accountId: authSession?.account?.id || "",
            action: "delete",
            resource,
            recordId,
            data: { id: recordId, expectedUpdatedAt: record.updatedAt || "" },
            queuedAt: new Date().toISOString()
          });
        }
      });
    });
    return operations;
  }

  function enqueueProfessorSyncOperations(operations) {
    if (!operations.length) {
      return;
    }
    const queue = loadProfessorSyncQueue();
    const order = [];
    const byRecord = new Map();

    queue.concat(operations).forEach((operation) => {
      const key = `${operation.resource}:${operation.recordId}`;
      if (!byRecord.has(key)) {
        order.push(key);
      }
      byRecord.set(key, operation);
    });

    saveProfessorSyncQueue(order.map((key) => byRecord.get(key)).filter(Boolean));
  }

  function formatProfessorLastSync() {
    const value = localStorage.getItem(professorAccountKey(PROFESSOR_LAST_SYNC_PREFIX));
    if (!value) {
      return "Ainda não sincronizado";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "Ainda não sincronizado";
    }
    return `Sincronizado ${new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(parsed)}`;
  }

  function setProfessorLastSync() {
    localStorage.setItem(professorAccountKey(PROFESSOR_LAST_SYNC_PREFIX), new Date().toISOString());
  }

  function renderProfessorSyncStatus(mode, customText) {
    const connectionText = document.getElementById("connectionText");
    const connectionDot = document.getElementById("connectionDot");
    const pendingText = document.getElementById("pendingSyncText");
    const lastSyncText = document.getElementById("lastSyncText");
    if (!connectionText || !connectionDot || !pendingText || !lastSyncText) {
      return;
    }

    const pending = getProfessorPendingCount();
    pendingText.hidden = pending === 0;
    pendingText.textContent = pending === 1 ? "1 pendência" : `${pending} pendências`;
    pendingText.title = loadProfessorSyncQueue()[0]?.lastError || "Toque para tentar enviar novamente";

    const resolvedMode = mode || (Store.isLocalDemoSession(authSession) ? "local" : pending ? "pending" : navigator.onLine === false ? "offline" : "online");
    const showLastSync = pending > 0 || ["pending", "offline", "error"].includes(resolvedMode);
    lastSyncText.hidden = !showLastSync;
    lastSyncText.textContent = showLastSync ? formatProfessorLastSync() : "";
    connectionDot.className = `connection-dot ${resolvedMode}`;
    document.body.classList.toggle("prof-syncing", resolvedMode === "syncing");

    const labels = {
      syncing: "Sincronizando",
      online: Store.isRemoteConfigured() ? "Dados sincronizados" : "Dados deste aparelho",
      pending: navigator.onLine === false ? "Sem internet — salvo no tablet" : "Envio pendente",
      offline: "Sem internet — salvo no tablet",
      error: "API indisponível — dados locais",
      local: "Dados deste aparelho"
    };
    connectionText.textContent = customText || labels[resolvedMode] || labels.online;
  }

  function isProfessorOnline() {
    return navigator.onLine !== false;
  }

  function isDialogOpen(dialogId) {
    const dialog = document.getElementById(dialogId);
    return Boolean(dialog?.open || dialog?.hasAttribute("open"));
  }

  function hasProfessorUnsavedEditor() {
    return studentEditing
      || isDialogOpen("profPaymentDialog")
      || isDialogOpen("profWorkoutDialog")
      || isDialogOpen("profAssessmentDialog")
      || isDialogOpen("profScheduleDialog");
  }

  async function sendProfessorSyncOperation(operation) {
    if (operation.action === "delete") {
      return Store.deleteRemoteRecord(operation.resource, operation.recordId, operation.data?.expectedUpdatedAt);
    }
    return Store.upsertRemoteRecord(operation.resource, operation.data);
  }

  async function flushProfessorSyncQueue(options) {
    const settings = options || {};
    if (professorSyncPromise) {
      return professorSyncPromise;
    }

    professorSyncPromise = (async () => {
      if (Store.isLocalDemoSession(authSession)) {
        saveProfessorSyncQueue([]);
        renderProfessorSyncStatus("local", "Demonstracao local");
        return true;
      }
      if (!Store.isRemoteConfigured()) {
        renderProfessorSyncStatus("local");
        return false;
      }
      if (!isProfessorOnline()) {
        renderProfessorSyncStatus("offline");
        return false;
      }

      if (!loadProfessorSyncQueue().length) {
        renderProfessorSyncStatus("online");
        return true;
      }

      renderProfessorSyncStatus("syncing", "Enviando alterações");
      let sent = 0;
      while (loadProfessorSyncQueue().length) {
        const operation = loadProfessorSyncQueue()[0];
        await sendProfessorSyncOperation(operation);
        const latestQueue = loadProfessorSyncQueue();
        const sentIndex = latestQueue.findIndex((item) => item.id === operation.id);
        if (sentIndex >= 0) {
          latestQueue.splice(sentIndex, 1);
          saveProfessorSyncQueue(latestQueue);
        }
        sent += 1;
        renderProfessorSyncStatus(loadProfessorSyncQueue().length ? "syncing" : "online", loadProfessorSyncQueue().length ? "Enviando alterações" : undefined);
      }

      setProfessorLastSync();
      renderProfessorSyncStatus("online");
      if (settings.notify !== false && sent) {
        showToast(sent === 1 ? "Alteração sincronizada." : `${sent} alterações sincronizadas.`, "success");
      }
      return true;
    })().catch((error) => {
      const queue = loadProfessorSyncQueue();
      if (queue[0]) {
        queue[0] = {
          ...queue[0],
          lastError: error?.message || "Falha de sincronizacao",
          lastAttemptAt: new Date().toISOString()
        };
        saveProfessorSyncQueue(queue);
      }
      renderProfessorSyncStatus(getProfessorPendingCount() ? "pending" : isProfessorOnline() ? "error" : "offline");
      if (settings.notify !== false) {
        showToast(error?.code === "SYNC_CONFLICT"
          ? "Ha uma versao mais recente na planilha. A alteracao ficou pendente para conferencia."
          : "Dados salvos no tablet. O envio será repetido automaticamente.", "warning");
      }
      return false;
    }).finally(() => {
      professorSyncPromise = null;
      document.body.classList.remove("prof-syncing");
    });

    return professorSyncPromise;
  }

  function formatPaymentReference(reference) {
    const [year, month] = String(reference || "").split("-").map(Number);
    if (!year || !month) {
      return reference || "Não informada";
    }
    const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
      .format(new Date(year, month - 1, 1));
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function getEffectivePaymentStatus(payment) {
    return payment ? Finance.effectivePaymentStatus(payment, todayLocalISO()) : "inexistente";
  }

  function getPaymentStatusLabel(status) {
    return {
      inexistente: "Ainda não gerada",
      pago: "Paga",
      parcial: "Parcial",
      pendente: "Pendente",
      vencido: "Vencida",
      cancelado: "Cancelada"
    }[status] || status;
  }

  function getStudentPayments(studentId) {
    return (state.payments || [])
      .filter((payment) => payment.studentId === studentId)
      .sort((left, right) => String(right.reference || right.dueDate || "").localeCompare(String(left.reference || left.dueDate || "")));
  }

  function getLatestStudentPayment(studentId) {
    return getStudentPayments(studentId)[0] || null;
  }

  function getPaymentForReference(studentId, reference) {
    return getStudentPayments(studentId).find((payment) => payment.reference === reference) || null;
  }

  function getSuggestedPaymentDueDate(studentId, reference, existingPayment) {
    if (existingPayment?.dueDate) {
      return existingPayment.dueDate;
    }
    const latest = getLatestStudentPayment(studentId);
    const preferredDay = Number(String(latest?.dueDate || "").slice(8, 10)) || 10;
    const [year, month] = String(reference || "").split("-").map(Number);
    if (!year || !month) {
      return todayLocalISO();
    }
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(preferredDay, lastDay)).padStart(2, "0")}`;
  }

  function getDefaultPaymentRecorder() {
    const activeUser = (state.users || []).find((user) => user.status !== "inativo");
    return activeUser?.name || "Equipe Pro Fitness";
  }

  function getAccessSummary(student) {
    const access = Store.getAccessState(state, student.id);
    return {
      blocked: !access.allowsGate,
      label: access.allowsGate ? "Acesso liberado" : "Acesso bloqueado"
    };
  }

  function getLatestAccessCheckin(studentId) {
    return Store.getStudentCheckins(state, studentId)
      .filter((item) => item.type === "access")
      .sort((a, b) => String(b.checkedInAt || `${b.date}T${b.time || "00:00"}`).localeCompare(String(a.checkedInAt || `${a.date}T${a.time || "00:00"}`)))[0] || null;
  }

  function getInsideStudents() {
    return state.students
      .filter((student) => Boolean(getOpenAccessCheckin(student.id)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  function isAccessCheckin(checkin) {
    return checkin?.type === "access" || Boolean(checkin?.checkedInAt || checkin?.entryAt);
  }

  function getPresenceTimestamp(checkin) {
    const explicit = checkin?.checkedInAt || checkin?.entryAt || "";
    if (explicit) {
      return explicit;
    }
    const date = String(checkin?.date || "");
    const time = Store.formatTime(checkin?.time || "00:00");
    return date ? `${date}T${time}:00` : "";
  }

  function getStudentAccessCheckins(studentId) {
    return state.checkins
      .filter((checkin) => checkin.studentId === studentId && isAccessCheckin(checkin))
      .sort((left, right) => String(getPresenceTimestamp(left)).localeCompare(String(getPresenceTimestamp(right))));
  }

  function getOpenAccessCheckin(studentId) {
    return [...getStudentAccessCheckins(studentId)]
      .reverse()
      .find((checkin) => !checkin.checkedOutAt && !checkin.exitAt && checkin.presenceStatus !== "outside") || null;
  }

  function formatPresence(checkin) {
    if (!checkin) {
      return "Nenhuma";
    }
    const timestamp = getPresenceTimestamp(checkin);
    return timestamp ? Store.formatDateTime(timestamp) : "Nenhuma";
  }

  function getPresenceStats(studentId) {
    const entries = getStudentAccessCheckins(studentId);
    return {
      entries,
      count: entries.length,
      first: entries[0] || null,
      last: entries[entries.length - 1] || null,
      open: getOpenAccessCheckin(studentId)
    };
  }

  function showToast(message, tone) {
    const toast = document.getElementById("profToast");
    if (!toast) {
      return;
    }
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `prof-toast ${tone || ""}`.trim();
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 4200);
  }

  function decodeWeeklyNotes(notes) {
    const value = String(notes || "");
    if (!value.startsWith(WEEKLY_NOTE_PREFIX)) {
      return {};
    }
    try {
      return JSON.parse(value.slice(WEEKLY_NOTE_PREFIX.length));
    } catch (error) {
      return {};
    }
  }

  function normalizeWeeklyClass(record) {
    const fallback = decodeWeeklyNotes(record.notes);
    const recurringValue = String(record.recurring || "").toLowerCase();
    const isRecurring = record.recurring === true || ["true", "1", "sim"].includes(recurringValue);
    const isWeekly = record.scheduleKind === "weekly-class" || record.type === "group" || isRecurring || Boolean(fallback.title);
    if (!isWeekly) {
      return null;
    }
    return {
      id: record.id,
      title: record.title || fallback.title || "Atividade",
      dayOfWeek: Number(record.dayOfWeek ?? fallback.dayOfWeek ?? 1),
      startTime: Store.formatTime(record.startTime || fallback.startTime || record.time || "00:00"),
      endTime: record.endTime || fallback.endTime ? Store.formatTime(record.endTime || fallback.endTime) : "",
      teacherName: record.teacherName || fallback.teacherName || "Professor",
      location: record.location || fallback.location || "",
      status: record.status || fallback.status || "ativo"
    };
  }

  function getTodayAgenda() {
    const today = todayLocalISO();
    const todayWeekDay = new Date(`${today}T12:00:00`).getDay();
    const individual = state.schedule
      .filter((item) => item.date === today && item.studentId)
      .map((item) => ({
        kind: "student",
        id: item.id,
        studentId: item.studentId,
        title: Store.findStudent(state, item.studentId)?.name || "Aluno",
        detail: item.notes || item.type || "Atendimento",
        time: Store.formatTime(item.time),
        status: item.status || "marcada"
      }));

    const weekly = state.schedule
      .map(normalizeWeeklyClass)
      .filter((item) => item && item.status === "ativo" && item.dayOfWeek === todayWeekDay)
      .map((item) => ({
        kind: "class",
        id: item.id,
        title: item.title,
        detail: [item.teacherName, item.location].filter(Boolean).join(" · "),
        time: item.startTime,
        endTime: item.endTime,
        status: "aula"
      }));

    return [...individual, ...weekly].sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }

  function findStudents(query) {
    const normalized = normalizeText(query);
    const students = [...state.students].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (!normalized) {
      return students;
    }
    return students.filter((student) => normalizeText([
      student.name,
      student.phone,
      student.email,
      student.plan,
      student.id,
      student.enrollmentToken,
      student.gateCode
    ].join(" ")).includes(normalized));
  }

  function studentStatusMarkup(student) {
    const access = getAccessSummary(student);
    return `
      <div class="status-stack">
        <span class="status-pill ${access.blocked ? "blocked" : "ok"}">${access.blocked ? "Bloqueado" : "OK"}</span>
      </div>
    `;
  }

  function studentRowMarkup(student, className) {
    return `
      <button class="${className}" type="button" data-open-student="${escapeHtml(student.id)}">
        <span class="person-main">
          <strong>${escapeHtml(student.name)}</strong>
          <span>${escapeHtml(student.plan || "Plano nao informado")}</span>
          <small>${escapeHtml(student.phone || "Telefone nao informado")}</small>
        </span>
        ${studentStatusMarkup(student)}
      </button>
    `;
  }

  function renderSearchResults(query) {
    const container = document.getElementById("profSearchResults");
    const clearButton = document.getElementById("clearProfessorSearch");
    clearButton.hidden = !query;

    if (!query.trim()) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }

    const students = findStudents(query).slice(0, 8);
    container.innerHTML = students.length
      ? students.map((student) => studentRowMarkup(student, "student-search-row")).join("")
      : '<div class="empty-state">Nenhum aluno encontrado.</div>';
    container.hidden = false;
  }

  function renderMetrics() {
    const inside = getInsideStudents();
    const agenda = getTodayAgenda();
    const active = state.students.filter((student) => student.status === "ativo");
    const blocked = active.filter((student) => getAccessSummary(student).blocked);
    document.getElementById("metricInside").textContent = inside.length;
    document.getElementById("metricAgenda").textContent = agenda.length;
    document.getElementById("metricActiveStudents").textContent = active.length;
    document.getElementById("metricBlocked").textContent = blocked.length;
  }

  function renderInsideStudents() {
    const students = getInsideStudents();
    document.getElementById("insideStudentsList").innerHTML = students.length
      ? students.slice(0, 6).map((student) => studentRowMarkup(student, "person-row")).join("")
      : '<div class="empty-state">Nenhum aluno registrado dentro da academia.</div>';
  }

  function getScheduleStatusLabel(status) {
    return {
      marcada: "Marcada",
      remarcada: "Remarcada",
      realizada: "Realizada",
      falta: "Falta",
      cancelada: "Cancelada"
    }[status] || status || "Marcada";
  }

  function getScheduleStatusTone(status) {
    if (status === "realizada") {
      return "ok";
    }
    if (["cancelada", "falta"].includes(status)) {
      return "blocked";
    }
    return "warning";
  }

  function agendaRowMarkup(item, compactMode) {
    const statusLabel = item.kind === "class" ? "Aula coletiva" : getScheduleStatusLabel(item.status);
    const actions = !compactMode && item.kind === "student"
      ? `<div class="agenda-row-actions">
          <button type="button" data-prof-edit-schedule="${escapeHtml(item.id)}">Editar</button>
          ${!["realizada", "cancelada"].includes(item.status) ? `<button type="button" data-prof-schedule-status="realizada" data-schedule-id="${escapeHtml(item.id)}">Realizada</button>` : ""}
          ${!["falta", "cancelada", "realizada"].includes(item.status) ? `<button type="button" data-prof-schedule-status="falta" data-schedule-id="${escapeHtml(item.id)}">Falta</button>` : ""}
          ${!["realizada", "falta", "cancelada"].includes(item.status) ? `<button type="button" data-prof-remchedule="${escapeHtml(item.id)}">Remarcar</button>` : ""}
          ${item.status !== "cancelada" ? `<button type="button" data-prof-schedule-status="cancelada" data-schedule-id="${escapeHtml(item.id)}">Cancelar</button>` : ""}
        </div>`
      : "";
    return `
      <article class="agenda-row ${compactMode ? "compact" : ""}">
        <div class="agenda-time">${escapeHtml(item.time)}</div>
        <div class="agenda-main">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.detail || "")}${item.endTime ? ` · até ${escapeHtml(item.endTime)}` : ""}</span>
          ${actions}
        </div>
        <span class="status-pill ${getScheduleStatusTone(item.status)}">${escapeHtml(statusLabel)}</span>
      </article>
    `;
  }

  function renderAgenda() {
    const agenda = getTodayAgenda();
    const compact = document.getElementById("todayAgendaList");
    const full = document.getElementById("profFullAgendaList");
    const markup = agenda.length
      ? agenda.map((item) => agendaRowMarkup(item, false)).join("")
      : '<div class="empty-state">Nenhuma atividade agendada para hoje.</div>';
    compact.innerHTML = agenda.length ? agenda.slice(0, 6).map((item) => agendaRowMarkup(item, true)).join("") : markup;
    full.innerHTML = markup;

    document.getElementById("profAgendaDate").textContent = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      timeZone: "America/Sao_Paulo"
    }).format(new Date());
  }

  function renderStudentList(query) {
    const students = findStudents(query);
    document.getElementById("profStudentCount").textContent = `${students.length} ${students.length === 1 ? "aluno" : "alunos"}`;
    document.getElementById("profStudentList").innerHTML = students.length
      ? students.map((student) => studentRowMarkup(student, "student-list-card")).join("")
      : '<div class="empty-state">Nenhum aluno encontrado.</div>';
  }

  function fillStudentForm(student) {
    const form = document.getElementById("profStudentForm");
    const source = student || {};
    ["id", "name", "phone", "email", "birthDate", "plan", "goal", "restrictions", "notes"].forEach((name) => {
      if (form.elements[name]) {
        form.elements[name].value = source[name] || "";
      }
    });
  }

  function setStudentEditing(enabled) {
    studentEditing = Boolean(enabled);
    const fieldset = document.getElementById("profStudentFieldset");
    const saveBar = document.getElementById("profStudentSaveBar");
    const editButton = document.getElementById("editProfessorStudent");
    const status = document.getElementById("profStudentFormStatus");

    fieldset.disabled = !studentEditing;
    saveBar.hidden = !studentEditing;
    editButton.hidden = studentEditing || creatingProfessorStudent;
    status.textContent = creatingProfessorStudent ? "Novo cadastro" : studentEditing ? "Editando" : "Somente visualização";

    if (studentEditing) {
      window.setTimeout(() => document.getElementById("profStudentForm").elements.name.focus(), 30);
    }
  }

  function presenceHistoryMarkup(checkin) {
    const entry = checkin.checkedInAt || checkin.entryAt || getPresenceTimestamp(checkin);
    const exit = checkin.checkedOutAt || checkin.exitAt || "";
    return `
      <article class="presence-history-row">
        <div>
          <strong>${escapeHtml(entry ? Store.formatDateTime(entry) : "Entrada não informada")}</strong>
          <span>${escapeHtml(checkin.presenceSource || checkin.source || "registro manual")}</span>
        </div>
        <div class="presence-exit">
          <span>Saída</span>
          <strong>${escapeHtml(exit ? Store.formatDateTime(exit) : "Ainda presente")}</strong>
        </div>
      </article>
    `;
  }

  function updateProfessorPaymentPreview() {
    const form = document.getElementById("profPaymentForm");
    const amount = safeNumber(form.elements.amount.value);
    const discount = safeNumber(form.elements.discount.value);
    const fine = safeNumber(form.elements.fine.value);
    const net = Math.max(0, amount - discount + fine);
    document.getElementById("profPaymentNetPreview").textContent = Store.currency(net);
    if (form.dataset.paidAmountTouched !== "1") {
      form.elements.paidAmount.value = net.toFixed(2);
    }
    return net;
  }

  function populateProfessorPaymentForm(student, reference) {
    const form = document.getElementById("profPaymentForm");
    const selectedReference = reference || todayLocalISO().slice(0, 7);
    const payment = getPaymentForReference(student.id, selectedReference);
    const latest = getLatestStudentPayment(student.id);
    const status = getEffectivePaymentStatus(payment);
    const amount = safeNumber(payment?.amount ?? student.monthlyFee ?? latest?.amount ?? 0);
    const discount = safeNumber(payment?.discount || 0);
    const fine = safeNumber(payment?.fine || 0);
    const net = Math.max(0, amount - discount + fine);

    form.reset();
    form.dataset.paidAmountTouched = "0";
    form.elements.id.value = payment?.id || "";
    form.elements.studentId.value = student.id;
    form.elements.status.value = "pago";
    form.elements.reference.value = selectedReference;
    form.elements.dueDate.value = getSuggestedPaymentDueDate(student.id, selectedReference, payment);
    form.elements.amount.value = amount || "";
    form.elements.method.value = payment?.method || latest?.method || "pix";
    form.elements.paidAt.value = payment?.paidAt || todayLocalISO();
    form.elements.paidAmount.value = payment?.status === "pago"
      ? safeNumber(payment.paidAmount ?? payment.netAmount ?? net).toFixed(2)
      : net.toFixed(2);
    form.elements.recordedBy.value = payment?.recordedBy || getDefaultPaymentRecorder();
    form.elements.discount.value = discount;
    form.elements.fine.value = fine;
    form.elements.notes.value = payment?.notes || "";

    document.getElementById("profPaymentTitle").textContent = `Receber mensalidade — ${student.name}`;
    document.getElementById("profPaymentStudentDisplay").value = student.name;
    document.getElementById("profPaymentStudentName").textContent = student.name;
    document.getElementById("profPaymentStudentPlan").textContent = student.plan || "Plano não informado";
    document.getElementById("profPaymentContextReference").textContent = `Competência: ${selectedReference}`;
    document.getElementById("profPaymentContextDueDate").textContent = `Vencimento: ${Store.formatDate(form.elements.dueDate.value)}`;
    document.getElementById("profPaymentContextStatus").textContent = `Situação atual: ${getPaymentStatusLabel(status)}`;
    document.getElementById("confirmProfessorPayment").textContent = status === "pago" ? "Atualizar recebimento" : "Confirmar recebimento";
    updateProfessorPaymentPreview();
  }

  async function openProfessorPayment() {
    const student = Store.findStudent(state, selectedStudentId);
    if (!student) {
      showToast("Selecione um aluno.", "warning");
      return;
    }
    try {
      const context = await Store.fetchProfessorPaymentContext(student.id, todayLocalISO().slice(0, 7));
      state.payments = context.payment ? [context.payment] : [];
      student.monthlyFee = context.suggestedAmount;
    } catch (error) {
      showToast(error.message || "Nao foi possivel consultar esta mensalidade.", "warning");
      return;
    }
    populateProfessorPaymentForm(student, todayLocalISO().slice(0, 7));
    const dialog = document.getElementById("profPaymentDialog");
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      dialog.setAttribute("open", "");
    }
    window.setTimeout(() => document.getElementById("profPaymentForm").elements.method.focus(), 40);
  }

  function closeProfessorPayment() {
    const dialog = document.getElementById("profPaymentDialog");
    if (dialog.open && typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  function syncProfessorPaymentMovement(snapshot, payment) {
    const next = Store.clone(snapshot);
    const existingIndex = (next.movements || []).findIndex((movement) => movement.paymentId === payment.id);
    const student = Store.findStudent(next, payment.studentId);
    const movement = Store.createMovementRecord({
      ...(existingIndex >= 0 ? next.movements[existingIndex] : {}),
      id: existingIndex >= 0 ? next.movements[existingIndex].id : "",
      date: payment.paidAt || todayLocalISO(),
      time: new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date()),
      type: "entrada",
      category: "mensalidade",
      description: `Mensalidade ${payment.reference} - ${student?.name || "Aluno"}`,
      amount: Finance.paidAmount(payment),
      method: payment.method || "pix",
      account: "caixa-principal",
      studentId: payment.studentId,
      paymentId: payment.id,
      expenseId: "",
      status: "confirmado",
      updatedAt: new Date().toISOString(),
      notes: payment.notes || "Recebimento registrado pelo professor no tablet."
    });
    next.movements = next.movements || [];
    if (existingIndex >= 0) {
      next.movements[existingIndex] = movement;
    } else {
      next.movements.unshift(movement);
    }
    return next;
  }

  async function saveProfessorPayment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const student = Store.findStudent(state, form.elements.studentId.value);
    if (!student) {
      showToast("Aluno não encontrado.", "warning");
      return;
    }
    const reference = form.elements.reference.value;
    const amount = safeNumber(form.elements.amount.value);
    const discount = safeNumber(form.elements.discount.value);
    const fine = safeNumber(form.elements.fine.value);
    const calculated = Math.max(0, amount - discount + fine);
    const paidAmount = Math.max(0, safeNumber(form.elements.paidAmount.value));
    const paidAt = form.elements.paidAt.value;
    const recordedBy = form.elements.recordedBy.value.trim();

    if (!reference || !form.elements.dueDate.value || !paidAt) {
      showToast("Preencha competência, vencimento e data do pagamento.", "warning");
      return;
    }
    if (!amount && calculated > 0) {
      showToast("Informe o valor previsto.", "warning");
      return;
    }
    if (!recordedBy) {
      form.elements.recordedBy.focus();
      showToast("Informe o responsável pelo lançamento.", "warning");
      return;
    }

    const payment = Store.createPaymentRecord({
      id: form.elements.id.value || "",
      studentId: student.id,
      reference,
      amount,
      discount,
      fine,
      netAmount: calculated,
      paidAmount,
      dueDate: form.elements.dueDate.value,
      status: paidAmount > 0 && paidAmount < calculated ? "parcial" : "pago",
      method: form.elements.method.value,
      paidAt,
      recordedBy,
      description: "Mensalidade",
      notes: form.elements.notes.value.trim(),
      updatedAt: new Date().toISOString()
    });

    try {
      const result = await Store.receivePaymentRemote(payment);
      state.payments = result.payment ? [result.payment] : [];
      closeProfessorPayment();
      showToast(`Recebimento de ${Store.currency(result.payment?.paidAmount || paidAmount)} confirmado.`, "success");
      await refreshData({ manual: false });
    } catch (error) {
      showToast(error.message || "Nao foi possivel confirmar o recebimento.", "warning");
    }
  }


  function normalizeWorkoutExerciseItem(item, workout, index) {
    const source = item && typeof item === "object" ? item : { name: item };
    return {
      id: source.id || `${workout?.id || "TR"}-EX-${index + 1}`,
      exerciseId: source.exerciseId || "",
      name: String(source.name || source.exercise || "").trim(),
      sets: String(source.sets ?? workout?.sets ?? "").trim(),
      reps: String(source.reps ?? workout?.reps ?? "").trim(),
      load: String(source.load ?? workout?.load ?? "").trim(),
      rest: String(source.rest ?? workout?.rest ?? "").trim(),
      notes: String(source.notes || "").trim()
    };
  }

  function getWorkoutExerciseItems(workout) {
    if (!workout) {
      return [];
    }
    const structured = Array.isArray(workout.exerciseItems)
      ? workout.exerciseItems.map((item, index) => normalizeWorkoutExerciseItem(item, workout, index)).filter((item) => item.name)
      : [];
    if (structured.length) {
      return structured;
    }
    const legacy = Array.isArray(workout.exercises)
      ? workout.exercises
      : String(workout.exercises || "").split(/[\n,]+/);
    return legacy
      .map((name, index) => normalizeWorkoutExerciseItem({ name }, workout, index))
      .filter((item) => item.name);
  }

  function getProfessorStudentWorkouts(studentId) {
    return Store.getStudentWorkouts(state, studentId)
      .sort((left, right) => {
        const leftActive = left.status === "ativo" ? 0 : 1;
        const rightActive = right.status === "ativo" ? 0 : 1;
        return leftActive - rightActive
          || String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || ""))
          || String(left.title || "").localeCompare(String(right.title || ""), "pt-BR");
      });
  }

  function workoutExerciseDisplayMarkup(item, index) {
    const details = [
      item.sets ? `${item.sets} séries` : "",
      item.reps ? `${item.reps} repetições` : "",
      item.load || "",
      item.rest ? `${item.rest} intervalo` : ""
    ].filter(Boolean);
    return `
      <div class="prof-workout-exercise-line">
        <span>${index + 1}</span>
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          ${details.length ? `<small>${details.map(escapeHtml).join(" · ")}</small>` : ""}
          ${item.notes ? `<small class="exercise-note">${escapeHtml(item.notes)}</small>` : ""}
        </div>
      </div>
    `;
  }

  function renderProfessorWorkouts(student) {
    const workouts = getProfessorStudentWorkouts(student.id);
    document.getElementById("profWorkoutCount").textContent = `${workouts.length} ${workouts.length === 1 ? "treino" : "treinos"}`;
    document.getElementById("profWorkoutTabCount").textContent = String(workouts.length);
    document.getElementById("profWorkoutList").innerHTML = workouts.length
      ? workouts.map((workout) => {
          const items = getWorkoutExerciseItems(workout);
          return `
            <article class="prof-workout-card ${workout.status === "ativo" ? "active" : "closed"}">
              <header class="prof-workout-card-head">
                <div class="workout-division-box">
                  <span>DIVISÃO</span>
                  <strong>${escapeHtml(workout.division || "-")}</strong>
                </div>
                <div class="workout-card-title">
                  <span>${escapeHtml(workout.muscleGroup || "Grupo muscular não informado")}</span>
                  <h4>${escapeHtml(workout.title || "Treino sem nome")}</h4>
                </div>
                <span class="status-pill ${workout.status === "ativo" ? "ok" : "warning"}">${escapeHtml(workout.status || "ativo")}</span>
              </header>
              <div class="prof-workout-exercises">
                ${items.length ? items.map(workoutExerciseDisplayMarkup).join("") : '<div class="empty-state compact">Nenhum exercício cadastrado.</div>'}
              </div>
              ${workout.notes ? `<p class="prof-workout-note">${escapeHtml(workout.notes)}</p>` : ""}
              <footer class="prof-workout-card-actions">
                <button type="button" data-prof-edit-workout="${escapeHtml(workout.id)}">Editar</button>
                <button type="button" data-prof-duplicate-workout="${escapeHtml(workout.id)}">Duplicar</button>
                <button class="${workout.status === "ativo" ? "danger" : "activate"}" type="button" data-prof-toggle-workout="${escapeHtml(workout.id)}">${workout.status === "ativo" ? "Encerrar" : "Ativar"}</button>
              </footer>
            </article>
          `;
        }).join("")
      : '<div class="empty-state">Nenhum treino cadastrado para este aluno.</div>';
  }

  function createExerciseDraft(item) {
    return {
      id: item?.id || Store.uid("EXI"),
      exerciseId: item?.exerciseId || "",
      name: String(item?.name || ""),
      sets: String(item?.sets || ""),
      reps: String(item?.reps || ""),
      load: String(item?.load || ""),
      rest: String(item?.rest || ""),
      notes: String(item?.notes || "")
    };
  }

  function syncExerciseDraftFromEditor() {
    document.querySelectorAll("[data-exercise-editor-id]").forEach((row) => {
      const item = workoutExerciseDraft.find((exercise) => exercise.id === row.dataset.exerciseEditorId);
      if (!item) {
        return;
      }
      row.querySelectorAll("[data-exercise-field]").forEach((input) => {
        item[input.dataset.exerciseField] = input.value;
      });
    });
  }

  function exerciseEditorMarkup(item, index) {
    return `
      <article class="exercise-editor-row" data-exercise-editor-id="${escapeHtml(item.id)}">
        <div class="exercise-order">
          <strong>${index + 1}</strong>
          <div>
            <button type="button" data-move-exercise="up" data-exercise-id="${escapeHtml(item.id)}" aria-label="Mover exercício para cima" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" data-move-exercise="down" data-exercise-id="${escapeHtml(item.id)}" aria-label="Mover exercício para baixo" ${index === workoutExerciseDraft.length - 1 ? "disabled" : ""}>↓</button>
          </div>
        </div>
        <div class="exercise-editor-fields">
          <label class="exercise-name-field">
            <span>Exercício</span>
            <input data-exercise-field="name" list="profExerciseCatalog" type="text" value="${escapeHtml(item.name)}" placeholder="Nome do exercício" />
          </label>
          <label>
            <span>Séries</span>
            <input data-exercise-field="sets" type="text" value="${escapeHtml(item.sets)}" placeholder="3x" />
          </label>
          <label>
            <span>Repetições</span>
            <input data-exercise-field="reps" type="text" value="${escapeHtml(item.reps)}" placeholder="8-12" />
          </label>
          <label>
            <span>Carga</span>
            <input data-exercise-field="load" type="text" value="${escapeHtml(item.load)}" placeholder="30 kg" />
          </label>
          <label>
            <span>Intervalo</span>
            <input data-exercise-field="rest" type="text" value="${escapeHtml(item.rest)}" placeholder="60 s" />
          </label>
          <label class="exercise-notes-field">
            <span>Orientação</span>
            <input data-exercise-field="notes" type="text" value="${escapeHtml(item.notes)}" placeholder="Opcional" />
          </label>
        </div>
        <button class="remove-exercise-button" type="button" data-remove-exercise="${escapeHtml(item.id)}" aria-label="Remover exercício">×</button>
      </article>
    `;
  }

  function renderExerciseEditor() {
    document.getElementById("profExerciseCount").textContent = `${workoutExerciseDraft.length} ${workoutExerciseDraft.length === 1 ? "exercício" : "exercícios"}`;
    document.getElementById("profExerciseEditorList").innerHTML = workoutExerciseDraft.length
      ? workoutExerciseDraft.map(exerciseEditorMarkup).join("")
      : '<div class="empty-state exercise-empty">Adicione pelo menos um exercício ao treino.</div>';
  }

  function renderExerciseCatalog() {
    const names = new Set();
    (state.exercises || []).forEach((exercise) => {
      if (exercise?.name) {
        names.add(exercise.name);
      }
    });
    (state.workouts || []).forEach((workout) => {
      getWorkoutExerciseItems(workout).forEach((item) => names.add(item.name));
    });
    document.getElementById("profExerciseCatalog").innerHTML = [...names]
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((name) => `<option value="${escapeHtml(name)}"></option>`)
      .join("");
  }

  function openProfessorWorkout(workoutId) {
    const student = Store.findStudent(state, selectedStudentId);
    if (!student) {
      showToast("Selecione um aluno.", "warning");
      return;
    }
    const workout = workoutId ? (state.workouts || []).find((item) => item.id === workoutId) : null;
    const form = document.getElementById("profWorkoutForm");
    form.reset();
    form.elements.id.value = workout?.id || "";
    form.elements.studentId.value = student.id;
    form.elements.title.value = workout?.title || "";
    form.elements.division.value = workout?.division || "A";
    form.elements.muscleGroup.value = workout?.muscleGroup || "";
    form.elements.status.value = workout?.status || "ativo";
    form.elements.notes.value = workout?.notes || "";
    workoutExerciseDraft = getWorkoutExerciseItems(workout).map(createExerciseDraft);
    if (!workoutExerciseDraft.length) {
      workoutExerciseDraft = [createExerciseDraft()];
    }
    document.getElementById("profWorkoutDialogTitle").textContent = `${workout ? "Editar treino" : "Novo treino"} — ${student.name}`;
    document.getElementById("profWorkoutStudentName").textContent = student.name;
    renderExerciseCatalog();
    renderExerciseEditor();
    const dialog = document.getElementById("profWorkoutDialog");
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      dialog.setAttribute("open", "");
    }
    window.setTimeout(() => form.elements.title.focus(), 40);
  }

  function closeProfessorWorkout() {
    const dialog = document.getElementById("profWorkoutDialog");
    if (dialog.open && typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
    workoutExerciseDraft = [];
  }

  function summarizeExerciseField(items, field) {
    const values = [...new Set(items.map((item) => String(item[field] || "").trim()).filter(Boolean))];
    return values.length === 1 ? values[0] : values.length > 1 ? "Variado" : "";
  }

  async function saveProfessorWorkout(event) {
    event.preventDefault();
    syncExerciseDraftFromEditor();
    const form = event.currentTarget;
    const student = Store.findStudent(state, form.elements.studentId.value);
    if (!student) {
      showToast("Aluno não encontrado.", "warning");
      return;
    }
    const title = form.elements.title.value.trim();
    const exerciseCatalogByName = new Map((state.exercises || []).map((exercise) => [String(exercise.name || "").trim().toLocaleLowerCase("pt-BR"), exercise.id]));
    const exerciseItems = workoutExerciseDraft
      .map(createExerciseDraft)
      .map((item) => {
        const name = item.name.trim();
        return { ...item, exerciseId: item.exerciseId || exerciseCatalogByName.get(name.toLocaleLowerCase("pt-BR")) || "", name, sets: item.sets.trim(), reps: item.reps.trim(), load: item.load.trim(), rest: item.rest.trim(), notes: item.notes.trim() };
      })
      .filter((item) => item.name);
    if (!title) {
      form.elements.title.focus();
      showToast("Informe o nome do treino.", "warning");
      return;
    }
    if (!exerciseItems.length) {
      showToast("Adicione pelo menos um exercício.", "warning");
      return;
    }
    const existing = form.elements.id.value
      ? (state.workouts || []).find((workout) => workout.id === form.elements.id.value)
      : null;
    const workout = {
      ...existing,
      id: existing?.id || Store.uid("TR"),
      studentId: student.id,
      title,
      division: form.elements.division.value || "A",
      muscleGroup: form.elements.muscleGroup.value.trim(),
      status: form.elements.status.value || "ativo",
      notes: form.elements.notes.value.trim(),
      exerciseItems,
      exercises: exerciseItems.map((item) => item.name),
      sets: summarizeExerciseField(exerciseItems, "sets"),
      reps: summarizeExerciseField(exerciseItems, "reps"),
      load: summarizeExerciseField(exerciseItems, "load"),
      rest: summarizeExerciseField(exerciseItems, "rest"),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const next = Store.clone(state);
    const index = next.workouts.findIndex((item) => item.id === workout.id);
    if (index >= 0) {
      next.workouts[index] = workout;
    } else {
      next.workouts.unshift(workout);
    }
    closeProfessorWorkout();
    await persistProfessorState(
      next,
      existing ? "professor-workout-updated" : "professor-workout-created",
      student.id,
      `${workout.title} ${existing ? "atualizado" : "criado"} no tablet.`
    );
  }

  async function duplicateProfessorWorkout(workoutId) {
    const workout = (state.workouts || []).find((item) => item.id === workoutId);
    const student = Store.findStudent(state, workout?.studentId || selectedStudentId);
    if (!workout || !student) {
      return;
    }
    const copy = {
      ...Store.clone(workout),
      id: Store.uid("TR"),
      title: `${workout.title} (cópia)`,
      status: "ativo",
      exerciseItems: getWorkoutExerciseItems(workout).map((item) => ({ ...item, id: Store.uid("EXI") })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const next = Store.clone(state);
    next.workouts.unshift(copy);
    await persistProfessorState(next, "professor-workout-duplicated", student.id, `${workout.title} duplicado no tablet.`);
  }

  async function toggleProfessorWorkout(workoutId) {
    const workout = (state.workouts || []).find((item) => item.id === workoutId);
    if (!workout) {
      return;
    }
    const nextStatus = workout.status === "ativo" ? "encerrado" : "ativo";
    const actionLabel = nextStatus === "encerrado" ? "encerrar" : "ativar";
    if (!window.confirm(`Deseja ${actionLabel} o treino ${workout.title}?`)) {
      return;
    }
    const next = Store.clone(state);
    next.workouts = next.workouts.map((item) => item.id === workout.id
      ? { ...item, status: nextStatus, updatedAt: new Date().toISOString() }
      : item);
    await persistProfessorState(next, "professor-workout-status-updated", workout.studentId, `${workout.title} marcado como ${nextStatus} no tablet.`);
  }


  function formatDecimal(value, digits) {
    const number = safeNumber(value);
    if (!number && number !== 0) {
      return "-";
    }
    return new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: digits ?? 1,
      maximumFractionDigits: digits ?? 1
    }).format(number);
  }

  function calculateAssessmentImc(weight, height) {
    const numericWeight = safeNumber(weight);
    const numericHeight = safeNumber(height);
    if (!numericWeight || !numericHeight) {
      return 0;
    }
    return Number((numericWeight / (numericHeight * numericHeight)).toFixed(2));
  }

  function getProfessorStudentAssessments(studentId) {
    return (state.assessments || [])
      .filter((assessment) => assessment.studentId === studentId)
      .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
  }

  function assessmentCardMarkup(assessment) {
    const measurements = [
      assessment.chest ? `Peitoral ${formatDecimal(assessment.chest, 1)} cm` : "",
      assessment.waist ? `Cintura ${formatDecimal(assessment.waist, 1)} cm` : "",
      assessment.hip ? `Quadril ${formatDecimal(assessment.hip, 1)} cm` : "",
      assessment.arm ? `Braço ${formatDecimal(assessment.arm, 1)} cm` : "",
      assessment.thigh ? `Coxa ${formatDecimal(assessment.thigh, 1)} cm` : ""
    ].filter(Boolean);
    return `
      <article class="prof-assessment-card">
        <div class="assessment-date-box">
          <strong>${escapeHtml(Store.formatDate(assessment.date))}</strong>
          <span>Avaliação</span>
        </div>
        <div class="assessment-card-main">
          <div class="assessment-primary-values">
            <strong>${escapeHtml(formatDecimal(assessment.weight, 1))} kg</strong>
            <span>IMC ${escapeHtml(formatDecimal(assessment.imc, 2))}</span>
            ${assessment.bodyFat ? `<span>${escapeHtml(formatDecimal(assessment.bodyFat, 1))}% gordura</span>` : ""}
          </div>
          ${measurements.length ? `<div class="assessment-measurements">${measurements.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
          ${assessment.notes ? `<p>${escapeHtml(assessment.notes)}</p>` : ""}
        </div>
        <button class="assessment-edit-button" type="button" data-prof-edit-assessment="${escapeHtml(assessment.id)}">Editar</button>
      </article>
    `;
  }

  function renderProfessorAssessments(student) {
    const assessments = getProfessorStudentAssessments(student.id);
    const latest = assessments[0] || null;
    const previous = assessments[1] || null;
    const weightDelta = latest && previous ? safeNumber(latest.weight) - safeNumber(previous.weight) : null;
    const deltaLabel = weightDelta === null
      ? "Sem comparação"
      : `${weightDelta > 0 ? "+" : ""}${formatDecimal(weightDelta, 1)} kg`;

    document.getElementById("profAssessmentCount").textContent = `${assessments.length} ${assessments.length === 1 ? "avaliação" : "avaliações"}`;
    document.getElementById("profAssessmentTabCount").textContent = String(assessments.length);
    document.getElementById("profAssessmentSummary").innerHTML = latest
      ? `
        <article><span>Peso atual</span><strong>${escapeHtml(formatDecimal(latest.weight, 1))} kg</strong></article>
        <article><span>Variação</span><strong class="${weightDelta !== null && weightDelta < 0 ? "positive" : weightDelta > 0 ? "attention" : ""}">${escapeHtml(deltaLabel)}</strong></article>
        <article><span>IMC</span><strong>${escapeHtml(formatDecimal(latest.imc, 2))}</strong></article>
        <article><span>Última avaliação</span><strong>${escapeHtml(Store.formatDate(latest.date))}</strong></article>
      `
      : '<div class="empty-state compact">Nenhuma avaliação física registrada.</div>';
    document.getElementById("profAssessmentList").innerHTML = assessments.length
      ? assessments.map(assessmentCardMarkup).join("")
      : '<div class="empty-state">Cadastre a primeira avaliação física deste aluno.</div>';
  }

  function updateProfessorAssessmentImc() {
    const form = document.getElementById("profAssessmentForm");
    const imc = calculateAssessmentImc(form.elements.weight.value, form.elements.height.value);
    form.elements.imc.value = imc ? imc.toFixed(2) : "";
  }

  function openProfessorAssessment(assessmentId) {
    const assessment = assessmentId
      ? (state.assessments || []).find((item) => item.id === assessmentId)
      : null;
    const student = Store.findStudent(state, assessment?.studentId || selectedStudentId);
    if (!student) {
      showToast("Selecione um aluno antes de criar a avaliação.", "warning");
      return;
    }
    selectedStudentId = student.id;
    const form = document.getElementById("profAssessmentForm");
    form.reset();
    form.elements.id.value = assessment?.id || "";
    form.elements.studentId.value = student.id;
    form.elements.date.value = assessment?.date || todayLocalISO();
    ["weight", "height", "imc", "bodyFat", "chest", "waist", "hip", "arm", "thigh", "notes"].forEach((name) => {
      form.elements[name].value = assessment?.[name] ?? "";
    });
    updateProfessorAssessmentImc();
    document.getElementById("profAssessmentDialogTitle").textContent = `${assessment ? "Editar avaliação" : "Nova avaliação"} — ${student.name}`;
    document.getElementById("profAssessmentStudentName").textContent = student.name;
    const dialog = document.getElementById("profAssessmentDialog");
    if (!dialog.open) {
      dialog.showModal();
    }
    window.setTimeout(() => form.elements.weight.focus(), 30);
  }

  function closeProfessorAssessment() {
    const dialog = document.getElementById("profAssessmentDialog");
    if (dialog.open) {
      dialog.close();
    }
  }

  async function saveProfessorAssessment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const student = Store.findStudent(state, form.elements.studentId.value);
    if (!student) {
      showToast("Aluno não encontrado.", "warning");
      return;
    }
    const weight = safeNumber(form.elements.weight.value);
    const height = safeNumber(form.elements.height.value);
    if (!form.elements.date.value || !weight || !height) {
      showToast("Informe data, peso e altura.", "warning");
      return;
    }
    const existing = form.elements.id.value
      ? (state.assessments || []).find((item) => item.id === form.elements.id.value)
      : null;
    const assessment = {
      ...existing,
      id: existing?.id || Store.uid("AV"),
      studentId: student.id,
      date: form.elements.date.value,
      weight,
      height,
      imc: calculateAssessmentImc(weight, height),
      bodyFat: safeNumber(form.elements.bodyFat.value),
      chest: safeNumber(form.elements.chest.value),
      waist: safeNumber(form.elements.waist.value),
      hip: safeNumber(form.elements.hip.value),
      arm: safeNumber(form.elements.arm.value),
      thigh: safeNumber(form.elements.thigh.value),
      photos: existing?.photos || [],
      notes: form.elements.notes.value.trim(),
      updatedAt: new Date().toISOString()
    };
    const next = Store.clone(state);
    next.assessments = next.assessments || [];
    const index = next.assessments.findIndex((item) => item.id === assessment.id);
    if (index >= 0) {
      next.assessments[index] = assessment;
    } else {
      next.assessments.unshift(assessment);
    }
    closeProfessorAssessment();
    await persistProfessorState(
      next,
      existing ? "professor-assessment-updated" : "professor-assessment-created",
      student.id,
      existing ? "Avaliação física atualizada no tablet." : "Nova avaliação física registrada no tablet."
    );
  }

  function isIndividualSchedule(item) {
    return Boolean(item?.studentId) && normalizeWeeklyClass(item) === null;
  }

  function getProfessorStudentSchedule(studentId) {
    const today = todayLocalISO();
    return (state.schedule || [])
      .filter((item) => item.studentId === studentId && isIndividualSchedule(item))
      .sort((left, right) => {
        const leftKey = `${left.date || ""}T${Store.formatTime(left.time)}`;
        const rightKey = `${right.date || ""}T${Store.formatTime(right.time)}`;
        const leftUpcoming = (left.date || "") >= today && !["realizada", "falta", "cancelada"].includes(left.status);
        const rightUpcoming = (right.date || "") >= today && !["realizada", "falta", "cancelada"].includes(right.status);
        if (leftUpcoming !== rightUpcoming) {
          return leftUpcoming ? -1 : 1;
        }
        return leftUpcoming ? leftKey.localeCompare(rightKey) : rightKey.localeCompare(leftKey);
      });
  }

  function studentScheduleCardMarkup(item) {
    const finished = ["realizada", "falta", "cancelada"].includes(item.status);
    return `
      <article class="prof-student-schedule-card ${escapeHtml(item.status || "marcada")}">
        <div class="student-schedule-date">
          <strong>${escapeHtml(Store.formatDate(item.date))}</strong>
          <span>${escapeHtml(Store.formatTime(item.time))}</span>
        </div>
        <div class="student-schedule-main">
          <div>
            <strong>${escapeHtml(item.type === "online" ? "Atendimento online" : "Atendimento presencial")}</strong>
            <span class="status-pill ${getScheduleStatusTone(item.status)}">${escapeHtml(getScheduleStatusLabel(item.status))}</span>
          </div>
          ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}
          <div class="student-schedule-actions">
            <button type="button" data-prof-edit-schedule="${escapeHtml(item.id)}">Editar</button>
            ${!finished ? `<button class="success" type="button" data-prof-schedule-status="realizada" data-schedule-id="${escapeHtml(item.id)}">Realizada</button>` : ""}
            ${!finished ? `<button type="button" data-prof-schedule-status="falta" data-schedule-id="${escapeHtml(item.id)}">Falta</button>` : ""}
            ${!finished ? `<button type="button" data-prof-remchedule="${escapeHtml(item.id)}">Remarcar</button>` : ""}
            ${item.status !== "cancelada" ? `<button class="danger" type="button" data-prof-schedule-status="cancelada" data-schedule-id="${escapeHtml(item.id)}">Cancelar</button>` : ""}
          </div>
        </div>
      </article>
    `;
  }

  function renderProfessorStudentSchedule(student) {
    const schedule = getProfessorStudentSchedule(student.id);
    document.getElementById("profStudentScheduleCount").textContent = `${schedule.length} ${schedule.length === 1 ? "agendamento" : "agendamentos"}`;
    document.getElementById("profScheduleTabCount").textContent = String(schedule.length);
    document.getElementById("profStudentScheduleList").innerHTML = schedule.length
      ? schedule.map(studentScheduleCardMarkup).join("")
      : '<div class="empty-state">Nenhum agendamento individual para este aluno.</div>';
  }

  function openProfessorSchedule(scheduleId, forceRemchedule) {
    const scheduleItem = scheduleId
      ? (state.schedule || []).find((item) => item.id === scheduleId)
      : null;
    const student = Store.findStudent(state, scheduleItem?.studentId || selectedStudentId);
    if (!student) {
      showToast("Selecione um aluno antes de criar o agendamento.", "warning");
      return;
    }
    selectedStudentId = student.id;
    const form = document.getElementById("profScheduleForm");
    form.reset();
    form.elements.id.value = scheduleItem?.id || "";
    form.elements.studentId.value = student.id;
    form.elements.date.value = scheduleItem?.date || todayLocalISO();
    form.elements.time.value = Store.formatTime(scheduleItem?.time || "08:00");
    form.elements.type.value = scheduleItem?.type || "presencial";
    form.elements.status.value = forceRemchedule ? "remarcada" : scheduleItem?.status || "marcada";
    form.elements.notes.value = scheduleItem?.notes || "";
    const scheduleTitle = forceRemchedule
      ? "Remarcar atendimento"
      : scheduleItem ? "Editar agendamento" : "Novo agendamento";
    document.getElementById("profScheduleDialogTitle").textContent = `${scheduleTitle} — ${student.name}`;
    document.getElementById("profScheduleStudentName").textContent = student.name;
    const dialog = document.getElementById("profScheduleDialog");
    if (!dialog.open) {
      dialog.showModal();
    }
    window.setTimeout(() => (forceRemchedule ? form.elements.date : form.elements.time).focus(), 30);
  }

  function closeProfessorSchedule() {
    const dialog = document.getElementById("profScheduleDialog");
    if (dialog.open) {
      dialog.close();
    }
  }

  async function saveProfessorSchedule(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const student = Store.findStudent(state, form.elements.studentId.value);
    if (!student) {
      showToast("Aluno não encontrado.", "warning");
      return;
    }
    if (!form.elements.date.value || !form.elements.time.value) {
      showToast("Informe data e horário.", "warning");
      return;
    }
    const existing = form.elements.id.value
      ? (state.schedule || []).find((item) => item.id === form.elements.id.value)
      : null;
    const scheduleItem = {
      ...existing,
      id: existing?.id || Store.uid("AG"),
      studentId: student.id,
      date: form.elements.date.value,
      time: form.elements.time.value,
      type: form.elements.type.value,
      status: form.elements.status.value,
      notes: form.elements.notes.value.trim(),
      updatedAt: new Date().toISOString()
    };
    const next = Store.clone(state);
    next.schedule = next.schedule || [];
    const index = next.schedule.findIndex((item) => item.id === scheduleItem.id);
    if (index >= 0) {
      next.schedule[index] = scheduleItem;
    } else {
      next.schedule.unshift(scheduleItem);
    }
    closeProfessorSchedule();
    await persistProfessorState(
      next,
      existing ? "professor-schedule-updated" : "professor-schedule-created",
      student.id,
      existing ? "Agendamento atualizado no tablet." : "Novo agendamento criado no tablet."
    );
  }

  async function updateProfessorScheduleStatus(scheduleId, status) {
    const scheduleItem = (state.schedule || []).find((item) => item.id === scheduleId);
    if (!scheduleItem) {
      return;
    }
    if (status === "cancelada" && !window.confirm("Cancelar este agendamento?")) {
      return;
    }
    if (status === "falta" && !window.confirm("Registrar falta para este aluno?")) {
      return;
    }
    const next = Store.clone(state);
    next.schedule = next.schedule.map((item) => item.id === scheduleId
      ? { ...item, status, updatedAt: new Date().toISOString() }
      : item);
    await persistProfessorState(
      next,
      `professor-schedule-${status}`,
      scheduleItem.studentId,
      `Agendamento marcado como ${getScheduleStatusLabel(status).toLowerCase()} no tablet.`
    );
  }

  function renderProfessorTrainingResults(student) {
    const sessions = (state.workoutSessions || []).filter((item) => item.studentId === student.id).sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
    const completed = sessions.filter((item) => item.status === "concluida");
    const totalMinutes = completed.reduce((sum, item) => sum + safeNumber(item.durationMinutes), 0);
    const painReports = sessions.filter((item) => item.pain && normalizeText(item.pain) !== "nenhuma").length;
    document.getElementById("profResultTabCount").textContent = String(sessions.length);
    document.getElementById("profResultCount").textContent = `${sessions.length} ${sessions.length === 1 ? "sessao" : "sessoes"}`;
    document.getElementById("profResultSummary").innerHTML = [
      ["Concluidos", completed.length], ["Tempo total", formatStaffDuration(totalMinutes)], ["Relatos de dor", painReports], ["Interrompidos", sessions.filter((item) => item.status !== "concluida").length]
    ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
    document.getElementById("profResultList").innerHTML = sessions.length ? sessions.slice(0, 12).map((session) => {
      const sets = (state.exerciseSets || []).filter((item) => item.sessionId === session.id);
      const grouped = new Map();
      sets.forEach((set) => {
        const key = set.exerciseId || set.exerciseName;
        if (!grouped.has(key)) grouped.set(key, { name: set.exerciseName, sets: 0, completed: 0, maxLoad: 0 });
        const group = grouped.get(key); group.sets += 1; if (set.status === "concluida") group.completed += 1; group.maxLoad = Math.max(group.maxLoad, safeNumber(set.actualLoad));
      });
      return `<article class="training-result-card"><header><div><span>${escapeHtml(Store.formatDateTime(session.startedAt))}</span><h4>${escapeHtml(session.workoutTitle || session.division || "Treino")}</h4></div><span class="status-pill ${session.status === "concluida" ? "ok" : "warning"}">${session.status === "concluida" ? "Concluido" : "Interrompido"}</span></header><div class="training-result-meta"><span>${escapeHtml(formatStaffDuration(session.durationMinutes || 0))}</span><span>${safeNumber(session.completedSets)} de ${safeNumber(session.totalSets)} series</span><span>Dificuldade: ${escapeHtml(session.difficulty || "nao informada")}</span><span class="${session.pain && normalizeText(session.pain) !== "nenhuma" ? "pain" : ""}">Dor: ${escapeHtml(session.pain || "nenhuma")}</span></div>${[...grouped.values()].map((group) => `<div class="training-exercise-result"><strong>${escapeHtml(group.name)}</strong><span>${group.completed}/${group.sets} series · ${group.maxLoad ? `${formatNumber(group.maxLoad, 1)} kg` : "sem carga"}</span></div>`).join("")}${session.notes ? `<p>${escapeHtml(session.notes)}</p>` : ""}</article>`;
    }).join("") : '<div class="empty-state">Nenhum treino realizado pelo aluno.</div>';
  }

  function setStudentModule(moduleName, options = {}) {
    const allowed = ["ficha", "treinos", "resultados", "avaliacoes", "agenda", "presencas"];
    const target = allowed.includes(moduleName) ? moduleName : "ficha";
    activeStudentModule = target;

    document.querySelectorAll("[data-student-module]").forEach((button) => {
      const active = button.dataset.studentModule === target;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    document.querySelectorAll("[data-student-module-panel]").forEach((panel) => {
      const active = panel.dataset.studentModulePanel === target;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });

    if (options.resetScroll !== false) {
      const scroller = document.querySelector(".student-workspace-scroll");
      if (scroller) {
        scroller.scrollTop = 0;
      }
    }
  }

  
function startNewProfessorStudent() {
    creatingProfessorStudent = true;
    selectedStudentId = "";
    activeStudentModule = "ficha";
    const shell = document.querySelector(".student-workspace-shell");
    shell?.classList.add("creating-student");
    document.getElementById("profStudentName").textContent = "Novo aluno";
    document.getElementById("profStudentBadges").innerHTML = '<span class="status-pill ok">Cadastro</span>';
    document.getElementById("profStudentPlan").textContent = "A definir";
    document.getElementById("profStudentPhone").textContent = "Não informado";
    document.getElementById("profStudentGoal").textContent = "Não informado";
    document.getElementById("profStudentLastPresence").textContent = "Nenhuma";
    document.getElementById("profStudentPresenceCount").textContent = "0";
    document.getElementById("profStudentFirstPresence").textContent = "Nenhuma";
    document.getElementById("profStudentInsideStatus").textContent = "Fora da academia";
    document.getElementById("profStudentRestrictionsSummary").textContent = "Nenhuma restrição cadastrada";
    fillStudentForm({});
    setStudentModule("ficha");
    setStudentEditing(true);
    const dialog = document.getElementById("studentPreviewDialog");
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function renderStudentWorkspace(studentId) {
    const student = Store.findStudent(state, studentId);
    if (!student) {
      return;
    }

    creatingProfessorStudent = false;
    document.querySelector(".student-workspace-shell")?.classList.remove("creating-student");
    selectedStudentId = student.id;
    const access = getAccessSummary(student);
    const presence = getPresenceStats(student.id);
    const inside = Boolean(presence.open);
    const restrictions = String(student.restrictions || "").trim();
    const hasRestrictions = restrictions && normalizeText(restrictions) !== "nenhuma";

    document.getElementById("profStudentName").textContent = student.name || "Aluno";
    document.getElementById("profStudentBadges").innerHTML = `
      <span class="status-pill ${access.blocked ? "blocked" : "ok"}">${access.blocked ? "Bloqueado" : "OK"}</span>
    `;

    document.getElementById("profStudentPlan").textContent = student.plan || "Não informado";
    document.getElementById("profStudentPhone").textContent = student.phone || "Não informado";
    document.getElementById("profStudentGoal").textContent = student.goal || "Não informado";
    document.getElementById("profStudentLastPresence").textContent = formatPresence(presence.last);
    document.getElementById("profStudentPresenceCount").textContent = String(presence.count);
    document.getElementById("profStudentFirstPresence").textContent = formatPresence(presence.first);
    document.getElementById("profStudentInsideStatus").textContent = inside ? "Dentro da academia" : "Fora da academia";

    const healthAlert = document.getElementById("profStudentHealthAlert");
    healthAlert.classList.toggle("has-restriction", Boolean(hasRestrictions));
    document.getElementById("profStudentRestrictionsSummary").textContent = hasRestrictions
      ? restrictions
      : "Nenhuma restrição cadastrada";

    const presenceButton = document.getElementById("profPresenceButton");
    presenceButton.textContent = inside ? "Registrar saída" : "Registrar entrada";
    presenceButton.classList.toggle("exit", inside);

    const currentPayment = getPaymentForReference(student.id, todayLocalISO().slice(0, 7));
    const receiveButton = document.getElementById("profReceivePaymentButton");
    receiveButton.textContent = getEffectivePaymentStatus(currentPayment) === "pago"
      ? "Pagamento do mês"
      : "Receber mensalidade";

    fillStudentForm(student);
    setStudentEditing(false);
    renderProfessorWorkouts(student);
    renderProfessorTrainingResults(student);
    renderProfessorAssessments(student);
    renderProfessorStudentSchedule(student);

    document.getElementById("profPresenceHistoryCount").textContent = `${presence.count} ${presence.count === 1 ? "registro" : "registros"}`;
    document.getElementById("profPresenceTabCount").textContent = String(presence.count);
    document.getElementById("profPresenceHistory").innerHTML = presence.entries.length
      ? [...presence.entries].reverse().slice(0, 8).map(presenceHistoryMarkup).join("")
      : '<div class="empty-state">Nenhuma presença registrada para este aluno.</div>';
    setStudentModule(activeStudentModule, { resetScroll: false });
  }

  function showStudentPreview(studentId) {
    creatingProfessorStudent = false;
    document.querySelector(".student-workspace-shell")?.classList.remove("creating-student");
    activeStudentModule = "ficha";
    renderStudentWorkspace(studentId);
    setStudentModule("ficha");
    const dialog = document.getElementById("studentPreviewDialog");
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      dialog.setAttribute("open", "");
    }
  }

  async function persistProfessorState(nextState, action, studentId, detail) {
    const previousState = state;
    state = Store.appendLog(nextState, {
      action,
      studentId,
      detail,
      message: detail,
      source: "painel-professor-tablet"
    });
    Store.saveData(state);
    if (!Store.isLocalDemoSession(authSession)) enqueueProfessorSyncOperations(buildProfessorSyncOperations(previousState, state));
    renderAll();
    if (selectedStudentId) {
      renderStudentWorkspace(selectedStudentId);
    }
    renderProfessorSyncStatus(getProfessorPendingCount() ? "pending" : "online");
    await flushProfessorSyncQueue({ notify: true });
  }

  async function saveProfessorStudent(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const existing = form.elements.id.value ? Store.findStudent(state, form.elements.id.value) : null;

    const name = form.elements.name.value.trim();
    if (!name) {
      form.elements.name.focus();
      showToast("Informe o nome do aluno.", "warning");
      return;
    }

    const updates = {
      name,
      phone: form.elements.phone.value.trim(),
      email: form.elements.email.value.trim(),
      birthDate: form.elements.birthDate.value,
      plan: form.elements.plan.value.trim(),
      goal: form.elements.goal.value.trim(),
      restrictions: form.elements.restrictions.value.trim(),
      notes: form.elements.notes.value.trim(),
      updatedAt: new Date().toISOString()
    };

    if (!existing && creatingProfessorStudent) {
      const student = Store.createStudentRecord({
        ...updates,
        status: "ativo",
        monthlyFee: 0,
        enrollmentStatus: "pendente",
        appAccessPolicy: "auto"
      });
      selectedStudentId = student.id;
      creatingProfessorStudent = false;
      document.querySelector(".student-workspace-shell")?.classList.remove("creating-student");
      const next = Store.upsertStudent(state, student);
      await persistProfessorState(next, "professor-student-created", student.id, `Aluno ${name} cadastrado pelo professor no tablet.`);
      setStudentEditing(false);
      showToast("Aluno cadastrado com sucesso.", "success");
      return;
    }

    if (!existing) {
      showToast("Aluno não encontrado.", "warning");
      return;
    }

    const next = Store.updateStudent(state, existing.id, updates);
    await persistProfessorState(next, "professor-student-updated", existing.id, `Ficha de ${name} atualizada no tablet.`);
    setStudentEditing(false);
  }

  async function toggleProfessorPresence() {
    const student = Store.findStudent(state, selectedStudentId);
    if (!student) {
      return;
    }

    const openPresence = getOpenAccessCheckin(student.id);
    const now = new Date();
    const next = Store.clone(state);

    if (openPresence) {
      next.checkins = next.checkins.map((checkin) => checkin.id === openPresence.id
        ? { ...checkin, checkedOutAt: now.toISOString(), presenceStatus: "outside", updatedAt: now.toISOString() }
        : checkin);
      await persistProfessorState(next, "professor-presence-exit", student.id, `Saída registrada para ${student.name} no tablet.`);
      return;
    }

    const access = Store.getAccessState(state, student.id);
    if (!access.allowsGate) {
      const proceed = window.confirm("O acesso deste aluno está bloqueado. Deseja registrar a entrada mesmo assim?");
      if (!proceed) {
        return;
      }
    }

    next.checkins.unshift({
      id: Store.uid("CK"),
      studentId: student.id,
      workoutId: "",
      date: todayLocalISO(),
      time: new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(now),
      type: "access",
      checkedInAt: now.toISOString(),
      checkedOutAt: "",
      presenceSource: "painel-professor-tablet",
      presenceStatus: "inside",
      usedLoad: "",
      difficulty: "",
      pain: "",
      notes: "Presença registrada pelo professor no tablet.",
      updatedAt: now.toISOString()
    });
    await persistProfessorState(next, "professor-presence-entry", student.id, `Entrada registrada para ${student.name} no tablet.`);
  }

  function getProfessorDeviceId() {
    let deviceId = localStorage.getItem(PROFESSOR_DEVICE_KEY);
    if (!deviceId) {
      deviceId = Store.uid("TAB");
      localStorage.setItem(PROFESSOR_DEVICE_KEY, deviceId);
    }
    return deviceId;
  }

  function getProfessorUsers() {
    const professors = (state.users || [])
      .filter((user) => ["professor", "instrutor"].includes(normalizeText(user.role)) && normalizeText(user.status || "ativo") !== "inativo")
      .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "pt-BR"));
    return professors.length
      ? professors
      : [{ id: authSession?.account?.personId || "USR-PROF-TEMP", name: authSession?.account?.login || "Professor Pro Fitness", email: "", role: "professor", status: "ativo" }];
  }

  function getActiveProfessor() {
    const professors = getProfessorUsers();
    const select = document.getElementById("activeProfessorSelect");
    const preferredId = select?.value || localStorage.getItem(ACTIVE_PROFESSOR_KEY) || professors[0].id;
    return professors.find((professor) => professor.id === preferredId) || professors[0];
  }

  function getOpenStaffTimeEntry(staffId) {
    return (state.staffTimeEntries || [])
      .filter((entry) => entry.staffId === staffId && !entry.clockOut && entry.status !== "cancelado")
      .sort((left, right) => String(right.clockIn || "").localeCompare(String(left.clockIn || "")))[0] || null;
  }

  function getStaffEntryMinutes(entry, now) {
    if (!entry?.clockIn) return safeNumber(entry?.durationMinutes);
    const start = new Date(entry.clockIn);
    const end = entry.clockOut ? new Date(entry.clockOut) : (now || new Date());
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return safeNumber(entry.durationMinutes);
    return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
  }

  function formatStaffDuration(minutes) {
    const total = Math.max(0, Math.round(safeNumber(minutes)));
    return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}min`;
  }

  function formatStaffClock(value) {
    const parsed = value ? new Date(value) : new Date();
    if (Number.isNaN(parsed.getTime())) return "--:--";
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(parsed);
  }

  function renderStaffClock() {
    const select = document.getElementById("activeProfessorSelect");
    if (!select) return;
    const professors = getProfessorUsers();
    const savedId = localStorage.getItem(ACTIVE_PROFESSOR_KEY);
    const selectedId = professors.some((professor) => professor.id === select.value)
      ? select.value
      : professors.some((professor) => professor.id === savedId) ? savedId : professors[0].id;
    const optionsSignature = professors.map((professor) => `${professor.id}:${professor.name}`).join("|");
    if (select.dataset.optionsSignature !== optionsSignature) {
      select.innerHTML = professors.map((professor) => `<option value="${escapeHtml(professor.id)}">${escapeHtml(professor.name)}</option>`).join("");
      select.dataset.optionsSignature = optionsSignature;
    }
    select.value = selectedId;
    localStorage.setItem(ACTIVE_PROFESSOR_KEY, selectedId);

    const professor = professors.find((item) => item.id === selectedId) || professors[0];
    const now = new Date();
    const openEntry = getOpenStaffTimeEntry(professor.id);
    const todayEntries = (state.staffTimeEntries || []).filter((entry) => entry.staffId === professor.id && entry.date === todayLocalISO() && entry.status !== "cancelado");
    const todayMinutes = todayEntries.reduce((total, entry) => total + getStaffEntryMinutes(entry, now), 0);

    document.getElementById("profTimeDate").textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(now);
    document.getElementById("staffClockCurrentTime").textContent = formatStaffClock(now);
    document.getElementById("staffClockStatus").textContent = openEntry ? "Presente na academia" : "Fora da academia";
    document.getElementById("staffClockDetail").textContent = openEntry
      ? `Entrada registrada as ${formatStaffClock(openEntry.clockIn)}. Tempo atual: ${formatStaffDuration(getStaffEntryMinutes(openEntry, now))}.`
      : "Registre a entrada ao chegar e a saida antes de deixar a academia.";
    document.getElementById("staffClockTodayTotal").textContent = formatStaffDuration(todayMinutes);
    document.getElementById("staffClockTodayCount").textContent = String(todayEntries.length);

    const actionButton = document.getElementById("toggleStaffClockButton");
    actionButton.textContent = openEntry ? "Registrar saida" : "Registrar entrada";
    actionButton.classList.toggle("clock-out", Boolean(openEntry));

    const history = (state.staffTimeEntries || [])
      .filter((entry) => entry.staffId === professor.id && entry.status !== "cancelado")
      .sort((left, right) => String(right.clockIn || "").localeCompare(String(left.clockIn || "")))
      .slice(0, 8);
    document.getElementById("staffClockHistory").innerHTML = history.length
      ? history.map((entry) => `<article class="staff-clock-history-row"><div><strong>${escapeHtml(Store.formatDate(entry.date))}</strong><span>${escapeHtml(formatStaffClock(entry.clockIn))} - ${entry.clockOut ? escapeHtml(formatStaffClock(entry.clockOut)) : "em andamento"}</span></div><strong>${escapeHtml(formatStaffDuration(getStaffEntryMinutes(entry, now)))}</strong><span class="status-pill ${entry.clockOut ? "ok" : "warning"}">${entry.clockOut ? "Concluido" : "Aberto"}</span></article>`).join("")
      : '<div class="empty-state">Nenhuma marcacao registrada para este professor.</div>';
  }

  async function toggleStaffClock() {
    const professor = getActiveProfessor();
    if (!professor) return;
    const now = new Date();
    const openEntry = getOpenStaffTimeEntry(professor.id);
    const next = Store.clone(state);
    if (openEntry) {
      next.staffTimeEntries = (next.staffTimeEntries || []).map((entry) => entry.id === openEntry.id
        ? {
            ...entry,
            clockOut: now.toISOString(),
            durationMinutes: getStaffEntryMinutes(entry, now),
            status: "concluido",
            updatedAt: now.toISOString()
          }
        : entry);
      await persistProfessorState(next, "staff-clock-out", professor.id, `Saida de ${professor.name} registrada no tablet.`);
      showToast(`Saida registrada para ${professor.name}.`, "success");
    } else {
      const entry = {
        id: Store.uid("PTO"),
        staffId: professor.id,
        staffName: professor.name,
        date: todayLocalISO(),
        clockIn: now.toISOString(),
        clockOut: "",
        durationMinutes: 0,
        status: "aberto",
        source: "tablet-professor",
        deviceId: getProfessorDeviceId(),
        notes: "",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
      next.staffTimeEntries = [entry, ...(next.staffTimeEntries || [])];
      await persistProfessorState(next, "staff-clock-in", professor.id, `Entrada de ${professor.name} registrada no tablet.`);
      showToast(`Entrada registrada para ${professor.name}.`, "success");
    }
    renderStaffClock();
  }

  function setView(viewName) {
    activeView = viewName;
    document.querySelectorAll("[data-view]").forEach((view) => {
      const active = view.dataset.view === viewName;
      view.hidden = !active;
      view.classList.toggle("active", active);
    });
    document.querySelectorAll("[data-prof-view]").forEach((button) => {
      const active = button.dataset.profView === viewName;
      button.classList.toggle("active", active);
      if (active) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderAll() {
    renderMetrics();
    renderInsideStudents();
    renderAgenda();
    renderStudentList(document.getElementById("profStudentsListSearch").value);
    renderStaffClock();
  }

  function buildProfessorState(data) {
    const empty = Store.createEmptySnapshot();
    return Store.migrateData({
      ...empty,
      students: data?.students || [], assessments: data?.assessments || [], workouts: data?.workouts || [], schedule: data?.schedule || [],
      checkins: data?.checkins || [], workoutSessions: data?.workoutSessions || [], exerciseSets: data?.exerciseSets || [], exercises: data?.exercises || [],
      users: data?.users || [], staffTimeEntries: data?.staffTimeEntries || [], config: data?.config || [], payments: [], movements: [], expenses: [], cashClosings: [], log: []
    });
  }

  async function refreshData(options) {
    const settings = options && !(options instanceof Event) ? options : {};
    const manual = settings.manual !== false;
    if (hasProfessorUnsavedEditor()) {
      if (manual) {
        showToast("Conclua ou cancele a edição antes de atualizar os dados.", "warning");
      }
      return;
    }

    const button = document.getElementById("refreshProfessorData");
    const refreshBaseline = JSON.stringify(Store.loadData());
    button.disabled = true;
    renderProfessorSyncStatus("syncing", "Atualizando dados");

    try {
      if (Store.isLocalDemoSession(authSession)) {
        state = Store.loadData();
        renderProfessorSyncStatus("local", "Demonstracao local");
      } else if (!Store.isRemoteConfigured()) {
        state = Store.loadData();
        renderProfessorSyncStatus("local");
      } else if (!isProfessorOnline()) {
        state = Store.loadData();
        renderProfessorSyncStatus("offline");
      } else {
        await flushProfessorSyncQueue({ notify: false });
        if (getProfessorPendingCount()) {
          state = Store.loadData();
          renderProfessorSyncStatus("pending");
        } else {
          const remoteRaw = await Store.fetchProfessorBootstrap();
          const localSnapshot = Store.loadData();
          const localChangedDuringRefresh = JSON.stringify(localSnapshot) !== refreshBaseline;
          if (getProfessorPendingCount() || localChangedDuringRefresh) {
            state = localSnapshot;
            renderProfessorSyncStatus("pending");
          } else if (Store.snapshotHasMeaningfulData(remoteRaw) || !Store.snapshotHasMeaningfulData(localSnapshot)) {
            state = buildProfessorState(remoteRaw);
            Store.saveData(state);
          } else {
            state = localSnapshot;
          }
          setProfessorLastSync();
          renderProfessorSyncStatus("online");
        }
      }
    } catch (error) {
      state = Store.loadData();
      renderProfessorSyncStatus(getProfessorPendingCount() ? "pending" : isProfessorOnline() ? "error" : "offline");
      if (manual) {
        showToast("Não foi possível consultar a planilha. Os dados locais continuam disponíveis.", "warning");
      }
    } finally {
      button.disabled = false;
      renderAll();
      if (selectedStudentId && document.getElementById("studentPreviewDialog").open) {
        renderStudentWorkspace(selectedStudentId);
      }
    }
  }

  function showProfessorAccess(mode) {
    const logged = mode === "app";
    document.getElementById("profAuthView").hidden = mode !== "login";
    document.getElementById("profLockView").hidden = mode !== "lock";
    document.getElementById("profAppShell").hidden = !logged;
    if (logged) {
      const profile = getProfessorUsers()[0];
      document.getElementById("profCurrentUser").textContent = profile?.name || authSession?.account?.login || "Professor";
      professorLastActivity = Date.now();
    }
  }

  function handleProfessorAuthInvalid(message) {
    authSession = null;
    state = Store.migrateData(Store.createEmptySnapshot());
    Store.saveData(state);
    showProfessorAccess("login");
    document.getElementById("profLoginCard").hidden = false;
    document.getElementById("profPasswordChangeCard").hidden = true;
    const feedback = document.getElementById("profLoginFeedback");
    if (feedback) feedback.textContent = message || "Sua sessao terminou. Entre novamente.";
  }

  async function validateProfessorSession() {
    if (!authSession || Store.isLocalDemoSession(authSession)) return authSession;
    try {
      authSession = await Store.validateAuthSessionRemote({ allowOffline: true });
      return authSession;
    } catch (error) {
      handleProfessorAuthInvalid(error.message);
      return null;
    }
  }

  async function loginProfessor(login, password, feedbackId) {
    const feedback = document.getElementById(feedbackId);
    feedback.textContent = "Entrando com seguranca. Isso pode levar alguns segundos...";
    try {
      const session = await Store.loginRemote(login, password);
      if (session.account?.role !== "professor") {
        await Store.logoutRemote();
        throw new Error("Esta conta nao pertence a um professor.");
      }
      authSession = session;
      if (session.account?.mustChangePassword) {
        document.getElementById("profLoginCard").hidden = true;
        document.getElementById("profPasswordChangeCard").hidden = false;
        feedback.textContent = "";
        return;
      }
      state = buildProfessorState(await Store.fetchProfessorBootstrap());
      Store.saveData(state);
      feedback.textContent = "";
      showProfessorAccess("app");
      renderAll();
      renderProfessorSyncStatus("online");
    } catch (error) {
      feedback.textContent = error.message || "Nao foi possivel entrar.";
    }
  }

  async function leaveProfessorSession() {
    await Store.logoutRemote();
    authSession = null;
    state = Store.migrateData(Store.createEmptySnapshot());
    Store.saveData(state);
    showProfessorAccess("login");
    document.getElementById("profLoginCard").hidden = false;
    document.getElementById("profPasswordChangeCard").hidden = true;
    document.getElementById("profLoginForm").reset();
  }

  function lockProfessorTablet() {
    if (!authSession) return;
    document.getElementById("profLockName").textContent = document.getElementById("profCurrentUser").textContent;
    showProfessorAccess("lock");
  }

  function registerProfessorActivity() {
    if (authSession && document.getElementById("profLockView").hidden) professorLastActivity = Date.now();
  }

  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-prof-view], [data-open-view]");
    if (viewButton) {
      setView(viewButton.dataset.profView || viewButton.dataset.openView);
      return;
    }

    const studentModuleButton = event.target.closest("[data-student-module]");
    if (studentModuleButton) {
      setStudentModule(studentModuleButton.dataset.studentModule);
      return;
    }

    const studentButton = event.target.closest("[data-open-student]");
    if (studentButton) {
      showStudentPreview(studentButton.dataset.openStudent);
      document.getElementById("profSearchResults").hidden = true;
      return;
    }

    const workoutEdit = event.target.closest("[data-prof-edit-workout]");
    if (workoutEdit) {
      openProfessorWorkout(workoutEdit.dataset.profEditWorkout);
      return;
    }

    const workoutDuplicate = event.target.closest("[data-prof-duplicate-workout]");
    if (workoutDuplicate) {
      duplicateProfessorWorkout(workoutDuplicate.dataset.profDuplicateWorkout);
      return;
    }

    const workoutToggle = event.target.closest("[data-prof-toggle-workout]");
    if (workoutToggle) {
      toggleProfessorWorkout(workoutToggle.dataset.profToggleWorkout);
      return;
    }

    const removeExercise = event.target.closest("[data-remove-exercise]");
    if (removeExercise) {
      syncExerciseDraftFromEditor();
      workoutExerciseDraft = workoutExerciseDraft.filter((item) => item.id !== removeExercise.dataset.removeExercise);
      renderExerciseEditor();
      return;
    }

    const moveExercise = event.target.closest("[data-move-exercise]");
    if (moveExercise) {
      syncExerciseDraftFromEditor();
      const index = workoutExerciseDraft.findIndex((item) => item.id === moveExercise.dataset.exerciseId);
      const targetIndex = moveExercise.dataset.moveExercise === "up" ? index - 1 : index + 1;
      if (index >= 0 && targetIndex >= 0 && targetIndex < workoutExerciseDraft.length) {
        const [item] = workoutExerciseDraft.splice(index, 1);
        workoutExerciseDraft.splice(targetIndex, 0, item);
        renderExerciseEditor();
      }
      return;
    }

    const assessmentEdit = event.target.closest("[data-prof-edit-assessment]");
    if (assessmentEdit) {
      openProfessorAssessment(assessmentEdit.dataset.profEditAssessment);
      return;
    }

    const scheduleEdit = event.target.closest("[data-prof-edit-schedule]");
    if (scheduleEdit) {
      openProfessorSchedule(scheduleEdit.dataset.profEditSchedule);
      return;
    }

    const scheduleRemchedule = event.target.closest("[data-prof-remchedule]");
    if (scheduleRemchedule) {
      openProfessorSchedule(scheduleRemchedule.dataset.profRemchedule, true);
      return;
    }

    const scheduleStatus = event.target.closest("[data-prof-schedule-status]");
    if (scheduleStatus) {
      updateProfessorScheduleStatus(scheduleStatus.dataset.scheduleId, scheduleStatus.dataset.profScheduleStatus);
      return;
    }

    const futureAction = event.target.closest("[data-prof-student-action]");
    if (futureAction) {
      const action = futureAction.dataset.profStudentAction;
      if (action === "treino") {
        setStudentModule("treinos");
        openProfessorWorkout();
        return;
      }
      if (action === "avaliacao") {
        setStudentModule("avaliacoes");
        openProfessorAssessment();
        return;
      }
      if (action === "agenda") {
        setStudentModule("agenda");
        return;
      }
    }
  });

  document.getElementById("profStudentSearch").addEventListener("input", (event) => renderSearchResults(event.target.value));
  document.getElementById("profStudentsListSearch").addEventListener("input", (event) => renderStudentList(event.target.value));
  document.getElementById("clearProfessorSearch").addEventListener("click", () => {
    const input = document.getElementById("profStudentSearch");
    input.value = "";
    input.focus();
    renderSearchResults("");
  });
  document.getElementById("refreshProfessorData").addEventListener("click", () => refreshData({ manual: true }));
  document.getElementById("pendingSyncText").addEventListener("click", () => flushProfessorSyncQueue({ notify: true }));
  document.getElementById("activeProfessorSelect").addEventListener("change", (event) => {
    localStorage.setItem(ACTIVE_PROFESSOR_KEY, event.currentTarget.value);
    renderStaffClock();
  });
  document.getElementById("toggleStaffClockButton").addEventListener("click", toggleStaffClock);
  document.getElementById("profLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (event.currentTarget.dataset.busy === "true") return;
    const form = new FormData(event.currentTarget);
    Store.setFormBusy(event.currentTarget, true, "Entrando...");
    try {
      await loginProfessor(form.get("login"), form.get("password"), "profLoginFeedback");
    } finally {
      Store.setFormBusy(event.currentTarget, false);
    }
  });
  document.getElementById("profPasswordChangeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (event.currentTarget.dataset.busy === "true") return;
    Store.setFormBusy(event.currentTarget, true, "Salvando...");
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") || "");
    const feedback = document.getElementById("profPasswordChangeFeedback");
    if (newPassword !== String(form.get("confirmPassword") || "")) { feedback.textContent = "A confirmacao nao confere."; return; }
    try {
      authSession = await Store.changePasswordRemote(form.get("currentPassword"), newPassword);
      state = buildProfessorState(await Store.fetchProfessorBootstrap());
      Store.saveData(state);
      document.getElementById("profLoginCard").hidden = false;
      document.getElementById("profPasswordChangeCard").hidden = true;
      showProfessorAccess("app"); renderAll();
    } catch (error) { feedback.textContent = error.message || "Nao foi possivel alterar a senha."; }
    finally { Store.setFormBusy(event.currentTarget, false); }
  });
  document.getElementById("cancelProfPasswordChange").addEventListener("click", leaveProfessorSession);
  document.getElementById("profLogoutButton").addEventListener("click", leaveProfessorSession);
  document.getElementById("profLockButton").addEventListener("click", lockProfessorTablet);
  document.getElementById("profSwitchUserButton").addEventListener("click", leaveProfessorSession);
  document.getElementById("profUnlockForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (event.currentTarget.dataset.busy === "true") return;
    const feedback = document.getElementById("profUnlockFeedback");
    feedback.textContent = "Desbloqueando...";
    Store.setFormBusy(event.currentTarget, true, "Desbloqueando...");
    try {
      authSession = await Store.unlockSessionRemote(new FormData(event.currentTarget).get("password"));
      feedback.textContent = "";
      event.currentTarget.reset();
      showProfessorAccess("app");
      renderAll();
      await refreshData({ manual: false });
    } catch (error) {
      feedback.textContent = error.message || "Nao foi possivel desbloquear.";
    } finally {
      Store.setFormBusy(event.currentTarget, false);
    }
  });
  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => document.addEventListener(eventName, registerProfessorActivity, { passive: true }));
  document.getElementById("newProfessorStudent").addEventListener("click", startNewProfessorStudent);
  document.getElementById("closeStudentPreview").addEventListener("click", () => {
    creatingProfessorStudent = false;
    document.querySelector(".student-workspace-shell")?.classList.remove("creating-student");
    setStudentEditing(false);
    document.getElementById("studentPreviewDialog").close();
  });
  document.getElementById("studentPreviewDialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      setStudentEditing(false);
      event.currentTarget.close();
    }
  });
  document.getElementById("editProfessorStudent").addEventListener("click", () => setStudentEditing(true));
  document.getElementById("cancelProfessorStudentEdit").addEventListener("click", () => {
    if (creatingProfessorStudent) {
      creatingProfessorStudent = false;
      document.querySelector(".student-workspace-shell")?.classList.remove("creating-student");
      setStudentEditing(false);
      document.getElementById("studentPreviewDialog").close();
      return;
    }
    const student = Store.findStudent(state, selectedStudentId);
    if (student) fillStudentForm(student);
    setStudentEditing(false);
  });
  document.getElementById("profStudentForm").addEventListener("submit", saveProfessorStudent);
  document.getElementById("profPresenceButton").addEventListener("click", toggleProfessorPresence);
  document.getElementById("profReceivePaymentButton").addEventListener("click", openProfessorPayment);
  document.getElementById("closeProfessorPayment").addEventListener("click", closeProfessorPayment);
  document.getElementById("cancelProfessorPayment").addEventListener("click", closeProfessorPayment);
  document.getElementById("profPaymentDialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      closeProfessorPayment();
    }
  });
  document.getElementById("profPaymentForm").addEventListener("submit", saveProfessorPayment);
  document.getElementById("profPaymentForm").elements.reference.addEventListener("change", (event) => {
    const student = Store.findStudent(state, selectedStudentId);
    if (student) {
      populateProfessorPaymentForm(student, event.target.value);
    }
  });
  ["amount", "discount", "fine"].forEach((name) => {
    document.getElementById("profPaymentForm").elements[name].addEventListener("input", updateProfessorPaymentPreview);
  });
  document.getElementById("profPaymentForm").elements.paidAmount.addEventListener("input", (event) => {
    event.currentTarget.form.dataset.paidAmountTouched = "1";
  });
  document.getElementById("newProfessorWorkout").addEventListener("click", () => openProfessorWorkout());
  document.getElementById("closeProfessorWorkout").addEventListener("click", closeProfessorWorkout);
  document.getElementById("cancelProfessorWorkout").addEventListener("click", closeProfessorWorkout);
  document.getElementById("addProfessorExercise").addEventListener("click", () => {
    syncExerciseDraftFromEditor();
    workoutExerciseDraft.push(createExerciseDraft());
    renderExerciseEditor();
    window.setTimeout(() => {
      const rows = document.querySelectorAll("[data-exercise-editor-id]");
      rows[rows.length - 1]?.querySelector('[data-exercise-field="name"]')?.focus();
    }, 30);
  });
  document.getElementById("profWorkoutForm").addEventListener("submit", saveProfessorWorkout);
  document.getElementById("profWorkoutDialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      closeProfessorWorkout();
    }
  });

  document.getElementById("newProfessorAssessment").addEventListener("click", () => openProfessorAssessment());
  document.getElementById("closeProfessorAssessment").addEventListener("click", closeProfessorAssessment);
  document.getElementById("cancelProfessorAssessment").addEventListener("click", closeProfessorAssessment);
  document.getElementById("profAssessmentDialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      closeProfessorAssessment();
    }
  });
  document.getElementById("profAssessmentForm").addEventListener("submit", saveProfessorAssessment);
  ["weight", "height"].forEach((name) => {
    document.getElementById("profAssessmentForm").elements[name].addEventListener("input", updateProfessorAssessmentImc);
  });

  document.getElementById("newProfessorSchedule").addEventListener("click", () => openProfessorSchedule());
  document.getElementById("closeProfessorSchedule").addEventListener("click", closeProfessorSchedule);
  document.getElementById("cancelProfessorSchedule").addEventListener("click", closeProfessorSchedule);
  document.getElementById("profScheduleDialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      closeProfessorSchedule();
    }
  });
  document.getElementById("profScheduleForm").addEventListener("submit", saveProfessorSchedule);

  window.addEventListener("storage", (event) => {
    if (event.key === Store.STORAGE_KEY && !hasProfessorUnsavedEditor()) {
      state = Store.loadData();
      renderAll();
      if (selectedStudentId && document.getElementById("studentPreviewDialog").open) {
        renderStudentWorkspace(selectedStudentId);
      }
    }
  });

  window.addEventListener("online", async () => {
    renderProfessorSyncStatus(getProfessorPendingCount() ? "pending" : "online", "Internet restabelecida");
    if (!(await validateProfessorSession())) return;
    showToast("Internet restabelecida. Sincronizando dados.", "success");
    refreshData({ manual: false });
  });

  window.addEventListener("offline", () => {
    renderProfessorSyncStatus("offline");
    showToast("Sem internet. As alterações continuarão salvas neste tablet.", "warning");
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && !hasProfessorUnsavedEditor() && await validateProfessorSession()) {
      refreshData({ manual: false });
    }
  });
  window.addEventListener("profitness:auth-invalid", (event) => handleProfessorAuthInvalid(event.detail?.message));

  professorAutoSyncTimer = window.setInterval(() => {
    if (authSession && !hasProfessorUnsavedEditor()) {
      refreshData({ manual: false });
    }
  }, PROFESSOR_SYNC_INTERVAL_MS);

  staffClockTimer = window.setInterval(renderStaffClock, 30000);
  professorIdleTimer = window.setInterval(() => {
    if (authSession && Date.now() - professorLastActivity >= 5 * 60 * 1000) lockProfessorTablet();
  }, 30000);
  professorAuthTimer = window.setInterval(() => validateProfessorSession(), 60000);

  window.addEventListener("beforeunload", () => {
    if (professorAutoSyncTimer) {
      window.clearInterval(professorAutoSyncTimer);
    }
    if (staffClockTimer) {
      window.clearInterval(staffClockTimer);
    }
    if (professorIdleTimer) window.clearInterval(professorIdleTimer);
    if (professorAuthTimer) window.clearInterval(professorAuthTimer);
  });

  Store.applyRuntimeEnvironment();
  setView(activeView);
  (async function initializeProfessorPanel() {
    if (authSession?.account?.role !== "professor") {
      authSession = null;
      showProfessorAccess("login");
      return;
    }
    if (!Store.isLocalDemoSession(authSession) && navigator.onLine !== false) {
      showProfessorAccess("login");
      document.getElementById("profLoginFeedback").textContent = "Validando sessao...";
    }
    if (!(await validateProfessorSession())) return;
    showProfessorAccess("app");
    renderProfessorSyncStatus(getProfessorPendingCount() ? "pending" : isProfessorOnline() ? "online" : "offline");
    refreshData({ manual: false });
  })();
})();
