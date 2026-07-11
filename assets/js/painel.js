const Store = window.ProFitnessStore;
const Finance = window.ProFitnessFinance;

let panelState = Store.loadData();
let authSession = Store.loadAuthSession();
let managedAccounts = [];
let gateSimulatorStream = null;
let selectedStudentId = panelState.students[0] ? panelState.students[0].id : "";
let activeFilter = "todos";
let studentSearchTerm = "";
let activePanelTab = "ficha";
let activeMainSection = "overview";
let activeWeeklyDay = new Date().getDay();
let activeFinanceTab = "summary";
let financeHistoryStudentId = selectedStudentId;
let adminSyncPromise = null;
let adminAutoSyncTimer = null;

const ADMIN_SYNC_QUEUE_PREFIX = Store.storageKey("admin-sync-queue-v2");
const ADMIN_PENDING_SNAPSHOT_PREFIX = Store.storageKey("admin-pending-snapshot-v2");
const ADMIN_LAST_SYNC_PREFIX = Store.storageKey("admin-last-sync-v2");
const ADMIN_SYNC_INTERVAL_MS = 60000;
const ADMIN_SYNC_RESOURCES = ["students", "assessments", "workouts", "schedule", "payments", "movements", "expenses", "cashClosings", "checkins", "exercises", "users", "staffTimeEntries", "config"];
const WEEKLY_NOTE_PREFIX = "WEEKLY_CLASS:";
const WEEK_DAYS = [
  { value: 1, label: "Segunda-feira", short: "Seg" },
  { value: 2, label: "Terca-feira", short: "Ter" },
  { value: 3, label: "Quarta-feira", short: "Qua" },
  { value: 4, label: "Quinta-feira", short: "Qui" },
  { value: 5, label: "Sexta-feira", short: "Sex" },
  { value: 6, label: "Sabado", short: "Sab" },
  { value: 0, label: "Domingo", short: "Dom" }
];

const WEEKLY_CATEGORY_LABELS = {
  natacao: "Natacao",
  hidroginastica: "Hidroginastica",
  karate: "Karate",
  "jiu-jitsu": "Jiu-jitsu",
  funcional: "Treino funcional",
  danca: "Danca",
  musculacao: "Musculacao orientada",
  outra: "Outra atividade"
};

const FINANCE_METHOD_LABELS = {
  pix: "Pix",
  cartao: "Cartao",
  dinheiro: "Dinheiro",
  boleto: "Boleto",
  transferencia: "Transferencia"
};

const FINANCE_CATEGORY_LABELS = {
  mensalidade: "Mensalidades",
  avaliacao: "Avaliacoes",
  venda: "Vendas",
  utilidades: "Utilidades",
  aluguel: "Aluguel",
  limpeza: "Limpeza",
  manutencao: "Manutencao",
  equipamentos: "Equipamentos",
  salarios: "Salarios",
  impostos: "Impostos",
  marketing: "Marketing",
  outros: "Outros"
};

const COST_CENTER_LABELS = {
  geral: "Geral",
  musculacao: "Musculacao",
  natacao: "Natacao",
  lutas: "Lutas",
  aulas: "Aulas coletivas",
  administrativo: "Administrativo"
};

const studentForm = document.getElementById("studentForm");
const paymentForm = document.getElementById("paymentForm");
const paymentDialog = document.getElementById("paymentDialog");
const receiptDialog = document.getElementById("receiptDialog");
const movementForm = document.getElementById("movementForm");
const expenseForm = document.getElementById("expenseForm");
const cashClosingForm = document.getElementById("cashClosingForm");
const workoutForm = document.getElementById("workoutForm");
const assessmentForm = document.getElementById("assessmentForm");
const scheduleForm = document.getElementById("scheduleForm");
const workspaceTitle = document.getElementById("workspaceTitle");
const workspaceEmpty = document.getElementById("workspaceEmpty");
const workspaceContent = document.getElementById("workspaceContent");
const financeMonthFilter = document.getElementById("financeMonthFilter");
const financeQuickStudentSearch = document.getElementById("financeQuickStudentSearch");
const financeQuickStudentList = document.getElementById("financeQuickStudentList");
const financeStatusFilter = document.getElementById("financeStatusFilter");
const financeSearchFilter = document.getElementById("financeSearchFilter");
const cashDateFilter = document.getElementById("cashDateFilter");
const movementTypeFilter = document.getElementById("movementTypeFilter");
const movementMethodFilter = document.getElementById("movementMethodFilter");
const movementSearchFilter = document.getElementById("movementSearchFilter");
const expenseMonthFilter = document.getElementById("expenseMonthFilter");
const expenseStatusFilter = document.getElementById("expenseStatusFilter");
const expenseSearchFilter = document.getElementById("expenseSearchFilter");
const reportStartDate = document.getElementById("reportStartDate");
const reportEndDate = document.getElementById("reportEndDate");
const reportTypeFilter = document.getElementById("reportTypeFilter");
const reportMethodFilter = document.getElementById("reportMethodFilter");
const reportCostCenterFilter = document.getElementById("reportCostCenterFilter");
const reportStudentFilter = document.getElementById("reportStudentFilter");
const weeklyScheduleForm = document.getElementById("weeklyScheduleForm");
const weeklyDayFilter = document.getElementById("weeklyDayFilter");
const weeklySearchFilter = document.getElementById("weeklySearchFilter");
const studentSearchFilter = document.getElementById("studentSearchFilter");
const globalStudentSearch = document.getElementById("globalStudentSearch");
const globalStudentSearchList = document.getElementById("globalStudentSearchList");
const planCatalogForm = document.getElementById("planCatalogForm");
const modalityCatalogForm = document.getElementById("modalityCatalogForm");
const paymentRulesForm = document.getElementById("paymentRulesForm");
const staffCatalogForm = document.getElementById("staffCatalogForm");
const staffReportStartDate = document.getElementById("staffReportStartDate");
const staffReportEndDate = document.getElementById("staffReportEndDate");
const staffReportProfessorFilter = document.getElementById("staffReportProfessorFilter");

function adminStorageKey(prefix) {
  return `${prefix}-${authSession?.account?.id || "anonymous"}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return entities[character];
  });
}

function escapeText(value) {
  return escapeHtml(value).replace(/\n/g, "<br />");
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

function badge(status, label) {
  return `<span class="badge ${Store.getStatusTone(status)}">${escapeHtml(label || status)}</span>`;
}

function getOperationalAccessLabel(access) {
  if (access.status === "liberado") {
    return "Acesso liberado";
  }
  if (access.status === "bloqueado") {
    return "Acesso bloqueado";
  }
  return "Verificar acesso";
}

function getOperationalAccessReason(access) {
  const financialTerms = /mensalidade|pagamento|cobranca|atraso|financeir/i;
  if (financialTerms.test(String(access.reason || ""))) {
    return "Acesso indisponivel. Consulte os detalhes na area reservada.";
  }
  return access.reason || "Verifique as regras atuais de acesso.";
}

function loadAdminSyncQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(adminStorageKey(ADMIN_SYNC_QUEUE_PREFIX)) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.resource && item.recordId) : [];
  } catch (error) {
    return [];
  }
}

function saveAdminSyncQueue(queue) {
  localStorage.setItem(adminStorageKey(ADMIN_SYNC_QUEUE_PREFIX), JSON.stringify(Array.isArray(queue) ? queue : []));
  renderAdminSyncStatus();
}

function loadAdminPendingSnapshot() {
  try {
    const parsed = JSON.parse(localStorage.getItem(adminStorageKey(ADMIN_PENDING_SNAPSHOT_PREFIX)) || "null");
    return parsed && parsed.snapshot ? parsed : null;
  } catch (error) {
    return null;
  }
}

function saveAdminPendingSnapshot(entry) {
  if (entry && entry.snapshot) {
    localStorage.setItem(adminStorageKey(ADMIN_PENDING_SNAPSHOT_PREFIX), JSON.stringify(entry));
  } else {
    localStorage.removeItem(adminStorageKey(ADMIN_PENDING_SNAPSHOT_PREFIX));
  }
  renderAdminSyncStatus();
}

function getAdminPendingCount() {
  return loadAdminSyncQueue().length + (loadAdminPendingSnapshot() ? 1 : 0);
}

function buildAdminSyncOperations(beforeState, afterState) {
  return Store.buildRemoteRecordOperations(beforeState, afterState, ADMIN_SYNC_RESOURCES).map((operation) => ({
    ...operation,
    id: Store.uid("SYNCADM"),
    queuedAt: new Date().toISOString()
  }));
}

function enqueueAdminSyncOperations(operations) {
  if (!Array.isArray(operations) || !operations.length) return;
  const orderedKeys = [];
  const byRecord = new Map();
  loadAdminSyncQueue().concat(operations).forEach((operation) => {
    const key = `${operation.resource}:${operation.recordId}`;
    if (!byRecord.has(key)) orderedKeys.push(key);
    byRecord.set(key, operation);
  });
  saveAdminSyncQueue(orderedKeys.map((key) => byRecord.get(key)).filter(Boolean));
}

function formatAdminLastSync() {
  const value = localStorage.getItem(adminStorageKey(ADMIN_LAST_SYNC_PREFIX));
  if (!value) return "Ainda nao sincronizado";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Ainda nao sincronizado";
  return `Ultima sincronizacao ${new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed)}`;
}

function setAdminLastSync() {
  localStorage.setItem(adminStorageKey(ADMIN_LAST_SYNC_PREFIX), new Date().toISOString());
}

function renderAdminSyncStatus(mode, customText) {
  const dot = document.getElementById("adminConnectionDot");
  const text = document.getElementById("adminConnectionText");
  const pendingButton = document.getElementById("adminPendingSyncButton");
  const lastSync = document.getElementById("adminLastSyncText");
  if (!dot || !text || !pendingButton || !lastSync) return;

  const pending = getAdminPendingCount();
  pendingButton.hidden = pending === 0;
  pendingButton.textContent = pending === 1 ? "1 pendencia" : `${pending} pendencias`;
  pendingButton.title = loadAdminPendingSnapshot()?.lastError || loadAdminSyncQueue()[0]?.lastError || "Clique para tentar novamente";
  lastSync.textContent = formatAdminLastSync();

  const resolved = mode || (pending ? "pending" : navigator.onLine === false ? "offline" : Store.isRemoteConfigured() ? "online" : "local");
  dot.className = `admin-sync-dot ${resolved}`;
  document.body.classList.toggle("admin-syncing", resolved === "syncing");
  const labels = {
    syncing: "Sincronizando",
    online: "Dados sincronizados",
    pending: navigator.onLine === false ? "Sem internet — salvo neste computador" : "Alteracoes aguardando envio",
    offline: "Sem internet — salvo neste computador",
    error: "API indisponivel — dados locais preservados",
    local: "Dados deste computador"
  };
  text.textContent = customText || labels[resolved] || labels.local;
}

async function sendAdminSyncOperation(operation) {
  if (operation.action === "delete") {
    return Store.deleteRemoteRecord(operation.resource, operation.recordId, operation.data?.expectedUpdatedAt);
  }
  return Store.upsertRemoteRecord(operation.resource, operation.data);
}

async function flushAdminSyncQueue(options) {
  const settings = options || {};
  if (adminSyncPromise) return adminSyncPromise;
  adminSyncPromise = (async () => {
    if (!Store.isRemoteConfigured()) {
      renderAdminSyncStatus("local");
      return false;
    }
    if (navigator.onLine === false) {
      renderAdminSyncStatus("offline");
      return false;
    }
    if (!loadAdminPendingSnapshot() && !loadAdminSyncQueue().length) {
      renderAdminSyncStatus("online");
      return true;
    }

    renderAdminSyncStatus("syncing", "Enviando alteracoes");
    let sent = 0;
    const pendingSnapshot = loadAdminPendingSnapshot();
    if (pendingSnapshot) {
      renderAdminSyncStatus("syncing", "Sincronizando restauracao completa");
      await Store.pushRemoteSnapshot(pendingSnapshot.snapshot);
      saveAdminPendingSnapshot(null);
      sent += 1;
    }
    while (loadAdminSyncQueue().length) {
      const operation = loadAdminSyncQueue()[0];
      await sendAdminSyncOperation(operation);
      const latest = loadAdminSyncQueue();
      const index = latest.findIndex((item) => item.id === operation.id);
      if (index >= 0) {
        latest.splice(index, 1);
        saveAdminSyncQueue(latest);
      }
      sent += 1;
    }
    setAdminLastSync();
    renderAdminSyncStatus("online");
    if (settings.notify && sent) window.alert(sent === 1 ? "Alteracao sincronizada." : `${sent} alteracoes sincronizadas.`);
    return true;
  })().catch((error) => {
    const pendingSnapshot = loadAdminPendingSnapshot();
    if (pendingSnapshot) {
      saveAdminPendingSnapshot({
        ...pendingSnapshot,
        lastError: error?.message || "Falha de sincronizacao",
        lastAttemptAt: new Date().toISOString()
      });
    } else {
      const queue = loadAdminSyncQueue();
      if (queue[0]) {
        queue[0] = { ...queue[0], lastError: error?.message || "Falha de sincronizacao", lastAttemptAt: new Date().toISOString() };
        saveAdminSyncQueue(queue);
      }
    }
    renderAdminSyncStatus(getAdminPendingCount() ? "pending" : navigator.onLine === false ? "offline" : "error");
    if (settings.notify) {
      window.alert(error?.code === "SYNC_CONFLICT"
        ? "Existe uma versao mais recente na planilha. A alteracao permaneceu pendente para conferencia."
        : "Os dados estao salvos neste computador e o envio sera tentado novamente.");
    }
    return false;
  }).finally(() => {
    adminSyncPromise = null;
    document.body.classList.remove("admin-syncing");
  });
  return adminSyncPromise;
}

async function refreshAdminFromRemote(options) {
  const settings = options || {};
  if (!Store.isRemoteConfigured()) {
    renderAdminSyncStatus("local");
    if (settings.notify) window.alert("Configure a URL do Web App antes de sincronizar.");
    return false;
  }
  if (navigator.onLine === false) {
    renderAdminSyncStatus("offline");
    if (settings.notify) window.alert("Sem internet. Os dados continuam salvos neste computador.");
    return false;
  }

  const baseline = JSON.stringify(Store.loadData());
  const flushed = await flushAdminSyncQueue({ notify: false });
  if (!flushed || getAdminPendingCount()) {
    if (settings.notify) window.alert("Ainda existem alteracoes aguardando envio. Resolva a sincronizacao antes de atualizar a base.");
    return false;
  }

  try {
    renderAdminSyncStatus("syncing", "Atualizando dados");
    const remoteRaw = await Store.fetchRemoteSnapshot();
    const currentLocal = Store.loadData();
    if (JSON.stringify(currentLocal) !== baseline) {
      renderAdminSyncStatus("pending", "Alteracao local detectada durante a atualizacao");
      if (settings.notify) window.alert("Houve uma alteracao local durante a atualizacao. A base remota nao substituiu os dados deste computador.");
      return false;
    }
    if (Store.snapshotHasMeaningfulData(remoteRaw) || !Store.snapshotHasMeaningfulData(currentLocal)) {
      panelState = Store.migrateData(remoteRaw);
      Store.saveData(panelState);
    } else {
      panelState = currentLocal;
    }
    setAdminLastSync();
    renderPanel();
    renderAdminSyncStatus("online");
    if (settings.notify) window.alert("Dados sincronizados com o Google Sheets.");
    return true;
  } catch (error) {
    panelState = Store.loadData();
    renderPanel();
    renderAdminSyncStatus("error");
    if (settings.notify) window.alert(`Nao foi possivel atualizar: ${error.message}`);
    return false;
  }
}

function savePanelState(nextState) {
  const previousState = panelState;
  panelState = Store.migrateData(nextState);
  Store.saveData(panelState);
  enqueueAdminSyncOperations(buildAdminSyncOperations(previousState, panelState));
  renderPanel();
  renderAdminSyncStatus(getAdminPendingCount() ? "pending" : undefined);
  flushAdminSyncQueue({ notify: false });
}

function saveWithLog(nextState, action, studentId, message) {
  savePanelState(
    Store.appendLog(nextState, {
      action: action,
      studentId: studentId,
      message: message,
      source: "painel-administrativo"
    })
  );
}

function renderQr(target, payload, size) {
  target.innerHTML = "";
  if (!payload) {
    target.innerHTML = `<div class="empty-state">QR indisponivel.</div>`;
    return;
  }

  if (!window.QRCode) {
    target.innerHTML = `<div class="code-box">${escapeHtml(payload)}</div>`;
    return;
  }

  new window.QRCode(target, {
    text: payload,
    width: size || 180,
    height: size || 180,
    colorDark: "#1b1c18",
    colorLight: "#ffffff",
    correctLevel: window.QRCode.CorrectLevel.M
  });
}

function getSelectedStudent() {
  return selectedStudentId ? Store.findStudent(panelState, selectedStudentId) : null;
}

function getFilteredStudents() {
  let students = panelState.students;

  if (activeFilter === "pendentes") {
    students = students.filter((student) => student.enrollmentStatus !== "ativo");
  } else if (activeFilter === "bloqueados") {
    students = students.filter((student) => Store.getAccessState(panelState, student.id).status === "bloqueado");
  } else if (activeFilter === "ativos") {
    students = students.filter((student) => Store.getAccessState(panelState, student.id).status === "liberado");
  }

  const query = studentSearchTerm.trim().toLocaleLowerCase("pt-BR");
  if (!query) {
    return students;
  }

  return students.filter((student) => {
    const searchable = [student.name, student.phone, student.email, student.plan, student.goal]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("pt-BR");
    return searchable.includes(query);
  });
}

function findRecord(collection, id) {
  return (panelState[collection] || []).find((record) => record.id === id) || null;
}

function upsertRecord(collection, record) {
  return upsertRecordInState(panelState, collection, record);
}

function upsertRecordInState(state, collection, record) {
  const nextState = Store.clone(state);
  const records = Array.isArray(nextState[collection]) ? nextState[collection] : [];
  const index = records.findIndex((item) => item.id === record.id);

  if (index >= 0) {
    records[index] = record;
  } else {
    records.unshift(record);
  }

  nextState[collection] = records;
  return nextState;
}

function updateRecord(collection, id, updater) {
  const nextState = Store.clone(panelState);
  const records = Array.isArray(nextState[collection]) ? nextState[collection] : [];
  nextState[collection] = records.map((record) => (record.id === id ? updater(record) : record));
  return nextState;
}

function getStudentRecords(collection, studentId) {
  return (panelState[collection] || []).filter((record) => record.studentId === studentId);
}

function setActivePanelTab(tabName) {
  activePanelTab = tabName;
  document.querySelectorAll("[data-panel-tab]").forEach((button) => {
    const isActive = button.dataset.panelTab === tabName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });

  document.querySelectorAll("[data-panel]").forEach((panel) => {
    const isActive = panel.dataset.panel === tabName;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });
}

function setActiveMainSection(sectionName) {
  activeMainSection = sectionName;
  document.querySelectorAll("[data-main-section]").forEach((button) => {
    const isActive = button.dataset.mainSection === sectionName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  document.querySelectorAll("[data-main-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.mainPanel !== sectionName;
  });

  const headings = {
    overview: "Visao geral",
    operation: "Alunos e estatísticas",
    weekly: "Grade semanal",
    staff: "Equipe e presenca",
    finance: "Financeiro",
    settings: "Configuracoes"
  };

  const sectionTitle = document.getElementById("sectionTitle");
  if (sectionTitle) {
    sectionTitle.textContent = headings[sectionName] || "Painel Pro Fitness";
  }

  if (sectionName === "operation") {
    renderOperation();
  }
  if (sectionName === "weekly") {
    renderWeeklyManagement();
  }
  if (sectionName === "finance") {
    renderFinance();
  }
  if (sectionName === "staff") {
    renderStaffTimeReport();
  }
  if (sectionName === "settings") {
    renderSettings();
  }

  const systemMenu = document.querySelector(".system-menu");
  if (systemMenu) {
    systemMenu.open = false;
  }
}

function shiftISODate(dateValue, amount) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + amount);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftMonthKey(amount) {
  const today = new Date(`${Store.todayISO()}T12:00:00`);
  today.setDate(1);
  today.setMonth(today.getMonth() + amount);
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function getCheckinDate(checkin) {
  const timestamp = checkin.checkedInAt || checkin.entryAt || "";
  return timestamp ? String(timestamp).slice(0, 10) : String(checkin.date || "");
}

function isAccessCheckin(checkin) {
  return checkin.type === "access" || Boolean(checkin.checkedInAt || checkin.entryAt);
}

function getCurrentPresenceCount() {
  const now = Date.now();
  const today = Store.todayISO();
  const presentStudents = new Set();

  panelState.checkins.filter(isAccessCheckin).forEach((checkin) => {
    const checkedInAt = checkin.checkedInAt || checkin.entryAt || "";
    const checkedOutAt = checkin.checkedOutAt || checkin.exitAt || "";
    const isMarkedInside = checkin.presenceStatus === "inside";
    const elapsed = checkedInAt ? now - new Date(checkedInAt).getTime() : Number.POSITIVE_INFINITY;
    const isRecentEntry = Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 6 * 60 * 60 * 1000;

    const isCurrentSession = isRecentEntry || (isMarkedInside && !checkedInAt && getCheckinDate(checkin) === today);
    if (!checkedOutAt && isCurrentSession) {
      presentStudents.add(checkin.studentId || checkin.id);
    }
  });

  return presentStudents.size;
}

function metricIcon(iconName) {
  const icons = {
    members: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    new: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M19 8v6M16 11h6"/></svg>',
    live: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21v-2a7 7 0 0 1 14 0v2"/><circle cx="12" cy="7" r="4"/><path d="M18.5 3.5l2 2"/></svg>',
    entries: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>',
    classes: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h3M13 14h3"/></svg>'
  };
  return icons[iconName] || icons.members;
}

function renderOverviewMetrics() {
  const today = Store.todayISO();
  const currentMonth = Store.currentMonth();
  const previousMonth = shiftMonthKey(-1);
  const enrolledStudents = panelState.students.filter((student) => student.enrollmentStatus === "ativo").length;
  const activeStudents = panelState.students.filter((student) => student.status === "ativo").length;
  const newStudents = panelState.students.filter((student) => String(student.createdAt || "").slice(0, 7) === currentMonth).length;
  const previousNewStudents = panelState.students.filter((student) => String(student.createdAt || "").slice(0, 7) === previousMonth).length;
  const currentPresence = getCurrentPresenceCount();
  const todayEntries = panelState.checkins.filter(
    (checkin) => isAccessCheckin(checkin) && getCheckinDate(checkin) === today
  ).length;
  const datedClassesToday = panelState.schedule.filter(
    (item) => item.date === today && !["cancelada", "falta"].includes(item.status)
  ).length;
  const weeklyClassesToday = getWeeklyClasses().filter(
    (item) => item.status === "ativo" && item.dayOfWeek === new Date().getDay()
  ).length;
  const todayClasses = datedClassesToday + weeklyClassesToday;

  const metrics = [
    {
      label: "Alunos matriculados",
      value: enrolledStudents,
      note: `${activeStudents} ativos na base`,
      icon: "members",
      tone: "yellow"
    },
    {
      label: "Alunos novos no mes",
      value: newStudents,
      note: `${previousNewStudents} no mes anterior`,
      icon: "new",
      tone: "green"
    },
    {
      label: "Na academia agora",
      value: currentPresence,
      note: "Entradas recentes sem saida",
      icon: "live",
      tone: "blue"
    },
    {
      label: "Entradas hoje",
      value: todayEntries,
      note: "Movimento registrado no dia",
      icon: "entries",
      tone: "orange"
    },
    {
      label: "Aulas de hoje",
      value: todayClasses,
      note: "Marcadas ou realizadas",
      icon: "classes",
      tone: "rose"
    }
  ];

  document.getElementById("metricGrid").innerHTML = metrics
    .map(
      (metric, index) => `
        <article class="metric-card tone-${metric.tone}" style="--card-delay: ${index * 55}ms">
          <div class="metric-card-top">
            <span class="metric-icon">${metricIcon(metric.icon)}</span>
            ${metric.icon === "live" ? '<span class="live-indicator"><i></i> agora</span>' : ""}
          </div>
          <span class="metric-label">${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
          <small>${escapeHtml(metric.note)}</small>
        </article>
      `
    )
    .join("");
}

function renderAttendanceChart() {
  const today = Store.todayISO();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = shiftISODate(today, index - 6);
    return {
      date: date,
      count: panelState.checkins.filter((checkin) => isAccessCheckin(checkin) && getCheckinDate(checkin) === date).length
    };
  });
  const maxValue = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const weekFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });

  document.getElementById("attendanceTotal").textContent = `${total} ${total === 1 ? "entrada" : "entradas"}`;
  document.getElementById("attendanceChart").innerHTML = days
    .map((day, index) => {
      const date = new Date(`${day.date}T12:00:00`);
      const weekday = weekFormatter.format(date).replace(".", "");
      const height = day.count ? Math.max(14, Math.round((day.count / maxValue) * 100)) : 4;
      return `
        <div class="attendance-day ${index === days.length - 1 ? "today" : ""}">
          <span>${day.count}</span>
          <div class="attendance-track"><i style="--attendance-height: ${height}%"></i></div>
          <strong>${escapeHtml(weekday)}</strong>
          <small>${String(date.getDate()).padStart(2, "0")}</small>
        </div>
      `;
    })
    .join("");
}

function renderEnrollmentChart() {
  const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "short" });
  const months = Array.from({ length: 6 }, (_, index) => {
    const key = shiftMonthKey(index - 5);
    const date = new Date(`${key}-01T12:00:00`);
    return {
      key: key,
      label: monthFormatter.format(date).replace(".", ""),
      count: panelState.students.filter((student) => String(student.createdAt || "").slice(0, 7) === key).length
    };
  });
  const maxValue = Math.max(1, ...months.map((month) => month.count));

  document.getElementById("enrollmentChart").innerHTML = months
    .map((month, index) => {
      const width = month.count ? Math.max(8, Math.round((month.count / maxValue) * 100)) : 2;
      return `
        <div class="enrollment-row ${index === months.length - 1 ? "current" : ""}">
          <span>${escapeHtml(month.label)}</span>
          <div class="enrollment-track"><i style="--enrollment-width: ${width}%"></i></div>
          <strong>${month.count}</strong>
        </div>
      `;
    })
    .join("");
}

function renderStudentMix() {
  const total = Math.max(1, panelState.students.length);
  const mix = [
    { label: "Ativos", value: panelState.students.filter((student) => student.status === "ativo").length, tone: "active" },
    { label: "Pausados", value: panelState.students.filter((student) => student.status === "pausado").length, tone: "paused" },
    { label: "Inativos", value: panelState.students.filter((student) => student.status === "inativo").length, tone: "inactive" }
  ];
  const activeAngle = (mix[0].value / total) * 360;
  const pausedAngle = activeAngle + (mix[1].value / total) * 360;

  document.getElementById("studentMix").innerHTML = `
    <div class="student-mix-ring" style="--active-angle: ${activeAngle}deg; --paused-angle: ${pausedAngle}deg">
      <div><strong>${panelState.students.length}</strong><span>alunos</span></div>
    </div>
    <div class="student-mix-legend">
      ${mix
        .map(
          (item) => `
            <div>
              <span><i class="mix-dot ${item.tone}"></i>${item.label}</span>
              <strong>${item.value}</strong>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function getWeekDay(dayValue) {
  const numericValue = Number(dayValue);
  return WEEK_DAYS.find((day) => day.value === numericValue) || WEEK_DAYS[0];
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
  const isWeeklyClass = record.scheduleKind === "weekly-class" || record.type === "group" || isRecurring || Boolean(fallback.title);

  if (!isWeeklyClass) {
    return null;
  }

  return {
    ...record,
    title: record.title || fallback.title || "Atividade sem nome",
    category: record.category || fallback.category || "outra",
    dayOfWeek: Number(record.dayOfWeek ?? fallback.dayOfWeek ?? 1),
    startTime: Store.formatTime(record.startTime || fallback.startTime || record.time || "00:00"),
    endTime: record.endTime || fallback.endTime ? Store.formatTime(record.endTime || fallback.endTime) : "",
    teacherId: record.teacherId || fallback.teacherId || "",
    teacherName: record.teacherName || fallback.teacherName || "Professor a definir",
    location: record.location || fallback.location || "Local a definir",
    capacity: safeNumber(record.capacity || fallback.capacity),
    status: record.status || fallback.status || "ativo",
    notes: fallback.userNotes ?? (String(record.notes || "").startsWith(WEEKLY_NOTE_PREFIX) ? "" : record.notes || ""),
    recurring: true,
    scheduleKind: "weekly-class"
  };
}

function getWeeklyClasses() {
  return panelState.schedule
    .map(normalizeWeeklyClass)
    .filter(Boolean)
    .sort((left, right) => {
      const leftDay = WEEK_DAYS.findIndex((day) => day.value === left.dayOfWeek);
      const rightDay = WEEK_DAYS.findIndex((day) => day.value === right.dayOfWeek);
      return leftDay - rightDay || String(left.startTime).localeCompare(String(right.startTime)) || left.title.localeCompare(right.title);
    });
}

function encodeWeeklyNotes(payload) {
  return `${WEEKLY_NOTE_PREFIX}${JSON.stringify({
    title: payload.title,
    category: payload.category,
    dayOfWeek: Number(payload.dayOfWeek),
    startTime: payload.startTime,
    endTime: payload.endTime,
    teacherId: payload.teacherId || "",
    teacherName: payload.teacherName,
    location: payload.location || "",
    capacity: safeNumber(payload.capacity),
    status: payload.status || "ativo",
    userNotes: payload.notes || ""
  })}`;
}

function buildWeeklyClassRecord(payload, existingRecord) {
  const record = existingRecord || {};
  const normalizedPayload = {
    ...payload,
    dayOfWeek: Number(payload.dayOfWeek),
    capacity: safeNumber(payload.capacity),
    status: payload.status || "ativo"
  };

  return {
    ...record,
    id: record.id || Store.uid("GRD"),
    studentId: "",
    date: "",
    time: normalizedPayload.startTime,
    type: "group",
    status: normalizedPayload.status,
    title: normalizedPayload.title,
    category: normalizedPayload.category,
    dayOfWeek: normalizedPayload.dayOfWeek,
    startTime: normalizedPayload.startTime,
    endTime: normalizedPayload.endTime,
    teacherId: normalizedPayload.teacherId || record.teacherId || "",
    teacherName: normalizedPayload.teacherName,
    location: normalizedPayload.location || "",
    capacity: normalizedPayload.capacity,
    recurring: true,
    scheduleKind: "weekly-class",
    notes: encodeWeeklyNotes(normalizedPayload)
  };
}

function getNextWeeklyOccurrence(weeklyClass, referenceDate) {
  const now = referenceDate || new Date();
  const occurrence = new Date(now);
  const [hour, minute] = String(weeklyClass.startTime || "00:00").split(":").map(Number);
  let daysAhead = (weeklyClass.dayOfWeek - now.getDay() + 7) % 7;

  occurrence.setHours(hour || 0, minute || 0, 0, 0);
  if (daysAhead === 0 && occurrence <= now) {
    daysAhead = 7;
  }
  occurrence.setDate(now.getDate() + daysAhead);
  return occurrence;
}

function weeklyClassMarkup(weeklyClass) {
  const category = WEEKLY_CATEGORY_LABELS[weeklyClass.category] || WEEKLY_CATEGORY_LABELS.outra;
  return `
    <article class="weekly-class-card">
      <div class="weekly-class-time">
        <strong>${escapeHtml(weeklyClass.startTime)}</strong>
        <span>${escapeHtml(weeklyClass.endTime || "-")}</span>
      </div>
      <div class="weekly-class-info">
        <span>${escapeHtml(category)}</span>
        <h4>${escapeHtml(weeklyClass.title)}</h4>
        <p>${escapeHtml(weeklyClass.teacherName)}</p>
        <small>${escapeHtml(weeklyClass.location)}</small>
      </div>
    </article>
  `;
}

function renderWeeklyOverview() {
  const weeklyClasses = getWeeklyClasses().filter((item) => item.status === "ativo");
  const daySelector = document.getElementById("weeklyDaySelector");
  const calendar = document.getElementById("weeklyScheduleCalendar");
  const upcomingList = document.getElementById("upcomingClassList");

  daySelector.innerHTML = WEEK_DAYS.map((day) => {
    const count = weeklyClasses.filter((item) => item.dayOfWeek === day.value).length;
    return `
      <button class="weekly-day-button ${day.value === activeWeeklyDay ? "active" : ""}" type="button" data-weekly-day="${day.value}">
        <span>${day.short}</span><small>${count}</small>
      </button>
    `;
  }).join("");

  calendar.innerHTML = WEEK_DAYS.map((day) => {
    const dayClasses = weeklyClasses.filter((item) => item.dayOfWeek === day.value);
    return `
      <section class="weekly-day-column ${day.value === activeWeeklyDay ? "mobile-active" : ""}">
        <header><span>${day.short}</span><strong>${day.label}</strong></header>
        <div class="weekly-day-classes">
          ${dayClasses.length ? dayClasses.map(weeklyClassMarkup).join("") : '<div class="weekly-day-empty">Sem atividade</div>'}
        </div>
      </section>
    `;
  }).join("");

  const upcoming = weeklyClasses
    .map((weeklyClass) => ({ weeklyClass, occurrence: getNextWeeklyOccurrence(weeklyClass) }))
    .sort((left, right) => left.occurrence - right.occurrence)
    .slice(0, 5);

  upcomingList.innerHTML = upcoming.length
    ? upcoming.map(({ weeklyClass, occurrence }) => {
        const day = getWeekDay(weeklyClass.dayOfWeek);
        const dateLabel = occurrence.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        return `
          <article class="upcoming-class-item">
            <div class="upcoming-class-date"><strong>${day.short}</strong><span>${dateLabel}</span></div>
            <div>
              <span>${escapeHtml(weeklyClass.startTime)} - ${escapeHtml(weeklyClass.endTime || "-")}</span>
              <h4>${escapeHtml(weeklyClass.title)}</h4>
              <p>${escapeHtml(weeklyClass.teacherName)} · ${escapeHtml(weeklyClass.location)}</p>
            </div>
          </article>
        `;
      }).join("")
    : '<div class="empty-state">Cadastre a primeira atividade da grade semanal.</div>';
}

function resetWeeklyScheduleForm() {
  weeklyScheduleForm.reset();
  weeklyScheduleForm.elements.id.value = "";
  weeklyScheduleForm.elements.dayOfWeek.value = String(activeWeeklyDay);
  weeklyScheduleForm.elements.startTime.value = "08:00";
  weeklyScheduleForm.elements.endTime.value = "09:00";
  weeklyScheduleForm.elements.status.value = "ativo";
  document.getElementById("weeklyEditorTitle").textContent = "Nova atividade";
}

function populateWeeklyScheduleForm(weeklyClass) {
  resetWeeklyScheduleForm();
  Object.entries(weeklyClass).forEach(([key, value]) => {
    if (weeklyScheduleForm.elements[key]) {
      weeklyScheduleForm.elements[key].value = value ?? "";
    }
  });
  document.getElementById("weeklyEditorTitle").textContent = `Editar ${weeklyClass.title}`;
  weeklyScheduleForm.elements.title.focus();
}

function renderWeeklyManagement() {
  const selectedDay = weeklyDayFilter.value;
  const query = weeklySearchFilter.value.trim().toLocaleLowerCase("pt-BR");
  const weeklyClasses = getWeeklyClasses().filter((weeklyClass) => {
    const matchesDay = selectedDay === "todos" || weeklyClass.dayOfWeek === Number(selectedDay);
    const searchable = `${weeklyClass.title} ${weeklyClass.teacherName} ${weeklyClass.location} ${weeklyClass.category}`.toLocaleLowerCase("pt-BR");
    return matchesDay && (!query || searchable.includes(query));
  });

  document.getElementById("weeklyScheduleCount").textContent = `${weeklyClasses.length} ${weeklyClasses.length === 1 ? "horario" : "horarios"}`;
  document.getElementById("weeklyScheduleAdminList").innerHTML = weeklyClasses.length
    ? weeklyClasses.map((weeklyClass) => {
        const day = getWeekDay(weeklyClass.dayOfWeek);
        const category = WEEKLY_CATEGORY_LABELS[weeklyClass.category] || WEEKLY_CATEGORY_LABELS.outra;
        return `
          <article class="weekly-admin-item ${weeklyClass.status === "inativo" ? "inactive" : ""}">
            <div class="weekly-admin-day">
              <strong>${day.short}</strong>
              <span>${escapeHtml(weeklyClass.startTime)}</span>
            </div>
            <div class="weekly-admin-info">
              <div class="weekly-admin-title-row">
                <div class="weekly-admin-title">
                  <span>${escapeHtml(category)} · ${escapeHtml(day.label)}</span>
                  <h4>${escapeHtml(weeklyClass.title)}</h4>
                </div>
                ${badge(weeklyClass.status, weeklyClass.status)}
              </div>
              <div class="weekly-admin-meta">
                <span><strong>${escapeHtml(weeklyClass.startTime)} - ${escapeHtml(weeklyClass.endTime || "-")}</strong></span>
                <span>${escapeHtml(weeklyClass.teacherName)}</span>
                <span>${escapeHtml(weeklyClass.location)}</span>
                ${weeklyClass.capacity ? `<span>${weeklyClass.capacity} alunos</span>` : ""}
              </div>
              ${weeklyClass.notes ? `<p class="weekly-admin-note" title="${escapeHtml(weeklyClass.notes)}">${escapeHtml(weeklyClass.notes)}</p>` : ""}
            </div>
            <div class="weekly-admin-actions">
              <button class="ghost-button small-button" type="button" data-edit-weekly="${escapeHtml(weeklyClass.id)}">Editar</button>
              <button class="ghost-button small-button" type="button" data-toggle-weekly="${escapeHtml(weeklyClass.id)}">${weeklyClass.status === "ativo" ? "Desativar" : "Ativar"}</button>
              <button class="ghost-button small-button danger-button" type="button" data-delete-weekly="${escapeHtml(weeklyClass.id)}">Excluir</button>
            </div>
          </article>
        `;
      }).join("")
    : '<div class="empty-state">Nenhum horario encontrado para os filtros selecionados.</div>';
}

function handleWeeklyScheduleSave(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

  if (payload.endTime <= payload.startTime) {
    window.alert("O horario de termino precisa ser posterior ao inicio.");
    return;
  }

  const existing = findRecord("schedule", payload.id);
  const weeklyClass = buildWeeklyClassRecord(payload, existing);
  activeWeeklyDay = weeklyClass.dayOfWeek;
  activeMainSection = "weekly";
  saveWithLog(
    upsertRecord("schedule", weeklyClass),
    existing ? "weekly-class-updated" : "weekly-class-created",
    "",
    `${weeklyClass.title} salva na grade semanal.`
  );
  resetWeeklyScheduleForm();
}

function handleWeeklyAdminAction(event) {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  const id = button.dataset.editWeekly || button.dataset.toggleWeekly || button.dataset.deleteWeekly;
  const rawRecord = id ? findRecord("schedule", id) : null;
  const weeklyClass = rawRecord ? normalizeWeeklyClass(rawRecord) : null;
  if (!weeklyClass) {
    return;
  }

  if (button.dataset.editWeekly) {
    populateWeeklyScheduleForm(weeklyClass);
    document.querySelector(".weekly-editor-card").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (button.dataset.toggleWeekly) {
    const nextStatus = weeklyClass.status === "ativo" ? "inativo" : "ativo";
    const updatedRecord = buildWeeklyClassRecord({ ...weeklyClass, status: nextStatus }, rawRecord);
    saveWithLog(
      updateRecord("schedule", weeklyClass.id, () => updatedRecord),
      "weekly-class-status-updated",
      "",
      `${weeklyClass.title} marcada como ${nextStatus}.`
    );
    return;
  }

  if (button.dataset.deleteWeekly && window.confirm(`Excluir ${weeklyClass.title} da grade semanal?`)) {
    const nextState = Store.clone(panelState);
    nextState.schedule = nextState.schedule.filter((item) => item.id !== weeklyClass.id);
    saveWithLog(nextState, "weekly-class-deleted", "", `${weeklyClass.title} removida da grade semanal.`);
    if (weeklyScheduleForm.elements.id.value === weeklyClass.id) {
      resetWeeklyScheduleForm();
    }
  }
}

function renderTodayAgendaSummary() {
  const todayItems = panelState.schedule.filter((item) => item.date === Store.todayISO());
  const weeklyToday = getWeeklyClasses().filter((item) => item.status === "ativo" && item.dayOfWeek === new Date().getDay());
  const completed = todayItems.filter((item) => item.status === "realizada").length;
  const scheduled = todayItems.filter((item) => ["marcada", "remarcada"].includes(item.status)).length + weeklyToday.length;
  const online = todayItems.filter((item) => item.type === "online").length;
  const inPerson = todayItems.filter((item) => item.type !== "online").length + weeklyToday.length;
  const totalActivities = todayItems.length + weeklyToday.length;

  document.getElementById("todayAgendaSummary").innerHTML = `
    <div class="agenda-total">
      <strong>${totalActivities}</strong>
      <span>${totalActivities === 1 ? "atividade prevista" : "atividades previstas"}</span>
    </div>
    <div class="agenda-stat-grid">
      <div><span class="agenda-dot scheduled"></span><strong>${scheduled}</strong><small>Agendadas</small></div>
      <div><span class="agenda-dot completed"></span><strong>${completed}</strong><small>Realizadas</small></div>
      <div><span class="agenda-dot in-person"></span><strong>${inPerson}</strong><small>Presenciais</small></div>
      <div><span class="agenda-dot online"></span><strong>${online}</strong><small>Online</small></div>
    </div>
  `;
}

function getDaysUntilBirthday(birthDate) {
  if (!birthDate) return null;
  const [, month, day] = String(birthDate).split("-").map(Number);
  if (!month || !day) return null;
  const today = new Date(`${Store.todayISO()}T12:00:00`);
  let next = new Date(today.getFullYear(), month - 1, day, 12);
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day, 12);
  return Math.round((next - today) / 86400000);
}

function renderAdminDailyGrid() {
  const birthdays7 = panelState.students.filter((student) => {
    const days = getDaysUntilBirthday(student.birthDate);
    return days !== null && days <= 7;
  }).length;
  const pendingEnrollment = panelState.students.filter((student) => student.enrollmentStatus !== "ativo").length;
  const incompleteRecords = panelState.students.filter((student) => !student.phone || !student.plan || safeNumber(student.monthlyFee) <= 0).length;
  const overdueExpenses = panelState.expenses.filter((expense) => getEffectiveExpenseStatus(expense) === "vencido").length;
  const cards = [
    ["Aniversarios", birthdays7, "Proximos 7 dias"],
    ["Matriculas pendentes", pendingEnrollment, "Aguardando ativacao"],
    ["Cadastros incompletos", incompleteRecords, "Telefone, plano ou valor"],
    ["Despesas vencidas", overdueExpenses, "Exigem conferencia"]
  ];
  document.getElementById("adminDailyGrid").innerHTML = cards.map(([label, value, note]) => `
    <article class="admin-daily-card"><span>${escapeHtml(label)}</span><strong>${value}</strong><small>${escapeHtml(note)}</small></article>
  `).join("");
}

function renderGlobalStudentOptions() {
  globalStudentSearchList.innerHTML = panelState.students.map((student) => `
    <option value="${escapeHtml(student.name)}">${escapeHtml(student.phone || student.plan || student.id)}</option>
  `).join("");
}

function openGlobalStudentSearch() {
  const query = globalStudentSearch.value.trim();
  if (!query) return;
  const normalized = query.toLocaleLowerCase("pt-BR");
  const digits = query.replace(/\D/g, "");
  const student = panelState.students.find((item) => {
    const searchable = `${item.name} ${item.email} ${item.phone} ${item.plan} ${item.id}`.toLocaleLowerCase("pt-BR");
    return searchable.includes(normalized) || (digits && String(item.phone || "").replace(/\D/g, "").includes(digits));
  });
  if (!student) {
    globalStudentSearch.setCustomValidity("Aluno nao encontrado.");
    globalStudentSearch.reportValidity();
    return;
  }
  globalStudentSearch.setCustomValidity("");
  selectedStudentId = student.id;
  studentSearchTerm = student.name;
  studentSearchFilter.value = student.name;
  activePanelTab = "ficha";
  setActiveMainSection("operation");
}

function renderOverview() {
  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(new Date(`${Store.todayISO()}T12:00:00`));
  document.getElementById("overviewDate").textContent = formattedDate;
  renderOverviewMetrics();
  renderAttendanceChart();
  renderEnrollmentChart();
  renderStudentMix();
  renderTodayAgendaSummary();
  renderAdminDailyGrid();
  renderWeeklyOverview();
  renderGlobalStudentOptions();
}

function getStudentPaymentSummary(studentId) {
  const payment = Store.getCurrentPayment(panelState, studentId);
  if (!payment) {
    return { status: "neutral", label: "Sem mensalidade", payment: null };
  }

  const status = getEffectivePaymentStatus(payment);
  const labels = {
    pago: "Mensalidade paga",
    pendente: "Mensalidade pendente",
    vencido: "Mensalidade vencida"
  };

  return {
    status: status,
    label: labels[status] || "Verificar mensalidade",
    payment: payment
  };
}

function getPresenceTimestamp(checkin) {
  const explicitTimestamp = checkin.checkedInAt || checkin.entryAt || "";
  if (explicitTimestamp) {
    return explicitTimestamp;
  }
  const date = getCheckinDate(checkin);
  if (!date) {
    return "";
  }
  return `${date}T${Store.formatTime(checkin.time || "00:00")}:00`;
}

function formatPresenceRecord(checkin) {
  if (!checkin) {
    return "Nenhuma";
  }
  const explicitTimestamp = checkin.checkedInAt || checkin.entryAt || "";
  if (explicitTimestamp) {
    return Store.formatDateTime(explicitTimestamp);
  }
  const date = getCheckinDate(checkin);
  return `${Store.formatDate(date)} ${Store.formatTime(checkin.time)}`.trim();
}

function getStudentPresenceStats(studentId) {
  const entries = panelState.checkins
    .filter((checkin) => checkin.studentId === studentId && isAccessCheckin(checkin))
    .sort((left, right) => String(getPresenceTimestamp(left)).localeCompare(String(getPresenceTimestamp(right))));

  return {
    count: entries.length,
    first: entries[0] || null,
    last: entries[entries.length - 1] || null
  };
}

function getOpenAccessCheckin(studentId) {
  return panelState.checkins
    .filter((checkin) => checkin.studentId === studentId && isAccessCheckin(checkin))
    .sort((left, right) => String(getPresenceTimestamp(right)).localeCompare(String(getPresenceTimestamp(left))))
    .find((checkin) => !checkin.checkedOutAt && !checkin.exitAt && checkin.presenceStatus !== "outside") || null;
}

function renderStudentHeader(student) {
  const access = Store.getAccessState(panelState, student.id);
  const paymentSummary = getStudentPaymentSummary(student.id);
  const presence = getStudentPresenceStats(student.id);

  workspaceTitle.textContent = student.name;
  document.getElementById("studentHeaderBadges").innerHTML = [
    badge(student.status || "inativo", student.status || "inativo"),
    badge(paymentSummary.status, paymentSummary.label),
    badge(access.status, getOperationalAccessLabel(access))
  ].join("");

  document.getElementById("studentHeaderMeta").innerHTML = `
    <span><strong>Plano</strong>${escapeHtml(student.plan || "Não informado")}</span>
    <span><strong>Telefone</strong>${escapeHtml(student.phone || "Não informado")}</span>
  `;

  document.getElementById("studentPresenceSummary").innerHTML = `
    <article><span>Última presença</span><strong>${escapeHtml(formatPresenceRecord(presence.last))}</strong></article>
    <article><span>Total de presenças</span><strong>${presence.count}</strong></article>
    <article><span>Primeira presença</span><strong>${escapeHtml(formatPresenceRecord(presence.first))}</strong></article>
  `;
}

function renderAdminStudentSummary(student) {
  const access = Store.getAccessState(panelState, student.id);
  const workouts = Store.getStudentWorkouts(panelState, student.id);
  const activeWorkouts = workouts.filter((item) => item.status === "ativo");
  const assessments = getStudentRecords("assessments", student.id).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const schedule = Store.getStudentSchedule(panelState, student.id);
  const upcoming = schedule
    .filter((item) => item.date >= Store.todayISO() && !["realizada", "falta", "cancelada"].includes(item.status))
    .sort((a, b) => `${a.date}${Store.formatTime(a.time)}`.localeCompare(`${b.date}${Store.formatTime(b.time)}`))[0] || null;
  const presence = getStudentPresenceStats(student.id);

  document.getElementById("adminStudentSummary").innerHTML = `
    <article><span>Nome</span><strong>${escapeHtml(student.name || "-")}</strong></article>
    <article><span>Telefone</span><strong>${escapeHtml(student.phone || "-")}</strong></article>
    <article><span>E-mail</span><strong>${escapeHtml(student.email || "-")}</strong></article>
    <article><span>Plano</span><strong>${escapeHtml(student.plan || "-")}</strong></article>
    <article><span>Status</span><strong>${escapeHtml(student.status || "-")}</strong></article>
    <article><span>Acesso</span><strong>${escapeHtml(access.allowsGate ? "OK" : "Bloqueado")}</strong></article>
  `;

  document.getElementById("adminOperationalStats").innerHTML = `
    <article><span>Treinos ativos</span><strong>${activeWorkouts.length}</strong></article>
    <article><span>Avaliações</span><strong>${assessments.length}${assessments[0] ? ` · ${escapeHtml(Store.formatDate(assessments[0].date))}` : ""}</strong></article>
    <article><span>Próximo agendamento</span><strong>${upcoming ? `${escapeHtml(Store.formatDate(upcoming.date))} ${escapeHtml(Store.formatTime(upcoming.time))}` : "Nenhum"}</strong></article>
    <article><span>Presenças</span><strong>${presence.count}</strong></article>
  `;
}

function renderAdminPresence(student) {
  const access = Store.getAccessState(panelState, student.id);
  const presence = getStudentPresenceStats(student.id);
  const entries = panelState.checkins
    .filter((checkin) => checkin.studentId === student.id && isAccessCheckin(checkin))
    .sort((a, b) => String(getPresenceTimestamp(b)).localeCompare(String(getPresenceTimestamp(a))));
  const openPresence = getOpenAccessCheckin(student.id);

  document.getElementById("adminPresenceStats").innerHTML = `
    <article><span>Acesso atual</span><strong>${access.allowsGate ? "OK" : "Bloqueado"}</strong></article>
    <article><span>Presença agora</span><strong>${openPresence ? "Dentro da academia" : "Fora da academia"}</strong></article>
    <article><span>Total de entradas</span><strong>${presence.count}</strong></article>
    <article><span>Última entrada</span><strong>${escapeHtml(formatPresenceRecord(presence.last))}</strong></article>
  `;

  document.getElementById("adminPresenceHistory").innerHTML = entries.length
    ? entries.slice(0, 12).map((item) => {
        const entry = item.checkedInAt || item.entryAt || getPresenceTimestamp(item);
        const exit = item.checkedOutAt || item.exitAt || "";
        return `
          <article class="record-item admin-readonly-record">
            <div class="record-copy">
              <strong>${escapeHtml(entry ? Store.formatDateTime(entry) : "Entrada não informada")}</strong>
              <p>Saída: ${escapeHtml(exit ? Store.formatDateTime(exit) : "Ainda presente")}</p>
            </div>
            ${badge(exit ? "inativo" : "ativo", exit ? "finalizada" : "presente")}
          </article>
        `;
      }).join("")
    : '<div class="empty-state">Nenhuma presença registrada.</div>';
}


function renderRoster() {
  const list = document.getElementById("studentRoster");
  const students = getFilteredStudents();
  const rosterCount = document.getElementById("studentRosterCount");
  if (rosterCount) {
    rosterCount.textContent = `${students.length} ${students.length === 1 ? "aluno" : "alunos"}`;
  }

  if (!students.length) {
    list.innerHTML = `<div class="empty-state">Nenhum aluno encontrado.</div>`;
    return;
  }

  list.innerHTML = students
    .map((student) => {
      const access = Store.getAccessState(panelState, student.id);
      const paymentSummary = getStudentPaymentSummary(student.id);
      const isSelected = student.id === selectedStudentId;
      return `
        <article
          class="roster-item ${isSelected ? "selected" : ""}"
          data-select-student="${escapeHtml(student.id)}"
          role="button"
          tabindex="0"
          aria-pressed="${isSelected ? "true" : "false"}"
        >
          <div class="roster-main-copy">
            <strong class="roster-name">${escapeHtml(student.name)}</strong>
            <span class="roster-plan">${escapeHtml(student.plan || "Plano nao informado")}</span>
          </div>
          <div class="roster-status-row">
            ${badge(paymentSummary.status, paymentSummary.label)}
            ${badge(access.status, getOperationalAccessLabel(access))}
          </div>
        </article>
      `;
    })
    .join("");
}

function populateStudentForm(student) {
  if (!student) {
    studentForm.reset();
    studentForm.elements.id.value = "";
    studentForm.elements.enrollmentStatus.value = "pendente";
    studentForm.elements.appAccessPolicy.value = "auto";
    return;
  }

  Object.entries(student).forEach(([key, value]) => {
    if (studentForm.elements[key]) {
      studentForm.elements[key].value = value ?? "";
    }
  });
}

function getDefaultPaymentRecorder() {
  return panelState.users?.find((user) => user.status !== "inativo")?.name || "Equipe Pro Fitness";
}

function populatePaymentForm(student, payment) {
  const record = payment || null;
  paymentForm.reset();
  paymentForm.dataset.paidAmountTouched = "0";
  renderFinanceStudentOptions();
  paymentForm.elements.studentId.value = record ? record.studentId : student ? student.id : "";
  paymentForm.elements.reference.value = record ? record.reference : Store.currentMonth();
  paymentForm.elements.amount.value = record ? record.amount : student ? student.monthlyFee : "";
  paymentForm.elements.discount.value = record ? record.discount || 0 : 0;
  paymentForm.elements.fine.value = record ? record.fine || 0 : 0;
  paymentForm.elements.dueDate.value = record ? record.dueDate : Store.todayISO();
  paymentForm.elements.status.value = record ? record.status : "pendente";
  paymentForm.elements.method.value = record ? record.method : "pix";
  paymentForm.elements.paidAt.value = record ? record.paidAt || "" : "";
  paymentForm.elements.paidAmount.value = record && ["pago", "parcial"].includes(getEffectivePaymentStatus(record))
    ? safeNumber(record.paidAmount ?? record.netAmount)
    : 0;
  paymentForm.elements.recordedBy.value = record ? record.recordedBy || getDefaultPaymentRecorder() : getDefaultPaymentRecorder();
  paymentForm.elements.notes.value = record ? record.notes || "" : "";
  paymentForm.elements.id.value = record?.id || "";
  updatePaymentNetPreview();
}

function updatePaymentNetPreview() {
  const amount = safeNumber(paymentForm.elements.amount.value);
  const discount = safeNumber(paymentForm.elements.discount.value);
  const fine = safeNumber(paymentForm.elements.fine.value);
  const netAmount = Math.max(0, amount - discount + fine);
  document.getElementById("paymentNetPreview").textContent = Store.currency(netAmount);
  if (paymentForm.elements.status.value === "pago" && paymentForm.dataset.paidAmountTouched !== "1") {
    paymentForm.elements.paidAmount.value = netAmount.toFixed(2);
  }
  return netAmount;
}

function openPaymentDialog() {
  if (!paymentDialog.open) {
    paymentDialog.showModal();
  }
}

function closePaymentDialog() {
  if (paymentDialog.open) {
    paymentDialog.close();
  }
}

function getReceiptNumber(payment) {
  return String(payment?.id || "RECIBO").replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
}

function renderPaymentReceipt(payment) {
  const student = Store.findStudent(panelState, payment.studentId);
  if (!student || getEffectivePaymentStatus(payment) !== "pago") {
    return false;
  }

  const calculatedAmount = getPaymentNetAmount(payment);
  const paidAmount = getPaymentPaidAmount(payment);
  document.getElementById("receiptNumber").textContent = `Nº ${getReceiptNumber(payment)}`;
  document.getElementById("receiptStudent").innerHTML = `
    <div><span>Aluno</span><strong>${escapeHtml(student.name)}</strong></div>
    <div><span>Plano</span><strong>${escapeHtml(student.plan || "Nao informado")}</strong></div>
    <div><span>Telefone</span><strong>${escapeHtml(student.phone || "Nao informado")}</strong></div>
  `;
  document.getElementById("receiptDetails").innerHTML = `
    <div><span>Competencia</span><strong>${escapeHtml(formatPaymentReference(payment.reference))}</strong></div>
    <div><span>Vencimento</span><strong>${escapeHtml(Store.formatDate(payment.dueDate))}</strong></div>
    <div><span>Data do pagamento</span><strong>${escapeHtml(Store.formatDate(payment.paidAt))}</strong></div>
    <div><span>Forma de pagamento</span><strong>${escapeHtml(FINANCE_METHOD_LABELS[payment.method] || payment.method || "Nao informada")}</strong></div>
    <div><span>Valor previsto</span><strong>${escapeHtml(Store.currency(payment.amount))}</strong></div>
    <div><span>Desconto</span><strong>${escapeHtml(Store.currency(payment.discount))}</strong></div>
    <div><span>Multa/acrescimo</span><strong>${escapeHtml(Store.currency(payment.fine))}</strong></div>
    <div><span>Valor calculado</span><strong>${escapeHtml(Store.currency(calculatedAmount))}</strong></div>
    <div><span>Responsavel</span><strong>${escapeHtml(payment.recordedBy || "Equipe Pro Fitness")}</strong></div>
    <div><span>Status</span><strong>Pago</strong></div>
  `;
  document.getElementById("receiptPaidAmount").textContent = Store.currency(paidAmount);
  const note = document.getElementById("receiptNote");
  note.hidden = !payment.notes;
  note.innerHTML = payment.notes ? `<strong>Observacao:</strong> ${escapeText(payment.notes)}` : "";
  document.getElementById("receiptIssuedAt").textContent = `Emitido em ${Store.formatDateTime(new Date().toISOString())}`;
  return true;
}

function openPaymentReceipt(paymentId) {
  const payment = findRecord("payments", paymentId);
  if (!payment || !renderPaymentReceipt(payment)) {
    window.alert("O comprovante esta disponivel apenas para mensalidades pagas.");
    return;
  }
  receiptDialog.dataset.paymentId = payment.id;
  if (!receiptDialog.open) {
    receiptDialog.showModal();
  }
}

function closePaymentReceipt() {
  if (receiptDialog.open) {
    receiptDialog.close();
  }
}

function printPaymentReceipt() {
  document.body.classList.add("printing-payment-receipt");
  window.print();
}

function getLatestStudentPayment(studentId) {
  return Store.getStudentPayments(panelState, studentId)[0] || null;
}

function getSuggestedPaymentDueDate(studentId, reference, existingPayment) {
  if (existingPayment?.dueDate) {
    return existingPayment.dueDate;
  }

  const latestPayment = getLatestStudentPayment(studentId);
  const sourceDay = Number(String(latestPayment?.dueDate || "").slice(8, 10)) || 10;
  const [year, month] = String(reference || Store.currentMonth()).split("-").map(Number);
  if (!year || !month) {
    return Store.todayISO();
  }

  const lastDay = new Date(year, month, 0).getDate();
  const dueDay = String(Math.min(sourceDay, lastDay)).padStart(2, "0");
  return `${year}-${String(month).padStart(2, "0")}-${dueDay}`;
}

function setPaymentEditorMode(student, payment, mode, originalStatus) {
  const editor = paymentDialog;
  const title = document.getElementById("paymentEditorTitle");
  const context = document.getElementById("paymentEditorContext");
  const submitButton = document.getElementById("paymentSubmitButton");
  const receiptButton = document.getElementById("paymentReceiptButton");
  const statusLabels = {
    pago: "Paga",
    pendente: "Pendente",
    vencido: "Vencida",
    inexistente: "Ainda nao gerada"
  };

  editor.classList.toggle("payment-receive-mode", mode === "receive");
  paymentForm.dataset.editorMode = mode;

  if (!student) {
    title.textContent = "Mensalidade";
    receiptButton.hidden = true;
    receiptButton.dataset.paymentId = "";
    context.hidden = true;
    context.innerHTML = "";
    submitButton.textContent = "Salvar mensalidade";
    return;
  }

  const effectiveStatus = originalStatus || (payment?.id ? getEffectivePaymentStatus(payment) : "inexistente");
  const canPrintReceipt = Boolean(payment?.id && effectiveStatus === "pago");
  receiptButton.hidden = !canPrintReceipt;
  receiptButton.dataset.paymentId = canPrintReceipt ? payment.id : "";
  const reference = payment?.reference || Store.currentMonth();
  const dueDate = payment?.dueDate || getSuggestedPaymentDueDate(student.id, reference, payment);

  if (mode === "receive") {
    title.textContent = "Receber mensalidade";
    submitButton.textContent = effectiveStatus === "pago" ? "Atualizar recebimento" : "Confirmar recebimento";
  } else if (mode === "edit") {
    title.textContent = "Editar mensalidade";
    submitButton.textContent = "Salvar alteracoes";
  } else {
    title.textContent = "Nova mensalidade";
    submitButton.textContent = "Salvar mensalidade";
  }

  context.hidden = false;
  context.innerHTML = `
    <strong>${escapeHtml(student.name)}</strong>
    <span>${escapeHtml(student.plan || "Plano nao informado")}</span>
    <span>Competencia: ${escapeHtml(reference)}</span>
    <span>Vencimento: ${escapeHtml(Store.formatDate(dueDate))}</span>
    <span>Situacao atual: ${escapeHtml(statusLabels[effectiveStatus] || effectiveStatus)}</span>
  `;
}

function openStudentPaymentFlow(student, requestedReference) {
  if (!student) {
    return;
  }

  const reference = requestedReference || financeMonthFilter.value || Store.currentMonth();
  const currentPayment = getStudentRecords("payments", student.id)
    .find((payment) => payment.reference === reference) || null;
  const latestPayment = getLatestStudentPayment(student.id);
  const originalStatus = currentPayment ? getEffectivePaymentStatus(currentPayment) : "inexistente";
  const amount = safeNumber(student.monthlyFee || currentPayment?.amount || latestPayment?.amount || 0);
  const paymentDraft = {
    ...currentPayment,
    studentId: student.id,
    reference: reference,
    amount: amount,
    discount: currentPayment?.discount || 0,
    fine: currentPayment?.fine || 0,
    dueDate: getSuggestedPaymentDueDate(student.id, reference, currentPayment),
    status: "pago",
    method: currentPayment?.method || latestPayment?.method || "pix",
    paidAt: currentPayment?.paidAt || Store.todayISO(),
    notes: currentPayment?.notes || ""
  };

  activeFinanceTab = "payments";
  financeMonthFilter.value = reference;
  financeStatusFilter.value = "todos";
  financeSearchFilter.value = student.name;
  if (financeQuickStudentSearch) {
    financeQuickStudentSearch.value = getFinanceQuickStudentLabel(student);
  }
  setActiveMainSection("finance");
  populatePaymentForm(student, paymentDraft);
  setPaymentEditorMode(student, paymentDraft, "receive", originalStatus);
  financeHistoryStudentId = student.id;
  renderFinancePaymentList();
  renderFinanceStudentHistory(student.id);
  openPaymentDialog();

  window.requestAnimationFrame(() => {
    paymentForm.elements.method.focus({ preventScroll: true });
  });
}

function getFinanceQuickStudentLabel(student) {
  const phone = String(student.phone || "").trim();
  return phone ? `${student.name} · ${phone}` : student.name;
}

function renderFinanceQuickStudentOptions() {
  if (!financeQuickStudentList) {
    return;
  }
  financeQuickStudentList.innerHTML = panelState.students
    .slice()
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "pt-BR"))
    .map((student) => {
      const detail = [student.plan, student.phone].filter(Boolean).join(" · ");
      return `<option value="${escapeHtml(getFinanceQuickStudentLabel(student))}">${escapeHtml(detail)}</option>`;
    })
    .join("");
}

function findFinanceQuickStudent(queryValue) {
  const rawQuery = String(queryValue || "").trim();
  if (!rawQuery) {
    return selectedStudentId ? Store.findStudent(panelState, selectedStudentId) : null;
  }

  const query = rawQuery.toLocaleLowerCase("pt-BR");
  const digits = rawQuery.replace(/\D/g, "");
  const students = panelState.students;
  const exactMatch = students.find((student) => {
    const fields = [
      getFinanceQuickStudentLabel(student),
      student.name,
      student.phone,
      student.email,
      student.id,
      student.enrollmentToken,
      student.gateCode
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().toLocaleLowerCase("pt-BR"));
    const phoneDigits = String(student.phone || "").replace(/\D/g, "");
    return fields.includes(query) || (digits && phoneDigits === digits);
  });
  if (exactMatch) {
    return exactMatch;
  }

  const partialMatches = students.filter((student) => {
    const searchable = [
      student.name,
      student.phone,
      student.email,
      student.id,
      student.enrollmentToken,
      student.gateCode,
      student.plan
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("pt-BR");
    return searchable.includes(query) || (digits && String(student.phone || "").replace(/\D/g, "").includes(digits));
  });

  return partialMatches.length === 1 ? partialMatches[0] : null;
}

function receivePaymentFromFinanceBar() {
  const student = findFinanceQuickStudent(financeQuickStudentSearch?.value);
  if (!student) {
    financeQuickStudentSearch?.setCustomValidity("Selecione um aluno da lista ou digite nome, telefone ou codigo completo.");
    financeQuickStudentSearch?.reportValidity();
    financeQuickStudentSearch?.focus();
    return;
  }

  financeQuickStudentSearch.setCustomValidity("");
  financeQuickStudentSearch.value = getFinanceQuickStudentLabel(student);
  selectedStudentId = student.id;
  openStudentPaymentFlow(student, financeMonthFilter.value || Store.currentMonth());
}

function renderFinanceStudentOptions() {
  renderFinanceQuickStudentOptions();
  const select = paymentForm.elements.studentId;
  const currentValue = select.value;
  select.innerHTML = panelState.students.length
    ? panelState.students
        .map((student) => `<option value="${escapeHtml(student.id)}">${escapeHtml(student.name)}</option>`)
        .join("")
    : `<option value="">Nenhum aluno cadastrado</option>`;

  if (panelState.students.some((student) => student.id === currentValue)) {
    select.value = currentValue;
  } else if (selectedStudentId && panelState.students.some((student) => student.id === selectedStudentId)) {
    select.value = selectedStudentId;
  }
}

function populateWorkoutForm(student, workout) {
  workoutForm.reset();
  workoutForm.elements.studentId.value = student ? student.id : "";
  workoutForm.elements.id.value = workout ? workout.id : "";
  workoutForm.elements.title.value = workout ? workout.title || "" : "";
  workoutForm.elements.division.value = workout ? workout.division || "A" : "A";
  workoutForm.elements.muscleGroup.value = workout ? workout.muscleGroup || "" : "";
  workoutForm.elements.status.value = workout ? workout.status || "ativo" : "ativo";
  const exerciseItems = workout ? getWorkoutExerciseItems(workout) : [];
  workoutForm.elements.exercises.value = exerciseItems.map((item) => item.name).join("\n");
  workoutForm.elements.sets.value = workout ? summarizeWorkoutExerciseField(exerciseItems, "sets") || workout.sets || "" : "";
  workoutForm.elements.reps.value = workout ? summarizeWorkoutExerciseField(exerciseItems, "reps") || workout.reps || "" : "";
  workoutForm.elements.load.value = workout ? summarizeWorkoutExerciseField(exerciseItems, "load") || workout.load || "" : "";
  workoutForm.elements.rest.value = workout ? summarizeWorkoutExerciseField(exerciseItems, "rest") || workout.rest || "" : "";
  workoutForm.elements.notes.value = workout ? workout.notes || "" : "";
}

function populateAssessmentForm(student, assessment) {
  assessmentForm.reset();
  assessmentForm.elements.studentId.value = student ? student.id : "";
  assessmentForm.elements.id.value = assessment ? assessment.id : "";
  assessmentForm.elements.date.value = assessment ? assessment.date || "" : Store.todayISO();

  ["weight", "height", "imc", "bodyFat", "chest", "waist", "hip", "arm", "thigh"].forEach((field) => {
    assessmentForm.elements[field].value = assessment && assessment[field] !== undefined ? assessment[field] : "";
  });

  assessmentForm.elements.photos.value = assessment ? getPhotos(assessment).join(", ") : "";
  assessmentForm.elements.notes.value = assessment ? assessment.notes || "" : "";
  updateImcPreview();
}

function populateScheduleForm(student, scheduleItem) {
  scheduleForm.reset();
  scheduleForm.elements.studentId.value = student ? student.id : "";
  scheduleForm.elements.id.value = scheduleItem ? scheduleItem.id : "";
  scheduleForm.elements.date.value = scheduleItem ? scheduleItem.date || "" : Store.todayISO();
  scheduleForm.elements.time.value = scheduleItem ? scheduleItem.time || "" : "08:00";
  scheduleForm.elements.type.value = scheduleItem ? scheduleItem.type || "presencial" : "presencial";
  scheduleForm.elements.status.value = scheduleItem ? scheduleItem.status || "marcada" : "marcada";
  scheduleForm.elements.notes.value = scheduleItem ? scheduleItem.notes || "" : "";
}

function getExercises(workout) {
  if (Array.isArray(workout.exercises)) {
    return workout.exercises.filter(Boolean);
  }

  return String(workout.exercises || "")
    .split(/[\n,]/)
    .map((exercise) => exercise.trim())
    .filter(Boolean);
}

function getWorkoutExerciseItems(workout) {
  if (!workout) {
    return [];
  }
  if (Array.isArray(workout.exerciseItems) && workout.exerciseItems.length) {
    return workout.exerciseItems
      .map((item, index) => ({
        id: item.id || `${workout.id || "TR"}-EX-${index + 1}`,
        exerciseId: item.exerciseId || "",
        name: String(item.name || item.exercise || "").trim(),
        sets: String(item.sets || "").trim(),
        reps: String(item.reps || "").trim(),
        load: String(item.load || "").trim(),
        rest: String(item.rest || "").trim(),
        notes: String(item.notes || "").trim()
      }))
      .filter((item) => item.name);
  }
  return getExercises(workout).map((name, index) => ({
    id: `${workout.id || "TR"}-EX-${index + 1}`,
    exerciseId: "",
    name,
    sets: workout.sets || "",
    reps: workout.reps || "",
    load: workout.load || "",
    rest: workout.rest || "",
    notes: ""
  }));
}

function summarizeWorkoutExerciseField(items, field) {
  const values = [...new Set(items.map((item) => String(item[field] || "").trim()).filter(Boolean))];
  return values.length === 1 ? values[0] : values.length > 1 ? "Variado" : "";
}

function getPhotos(assessment) {
  if (Array.isArray(assessment.photos)) {
    return assessment.photos.filter(Boolean);
  }

  return String(assessment.photos || "")
    .split(/[\n,]/)
    .map((photo) => photo.trim())
    .filter(Boolean);
}

function renderTimeline(student) {
  const events = [];

  getStudentRecords("schedule", student.id).forEach((item) => {
    events.push({
      date: `${item.date || ""}T${item.time || "00:00"}`,
      title: "Agenda",
      detail: `${Store.formatDate(item.date)} ${Store.formatTime(item.time)} · ${item.status}`,
      status: item.status
    });
  });

  getStudentRecords("checkins", student.id).filter((item) => !isAccessCheckin(item)).forEach((item) => {
    events.push({
      date: `${item.date || ""}T00:00`,
      title: "Treino acompanhado",
      detail: `Registro realizado em ${Store.formatDate(item.date)} pelo professor.`,
      status: "ativo"
    });
  });

  getStudentRecords("assessments", student.id).forEach((item) => {
    events.push({
      date: `${item.date || ""}T00:00`,
      title: "Avaliação física",
      detail: `Avaliação registrada em ${Store.formatDate(item.date)}.`,
      status: "ativo"
    });
  });

  const items = events.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
  document.getElementById("studentTimeline").innerHTML = items.length
    ? items.map((item) => `
        <article class="timeline-item">
          <div class="meta-row"><strong>${escapeHtml(item.title)}</strong>${badge(item.status, item.status)}</div>
          <p>${escapeHtml(item.detail)}</p>
        </article>
      `).join("")
    : '<div class="empty-state">Sem eventos para este aluno.</div>';
}

function renderWorkouts(student) {
  const workouts = Store.getStudentWorkouts(panelState, student.id).sort((left, right) => {
    if (left.status !== right.status) return left.status === "ativo" ? -1 : 1;
    return String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || ""));
  });
  const active = workouts.filter((item) => item.status === "ativo").length;
  const totalExercises = workouts.reduce((sum, item) => sum + getWorkoutExerciseItems(item).length, 0);
  const latest = workouts[0] || null;

  document.getElementById("adminWorkoutStats").innerHTML = `
    <article><span>Total de treinos</span><strong>${workouts.length}</strong></article>
    <article><span>Treinos ativos</span><strong>${active}</strong></article>
    <article><span>Exercícios cadastrados</span><strong>${totalExercises}</strong></article>
    <article><span>Última atualização</span><strong>${latest ? escapeHtml(Store.formatDate(latest.updatedAt || latest.createdAt)) : "Nenhuma"}</strong></article>
  `;

  document.getElementById("workoutList").innerHTML = workouts.length
    ? workouts.map((workout) => {
        const exerciseCount = getWorkoutExerciseItems(workout).length;
        return `
          <article class="record-item admin-readonly-record">
            <div class="record-copy">
              <div class="record-head"><div><p class="eyebrow">Divisão ${escapeHtml(workout.division || "-")}</p><h4>${escapeHtml(workout.title || "Treino sem nome")}</h4></div></div>
              <p>${escapeHtml(workout.muscleGroup || "Grupo muscular não informado")} · ${exerciseCount} exercício(s)</p>
              <small>Atualizado em ${escapeHtml(Store.formatDate(workout.updatedAt || workout.createdAt))}</small>
            </div>
            ${badge(workout.status || "ativo", workout.status || "ativo")}
          </article>
        `;
      }).join("")
    : '<div class="empty-state">Nenhum treino registrado pelo professor.</div>';
}

function renderAssessmentEvolution(assessments) {
  const chart = document.getElementById("assessmentEvolution");
  const ordered = [...assessments].sort((left, right) => String(left.date).localeCompare(String(right.date)));

  if (!ordered.length) {
    chart.innerHTML = `<div class="empty-state">Cadastre avaliacoes para acompanhar a evolucao.</div>`;
    return;
  }

  const weights = ordered.map((item) => safeNumber(item.weight));
  const minimum = Math.min(...weights);
  const maximum = Math.max(...weights);
  const difference = maximum - minimum || 1;

  chart.innerHTML = ordered
    .map((assessment) => {
      const size = 26 + ((safeNumber(assessment.weight) - minimum) / difference) * 74;
      return `
        <div class="evolution-column" title="${escapeHtml(Store.formatDate(assessment.date))}: ${formatNumber(assessment.weight, 1)} kg">
          <strong>${formatNumber(assessment.weight, 1)}</strong>
          <div class="evolution-bar" style="--bar-size: ${size.toFixed(2)}%"></div>
          <span>${escapeHtml(Store.formatDate(assessment.date).slice(0, 5))}</span>
        </div>
      `;
    })
    .join("");
}

function renderAssessments(student) {
  const assessments = getStudentRecords("assessments", student.id).sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
  const latest = assessments[0] || null;
  const previous = assessments[1] || null;
  const intervalDays = latest && previous
    ? Math.max(0, Math.round((new Date(`${latest.date}T12:00:00`) - new Date(`${previous.date}T12:00:00`)) / 86400000))
    : 0;

  document.getElementById("assessmentEvolution").innerHTML = "";
  document.getElementById("adminAssessmentStats").innerHTML = `
    <article><span>Total de avaliações</span><strong>${assessments.length}</strong></article>
    <article><span>Última avaliação</span><strong>${latest ? escapeHtml(Store.formatDate(latest.date)) : "Nenhuma"}</strong></article>
    <article><span>Avaliação anterior</span><strong>${previous ? escapeHtml(Store.formatDate(previous.date)) : "Nenhuma"}</strong></article>
    <article><span>Intervalo recente</span><strong>${intervalDays ? `${intervalDays} dias` : "-"}</strong></article>
  `;

  document.getElementById("assessmentList").innerHTML = assessments.length
    ? assessments.map((assessment, index) => `
        <article class="record-item admin-readonly-record">
          <div class="record-copy">
            <strong>${escapeHtml(Store.formatDate(assessment.date))}</strong>
            <p>${index === 0 ? "Avaliação mais recente" : "Avaliação registrada pelo professor"}</p>
          </div>
          ${badge("ativo", "registrada")}
        </article>
      `).join("")
    : '<div class="empty-state">Nenhuma avaliação registrada pelo professor.</div>';
}

function renderSchedule(student) {
  const schedule = Store.getStudentSchedule(panelState, student.id);
  const today = Store.todayISO();
  const upcoming = schedule.filter((item) => item.date >= today && !["realizada", "falta", "cancelada"].includes(item.status));
  const completed = schedule.filter((item) => item.status === "realizada").length;
  const missed = schedule.filter((item) => item.status === "falta").length;
  const next = upcoming[0] || null;

  document.getElementById("adminScheduleStats").innerHTML = `
    <article><span>Total de agendamentos</span><strong>${schedule.length}</strong></article>
    <article><span>Próximos</span><strong>${upcoming.length}</strong></article>
    <article><span>Realizados</span><strong>${completed}</strong></article>
    <article><span>Próximo horário</span><strong>${next ? `${escapeHtml(Store.formatDate(next.date))} ${escapeHtml(Store.formatTime(next.time))}` : "Nenhum"}</strong></article>
  `;

  document.getElementById("scheduleList").innerHTML = schedule.length
    ? schedule.map((item) => `
        <article class="record-item admin-readonly-record">
          <div class="record-copy">
            <strong>${escapeHtml(Store.formatDate(item.date))} às ${escapeHtml(Store.formatTime(item.time))}</strong>
            <p>${escapeHtml(item.type || "presencial")}${item.notes ? ` · ${escapeHtml(item.notes)}` : ""}</p>
          </div>
          ${badge(item.status || "marcada", item.status || "marcada")}
        </article>
      `).join("")
    : '<div class="empty-state">Nenhum agendamento registrado pelo professor.</div>';
}

function getEffectivePaymentStatus(payment) {
  return Finance.effectivePaymentStatus(payment, Store.todayISO());
}

function getEffectiveExpenseStatus(expense) {
  if (expense.status === "pago") {
    return "pago";
  }
  if (expense.status === "vencido" || (expense.dueDate && expense.dueDate < Store.todayISO())) {
    return "vencido";
  }
  return "pendente";
}

function getPaymentNetAmount(payment) {
  return Finance.netAmount(payment);
}

function getPaymentPaidAmount(payment) {
  return Finance.paidAmount(payment);
}

function getPaymentOutstandingAmount(payment) {
  return Finance.outstandingAmount(payment);
}


function getStudentPaymentHistoryRecords(studentId) {
  return panelState.payments
    .filter((payment) => payment.studentId === studentId)
    .sort((left, right) => {
      const referenceDifference = String(right.reference || "").localeCompare(String(left.reference || ""));
      const paidDifference = String(right.paidAt || right.updatedAt || right.createdAt || "")
        .localeCompare(String(left.paidAt || left.updatedAt || left.createdAt || ""));
      return referenceDifference || paidDifference;
    });
}

function getPaymentStatusLabel(status) {
  return {
    pago: "Pago",
    parcial: "Parcial",
    pendente: "Pendente",
    vencido: "Vencido",
    cancelado: "Cancelado"
  }[status] || status || "Pendente";
}

function getStudentFinancialSummaryData(studentId) {
  const payments = getStudentPaymentHistoryRecords(studentId);
  const paid = payments.filter((payment) => getEffectivePaymentStatus(payment) === "pago");
  const overdue = payments.filter((payment) => getEffectivePaymentStatus(payment) === "vencido");
  const pending = payments.filter((payment) => getEffectivePaymentStatus(payment) === "pendente");
  const partial = payments.filter((payment) => getEffectivePaymentStatus(payment) === "parcial");
  const lastPaid = paid
    .slice()
    .sort((left, right) => String(right.paidAt || right.reference || "").localeCompare(String(left.paidAt || left.reference || "")))[0] || null;

  return {
    payments,
    totalPaid: sumFinance([...paid, ...partial], getPaymentPaidAmount),
    paidCount: paid.length + partial.length,
    openCount: pending.length + overdue.length + partial.length,
    overdueCount: overdue.length,
    overdueAmount: sumFinance(overdue, getPaymentNetAmount),
    lastPaid
  };
}

function buildStudentFinancialSummaryMarkup(summary) {
  const lastPaymentLabel = summary.lastPaid
    ? `${formatPaymentReference(summary.lastPaid.reference)} · ${Store.formatDate(summary.lastPaid.paidAt)}`
    : "Nenhum pagamento";
  return `
    <article><span>Total pago</span><strong>${escapeHtml(Store.currency(summary.totalPaid))}</strong></article>
    <article><span>Mensalidades pagas</span><strong>${summary.paidCount}</strong></article>
    <article><span>Em aberto</span><strong>${summary.openCount}</strong></article>
    <article class="${summary.overdueCount ? "danger" : ""}"><span>Vencidas</span><strong>${summary.overdueCount}</strong><small>${escapeHtml(Store.currency(summary.overdueAmount))}</small></article>
    <article class="summary-last-payment"><span>Ultimo pagamento</span><strong>${escapeHtml(lastPaymentLabel)}</strong></article>
  `;
}

function buildStudentPaymentHistoryMarkup(studentId, includeActions) {
  const payments = getStudentPaymentHistoryRecords(studentId);
  if (!payments.length) {
    return '<div class="empty-state">Nenhum pagamento registrado para este aluno.</div>';
  }

  return payments.map((payment) => {
    const status = getEffectivePaymentStatus(payment);
    const calculatedAmount = getPaymentNetAmount(payment);
    const paidAmount = getPaymentPaidAmount(payment);
    const actions = [];
    if (status === "pago") {
      actions.push(`<button class="ghost-button small-button" type="button" data-print-receipt="${escapeHtml(payment.id)}">Comprovante</button>`);
    }
    if (includeActions) {
      actions.push(`<button class="ghost-button small-button" type="button" data-edit-payment="${escapeHtml(payment.id)}">Ver / editar</button>`);
    }
    const action = actions.join("");
    return `
      <article class="student-payment-history-row payment-history-status-${escapeHtml(status)}">
        <div class="payment-history-title">
          <div>
            <strong>${escapeHtml(formatPaymentReference(payment.reference))}</strong>
            <span>Vencimento ${escapeHtml(Store.formatDate(payment.dueDate))}</span>
          </div>
          ${badge(status, getPaymentStatusLabel(status))}
        </div>
        <div class="payment-history-values">
          <div><span>Previsto</span><strong>${escapeHtml(Store.currency(payment.amount))}</strong></div>
          <div><span>Desconto</span><strong>${escapeHtml(Store.currency(payment.discount))}</strong></div>
          <div><span>Multa</span><strong>${escapeHtml(Store.currency(payment.fine))}</strong></div>
          <div><span>Valor final</span><strong>${escapeHtml(Store.currency(calculatedAmount))}</strong></div>
          <div><span>Valor pago</span><strong>${status === "pago" ? escapeHtml(Store.currency(paidAmount)) : "—"}</strong></div>
        </div>
        <div class="payment-history-details">
          <span><strong>Pagamento:</strong> ${status === "pago" ? escapeHtml(Store.formatDate(payment.paidAt)) : "—"}</span>
          <span><strong>Forma:</strong> ${status === "pago" ? escapeHtml(FINANCE_METHOD_LABELS[payment.method] || payment.method || "—") : "—"}</span>
          <span><strong>Responsavel:</strong> ${escapeHtml(payment.recordedBy || "Nao informado")}</span>
        </div>
        ${payment.notes ? `<p class="payment-history-note">${escapeText(payment.notes)}</p>` : ""}
        ${action ? `<div class="payment-history-actions">${action}</div>` : ""}
      </article>
    `;
  }).join("");
}

function renderStudentFinancialHistory(student) {
  const summaryTarget = document.getElementById("studentFinancialSummary");
  const historyTarget = document.getElementById("studentPaymentHistory");
  if (!summaryTarget || !historyTarget) {
    return;
  }
  const summary = getStudentFinancialSummaryData(student.id);
  summaryTarget.innerHTML = buildStudentFinancialSummaryMarkup(summary);
  historyTarget.innerHTML = buildStudentPaymentHistoryMarkup(student.id, false);
}

function renderFinanceStudentHistory(studentId) {
  const student = Store.findStudent(panelState, studentId);
  const title = document.getElementById("financeStudentHistoryTitle");
  const summaryTarget = document.getElementById("financeStudentHistorySummary");
  const historyTarget = document.getElementById("financeStudentHistoryList");
  const profileButton = document.getElementById("openFinanceStudentProfileButton");
  if (!title || !summaryTarget || !historyTarget) {
    return;
  }

  if (!student) {
    title.textContent = "Historico do aluno";
    summaryTarget.innerHTML = "";
    historyTarget.innerHTML = '<div class="empty-state">Selecione um aluno para consultar o historico.</div>';
    if (profileButton) profileButton.disabled = true;
    return;
  }

  financeHistoryStudentId = student.id;
  title.textContent = student.name;
  if (profileButton) profileButton.disabled = false;
  const summary = getStudentFinancialSummaryData(student.id);
  summaryTarget.innerHTML = buildStudentFinancialSummaryMarkup(summary);
  historyTarget.innerHTML = buildStudentPaymentHistoryMarkup(student.id, true);
}

function sumFinance(records, valueGetter) {
  return Finance.sum(records, valueGetter);
}

function getReportableMovements() {
  const movements = panelState.movements.map((movement) => ({ ...movement, synthetic: false }));
  const linkedPayments = new Set(movements.filter((item) => item.paymentId).map((item) => item.paymentId));
  const linkedExpenses = new Set(movements.filter((item) => item.expenseId).map((item) => item.expenseId));

  panelState.payments
    .filter((payment) => getEffectivePaymentStatus(payment) === "pago" && !linkedPayments.has(payment.id))
    .forEach((payment) => {
      const student = Store.findStudent(panelState, payment.studentId);
      movements.push({
        id: `SYN-${payment.id}`,
        date: payment.paidAt || payment.dueDate || Store.todayISO(),
        time: "12:00",
        type: "entrada",
        category: "mensalidade",
        description: `Mensalidade ${payment.reference} - ${student?.name || "Aluno"}`,
        amount: getPaymentPaidAmount(payment),
        method: payment.method || "pix",
        account: "caixa-principal",
        studentId: payment.studentId,
        paymentId: payment.id,
        status: "confirmado",
        synthetic: true
      });
    });

  panelState.expenses
    .filter((expense) => getEffectiveExpenseStatus(expense) === "pago" && !linkedExpenses.has(expense.id))
    .forEach((expense) => {
      movements.push({
        id: `SYN-${expense.id}`,
        date: expense.paidAt || expense.dueDate || Store.todayISO(),
        time: "12:00",
        type: "saida",
        category: expense.category || "outros",
        description: expense.description,
        amount: safeNumber(expense.amount),
        method: expense.method || "pix",
        account: expense.account || "caixa-principal",
        expenseId: expense.id,
        status: "confirmado",
        synthetic: true
      });
    });

  return movements.sort((left, right) => `${right.date || ""}T${right.time || ""}`.localeCompare(`${left.date || ""}T${left.time || ""}`));
}

function syncPaymentMovement(state, payment) {
  const existing = (state.movements || []).find((movement) => movement.paymentId === payment.id);
  if (!["pago", "parcial"].includes(getEffectivePaymentStatus(payment)) || getPaymentPaidAmount(payment) <= 0) {
    if (!existing) return state;
    return upsertRecordInState(state, "movements", { ...existing, status: "estornado" });
  }

  const student = Store.findStudent(state, payment.studentId);
  const movement = Store.createMovementRecord({
    ...existing,
    id: existing?.id || "",
    date: payment.paidAt || Store.todayISO(),
    time: existing?.time || new Date().toTimeString().slice(0, 5),
    type: "entrada",
    category: "mensalidade",
    description: `Mensalidade ${payment.reference} - ${student?.name || "Aluno"}`,
    amount: getPaymentPaidAmount(payment),
    method: payment.method || "pix",
    account: existing?.account || "caixa-principal",
    costCenter: existing?.costCenter || "geral",
    studentId: payment.studentId,
    paymentId: payment.id,
    expenseId: "",
    status: "confirmado",
    notes: payment.notes || ""
  });
  return upsertRecordInState(state, "movements", movement);
}

function syncExpenseMovement(state, expense) {
  const existing = (state.movements || []).find((movement) => movement.expenseId === expense.id);
  if (getEffectiveExpenseStatus(expense) !== "pago") {
    if (!existing) return state;
    return upsertRecordInState(state, "movements", { ...existing, status: "estornado" });
  }

  const movement = Store.createMovementRecord({
    ...existing,
    id: existing?.id || "",
    date: expense.paidAt || Store.todayISO(),
    time: existing?.time || new Date().toTimeString().slice(0, 5),
    type: "saida",
    category: expense.category || "outros",
    description: expense.description,
    amount: safeNumber(expense.amount),
    method: expense.method || "pix",
    account: expense.account || "caixa-principal",
    costCenter: expense.costCenter || "geral",
    studentId: "",
    paymentId: "",
    expenseId: expense.id,
    status: "confirmado",
    notes: expense.notes || ""
  });
  return upsertRecordInState(state, "movements", movement);
}

function getRecentMonths(endMonth, count) {
  const [year, month] = String(endMonth || Store.currentMonth()).split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month - 1 - (count - 1 - index), 1);
    const monthValue = String(date.getMonth() + 1).padStart(2, "0");
    return `${date.getFullYear()}-${monthValue}`;
  });
}

function getFinanceMonthLabel(reference) {
  const [year, month] = String(reference).split("-").map(Number);
  if (!year || !month) {
    return reference;
  }
  return new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(new Date(year, month - 1, 1))
    .replace(".", "");
}

function formatPaymentReference(reference) {
  const [year, month] = String(reference || "").split("-").map(Number);
  if (!year || !month) {
    return reference || "-";
  }
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, 1));
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

function getFinanceStudentSearchText(student) {
  return [
    student?.name,
    student?.phone,
    student?.email,
    student?.id,
    student?.enrollmentToken,
    student?.gateCode,
    student?.plan
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("pt-BR");
}

function setActiveFinanceTab(tabName) {
  activeFinanceTab = tabName;
  document.querySelectorAll("[data-finance-tab]").forEach((button) => {
    const isActive = button.dataset.financeTab === tabName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  document.querySelectorAll("[data-finance-panel]").forEach((panel) => {
    const isActive = panel.dataset.financePanel === tabName;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });

  if (tabName === "summary") renderFinanceSummary();
  if (tabName === "payments") {
    renderFinancePaymentsModule();
    window.requestAnimationFrame(() => {
      financeSearchFilter?.focus();
    });
  }
  if (tabName === "cash") renderCashModule();
  if (tabName === "expenses") renderExpenseModule();
  if (tabName === "reports") renderFinanceReports();
}

function renderFinanceMetrics(monthlyPayments, monthlyMovements) {
  const paidPayments = monthlyPayments.filter((payment) => getEffectivePaymentStatus(payment) === "pago");
  const partialPayments = monthlyPayments.filter((payment) => getEffectivePaymentStatus(payment) === "parcial");
  const pendingPayments = monthlyPayments.filter((payment) => getEffectivePaymentStatus(payment) === "pendente");
  const overduePayments = monthlyPayments.filter((payment) => getEffectivePaymentStatus(payment) === "vencido");
  const confirmedMovements = monthlyMovements.filter((movement) => movement.status !== "estornado");
  const income = sumFinance(confirmedMovements.filter((item) => item.type === "entrada"));
  const expense = sumFinance(confirmedMovements.filter((item) => item.type === "saida"));
  const cashBalance = income - expense;
  const metrics = [
    {
      label: "Recebido",
      value: Store.currency(sumFinance([...paidPayments, ...partialPayments], getPaymentPaidAmount)),
      note: `${paidPayments.length} quitada(s) e ${partialPayments.length} parcial(is)`,
      tone: "success"
    },
    {
      label: "Pendente",
      value: Store.currency(sumFinance(pendingPayments, getPaymentNetAmount) + sumFinance(partialPayments, getPaymentOutstandingAmount)),
      note: `${pendingPayments.length} aguardando e ${partialPayments.length} parcial(is)`,
      tone: "warning"
    },
    {
      label: "Vencido",
      value: Store.currency(sumFinance(overduePayments, getPaymentNetAmount)),
      note: `${overduePayments.length} cobranca${overduePayments.length === 1 ? "" : "s"} em atraso`,
      tone: "danger"
    },
    {
      label: "Saldo do caixa",
      value: Store.currency(cashBalance),
      note: `${Store.currency(income)} entradas - ${Store.currency(expense)} saidas`,
      tone: cashBalance >= 0 ? "success" : "danger"
    }
  ];

  document.getElementById("financeMetricGrid").innerHTML = metrics
    .map(
      (metric) => `
        <article class="finance-metric-card ${metric.tone}">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
          <small>${escapeHtml(metric.note)}</small>
        </article>
      `
    )
    .join("");
}

function renderFinanceChart() {
  const months = getRecentMonths(financeMonthFilter.value, 6);
  const summaries = months.map((reference) => {
    const payments = panelState.payments.filter((payment) => payment.reference === reference);
    return {
      reference: reference,
      expected: sumFinance(payments.filter((payment) => getEffectivePaymentStatus(payment) !== "cancelado"), getPaymentNetAmount),
      paid: payments
        .filter((payment) => ["pago", "parcial"].includes(getEffectivePaymentStatus(payment)))
        .reduce((sum, payment) => sum + getPaymentPaidAmount(payment), 0)
    };
  });
  const maximum = Math.max(...summaries.map((item) => item.expected), 1);

  document.getElementById("financeChart").innerHTML = summaries
    .map((item) => {
      const expectedHeight = (item.expected / maximum) * 100;
      const paidHeight = (item.paid / maximum) * 100;
      return `
        <div class="finance-chart-column">
          <div class="finance-chart-value">${escapeHtml(Store.currency(item.paid))}</div>
          <div class="finance-bars" title="Previsto ${escapeHtml(Store.currency(item.expected))} | Recebido ${escapeHtml(Store.currency(item.paid))}">
            <div class="finance-bar expected" style="--finance-bar-height: ${expectedHeight.toFixed(2)}%"></div>
            <div class="finance-bar paid" style="--finance-bar-height: ${paidHeight.toFixed(2)}%"></div>
          </div>
          <strong>${escapeHtml(getFinanceMonthLabel(item.reference))}</strong>
          <span>${escapeHtml(item.reference.slice(0, 4))}</span>
        </div>
      `;
    })
    .join("");
}

function getFinancePaymentRows() {
  const reference = financeMonthFilter.value || Store.currentMonth();
  const paymentsForReference = panelState.payments.filter((payment) => payment.reference === reference);
  const paymentsByStudent = new Map(paymentsForReference.map((payment) => [payment.studentId, payment]));
  const knownStudentIds = new Set(panelState.students.map((student) => student.id));

  const studentRows = panelState.students.map((student) => {
    const payment = paymentsByStudent.get(student.id) || null;
    const latestPayment = getLatestStudentPayment(student.id);
    const status = payment ? getEffectivePaymentStatus(payment) : "sem-cobranca";
    const amount = payment
      ? getPaymentNetAmount(payment)
      : safeNumber(student.monthlyFee || latestPayment?.amount || 0);
    return {
      student: student,
      payment: payment,
      reference: reference,
      dueDate: payment?.dueDate || getSuggestedPaymentDueDate(student.id, reference, null),
      amount: amount,
      status: status,
      missing: !payment
    };
  });

  const orphanRows = paymentsForReference
    .filter((payment) => !knownStudentIds.has(payment.studentId))
    .map((payment) => ({
      student: null,
      payment: payment,
      reference: reference,
      dueDate: payment.dueDate || "",
      amount: getPaymentNetAmount(payment),
      status: getEffectivePaymentStatus(payment),
      missing: false
    }));

  return [...studentRows, ...orphanRows];
}

function getFilteredFinancePaymentRows() {
  const status = financeStatusFilter.value;
  const query = financeSearchFilter.value.trim().toLocaleLowerCase("pt-BR");
  const digits = financeSearchFilter.value.replace(/\D/g, "");
  const statusOrder = { vencido: 0, parcial: 1, pendente: 2, "sem-cobranca": 3, pago: 4, cancelado: 5 };

  return getFinancePaymentRows()
    .filter((row) => status === "todos" || row.status === status)
    .filter((row) => {
      if (!query) {
        return true;
      }
      const searchable = `${getFinanceStudentSearchText(row.student)} ${row.payment?.id || ""} ${row.reference}`;
      const phoneDigits = String(row.student?.phone || "").replace(/\D/g, "");
      return searchable.includes(query) || Boolean(digits && phoneDigits.includes(digits));
    })
    .sort((left, right) => {
      const statusDifference = (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9);
      const nameDifference = String(left.student?.name || "").localeCompare(String(right.student?.name || ""), "pt-BR");
      return statusDifference || nameDifference || String(left.dueDate || "").localeCompare(String(right.dueDate || ""));
    });
}

function buildWhatsAppChargeAction(student, row) {
  const phone = String(student?.phone || "").replace(/\D/g, "");
  if (!phone || !["vencido", "pendente", "parcial"].includes(row.status)) return "";
  const brazilPhone = phone.startsWith("55") ? phone : `55${phone}`;
  const outstanding = row.payment ? getPaymentOutstandingAmount(row.payment) : row.amount;
  const message = `Ola, ${student.name}. A Pro Fitness informa que a mensalidade de ${formatPaymentReference(row.reference)} possui saldo de ${Store.currency(outstanding)}. Em caso de duvida, fale com nossa equipe.`;
  return `<a class="ghost-button small-button whatsapp-button" href="https://wa.me/${escapeHtml(brazilPhone)}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">WhatsApp</a>`;
}

function renderFinancePaymentList() {
  const rows = getFilteredFinancePaymentRows();
  const countLabel = rows.length === 1 ? "1 aluno" : `${rows.length} alunos`;
  document.getElementById("financeResultCount").textContent = countLabel;
  document.getElementById("paymentHistory").innerHTML = rows.length
    ? `
      <div class="finance-table-header payment-table-header" aria-hidden="true">
        <span>Aluno</span>
        <span>Plano</span>
        <span>Competencia</span>
        <span>Vencimento</span>
        <span>Valor</span>
        <span>Status</span>
        <span>Acao</span>
      </div>
      ${rows
        .map((row) => {
          const student = row.student;
          const payment = row.payment;
          const statusLabel = {
            pago: "Pago",
            parcial: "Parcial",
            pendente: "Pendente",
            vencido: "Vencido",
            "sem-cobranca": "Sem cobranca",
            cancelado: "Cancelado"
          }[row.status] || row.status;
          const statusBadge = row.status === "sem-cobranca"
            ? badge("aviso", statusLabel)
            : badge(row.status, statusLabel);
          const amountLabel = row.amount > 0 ? Store.currency(row.amount) : "A definir";
          const dueDateLabel = row.dueDate ? Store.formatDate(row.dueDate) : "A definir";
          const primaryAction = row.missing && student
            ? `<button class="primary-button small-button payment-row-primary" type="button" data-receive-student="${escapeHtml(student.id)}">Receber</button>`
            : ["pendente", "vencido", "parcial"].includes(row.status)
              ? `<button class="primary-button small-button payment-row-primary" type="button" data-receive-payment="${escapeHtml(payment?.id || "")}">Receber</button>`
              : payment
                ? `<button class="ghost-button small-button" type="button" data-edit-payment="${escapeHtml(payment.id)}">Ver</button>`
                : "";
          const historyAction = student
            ? `<button class="ghost-button small-button" type="button" data-history-student="${escapeHtml(student.id)}">Historico</button>`
            : "";
          const actionMarkup = `${primaryAction}${buildWhatsAppChargeAction(student, row)}${historyAction}`;
          return `
            <article class="finance-table-row payment-table-row payment-status-${escapeHtml(row.status)}" ${student ? `data-history-row="${escapeHtml(student.id)}"` : ""}>
              <div class="finance-student-cell" data-label="Aluno">
                <strong>${escapeHtml(student?.name || "Aluno nao encontrado")}</strong>
                <small>${escapeHtml(student?.phone || student?.email || "Sem contato informado")}</small>
              </div>
              <div class="finance-plan-cell" data-label="Plano"><span>${escapeHtml(student?.plan || "Nao informado")}</span></div>
              <div class="finance-reference-cell" data-label="Competencia"><strong>${escapeHtml(formatPaymentReference(row.reference))}</strong></div>
              <div class="finance-due-cell" data-label="Vencimento">
                <span>${escapeHtml(dueDateLabel)}</span>
                ${row.missing ? "<small>data prevista</small>" : ""}
              </div>
              <div data-label="Valor"><strong class="finance-amount">${escapeHtml(amountLabel)}</strong></div>
              <div class="finance-status-cell" data-label="Status">${statusBadge}</div>
              <div class="finance-row-actions" data-label="Acao">${actionMarkup}</div>
            </article>
          `;
        })
        .join("")}
    `
    : `<div class="empty-state">Nenhum aluno encontrado para os filtros selecionados.</div>`;
}

function renderFinancePaymentsModule() {
  renderFinanceStudentOptions();
  renderFinancePaymentList();
  if (!financeHistoryStudentId || !Store.findStudent(panelState, financeHistoryStudentId)) {
    financeHistoryStudentId = selectedStudentId || panelState.students[0]?.id || "";
  }
  renderFinanceStudentHistory(financeHistoryStudentId);
}

function renderFinanceTodaySummary() {
  const today = Store.todayISO();
  const movements = getReportableMovements().filter((item) => item.date === today && item.status !== "estornado");
  const income = sumFinance(movements.filter((item) => item.type === "entrada"));
  const expense = sumFinance(movements.filter((item) => item.type === "saida"));
  const methods = Object.keys(FINANCE_METHOD_LABELS)
    .map((method) => ({ method, value: sumFinance(movements.filter((item) => item.type === "entrada" && item.method === method)) }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);

  document.getElementById("financeTodaySummary").innerHTML = `
    <div class="finance-today-balance"><span>Resultado do dia</span><strong>${Store.currency(income - expense)}</strong></div>
    <div class="finance-today-totals"><div><span>Entradas</span><strong>${Store.currency(income)}</strong></div><div><span>Saidas</span><strong>${Store.currency(expense)}</strong></div></div>
    <div class="finance-method-summary">
      ${methods.length ? methods.map((item) => `<div><span>${escapeHtml(FINANCE_METHOD_LABELS[item.method])}</span><strong>${escapeHtml(Store.currency(item.value))}</strong></div>`).join("") : '<p class="muted">Nenhum recebimento registrado hoje.</p>'}
    </div>
  `;
}

function daysOverdue(dateValue) {
  if (!dateValue) return 0;
  return Math.max(0, Math.floor((new Date(`${Store.todayISO()}T12:00:00`) - new Date(`${dateValue}T12:00:00`)) / 86400000));
}

function renderFinancePriorities() {
  const paymentPriorities = panelState.payments
    .filter((payment) => getEffectivePaymentStatus(payment) === "vencido")
    .map((payment) => {
      const student = Store.findStudent(panelState, payment.studentId);
      return { type: "Mensalidade", title: student?.name || "Aluno", dueDate: payment.dueDate, amount: getPaymentNetAmount(payment), tone: "danger" };
    });
  const expensePriorities = panelState.expenses
    .filter((expense) => getEffectiveExpenseStatus(expense) === "vencido")
    .map((expense) => ({ type: "Despesa", title: expense.description, dueDate: expense.dueDate, amount: expense.amount, tone: "warning" }));
  const priorities = [...paymentPriorities, ...expensePriorities]
    .sort((left, right) => String(left.dueDate).localeCompare(String(right.dueDate)))
    .slice(0, 6);

  document.getElementById("financePriorityList").innerHTML = priorities.length
    ? priorities.map((item) => `
        <article class="finance-priority-item">
          <div><span>${escapeHtml(item.type)} · ${daysOverdue(item.dueDate)} dia(s) em atraso</span><strong>${escapeHtml(item.title)}</strong><small>Venceu em ${escapeHtml(Store.formatDate(item.dueDate))}</small></div>
          <strong>${escapeHtml(Store.currency(item.amount))}</strong>
        </article>
      `).join("")
    : '<div class="empty-state">Nenhuma pendencia vencida. Caixa em dia.</div>';
}

function renderFinanceForecast() {
  const today = Store.todayISO();
  const end = shiftISODate(today, 30);
  const receivables = panelState.payments.filter((item) => getEffectivePaymentStatus(item) === "pendente" && item.dueDate >= today && item.dueDate <= end);
  const payables = panelState.expenses.filter((item) => getEffectiveExpenseStatus(item) === "pendente" && item.dueDate >= today && item.dueDate <= end);
  const income = sumFinance(receivables, getPaymentNetAmount);
  const expense = sumFinance(payables);
  document.getElementById("financeForecast").innerHTML = `
    <div class="forecast-result"><span>Saldo projetado</span><strong class="${income - expense < 0 ? "negative" : ""}">${Store.currency(income - expense)}</strong></div>
    <div class="forecast-line"><span>A receber</span><strong>${Store.currency(income)}</strong><small>${receivables.length} cobranca(s)</small></div>
    <div class="forecast-line"><span>A pagar</span><strong>${Store.currency(expense)}</strong><small>${payables.length} despesa(s)</small></div>
  `;
}

function renderFinanceSummary() {
  const reference = financeMonthFilter.value || Store.currentMonth();
  const monthlyPayments = panelState.payments.filter((payment) => payment.reference === reference);
  const monthlyMovements = getReportableMovements().filter((movement) => String(movement.date || "").slice(0, 7) === reference);
  renderFinanceMetrics(monthlyPayments, monthlyMovements);
  renderFinanceChart();
  renderFinanceTodaySummary();
  renderFinancePriorities();
  renderFinanceForecast();
}

function setFinanceEditorOpen(editor, open) {
  if (!editor) {
    return;
  }
  editor.hidden = !open;
  const layout = editor.closest(".finance-layout");
  if (layout) {
    layout.classList.toggle("editor-open", open);
  }
}

function resetMovementForm() {
  movementForm.reset();
  movementForm.elements.id.value = "";
  movementForm.elements.date.value = cashDateFilter.value || Store.todayISO();
  movementForm.elements.time.value = new Date().toTimeString().slice(0, 5);
  movementForm.elements.type.value = "entrada";
  movementForm.elements.method.value = "pix";
  movementForm.elements.account.value = "caixa-principal";
  movementForm.elements.costCenter.value = "geral";
  document.getElementById("movementEditorTitle").textContent = "Novo lancamento";
}

function openMovementEditor(movement) {
  if (movement) {
    resetMovementForm();
    Object.entries(movement).forEach(([key, value]) => {
      if (movementForm.elements[key]) movementForm.elements[key].value = value ?? "";
    });
    document.getElementById("movementEditorTitle").textContent = "Editar movimento";
  } else {
    resetMovementForm();
  }
  setFinanceEditorOpen(document.getElementById("movementEditorCard"), true);
  document.getElementById("movementEditorCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
  window.requestAnimationFrame(() => movementForm.elements.description.focus({ preventScroll: true }));
}

function closeMovementEditor() {
  setFinanceEditorOpen(document.getElementById("movementEditorCard"), false);
  resetMovementForm();
}

function getFilteredMovements() {
  const date = cashDateFilter.value;
  const type = movementTypeFilter.value;
  const method = movementMethodFilter.value;
  const query = movementSearchFilter.value.trim().toLocaleLowerCase("pt-BR");
  return getReportableMovements()
    .filter((item) => !date || item.date === date)
    .filter((item) => type === "todos" || item.type === type)
    .filter((item) => method === "todos" || item.method === method)
    .filter((item) => !query || `${item.description} ${item.category} ${item.method}`.toLocaleLowerCase("pt-BR").includes(query))
    .sort((left, right) => `${right.date || ""}T${right.time || ""}`.localeCompare(`${left.date || ""}T${left.time || ""}`));
}

function renderMovementList() {
  const movements = getFilteredMovements();
  document.getElementById("movementResultCount").textContent = `${movements.length} registro${movements.length === 1 ? "" : "s"}`;
  document.getElementById("movementList").innerHTML = movements.length
    ? movements.map((item) => `
        <article class="movement-item ${item.type} ${item.status === "estornado" ? "void" : ""}">
          <strong class="movement-time" data-label="Horario">${escapeHtml(Store.formatTime(item.time))}</strong>
          <div class="movement-info" data-label="Descricao"><strong>${escapeHtml(item.description)}</strong><small>${escapeHtml(FINANCE_CATEGORY_LABELS[item.category] || item.category)}</small></div>
          <div class="movement-method" data-label="Forma / conta"><strong>${escapeHtml(FINANCE_METHOD_LABELS[item.method] || item.method)}</strong><small>${escapeHtml(item.account || "caixa-principal")}</small></div>
          <span class="movement-type-pill ${item.type}" data-label="Tipo">${item.type === "entrada" ? "Entrada" : "Saida"}</span>
          <strong class="movement-amount" data-label="Valor">${item.type === "entrada" ? "+" : "-"} ${escapeHtml(Store.currency(item.amount))}</strong>
          <div class="movement-actions" data-label="Acao">
            ${!item.synthetic ? `<button class="ghost-button small-button" type="button" data-edit-movement="${escapeHtml(item.id)}">Editar</button><button class="ghost-button small-button" type="button" data-void-movement="${escapeHtml(item.id)}">${item.status === "estornado" ? "Reativar" : "Estornar"}</button>` : '<span class="linked-label">Vinculado</span>'}
          </div>
        </article>
      `).join("")
    : '<div class="empty-state">Nenhuma movimentacao encontrada.</div>';
}

function getCashDaySummary(date) {
  const movements = getReportableMovements().filter((item) => item.date === date && item.status !== "estornado");
  const income = movements.filter((item) => item.type === "entrada");
  const expense = movements.filter((item) => item.type === "saida");
  return {
    movements,
    income: sumFinance(income),
    expense: sumFinance(expense),
    cashIncome: sumFinance(income.filter((item) => item.method === "dinheiro")),
    cashExpense: sumFinance(expense.filter((item) => item.method === "dinheiro"))
  };
}

function getCashClosingForDate(date) {
  return panelState.cashClosings.find((item) => item.date === date) || null;
}

function getPreviousCashClosing(date) {
  return [...panelState.cashClosings]
    .filter((item) => item.date && item.date < date)
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))[0] || null;
}

function getSuggestedOpeningBalance(date) {
  const existing = getCashClosingForDate(date);
  if (existing) {
    return safeNumber(existing.openingBalance);
  }
  const previous = getPreviousCashClosing(date);
  if (!previous) {
    return 0;
  }
  if (previous.countedCash !== "" && previous.countedCash !== null && previous.countedCash !== undefined) {
    return safeNumber(previous.countedCash);
  }
  return safeNumber(previous.expectedCash);
}

function renderCashMetrics() {
  const date = cashDateFilter.value;
  const summary = getCashDaySummary(date);
  const opening = safeNumber(cashClosingForm.elements.openingBalance.value || getSuggestedOpeningBalance(date));
  const current = opening + summary.income - summary.expense;
  const dateLabel = date === Store.todayISO() ? "Hoje" : Store.formatDate(date);
  const metrics = [
    ["Saldo inicial", opening, "neutral"],
    ["Entradas", summary.income, "success"],
    ["Saidas", summary.expense, "danger"],
    ["Saldo atual", current, current >= 0 ? "success" : "danger"]
  ];
  document.getElementById("cashMetricGrid").innerHTML = metrics
    .map(([label, value, tone]) => `<article class="finance-metric-card ${tone}"><span>${label}</span><strong>${Store.currency(value)}</strong><small>${dateLabel}</small></article>`)
    .join("");
}

function updateCashClosingPreview() {
  const summary = getCashDaySummary(cashDateFilter.value);
  const opening = safeNumber(cashClosingForm.elements.openingBalance.value);
  const countedRaw = cashClosingForm.elements.countedCash.value;
  const hasCounted = countedRaw !== "";
  const counted = safeNumber(countedRaw);
  const expected = opening + summary.cashIncome - summary.cashExpense;
  const difference = hasCounted ? counted - expected : 0;
  document.getElementById("cashClosingPreview").innerHTML = `
    <div><span>Esperado em dinheiro</span><strong>${Store.currency(expected)}</strong></div>
    <div><span>Contado</span><strong>${hasCounted ? Store.currency(counted) : "--"}</strong></div>
    <div><span>Diferenca</span><strong class="${difference < 0 ? "negative" : difference > 0 ? "positive" : ""}">${hasCounted ? Store.currency(difference) : "--"}</strong></div>
  `;
  return { ...summary, opening, counted, expected, difference };
}

function renderCashClosing() {
  const date = cashDateFilter.value;
  const existing = getCashClosingForDate(date);
  cashClosingForm.elements.id.value = existing?.id || "";
  cashClosingForm.elements.openingBalance.value = existing ? safeNumber(existing.openingBalance) : getSuggestedOpeningBalance(date);
  cashClosingForm.elements.countedCash.value = existing?.countedCash ?? "";
  cashClosingForm.elements.closedBy.value = existing?.closedBy || "Administracao";
  cashClosingForm.elements.notes.value = existing?.notes || "";

  const statusText = existing ? `Fechado ${Store.formatDateTime(existing.closedAt)}` : "Em aberto";
  document.getElementById("cashClosingStatus").textContent = statusText;
  const dayStatus = document.getElementById("cashDayStatus");
  dayStatus.textContent = existing ? "Caixa fechado" : "Caixa aberto";
  dayStatus.classList.toggle("closed", Boolean(existing));
  document.getElementById("cashClosingSubmitButton").textContent = existing ? "Atualizar fechamento" : "Fechar caixa";

  updateCashClosingPreview();
  document.getElementById("cashClosingHistory").innerHTML = panelState.cashClosings.length
    ? [...panelState.cashClosings]
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 8)
        .map((item) => `
          <article class="cash-history-row">
            <div><strong>${Store.formatDate(item.date)}</strong><span>${escapeHtml(item.closedBy)}</span></div>
            <div><span>Esperado</span><strong>${Store.currency(item.expectedCash)}</strong></div>
            <div><span>Contado</span><strong>${Store.currency(item.countedCash)}</strong></div>
            <div><span>Diferenca</span><strong class="${safeNumber(item.difference) ? "warning-text" : ""}">${Store.currency(item.difference)}</strong></div>
          </article>
        `).join("")
    : '<div class="empty-state">Nenhum fechamento realizado.</div>';
}

function renderCashModule() {
  if (!cashDateFilter.value) cashDateFilter.value = Store.todayISO();
  renderCashClosing();
  renderCashMetrics();
  renderMovementList();
}

function resetExpenseForm() {
  expenseForm.reset();
  expenseForm.elements.id.value = "";
  expenseForm.elements.dueDate.value = Store.todayISO();
  expenseForm.elements.status.value = "pendente";
  expenseForm.elements.method.value = "pix";
  expenseForm.elements.costCenter.value = "geral";
  expenseForm.elements.recurring.value = "nao";
  document.getElementById("expenseEditorTitle").textContent = "Nova despesa";
}

function openExpenseEditor(expense) {
  resetExpenseForm();
  if (expense) {
    Object.entries(expense).forEach(([key, value]) => {
      if (expenseForm.elements[key]) expenseForm.elements[key].value = value ?? "";
    });
    document.getElementById("expenseEditorTitle").textContent = "Editar despesa";
  }
  setFinanceEditorOpen(document.getElementById("expenseEditorCard"), true);
  document.getElementById("expenseEditorCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
  window.requestAnimationFrame(() => expenseForm.elements.description.focus({ preventScroll: true }));
}

function closeExpenseEditor() {
  setFinanceEditorOpen(document.getElementById("expenseEditorCard"), false);
  resetExpenseForm();
}

function isUpcomingExpense(expense, days = 7) {
  const status = getEffectiveExpenseStatus(expense);
  if (status !== "pendente" || !expense.dueDate) {
    return false;
  }
  const today = Store.todayISO();
  return expense.dueDate >= today && expense.dueDate <= shiftISODate(today, days);
}

function getFilteredExpenses() {
  const month = expenseMonthFilter.value;
  const status = expenseStatusFilter.value;
  const query = expenseSearchFilter.value.trim().toLocaleLowerCase("pt-BR");
  const statusPriority = { vencido: 0, pendente: 1, pago: 2 };
  return [...panelState.expenses]
    .filter((item) => !month || String(item.dueDate || "").slice(0, 7) === month)
    .filter((item) => {
      const effective = getEffectiveExpenseStatus(item);
      if (status === "todos") return true;
      if (status === "proximas") return isUpcomingExpense(item);
      return effective === status;
    })
    .filter((item) => !query || `${item.description} ${item.supplier} ${item.category}`.toLocaleLowerCase("pt-BR").includes(query))
    .sort((left, right) => {
      const leftStatus = statusPriority[getEffectiveExpenseStatus(left)] ?? 9;
      const rightStatus = statusPriority[getEffectiveExpenseStatus(right)] ?? 9;
      return leftStatus - rightStatus || String(left.dueDate).localeCompare(String(right.dueDate));
    });
}

function renderExpenseStatusTabs() {
  document.querySelectorAll("[data-expense-status]").forEach((button) => {
    const active = button.dataset.expenseStatus === expenseStatusFilter.value;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderExpenseMetrics() {
  const month = expenseMonthFilter.value;
  const expenses = panelState.expenses.filter((item) => !month || String(item.dueDate || "").slice(0, 7) === month);
  const open = expenses.filter((item) => getEffectiveExpenseStatus(item) !== "pago");
  const overdue = expenses.filter((item) => getEffectiveExpenseStatus(item) === "vencido");
  const upcoming = expenses.filter((item) => isUpcomingExpense(item));
  const paid = expenses.filter((item) => getEffectiveExpenseStatus(item) === "pago");
  const metrics = [
    ["A pagar", sumFinance(open), `${open.length} conta(s)`, "warning"],
    ["Vencidas", sumFinance(overdue), `${overdue.length} conta(s)`, "danger"],
    ["Proximos 7 dias", sumFinance(upcoming), `${upcoming.length} conta(s)`, "neutral"],
    ["Pagas", sumFinance(paid), `${paid.length} conta(s)`, "success"]
  ];
  document.getElementById("expenseMetricGrid").innerHTML = metrics
    .map(([label, value, detail, tone]) => `<article class="finance-metric-card ${tone}"><span>${label}</span><strong>${Store.currency(value)}</strong><small>${detail}</small></article>`)
    .join("");
}

function renderExpenseList() {
  const expenses = getFilteredExpenses();
  renderExpenseStatusTabs();
  document.getElementById("expenseResultCount").textContent = `${expenses.length} registro${expenses.length === 1 ? "" : "s"}`;
  document.getElementById("expenseList").innerHTML = expenses.length
    ? expenses.map((expense) => {
        const status = getEffectiveExpenseStatus(expense);
        return `
          <article class="expense-item expense-${status}">
            <div class="expense-date" data-label="Vencimento"><strong>${escapeHtml(Store.formatDate(expense.dueDate))}</strong><small>${expense.paidAt ? `Pago ${escapeHtml(Store.formatDate(expense.paidAt))}` : ""}</small></div>
            <div class="expense-description" data-label="Despesa"><strong>${escapeHtml(expense.description)}</strong><small>${escapeHtml(expense.recurring === "nao" ? "Nao recorrente" : `Recorrencia ${expense.recurring}`)}</small></div>
            <span class="expense-category" data-label="Categoria">${escapeHtml(FINANCE_CATEGORY_LABELS[expense.category] || expense.category)}</span>
            <span class="expense-supplier" data-label="Fornecedor">${escapeHtml(expense.supplier || "Nao informado")}</span>
            <strong class="expense-amount" data-label="Valor">${escapeHtml(Store.currency(expense.amount))}</strong>
            <div class="expense-status" data-label="Status">${badge(status, status)}</div>
            <div class="expense-actions" data-label="Acao"><button class="ghost-button small-button" type="button" data-edit-expense="${escapeHtml(expense.id)}">Editar</button>${status !== "pago" ? `<button class="primary-button small-button" type="button" data-pay-expense="${escapeHtml(expense.id)}">Pagar</button>` : ""}</div>
          </article>`;
      }).join("")
    : '<div class="empty-state">Nenhuma despesa encontrada.</div>';
}

function renderExpenseModule() {
  if (!expenseMonthFilter.value) expenseMonthFilter.value = financeMonthFilter.value || Store.currentMonth();
  renderExpenseMetrics();
  renderExpenseList();
}

function populateReportStudentOptions() {
  if (!reportStudentFilter) return;
  const currentValue = reportStudentFilter.value || "todos";
  reportStudentFilter.innerHTML = `
    <option value="todos">Todos os alunos</option>
    ${panelState.students
      .slice()
      .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "pt-BR"))
      .map((student) => `<option value="${escapeHtml(student.id)}">${escapeHtml(student.name)}</option>`)
      .join("")}
  `;
  reportStudentFilter.value = Store.findStudent(panelState, currentValue) ? currentValue : "todos";
}

function getReportSelectedStudentId() {
  return reportStudentFilter?.value && reportStudentFilter.value !== "todos" ? reportStudentFilter.value : "";
}

function getReportMovements() {
  const start = reportStartDate.value;
  const end = reportEndDate.value;
  const type = reportTypeFilter.value;
  const method = reportMethodFilter.value;
  const costCenter = reportCostCenterFilter.value;
  const studentId = getReportSelectedStudentId();
  return getReportableMovements()
    .filter((item) => item.status !== "estornado")
    .filter((item) => !start || item.date >= start)
    .filter((item) => !end || item.date <= end)
    .filter((item) => type === "todos" || item.type === type)
    .filter((item) => method === "todos" || item.method === method)
    .filter((item) => costCenter === "todos" || (item.costCenter || "geral") === costCenter)
    .filter((item) => !studentId || item.studentId === studentId)
    .sort((left, right) => `${right.date}T${right.time}`.localeCompare(`${left.date}T${left.time}`));
}

function getReportPayments(studentId) {
  const start = reportStartDate.value;
  const end = reportEndDate.value;
  return panelState.payments
    .filter((payment) => !studentId || payment.studentId === studentId)
    .filter((payment) => {
      const referenceDate = payment.paidAt || payment.dueDate || (payment.reference ? `${payment.reference}-01` : "");
      return (!start || referenceDate >= start) && (!end || referenceDate <= end);
    })
    .sort((left, right) => {
      const leftDate = left.paidAt || left.dueDate || `${left.reference || ""}-01`;
      const rightDate = right.paidAt || right.dueDate || `${right.reference || ""}-01`;
      return String(rightDate).localeCompare(String(leftDate));
    });
}

function getFinancialReconciliation(studentId) {
  const payments = getReportPayments(studentId).filter((payment) => ["pago", "parcial"].includes(getEffectivePaymentStatus(payment)));
  const paymentIds = new Set(payments.map((payment) => payment.id));
  const linkedMovements = panelState.movements.filter((movement) =>
    movement.status !== "estornado" && movement.paymentId && paymentIds.has(movement.paymentId)
  );
  const movementsByPayment = linkedMovements.reduce((groups, movement) => {
    groups[movement.paymentId] = groups[movement.paymentId] || [];
    groups[movement.paymentId].push(movement);
    return groups;
  }, {});

  let missingCount = 0;
  let mismatchCount = 0;
  let duplicateCount = 0;
  payments.forEach((payment) => {
    const movements = movementsByPayment[payment.id] || [];
    if (!movements.length) missingCount += 1;
    if (movements.length > 1) duplicateCount += movements.length - 1;
    const movementAmount = sumFinance(movements);
    if (movements.length && Math.abs(movementAmount - getPaymentPaidAmount(payment)) > 0.01) {
      mismatchCount += 1;
    }
  });

  const paymentTotal = sumFinance(payments, getPaymentPaidAmount);
  const movementTotal = sumFinance(linkedMovements);
  return {
    paymentCount: payments.length,
    paymentTotal,
    movementTotal,
    difference: movementTotal - paymentTotal,
    missingCount,
    mismatchCount,
    duplicateCount,
    issueCount: missingCount + mismatchCount + duplicateCount
  };
}

function renderReportReconciliation(studentId) {
  const summary = getFinancialReconciliation(studentId);
  const target = document.getElementById("reportReconciliationCard");
  const statusClass = summary.issueCount ? "warning" : "success";
  target.className = `dashboard-card report-reconciliation-card ${statusClass}`;
  target.innerHTML = `
    <div class="report-reconciliation-title">
      <div><span>Conferencia financeira</span><strong>${summary.issueCount ? `${summary.issueCount} ponto(s) para revisar` : "Valores conferidos"}</strong></div>
      ${badge(summary.issueCount ? "aviso" : "pago", summary.issueCount ? "Revisar" : "OK")}
    </div>
    <div class="report-reconciliation-grid">
      <div><span>Mensalidades pagas</span><strong>${summary.paymentCount}</strong></div>
      <div><span>Total recebido</span><strong>${escapeHtml(Store.currency(summary.paymentTotal))}</strong></div>
      <div><span>Entradas vinculadas</span><strong>${escapeHtml(Store.currency(summary.movementTotal))}</strong></div>
      <div><span>Diferenca</span><strong>${escapeHtml(Store.currency(summary.difference))}</strong></div>
    </div>
    ${summary.issueCount ? `<div class="report-reconciliation-note">Sem movimento: ${summary.missingCount} · Valor diferente: ${summary.mismatchCount} · Movimento duplicado: ${summary.duplicateCount}</div>` : ""}
  `;
}

function renderReportBars(targetId, groups) {
  const maximum = Math.max(...groups.map((item) => item.value), 1);
  document.getElementById(targetId).innerHTML = groups.length
    ? groups.map((item) => `<div class="report-bar-row"><span>${escapeHtml(item.label)}</span><div><i style="--report-width: ${(item.value / maximum) * 100}%"></i></div><strong>${escapeHtml(Store.currency(item.value))}</strong></div>`).join("")
    : '<div class="empty-state">Sem dados para o periodo.</div>';
}

function renderStudentFinanceReport(studentId) {
  const card = document.getElementById("printableStudentFinanceReport");
  const student = Store.findStudent(panelState, studentId);
  if (!student) {
    card.hidden = true;
    return;
  }

  const payments = getReportPayments(student.id);
  const paid = payments.filter((payment) => getEffectivePaymentStatus(payment) === "pago");
  const pending = payments.filter((payment) => getEffectivePaymentStatus(payment) === "pendente");
  const overdue = payments.filter((payment) => getEffectivePaymentStatus(payment) === "vencido");
  const canceled = payments.filter((payment) => getEffectivePaymentStatus(payment) === "cancelado");
  card.hidden = false;
  document.getElementById("studentReportPeriodLabel").textContent = `${Store.formatDate(reportStartDate.value)} a ${Store.formatDate(reportEndDate.value)}`;
  document.getElementById("studentReportIdentification").innerHTML = `
    <div><span>Aluno</span><strong>${escapeHtml(student.name)}</strong></div>
    <div><span>Plano</span><strong>${escapeHtml(student.plan || "Nao informado")}</strong></div>
    <div><span>Telefone</span><strong>${escapeHtml(student.phone || "Nao informado")}</strong></div>
  `;
  const metrics = [
    ["Total pago", sumFinance(paid, getPaymentPaidAmount), "success"],
    ["Em aberto", sumFinance(pending, getPaymentNetAmount), "warning"],
    ["Vencido", sumFinance(overdue, getPaymentNetAmount), "danger"],
    ["Registros", payments.length, "neutral", true]
  ];
  document.getElementById("studentReportMetricGrid").innerHTML = metrics.map(([label, value, tone, count]) => `
    <article class="student-report-metric ${tone}"><span>${label}</span><strong>${count ? value : escapeHtml(Store.currency(value))}</strong></article>
  `).join("");
  document.getElementById("studentReportResultCount").textContent = `${payments.length} registro${payments.length === 1 ? "" : "s"}`;
  document.getElementById("studentReportPaymentTable").innerHTML = payments.length
    ? `<div class="student-report-payment-header"><span>Competencia</span><span>Vencimento</span><span>Pagamento</span><span>Valor</span><span>Forma</span><span>Status</span><span>Acao</span></div>${payments.map((payment) => {
        const status = getEffectivePaymentStatus(payment);
        return `<article class="student-report-payment-row">
          <strong data-label="Competencia">${escapeHtml(formatPaymentReference(payment.reference))}</strong>
          <span data-label="Vencimento">${escapeHtml(Store.formatDate(payment.dueDate))}</span>
          <span data-label="Pagamento">${status === "pago" ? escapeHtml(Store.formatDate(payment.paidAt)) : "—"}</span>
          <strong data-label="Valor">${escapeHtml(Store.currency(status === "pago" ? getPaymentPaidAmount(payment) : getPaymentNetAmount(payment)))}</strong>
          <span data-label="Forma">${status === "pago" ? escapeHtml(FINANCE_METHOD_LABELS[payment.method] || payment.method || "—") : "—"}</span>
          <span data-label="Status">${badge(status, getPaymentStatusLabel(status))}</span>
          <span class="report-row-action" data-label="Acao">${status === "pago" ? `<button class="ghost-button small-button" data-print-receipt="${escapeHtml(payment.id)}" type="button">Comprovante</button>` : "—"}</span>
        </article>`;
      }).join("")}`
    : '<div class="empty-state">Nenhuma mensalidade no periodo selecionado.</div>';
}

function renderFinanceReports() {
  if (!reportStartDate.value) reportStartDate.value = `${Store.currentMonth()}-01`;
  if (!reportEndDate.value) reportEndDate.value = Store.todayISO();
  populateReportStudentOptions();
  const studentId = getReportSelectedStudentId();
  const student = studentId ? Store.findStudent(panelState, studentId) : null;
  const movements = getReportMovements();
  const income = sumFinance(movements.filter((item) => item.type === "entrada"));
  const expense = sumFinance(movements.filter((item) => item.type === "saida"));
  const result = income - expense;
  const incomeCount = movements.filter((item) => item.type === "entrada").length;
  const averageTicket = incomeCount ? income / incomeCount : 0;
  const metrics = [["Entradas", income, "success"], ["Saidas", expense, "neutral"], ["Resultado", result, result >= 0 ? "success" : "danger"], ["Ticket medio", averageTicket, "warning"]];
  document.getElementById("reportMetricGrid").innerHTML = metrics.map(([label, value, tone]) => `<article class="finance-metric-card ${tone}"><span>${label}</span><strong>${Store.currency(value)}</strong><small>${movements.length} movimento(s)</small></article>`).join("");

  const categoryGroups = Object.entries(movements.reduce((groups, item) => {
    const key = `${item.type}:${item.category}`;
    groups[key] = (groups[key] || 0) + safeNumber(item.amount);
    return groups;
  }, {})).map(([key, value]) => { const [type, category] = key.split(":"); return { label: `${type === "entrada" ? "+" : "-"} ${FINANCE_CATEGORY_LABELS[category] || category}`, value }; }).sort((a, b) => b.value - a.value);
  const methodGroups = Object.entries(movements.filter((item) => item.type === "entrada").reduce((groups, item) => { groups[item.method] = (groups[item.method] || 0) + safeNumber(item.amount); return groups; }, {})).map(([method, value]) => ({ label: FINANCE_METHOD_LABELS[method] || method, value })).sort((a, b) => b.value - a.value);
  renderReportBars("reportCategoryChart", categoryGroups);
  renderReportBars("reportMethodChart", methodGroups);
  renderReportReconciliation(studentId);
  renderStudentFinanceReport(studentId);
  const reconciliation = getFinancialReconciliation(studentId);
  document.getElementById("reportPrintSummary").innerHTML = `
    <div><span>Entradas</span><strong>${escapeHtml(Store.currency(income))}</strong></div>
    <div><span>Saidas</span><strong>${escapeHtml(Store.currency(expense))}</strong></div>
    <div><span>Resultado</span><strong>${escapeHtml(Store.currency(result))}</strong></div>
    <div><span>Conferencia</span><strong>${reconciliation.issueCount ? `${reconciliation.issueCount} pendencia(s)` : "OK"}</strong></div>
  `;

  document.getElementById("reportDocumentTitle").textContent = student ? `Relatorio financeiro - ${student.name}` : "Relatorio financeiro geral";
  document.getElementById("reportMovementTitle").textContent = student ? "Movimentacoes do aluno" : "Movimentacoes do periodo";
  document.getElementById("reportResultCount").textContent = `${movements.length} registro${movements.length === 1 ? "" : "s"}`;
  document.getElementById("reportPeriodLabel").textContent = `${Store.formatDate(reportStartDate.value)} a ${Store.formatDate(reportEndDate.value)}`;
  document.getElementById("reportMovementTable").innerHTML = movements.length
    ? `<div class="report-table-header"><span>Data</span><span>Descricao</span><span>Categoria</span><span>Forma</span><span>Tipo</span><span>Valor</span></div>${movements.map((item) => `<article class="report-table-row"><span data-label="Data">${Store.formatDate(item.date)} ${escapeHtml(Store.formatTime(item.time))}</span><strong data-label="Descricao">${escapeHtml(item.description)}</strong><span data-label="Categoria">${escapeHtml(FINANCE_CATEGORY_LABELS[item.category] || item.category)}</span><span data-label="Forma">${escapeHtml(FINANCE_METHOD_LABELS[item.method] || item.method)}</span><span data-label="Tipo" class="report-type ${item.type}">${item.type}</span><strong data-label="Valor">${item.type === "entrada" ? "+" : "-"} ${Store.currency(item.amount)}</strong></article>`).join("")}`
    : '<div class="empty-state">Nenhuma movimentacao no periodo selecionado.</div>';
}

function renderFinance() {
  if (!financeMonthFilter.value) financeMonthFilter.value = Store.currentMonth();
  renderFinanceStudentOptions();
  setActiveFinanceTab(activeFinanceTab);
}

function renderAccess(student) {
  const access = Store.getAccessState(panelState, student.id);
  const enrollmentCodeBox = document.getElementById("enrollmentCodeBox");
  const enrollmentQr = document.getElementById("enrollmentQr");
  const gateCodeBox = document.getElementById("gateCodeBox");
  const gateQr = document.getElementById("gateQr");
  const gateStateBox = document.getElementById("gateStateBox");

  enrollmentCodeBox.innerHTML = `${badge(student.enrollmentStatus || "ativo", "matricula cadastrada")}<div class="detail-copy"><strong>Numero:</strong> ${escapeHtml(student.enrollmentNumber || student.id)}</div><div class="detail-copy">O aplicativo usa matricula e senha individual.</div>`;
  enrollmentQr.innerHTML = '<div class="empty-state">A matricula nao utiliza QR fixo.</div>';

  gateCodeBox.innerHTML = `
    ${badge(access.status, access.label)}
    <div class="detail-copy">O QR temporario e gerado somente no aplicativo autenticado do aluno.</div>
  `;

  gateQr.innerHTML = `<div class="empty-state">${access.allowsGate ? "Acesso apto para gerar QR temporario no celular." : "QR bloqueado no momento."}</div>`;

  gateStateBox.textContent = access.allowsGate
    ? "Acesso autorizado pelas regras atuais do sistema."
    : getOperationalAccessReason(access);
}

function renderWorkspace() {
  const student = getSelectedStudent();
  workspaceEmpty.hidden = Boolean(student);
  workspaceContent.hidden = !student;

  if (!student) {
    workspaceTitle.textContent = "Selecione um aluno";
    return;
  }

  renderStudentHeader(student);
  renderAdminStudentSummary(student);
  populateStudentForm(student);
  populateWorkoutForm(student);
  populateAssessmentForm(student);
  populateScheduleForm(student);
  renderStudentFinancialHistory(student);
  renderTimeline(student);
  renderWorkouts(student);
  renderAssessments(student);
  renderSchedule(student);
  renderAdminPresence(student);
  setActivePanelTab(activePanelTab);
}

function renderAlertBoard() {
  const alerts = panelState.students
    .map((student) => ({
      student: student,
      access: Store.getAccessState(panelState, student.id)
    }))
    .filter((item) => item.access.status !== "liberado");

  document.getElementById("alertBoard").innerHTML = alerts.length
    ? alerts
        .map(
          (item) => `
            <article class="timeline-item">
              <div class="meta-row">
                <strong>${escapeHtml(item.student.name)}</strong>
                ${badge(item.access.status, getOperationalAccessLabel(item.access))}
              </div>
              <p>${escapeHtml(getOperationalAccessReason(item.access))}</p>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Nenhum alerta aberto no momento.</div>`;
}

function renderLogBoard() {
  const logBoard = document.getElementById("logBoard");
  const financialTerms = /payment|mensalidade|pagamento|cobranca|financeir/i;
  const logs = panelState.log
    .filter((entry) => !financialTerms.test(`${entry.action || ""} ${entry.message || ""}`))
    .slice(0, 8);

  logBoard.innerHTML = logs.length
    ? logs
        .map(
          (entry) => `
            <article class="timeline-item">
              <strong>${escapeHtml(entry.action || "evento")}</strong>
              <p>${escapeHtml(entry.message || entry.studentId || "-")}</p>
              <p>${escapeHtml(Store.formatDateTime(entry.timestamp))}</p>
              <small>Origem: ${escapeHtml(entry.source === "painel-professor-tablet" ? "Tablet do professor" : entry.source === "painel-administrativo" ? "Painel administrativo" : entry.source || "Sistema")}</small>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Nenhum evento registrado ainda.</div>`;
}

function parseCatalog(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (error) {
      return fallback;
    }
  }
  return fallback;
}

function getAdminConfig() {
  const current = panelState.config?.[0] || { id: "CFG-001", appName: "Pro Fitness Academia" };
  const studentPlans = [...new Set(panelState.students.map((student) => student.plan).filter(Boolean))]
    .map((name) => ({ id: `PLAN-${normalizeTextKey(name)}`, name, monthlyFee: panelState.students.find((student) => student.plan === name)?.monthlyFee || 0 }));
  return {
    ...current,
    plans: parseCatalog(current.plans, studentPlans),
    modalities: parseCatalog(current.modalities, Object.values(WEEKLY_CATEGORY_LABELS).filter((name) => name !== "Outra atividade")),
    costCenters: parseCatalog(current.costCenters, Object.keys(COST_CENTER_LABELS)),
    paymentAlertDays: parseCatalog(current.paymentAlertDays, [7, 3, 0]),
    paymentGraceDays: Math.max(0, safeNumber(current.paymentGraceDays)),
    blockAccessOnOverdue: current.blockAccessOnOverdue !== false && current.blockAccessOnOverdue !== "false",
    whatsappNumber: String(current.whatsappNumber || current.supportPhone || "5522988233216").replace(/\D/g, "")
  };
}

function normalizeTextKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
}

function saveAdminConfig(config, action, message) {
  const nextConfig = { ...config, updatedAt: new Date().toISOString() };
  const nextState = upsertRecordInState(panelState, "config", nextConfig);
  saveWithLog(nextState, action, "", message);
}

function renderSettings() {
  const config = getAdminConfig();
  document.getElementById("planCatalogList").innerHTML = config.plans.length
    ? config.plans.map((plan) => `<article class="settings-list-item"><div><strong>${escapeHtml(plan.name)}</strong><span>${Store.currency(plan.monthlyFee || 0)}</span></div><button class="ghost-button small-button" data-delete-plan="${escapeHtml(plan.id || normalizeTextKey(plan.name))}" type="button">Remover</button></article>`).join("")
    : '<div class="empty-state">Nenhum plano cadastrado.</div>';
  document.getElementById("modalityCatalogList").innerHTML = config.modalities.length
    ? config.modalities.map((name) => `<article class="settings-list-item"><strong>${escapeHtml(name)}</strong><button class="ghost-button small-button" data-delete-modality="${escapeHtml(name)}" type="button">Remover</button></article>`).join("")
    : '<div class="empty-state">Nenhuma modalidade cadastrada.</div>';
  const professors = getStaffUsers(true);
  document.getElementById("staffCatalogList").innerHTML = professors.length
    ? professors.map((professor) => `<article class="settings-list-item"><div><strong>${escapeHtml(professor.name)}</strong><span>${escapeHtml(professor.email || "Sem e-mail")}</span></div><button class="ghost-button small-button" data-delete-staff="${escapeHtml(professor.id)}" type="button">Remover</button></article>`).join("")
    : '<div class="empty-state">Nenhum professor cadastrado.</div>';
  paymentRulesForm.elements.paymentAlertDays.value = config.paymentAlertDays.join(", ");
  paymentRulesForm.elements.paymentGraceDays.value = config.paymentGraceDays;
  paymentRulesForm.elements.whatsappNumber.value = config.whatsappNumber;
  paymentRulesForm.elements.blockAccessOnOverdue.checked = config.blockAccessOnOverdue;

  const checks = [
    ["Sem telefone", panelState.students.filter((student) => !student.phone).length],
    ["Sem e-mail", panelState.students.filter((student) => !student.email).length],
    ["Sem plano", panelState.students.filter((student) => !student.plan).length],
    ["Sem valor mensal", panelState.students.filter((student) => safeNumber(student.monthlyFee) <= 0).length],
    ["Matricula pendente", panelState.students.filter((student) => student.enrollmentStatus !== "ativo").length],
    ["Telefone duplicado", countDuplicateStudentField("phone")]
  ];
  document.getElementById("adminQualityGrid").innerHTML = checks.map(([label, value]) => `<article class="admin-quality-item ${value ? "warning" : "ok"}"><span>${escapeHtml(label)}</span><strong>${value}</strong></article>`).join("");
  renderDataAudit();
}

function downloadTextFile(content, filename, type) {
  const objectUrl = URL.createObjectURL(new Blob([content], { type: type || "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function downloadDataBackup() {
  const backup = {
    app: "Pro Fitness Academia",
    schemaVersion: 8,
    exportedAt: new Date().toISOString(),
    snapshot: Store.clone(panelState)
  };
  downloadTextFile(JSON.stringify(backup, null, 2), `pro-fitness-backup-${Store.todayISO()}.json`, "application/json;charset=utf-8");
}

function getDataAudit() {
  const issues = [];
  const students = panelState.students || [];
  const studentIds = new Set(students.map((student) => String(student.id)));
  const duplicateCount = (field, normalize) => {
    const counts = new Map();
    students.forEach((student) => {
      const value = normalize(student[field]);
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.values()].filter((count) => count > 1).reduce((total, count) => total + count, 0);
  };
  const duplicatePhones = duplicateCount("phone", (value) => String(value || "").replace(/\D/g, ""));
  const duplicateEmails = duplicateCount("email", (value) => String(value || "").trim().toLocaleLowerCase("pt-BR"));
  const missingNames = students.filter((student) => !String(student.name || "").trim()).length;
  const invalidMonthlyFees = students.filter((student) => safeNumber(student.monthlyFee) < 0).length;
  const relatedCollections = ["assessments", "workouts", "schedule", "payments", "checkins"];
  const orphanRecords = relatedCollections.reduce((total, collection) => total + (panelState[collection] || []).filter((record) => record.studentId && !studentIds.has(String(record.studentId))).length, 0);
  const invalidFinance = [
    ...(panelState.payments || []).filter((item) => safeNumber(item.amount) < 0 || safeNumber(item.paidAmount) < 0),
    ...(panelState.movements || []).filter((item) => safeNumber(item.amount) < 0),
    ...(panelState.expenses || []).filter((item) => safeNumber(item.amount) < 0)
  ].length;
  const now = new Date();
  const staleOpenShifts = (panelState.staffTimeEntries || []).filter((entry) => {
    if (entry.clockOut || !entry.clockIn) return false;
    const started = new Date(entry.clockIn);
    return !Number.isNaN(started.getTime()) && now.getTime() - started.getTime() > 16 * 60 * 60 * 1000;
  }).length;

  if (duplicatePhones) issues.push(["Telefones duplicados", `${duplicatePhones} cadastro(s) compartilham telefone.`, "warning"]);
  if (duplicateEmails) issues.push(["E-mails duplicados", `${duplicateEmails} cadastro(s) compartilham e-mail.`, "warning"]);
  if (missingNames) issues.push(["Alunos sem nome", `${missingNames} cadastro(s) precisam de identificacao.`, "danger"]);
  if (invalidMonthlyFees || invalidFinance) issues.push(["Valores invalidos", `${invalidMonthlyFees + invalidFinance} registro(s) possuem valor negativo.`, "danger"]);
  if (orphanRecords) issues.push(["Registros sem aluno", `${orphanRecords} registro(s) apontam para alunos inexistentes.`, "danger"]);
  if (staleOpenShifts) issues.push(["Presenca sem saida", `${staleOpenShifts} permanencia(s) estao abertas ha mais de 16 horas.`, "warning"]);

  return {
    issues,
    metrics: [
      ["Alunos", students.length],
      ["Registros relacionados", relatedCollections.reduce((sum, key) => sum + (panelState[key] || []).length, 0)],
      ["Pendencias", issues.length],
      ["Versao do backup", "8"]
    ]
  };
}

function renderDataAudit() {
  const target = document.getElementById("dataAuditGrid");
  if (!target) return;
  const audit = getDataAudit();
  target.innerHTML = audit.metrics.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  document.getElementById("dataAuditList").innerHTML = audit.issues.length
    ? audit.issues.map(([title, detail, tone]) => `<article class="data-audit-item ${tone}"><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>${badge(tone === "danger" ? "bloqueado" : "aviso", tone === "danger" ? "Corrigir" : "Revisar")}</article>`).join("")
    : '<div class="data-audit-ok"><strong>Base consistente</strong><span>Nenhuma inconsistencia automatica foi encontrada.</span></div>';
}

async function restoreDataBackup(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const snapshot = parsed.snapshot || parsed.data || parsed;
    Store.validateCompleteSnapshot(snapshot);
    const summary = Store.getSnapshotSummary(snapshot);
    const exportedAt = parsed.exportedAt ? Store.formatDateTime(parsed.exportedAt) : "nao informada";
    const confirmation = [
      `Data do backup: ${exportedAt}`,
      `Alunos: ${summary.students}`,
      `Pagamentos: ${summary.payments}`,
      `Treinos: ${summary.workouts}`,
      `Avaliacoes: ${summary.assessments}`,
      `Movimentacoes: ${summary.movements}`,
      `Despesas: ${summary.expenses}`,
      "",
      "Os dados atuais serao substituidos. Deseja continuar?"
    ].join("\n");
    if (!window.confirm(confirmation)) return;

    panelState = Store.migrateData(snapshot);
    Store.saveData(panelState);
    saveAdminSyncQueue([]);
    saveAdminPendingSnapshot({
      snapshot: panelState,
      queuedAt: new Date().toISOString(),
      sourceFile: file.name
    });
    selectedStudentId = panelState.students[0]?.id || "";
    renderPanel();
    renderAdminSyncStatus(getAdminPendingCount() ? "pending" : undefined);
    const synchronized = await flushAdminSyncQueue({ notify: false });
    window.alert(getAdminPendingCount()
      ? "Backup restaurado neste computador. A copia completa permanece pendente e sera reenviada sem substituir estes dados locais."
      : synchronized ? "Backup restaurado e sincronizado com sucesso." : "Backup restaurado neste computador.");
  } catch (error) {
    window.alert(`Nao foi possivel restaurar o backup: ${error.message}`);
  } finally {
    input.value = "";
  }
}

function parseCsvRows(text) {
  const firstLine = String(text || "").split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeCsvHeader(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLocaleLowerCase("pt-BR");
}

async function importStudentsCsv(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const rows = parseCsvRows(await file.text());
    if (rows.length < 2) throw new Error("O CSV precisa ter cabecalho e ao menos uma linha de aluno.");
    const aliases = {
      nome: "name", name: "name", telefone: "phone", phone: "phone", celular: "phone",
      email: "email", datadenascimento: "birthDate", nascimento: "birthDate", birthdate: "birthDate",
      objetivo: "goal", goal: "goal", restricoes: "restrictions", restricoesfisicas: "restrictions", restrictions: "restrictions",
      status: "status", plano: "plan", plan: "plan", valormensal: "monthlyFee", mensalidade: "monthlyFee", monthlyfee: "monthlyFee",
      observacoes: "notes", notes: "notes"
    };
    const fields = rows[0].map((header) => aliases[normalizeCsvHeader(header)] || "");
    if (!fields.includes("name")) throw new Error("O CSV precisa ter a coluna Nome.");
    const imported = rows.slice(1).map((cells) => Object.fromEntries(fields.map((field, index) => [field, cells[index] || ""]).filter(([field]) => field))).filter((item) => String(item.name || "").trim());
    if (!imported.length) throw new Error("Nenhum aluno valido foi encontrado no arquivo.");
    const next = Store.clone(panelState);
    let created = 0;
    let updated = 0;
    imported.forEach((item) => {
      const phoneKey = String(item.phone || "").replace(/\D/g, "");
      const emailKey = String(item.email || "").trim().toLocaleLowerCase("pt-BR");
      const existing = next.students.find((student) => (phoneKey && String(student.phone || "").replace(/\D/g, "") === phoneKey) || (emailKey && String(student.email || "").trim().toLocaleLowerCase("pt-BR") === emailKey));
      const record = Store.createStudentRecord({
        ...(existing || {}),
        ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== "")),
        monthlyFee: item.monthlyFee === "" || item.monthlyFee === undefined ? existing?.monthlyFee || 0 : safeNumber(item.monthlyFee),
        status: item.status || existing?.status || "ativo",
        updatedAt: new Date().toISOString(),
        updatedBy: "Administracao",
        source: "painel-administrativo"
      });
      if (existing) {
        next.students[next.students.findIndex((student) => student.id === existing.id)] = record;
        updated += 1;
      } else {
        next.students.push(record);
        created += 1;
      }
    });
    if (!window.confirm(`Importar ${imported.length} aluno(s)? ${created} novo(s) e ${updated} atualizacao(oes).`)) return;
    saveWithLog(next, "students-csv-imported", "", `CSV importado: ${created} aluno(s) criado(s) e ${updated} atualizado(s).`);
    window.alert("Importacao concluida com sucesso.");
  } catch (error) {
    window.alert(`Nao foi possivel importar o CSV: ${error.message}`);
  } finally {
    input.value = "";
  }
}

function countDuplicateStudentField(field) {
  const counts = panelState.students.reduce((result, student) => {
    const value = String(student[field] || "").replace(/\D/g, "").trim();
    if (value) result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
  return Object.values(counts).filter((count) => count > 1).length;
}

function handlePlanCatalogSave(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const config = getAdminConfig();
  const name = payload.name.trim();
  if (config.plans.some((plan) => plan.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) {
    window.alert("Este plano ja esta cadastrado.");
    return;
  }
  config.plans.push({ id: `PLAN-${normalizeTextKey(name)}`, name, monthlyFee: safeNumber(payload.monthlyFee) });
  event.currentTarget.reset();
  saveAdminConfig(config, "plan-created", `Plano ${name} adicionado nas configuracoes.`);
}

function handleModalityCatalogSave(event) {
  event.preventDefault();
  const name = String(new FormData(event.currentTarget).get("name") || "").trim();
  const config = getAdminConfig();
  if (config.modalities.some((item) => item.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) {
    window.alert("Esta modalidade ja esta cadastrada.");
    return;
  }
  config.modalities.push(name);
  event.currentTarget.reset();
  saveAdminConfig(config, "modality-created", `Modalidade ${name} adicionada nas configuracoes.`);
}

function handlePaymentRulesSave(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const alertDays = String(payload.paymentAlertDays || "")
    .split(/[;,\s]+/)
    .map(Number)
    .filter((item) => Number.isFinite(item) && item >= 0);
  if (!alertDays.length) {
    window.alert("Informe ao menos um dia de aviso.");
    return;
  }
  const config = getAdminConfig();
  config.paymentAlertDays = [...new Set(alertDays)].sort((left, right) => right - left);
  config.paymentGraceDays = Math.max(0, safeNumber(payload.paymentGraceDays));
  config.blockAccessOnOverdue = event.currentTarget.elements.blockAccessOnOverdue.checked;
  config.whatsappNumber = String(payload.whatsappNumber || "").replace(/\D/g, "");
  saveAdminConfig(config, "student-app-payment-rules-updated", "Regras de aviso e bloqueio do aplicativo do aluno atualizadas.");
}

function getStaffUsers(includeInactive) {
  return (panelState.users || [])
    .filter((user) => ["professor", "instrutor"].includes(normalizeTextKey(user.role).toLocaleLowerCase("pt-BR")) && (includeInactive || user.status !== "inativo"))
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "pt-BR"));
}

function handleStaffCatalogSave(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const name = String(payload.name || "").trim();
  if (!name) return;
  if (getStaffUsers(true).some((user) => user.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) {
    window.alert("Este professor ja esta cadastrado.");
    return;
  }
  const professor = {
    id: Store.uid("USR-PROF"),
    name,
    email: String(payload.email || "").trim(),
    passwordHash: "",
    role: "professor",
    status: "ativo",
    lastLogin: ""
  };
  event.currentTarget.reset();
  saveWithLog(upsertRecordInState(panelState, "users", professor), "staff-created", "", `Professor ${name} adicionado a equipe.`);
}

function handleSettingsAction(event) {
  const planButton = event.target.closest("[data-delete-plan]");
  const modalityButton = event.target.closest("[data-delete-modality]");
  const staffButton = event.target.closest("[data-delete-staff]");
  if (!planButton && !modalityButton && !staffButton) return;
  if (staffButton) {
    const professor = (panelState.users || []).find((user) => user.id === staffButton.dataset.deleteStaff);
    if (!professor || !window.confirm(`Remover ${professor.name} da lista de professores? Os registros de presenca serao preservados.`)) return;
    const nextState = Store.clone(panelState);
    nextState.users = nextState.users.filter((user) => user.id !== professor.id);
    saveWithLog(nextState, "staff-removed", "", `Professor ${professor.name} removido da equipe ativa.`);
    return;
  }
  const config = getAdminConfig();
  if (planButton) config.plans = config.plans.filter((plan) => (plan.id || normalizeTextKey(plan.name)) !== planButton.dataset.deletePlan);
  if (modalityButton) config.modalities = config.modalities.filter((name) => name !== modalityButton.dataset.deleteModality);
  saveAdminConfig(config, "catalog-updated", "Catalogos administrativos atualizados.");
}

function getStaffTimeMinutes(entry, now) {
  if (!entry?.clockIn) return safeNumber(entry?.durationMinutes);
  const start = new Date(entry.clockIn);
  const end = entry.clockOut ? new Date(entry.clockOut) : (now || new Date());
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return safeNumber(entry.durationMinutes);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
}

function formatStaffTimeDuration(minutes) {
  const total = Math.max(0, Math.round(safeNumber(minutes)));
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}min`;
}

function formatStaffTimeClock(value) {
  if (!value) return "--:--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(parsed);
}

function populateStaffReportProfessorOptions() {
  const current = staffReportProfessorFilter.value;
  const byId = new Map(getStaffUsers(true).map((user) => [user.id, user.name]));
  (panelState.staffTimeEntries || []).forEach((entry) => {
    if (entry.staffId && !byId.has(entry.staffId)) byId.set(entry.staffId, entry.staffName || "Professor removido");
  });
  staffReportProfessorFilter.innerHTML = '<option value="">Toda a equipe</option>' + [...byId.entries()]
    .sort((left, right) => left[1].localeCompare(right[1], "pt-BR"))
    .map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("");
  if ([...byId.keys()].includes(current)) staffReportProfessorFilter.value = current;
}

function getFilteredStaffTimeEntries() {
  const start = staffReportStartDate.value || `${Store.currentMonth()}-01`;
  const end = staffReportEndDate.value || Store.todayISO();
  const staffId = staffReportProfessorFilter.value;
  return (panelState.staffTimeEntries || [])
    .filter((entry) => entry.status !== "cancelado" && entry.date >= start && entry.date <= end && (!staffId || entry.staffId === staffId))
    .sort((left, right) => String(right.clockIn || right.date || "").localeCompare(String(left.clockIn || left.date || "")));
}

function renderStaffTimeReport() {
  if (!staffReportStartDate.value) staffReportStartDate.value = `${Store.currentMonth()}-01`;
  if (!staffReportEndDate.value) staffReportEndDate.value = Store.todayISO();
  populateStaffReportProfessorOptions();
  const entries = getFilteredStaffTimeEntries();
  const now = new Date();
  const totalMinutes = entries.reduce((sum, entry) => sum + getStaffTimeMinutes(entry, now), 0);
  const incomplete = entries.filter((entry) => !entry.clockOut).length;
  const workedDays = new Set(entries.map((entry) => `${entry.staffId}:${entry.date}`)).size;
  const average = entries.length ? totalMinutes / entries.length : 0;
  const metrics = [
    ["Tempo total", formatStaffTimeDuration(totalMinutes), `${workedDays} dia(s) trabalhado(s)`, "primary"],
    ["Presencas", String(entries.length), "entradas registradas", "neutral"],
    ["Media de permanencia", formatStaffTimeDuration(average), "no periodo filtrado", "success"],
    ["Sem saida", String(incomplete), incomplete ? "requer conferencia" : "todas concluidas", incomplete ? "danger" : "success"]
  ];
  document.getElementById("staffTimeMetrics").innerHTML = metrics.map(([label, value, detail, tone]) => `<article class="staff-time-metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`).join("");
  const selectedOption = staffReportProfessorFilter.selectedOptions[0];
  document.getElementById("staffTimeReportPeriod").textContent = `${Store.formatDate(staffReportStartDate.value)} a ${Store.formatDate(staffReportEndDate.value)}`;
  document.getElementById("staffTimeReportPerson").textContent = selectedOption?.value ? selectedOption.textContent : "Toda a equipe";
  document.getElementById("staffTimeTable").innerHTML = entries.length
    ? `<div class="staff-time-table-head"><span>Professor</span><span>Data</span><span>Entrada</span><span>Saida</span><span>Tempo</span><span>Situacao</span></div>${entries.map((entry) => `<article class="staff-time-table-row"><strong data-label="Professor">${escapeHtml(entry.staffName || "Professor")}</strong><span data-label="Data">${escapeHtml(Store.formatDate(entry.date))}</span><span data-label="Entrada">${escapeHtml(formatStaffTimeClock(entry.clockIn))}</span><span data-label="Saida">${entry.clockOut ? escapeHtml(formatStaffTimeClock(entry.clockOut)) : "--:--"}</span><strong data-label="Tempo">${escapeHtml(formatStaffTimeDuration(getStaffTimeMinutes(entry, now)))}</strong><span data-label="Situacao">${badge(entry.clockOut ? "pago" : "pendente", entry.clockOut ? "Concluido" : "Em aberto")}</span></article>`).join("")}`
    : '<div class="empty-state">Nenhum registro de presenca no periodo selecionado.</div>';
}

function exportStaffTimeCsv() {
  const entries = getFilteredStaffTimeEntries();
  const rows = [
    ["Professor", "Data", "Entrada", "Saida", "Tempo em minutos", "Tempo formatado", "Situacao", "Origem", "Dispositivo"],
    ...entries.map((entry) => [entry.staffName, entry.date, formatStaffTimeClock(entry.clockIn), entry.clockOut ? formatStaffTimeClock(entry.clockOut) : "", getStaffTimeMinutes(entry), formatStaffTimeDuration(getStaffTimeMinutes(entry)), entry.clockOut ? "Concluido" : "Em aberto", entry.source || "", entry.deviceId || ""])
  ];
  const content = `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(";")).join("\r\n")}`;
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  link.href = objectUrl;
  link.download = `pro-fitness-presenca-professores-${staffReportStartDate.value}-${staffReportEndDate.value}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function renderPanel() {
  panelState = Store.loadData();
  if (selectedStudentId && !Store.findStudent(panelState, selectedStudentId)) {
    selectedStudentId = panelState.students[0] ? panelState.students[0].id : "";
  }
  renderOverview();
  setActiveMainSection(activeMainSection);
}

function renderOperation() {
  renderRoster();
  renderWorkspace();
  renderAlertBoard();
  renderLogBoard();
}

function handleStudentSave(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const existingStudent = Store.findStudent(panelState, payload.id);
  const nextStudent = Store.createStudentRecord({
    ...existingStudent,
    ...payload,
    monthlyFee: safeNumber(payload.monthlyFee)
  });

  const nextState = Store.upsertStudent(panelState, nextStudent);
  selectedStudentId = nextStudent.id;
  saveWithLog(
    nextState,
    payload.id ? "student-updated" : "student-created",
    nextStudent.id,
    payload.id ? "Cadastro de aluno atualizado no painel." : "Novo aluno criado no painel."
  );
}

function handlePaymentSave(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (!payload.studentId) {
    return;
  }

  const existingByReference = !payload.id
    ? getStudentRecords("payments", payload.studentId).find((payment) => payment.reference === payload.reference)
    : null;
  const existing = findRecord("payments", payload.id) || existingByReference;
  const calculatedAmount = Math.max(0, safeNumber(payload.amount) - safeNumber(payload.discount) + safeNumber(payload.fine));
  const receivesValue = ["pago", "parcial"].includes(payload.status);
  const paidAt = receivesValue ? payload.paidAt || existing?.paidAt || Store.todayISO() : "";
  const paidAmount = receivesValue
    ? (payload.paidAmount === "" ? calculatedAmount : Math.max(0, safeNumber(payload.paidAmount)))
    : 0;
  const resolvedStatus = payload.status === "cancelado"
    ? "cancelado"
    : paidAmount > 0 && paidAmount < calculatedAmount
      ? "parcial"
      : paidAmount >= calculatedAmount && receivesValue
        ? "pago"
        : payload.status;

  if (receivesValue && !paidAt) {
    window.alert("Informe a data do pagamento.");
    paymentForm.elements.paidAt.focus();
    return;
  }

  let reversalReason = existing?.reversalReason || "";
  let reversedBy = existing?.reversedBy || "";
  let reversedAt = existing?.reversedAt || "";
  if (resolvedStatus === "cancelado" && existing?.status !== "cancelado") {
    reversalReason = window.prompt("Informe o motivo do cancelamento/estorno desta mensalidade:", "")?.trim() || "";
    if (!reversalReason) return;
    reversedBy = payload.recordedBy || getDefaultPaymentRecorder();
    reversedAt = new Date().toISOString();
  }

  const nextPayment = Store.createPaymentRecord({
    ...existing,
    ...payload,
    id: payload.id || (existingByReference ? existingByReference.id : ""),
    amount: safeNumber(payload.amount),
    discount: safeNumber(payload.discount),
    fine: safeNumber(payload.fine),
    netAmount: calculatedAmount,
    paidAmount: paidAmount,
    paidAt: paidAt,
    status: resolvedStatus,
    method: receivesValue ? payload.method : existing?.method || payload.method || "pix",
    recordedBy: payload.recordedBy || existing?.recordedBy || getDefaultPaymentRecorder(),
    reversalReason,
    reversedBy,
    reversedAt,
    updatedAt: new Date().toISOString()
  });

  paymentForm.elements.id.value = nextPayment.id;
  financeHistoryStudentId = payload.studentId;
  let nextState = Store.upsertPayment(panelState, nextPayment);
  nextState = Store.updateStudent(nextState, payload.studentId, { monthlyFee: nextPayment.amount });
  nextState = syncPaymentMovement(nextState, nextPayment);
  closePaymentDialog();
  saveWithLog(
    nextState,
    existing ? "payment-updated" : "payment-created",
    payload.studentId,
    `Mensalidade ${nextPayment.reference} registrada como ${nextPayment.status} por ${nextPayment.recordedBy}.`
  );
}

function handleMovementSave(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const existing = findRecord("movements", payload.id);
  const movement = Store.createMovementRecord({
    ...existing,
    ...payload,
    amount: safeNumber(payload.amount),
    status: existing?.status || "confirmado"
  });
  cashDateFilter.value = movement.date;
  closeMovementEditor();
  saveWithLog(
    upsertRecord("movements", movement),
    payload.id ? "movement-updated" : "movement-created",
    "",
    `${movement.type === "entrada" ? "Entrada" : "Saida"} de caixa registrada: ${movement.description}.`
  );
}

function handleExpenseSave(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const existing = findRecord("expenses", payload.id);
  const expense = Store.createExpenseRecord({
    ...existing,
    ...payload,
    amount: safeNumber(payload.amount),
    paidAt: payload.status === "pago" ? existing?.paidAt || Store.todayISO() : ""
  });
  let nextState = upsertRecordInState(panelState, "expenses", expense);
  nextState = syncExpenseMovement(nextState, expense);
  closeExpenseEditor();
  saveWithLog(
    nextState,
    payload.id ? "expense-updated" : "expense-created",
    "",
    `Despesa ${expense.description} atualizada para ${expense.status}.`
  );
}

function handleCashClosingSave(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const summary = updateCashClosingPreview();
  const existing = findRecord("cashClosings", payload.id);
  const closing = Store.createCashClosingRecord({
    ...existing,
    ...payload,
    date: cashDateFilter.value,
    openingBalance: summary.opening,
    cashIncome: summary.cashIncome,
    cashExpense: summary.cashExpense,
    expectedCash: summary.expected,
    countedCash: summary.counted,
    difference: summary.difference,
    totalIncome: summary.income,
    totalExpense: summary.expense,
    closedAt: new Date().toISOString()
  });
  saveWithLog(
    upsertRecord("cashClosings", closing),
    existing ? "cash-closing-updated" : "cash-closing-created",
    "",
    `Caixa de ${Store.formatDate(closing.date)} fechado com diferenca de ${Store.currency(closing.difference)}.`
  );
}

function handleWorkoutSave(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (!payload.studentId) {
    return;
  }

  const existing = findRecord("workouts", payload.id);
  const exerciseNames = String(payload.exercises || "")
    .split(/[\n,]/)
    .map((exercise) => exercise.trim())
    .filter(Boolean);
  const existingItems = getWorkoutExerciseItems(existing);
  const sameExerciseNames = existingItems.length === exerciseNames.length
    && existingItems.every((item, index) => String(item.name || "").trim().toLocaleLowerCase("pt-BR") === String(exerciseNames[index] || "").trim().toLocaleLowerCase("pt-BR"));
  const applySharedValue = (currentValue, formValue) => {
    const normalized = String(formValue || "").trim();
    return normalized && normalized.toLocaleLowerCase("pt-BR") !== "variado" ? normalized : currentValue;
  };
  const exerciseItems = sameExerciseNames
    ? existingItems.map((item) => ({
        ...item,
        sets: applySharedValue(item.sets, payload.sets),
        reps: applySharedValue(item.reps, payload.reps),
        load: applySharedValue(item.load, payload.load),
        rest: applySharedValue(item.rest, payload.rest)
      }))
    : exerciseNames.map((name, index) => ({
        id: existingItems[index]?.id || Store.uid("EXI"),
        exerciseId: existingItems[index]?.exerciseId || panelState.exercises.find((exercise) => String(exercise.name || "").trim().toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))?.id || "",
        name,
        sets: payload.sets.trim(),
        reps: payload.reps.trim(),
        load: payload.load.trim(),
        rest: payload.rest.trim(),
        notes: ""
      }));
  const workout = {
    ...existing,
    id: payload.id || Store.uid("TR"),
    studentId: payload.studentId,
    title: payload.title.trim(),
    division: payload.division,
    muscleGroup: payload.muscleGroup.trim(),
    exercises: exerciseNames,
    exerciseItems,
    sets: payload.sets.trim() || summarizeWorkoutExerciseField(exerciseItems, "sets"),
    reps: payload.reps.trim() || summarizeWorkoutExerciseField(exerciseItems, "reps"),
    load: payload.load.trim() || summarizeWorkoutExerciseField(exerciseItems, "load"),
    rest: payload.rest.trim() || summarizeWorkoutExerciseField(exerciseItems, "rest"),
    status: payload.status,
    notes: payload.notes.trim(),
    createdAt: existing?.createdAt || Store.todayISO(),
    updatedAt: new Date().toISOString()
  };

  saveWithLog(
    upsertRecord("workouts", workout),
    existing ? "workout-updated" : "workout-created",
    workout.studentId,
    existing ? `Treino ${workout.title} atualizado.` : `Treino ${workout.title} criado.`
  );
}

function handleAssessmentSave(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (!payload.studentId) {
    return;
  }

  const existing = findRecord("assessments", payload.id);
  const weight = safeNumber(payload.weight);
  const height = safeNumber(payload.height);
  const assessment = {
    ...existing,
    id: payload.id || Store.uid("AV"),
    studentId: payload.studentId,
    date: payload.date,
    weight: weight,
    height: height,
    imc: calculateImc(weight, height),
    bodyFat: safeNumber(payload.bodyFat),
    chest: safeNumber(payload.chest),
    waist: safeNumber(payload.waist),
    hip: safeNumber(payload.hip),
    arm: safeNumber(payload.arm),
    thigh: safeNumber(payload.thigh),
    photos: String(payload.photos || "")
      .split(/[\n,]/)
      .map((photo) => photo.trim())
      .filter(Boolean),
    notes: payload.notes.trim()
  };

  saveWithLog(
    upsertRecord("assessments", assessment),
    existing ? "assessment-updated" : "assessment-created",
    assessment.studentId,
    existing ? "Avaliacao fisica atualizada." : "Nova avaliacao fisica registrada."
  );
}

function handleScheduleSave(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (!payload.studentId) {
    return;
  }

  const existing = findRecord("schedule", payload.id);
  const scheduleItem = {
    ...existing,
    id: payload.id || Store.uid("AG"),
    studentId: payload.studentId,
    date: payload.date,
    time: payload.time,
    type: payload.type,
    status: payload.status,
    notes: payload.notes.trim()
  };

  saveWithLog(
    upsertRecord("schedule", scheduleItem),
    existing ? "schedule-updated" : "schedule-created",
    scheduleItem.studentId,
    existing ? "Aula atualizada na agenda." : "Nova aula marcada na agenda."
  );
}

function calculateImc(weight, height) {
  if (!weight || !height) {
    return 0;
  }

  return Number((weight / (height * height)).toFixed(2));
}

function updateImcPreview() {
  const value = calculateImc(assessmentForm.elements.weight.value, assessmentForm.elements.height.value);
  assessmentForm.elements.imc.value = value ? value.toFixed(2) : "";
}

function createNewStudent() {
  studentSearchTerm = "";
  activeFilter = "todos";
  if (studentSearchFilter) {
    studentSearchFilter.value = "";
  }
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === "todos");
  });

  const student = Store.createStudentRecord({
    name: "Novo aluno",
    plan: "Plano a definir",
    monthlyFee: 0
  });
  selectedStudentId = student.id;
  activePanelTab = "ficha";
  activeMainSection = "operation";
  saveWithLog(Store.upsertStudent(panelState, student), "student-created", student.id, "Novo aluno criado para matricula.");
}

function createNewWorkout() {
  const student = getSelectedStudent();
  if (student) {
    populateWorkoutForm(student);
  }
}

function createNewAssessment() {
  const student = getSelectedStudent();
  if (student) {
    populateAssessmentForm(student);
  }
}

function createNewSchedule() {
  const student = getSelectedStudent();
  if (student) {
    populateScheduleForm(student);
  }
}

function createNewPayment() {
  activeFinanceTab = "payments";
  setActiveFinanceTab("payments");
  const preferredStudentId = financeHistoryStudentId || selectedStudentId;
  const student = Store.findStudent(panelState, preferredStudentId) || panelState.students[0] || null;
  if (student) {
    const latestPayment = getLatestStudentPayment(student.id);
    const reference = financeMonthFilter.value || Store.currentMonth();
    const paymentDraft = {
      studentId: student.id,
      reference: reference,
      amount: student.monthlyFee || latestPayment?.amount || 0,
      dueDate: getSuggestedPaymentDueDate(student.id, reference, null),
      status: "pendente",
      method: latestPayment?.method || "pix",
      paidAmount: 0,
      recordedBy: getDefaultPaymentRecorder()
    };
    financeHistoryStudentId = student.id;
    populatePaymentForm(student, paymentDraft);
    setPaymentEditorMode(student, paymentDraft, "new", "inexistente");
    renderFinanceStudentHistory(student.id);
    openPaymentDialog();
  }
}

function createNewMovement() {
  setActiveFinanceTab("cash");
  openMovementEditor(null);
}

function createNewExpense() {
  setActiveFinanceTab("expenses");
  openExpenseEditor(null);
}

function generateMonthlyPayments(options = {}) {
  const reference = options.reference || financeMonthFilter.value || Store.currentMonth();
  const activeStudents = panelState.students.filter((student) => student.status === "ativo" || student.enrollmentStatus === "ativo");
  const existingKeys = new Set(panelState.payments.map((payment) => `${payment.studentId}:${payment.reference}`));
  const payments = activeStudents
    .filter((student) => !existingKeys.has(`${student.id}:${reference}`) && safeNumber(student.monthlyFee) > 0)
    .map((student) => Store.createPaymentRecord({
      studentId: student.id,
      reference: reference,
      amount: safeNumber(student.monthlyFee),
      dueDate: `${reference}-10`,
      status: "pendente",
      method: "pix",
      description: "Mensalidade"
    }));

  if (!payments.length) {
    if (!options.silent) window.alert("Todos os alunos ativos ja possuem mensalidade nesta competencia.");
    return 0;
  }

  const nextState = Store.clone(panelState);
  nextState.payments = [...payments, ...nextState.payments];
  saveWithLog(nextState, "monthly-payments-generated", "", `${payments.length} mensalidade(s) gerada(s) para ${reference}.`);
  if (!options.silent) window.alert(`${payments.length} mensalidade(s) gerada(s) para ${reference}.`);
  return payments.length;
}

function getExpenseRecurrenceKey(expense) {
  return `${String(expense.description || "").trim().toLocaleLowerCase("pt-BR")}|${String(expense.supplier || "").trim().toLocaleLowerCase("pt-BR")}|${expense.costCenter || "geral"}`;
}

function generateRecurringExpenses(options = {}) {
  const reference = options.reference || expenseMonthFilter.value || financeMonthFilter.value || Store.currentMonth();
  const existingKeys = new Set(panelState.expenses
    .filter((expense) => String(expense.dueDate || "").slice(0, 7) === reference)
    .map(getExpenseRecurrenceKey));
  const latestByKey = new Map();
  panelState.expenses
    .filter((expense) => expense.recurring && expense.recurring !== "nao" && String(expense.dueDate || "").slice(0, 7) < reference)
    .sort((left, right) => String(left.dueDate).localeCompare(String(right.dueDate)))
    .forEach((expense) => latestByKey.set(getExpenseRecurrenceKey(expense), expense));

  const generated = [...latestByKey.entries()].flatMap(([key, source]) => {
    if (existingKeys.has(key)) return [];
    const sourceMonth = String(source.dueDate || "").slice(0, 7);
    if (source.recurring === "anual" && sourceMonth.slice(5, 7) !== reference.slice(5, 7)) return [];
    const day = String(source.dueDate || "").slice(8, 10) || "10";
    return [Store.createExpenseRecord({
      ...source,
      id: "",
      dueDate: `${reference}-${day}`,
      status: "pendente",
      paidAt: "",
      recurrenceId: source.recurrenceId || source.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })];
  });

  if (!generated.length) {
    if (!options.silent) window.alert("Nenhuma despesa recorrente nova para esta competencia.");
    return 0;
  }
  const nextState = Store.clone(panelState);
  nextState.expenses = [...generated, ...nextState.expenses];
  saveWithLog(nextState, "recurring-expenses-generated", "", `${generated.length} despesa(s) recorrente(s) gerada(s) para ${reference}.`);
  if (!options.silent) window.alert(`${generated.length} despesa(s) recorrente(s) gerada(s).`);
  return generated.length;
}

function autoGenerateCurrentMonthFinance() {
  const reference = Store.currentMonth();
  const marker = `profitness-finance-generated-${reference}`;
  if (localStorage.getItem(marker)) return;
  generateMonthlyPayments({ reference, silent: true });
  generateRecurringExpenses({ reference, silent: true });
  localStorage.setItem(marker, new Date().toISOString());
}

function handleMovementAction(event) {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.editMovement || button.dataset.voidMovement;
  const movement = findRecord("movements", id);
  if (!movement) return;

  if (button.dataset.editMovement) {
    openMovementEditor(movement);
    return;
  }

  const status = movement.status === "estornado" ? "confirmado" : "estornado";
  const actionLabel = status === "estornado" ? "estornar" : "reativar";
  if (!window.confirm(`Deseja ${actionLabel} o movimento ${movement.description}?`)) {
    return;
  }
  const reason = status === "estornado"
    ? window.prompt("Informe o motivo do estorno:", movement.voidReason || "")?.trim() || ""
    : "";
  if (status === "estornado" && !reason) return;
  const responsible = status === "estornado"
    ? window.prompt("Responsavel pelo estorno:", getDefaultPaymentRecorder())?.trim() || ""
    : "";
  if (status === "estornado" && !responsible) return;
  saveWithLog(
    updateRecord("movements", movement.id, (record) => ({
      ...record,
      status,
      voidReason: reason,
      voidedBy: responsible,
      voidedAt: status === "estornado" ? new Date().toISOString() : "",
      updatedAt: new Date().toISOString()
    })),
    status === "estornado" ? "movement-voided" : "movement-restored",
    movement.studentId || "",
    `Movimento ${movement.description} marcado como ${status}.`
  );
}

function handleExpenseAction(event) {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.editExpense || button.dataset.payExpense;
  const expense = findRecord("expenses", id);
  if (!expense) return;

  if (button.dataset.editExpense) {
    openExpenseEditor(expense);
    return;
  }

  if (!window.confirm(`Confirmar pagamento de ${expense.description} no valor de ${Store.currency(expense.amount)}?`)) {
    return;
  }
  const paidExpense = Store.createExpenseRecord({ ...expense, status: "pago", paidAt: Store.todayISO() });
  let nextState = upsertRecordInState(panelState, "expenses", paidExpense);
  nextState = syncExpenseMovement(nextState, paidExpense);
  saveWithLog(nextState, "expense-paid", "", `Despesa ${expense.description} marcada como paga.`);
}

function escapeCsvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportFinanceCsv() {
  const studentId = getReportSelectedStudentId();
  const student = studentId ? Store.findStudent(panelState, studentId) : null;
  let rows;
  let filename;

  if (student) {
    const payments = getReportPayments(student.id);
    rows = [
      ["Aluno", "Competencia", "Vencimento", "Data do pagamento", "Valor previsto", "Desconto", "Multa", "Valor final", "Valor pago", "Forma", "Status", "Responsavel", "Observacao"],
      ...payments.map((payment) => {
        const status = getEffectivePaymentStatus(payment);
        return [
          student.name,
          formatPaymentReference(payment.reference),
          payment.dueDate || "",
          status === "pago" ? payment.paidAt || "" : "",
          safeNumber(payment.amount).toFixed(2).replace(".", ","),
          safeNumber(payment.discount).toFixed(2).replace(".", ","),
          safeNumber(payment.fine).toFixed(2).replace(".", ","),
          getPaymentNetAmount(payment).toFixed(2).replace(".", ","),
          status === "pago" ? getPaymentPaidAmount(payment).toFixed(2).replace(".", ",") : "",
          status === "pago" ? FINANCE_METHOD_LABELS[payment.method] || payment.method : "",
          getPaymentStatusLabel(status),
          payment.recordedBy || "",
          payment.notes || ""
        ];
      })
    ];
    filename = `pro-fitness-${student.name.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/gi, "-")}-${reportStartDate.value}-${reportEndDate.value}.csv`;
  } else {
    const movements = getReportMovements();
    rows = [
      ["Data", "Horario", "Tipo", "Categoria", "Descricao", "Forma", "Conta", "Valor", "Status"],
      ...movements.map((item) => [
        item.date,
        item.time || "",
        item.type,
        FINANCE_CATEGORY_LABELS[item.category] || item.category,
        item.description,
        FINANCE_METHOD_LABELS[item.method] || item.method,
        item.account || "",
        safeNumber(item.amount).toFixed(2).replace(".", ","),
        item.status || "confirmado"
      ])
    ];
    filename = `pro-fitness-financeiro-${reportStartDate.value}-${reportEndDate.value}.csv`;
  }

  const content = `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(";")).join("\r\n")}`;
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function toggleStudentPresence(student) {
  const openPresence = getOpenAccessCheckin(student.id);
  const now = new Date();

  if (openPresence) {
    const nextRecord = {
      ...openPresence,
      checkedOutAt: now.toISOString(),
      presenceStatus: "outside"
    };
    saveWithLog(
      upsertRecord("checkins", nextRecord),
      "manual-presence-exit",
      student.id,
      `Saida manual registrada para ${student.name}.`
    );
    return;
  }

  const access = Store.getAccessState(panelState, student.id);
  if (!access.allowsGate) {
    const proceed = window.confirm("O acesso deste aluno esta bloqueado. Deseja registrar a presenca mesmo assim?");
    if (!proceed) {
      return;
    }
  }

  const checkin = {
    id: Store.uid("CK"),
    studentId: student.id,
    workoutId: "",
    date: Store.todayISO(),
    time: now.toTimeString().slice(0, 5),
    type: "access",
    checkedInAt: now.toISOString(),
    checkedOutAt: "",
    presenceSource: "painel-administrativo",
    presenceStatus: "inside",
    usedLoad: "",
    difficulty: "",
    pain: "",
    notes: "Presenca registrada manualmente no painel."
  };

  saveWithLog(
    upsertRecord("checkins", checkin),
    "manual-presence-entry",
    student.id,
    `Presenca manual registrada para ${student.name}.`
  );
}

function handleWorkspaceAction(event) {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  if (button.dataset.printReceipt) {
    openPaymentReceipt(button.dataset.printReceipt);
    return;
  }

  const student = getSelectedStudent();
  if (!student) {
    return;
  }

  if (button.dataset.quickAction === "payment") {
    openStudentPaymentFlow(student);
    return;
  }

  if (button.dataset.quickAction === "edit") {
    setActivePanelTab("ficha");
    studentForm.elements.name.focus();
    return;
  }

  if (button.dataset.quickAction === "workout") {
    setActivePanelTab("treinos");
    populateWorkoutForm(student);
    workoutForm.elements.title.focus();
    return;
  }

  if (button.dataset.quickAction === "assessment") {
    setActivePanelTab("avaliacoes");
    populateAssessmentForm(student);
    assessmentForm.elements.weight.focus();
    return;
  }

  if (button.dataset.quickAction === "presence") {
    toggleStudentPresence(student);
    return;
  }

  if (button.dataset.editWorkout) {
    populateWorkoutForm(student, findRecord("workouts", button.dataset.editWorkout));
    return;
  }

  if (button.dataset.duplicateWorkout) {
    const workout = findRecord("workouts", button.dataset.duplicateWorkout);
    if (!workout) {
      return;
    }
    const copy = {
      ...Store.clone(workout),
      id: Store.uid("TR"),
      title: `${workout.title} (copia)`,
      status: "ativo",
      exerciseItems: getWorkoutExerciseItems(workout).map((item) => ({ ...item, id: Store.uid("EXI") })),
      createdAt: Store.todayISO(),
      updatedAt: new Date().toISOString()
    };
    saveWithLog(upsertRecord("workouts", copy), "workout-duplicated", student.id, `Treino ${workout.title} duplicado.`);
    return;
  }

  if (button.dataset.toggleWorkout) {
    const workout = findRecord("workouts", button.dataset.toggleWorkout);
    if (!workout) {
      return;
    }
    const status = workout.status === "ativo" ? "encerrado" : "ativo";
    saveWithLog(
      updateRecord("workouts", workout.id, (record) => ({ ...record, status: status })),
      "workout-status-updated",
      student.id,
      `Treino ${workout.title} marcado como ${status}.`
    );
    return;
  }

  if (button.dataset.editAssessment) {
    populateAssessmentForm(student, findRecord("assessments", button.dataset.editAssessment));
    return;
  }

  if (button.dataset.editSchedule) {
    populateScheduleForm(student, findRecord("schedule", button.dataset.editSchedule));
    return;
  }

  if (button.dataset.completeSchedule) {
    const scheduleItem = findRecord("schedule", button.dataset.completeSchedule);
    if (!scheduleItem) {
      return;
    }
    saveWithLog(
      updateRecord("schedule", scheduleItem.id, (record) => ({ ...record, status: "realizada" })),
      "schedule-completed",
      student.id,
      `Aula de ${Store.formatDate(scheduleItem.date)} marcada como realizada.`
    );
    return;
  }

}

function handleFinanceAction(event) {
  const button = event.target.closest("button");
  if (button?.dataset.printReceipt) {
    openPaymentReceipt(button.dataset.printReceipt);
    return;
  }
  const historyTrigger = button?.dataset.historyStudent || (!button ? event.target.closest("[data-history-row]")?.dataset.historyRow : "");

  if (historyTrigger) {
    financeHistoryStudentId = historyTrigger;
    selectedStudentId = historyTrigger;
    renderFinanceStudentHistory(historyTrigger);
    return;
  }

  if (!button) {
    return;
  }

  if (button.dataset.receiveStudent) {
    const student = Store.findStudent(panelState, button.dataset.receiveStudent);
    if (student) {
      selectedStudentId = student.id;
      financeHistoryStudentId = student.id;
      openStudentPaymentFlow(student, financeMonthFilter.value || Store.currentMonth());
    }
    return;
  }

  const paymentId = button.dataset.editPayment || button.dataset.receivePayment;
  const payment = findRecord("payments", paymentId);
  if (!payment) {
    return;
  }

  const student = Store.findStudent(panelState, payment.studentId);
  if (!student) {
    return;
  }

  selectedStudentId = student.id;
  financeHistoryStudentId = student.id;
  renderFinanceStudentHistory(student.id);

  if (button.dataset.editPayment) {
    populatePaymentForm(student, payment);
    setPaymentEditorMode(student, payment, "edit", getEffectivePaymentStatus(payment));
    openPaymentDialog();
    return;
  }

  const paymentDraft = {
    ...payment,
    status: "pago",
    paidAt: payment.paidAt || Store.todayISO(),
    paidAmount: payment.paidAmount || getPaymentNetAmount(payment),
    recordedBy: payment.recordedBy || getDefaultPaymentRecorder()
  };
  populatePaymentForm(student, paymentDraft);
  setPaymentEditorMode(student, paymentDraft, "receive", getEffectivePaymentStatus(payment));
  openPaymentDialog();
  window.requestAnimationFrame(() => paymentForm.elements.method.focus({ preventScroll: true }));
}

function handleTabKeyboard(event) {
  if (!event.target.matches("[data-panel-tab]")) {
    return;
  }

  const tabs = [...document.querySelectorAll("[data-panel-tab]")];
  const index = tabs.indexOf(event.target);
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    return;
  }

  event.preventDefault();
  let nextIndex = index;
  if (event.key === "ArrowLeft") {
    nextIndex = (index - 1 + tabs.length) % tabs.length;
  }
  if (event.key === "ArrowRight") {
    nextIndex = (index + 1) % tabs.length;
  }
  if (event.key === "Home") {
    nextIndex = 0;
  }
  if (event.key === "End") {
    nextIndex = tabs.length - 1;
  }

  tabs[nextIndex].focus();
  setActivePanelTab(tabs[nextIndex].dataset.panelTab);
}

function showAdminAccess(loggedIn) {
  document.getElementById("adminAuthView").hidden = loggedIn;
  document.getElementById("adminAppShell").hidden = !loggedIn;
  if (loggedIn) document.getElementById("adminCurrentUser").textContent = authSession?.account?.login || "Administracao";
}

async function loginAdministrator(login, password) {
  const feedback = document.getElementById("adminLoginFeedback");
  feedback.textContent = "Verificando acesso...";
  try {
    const session = await Store.loginRemote(login, password);
    if (session.account?.role !== "admin") {
      await Store.logoutRemote();
      throw new Error("Esta conta nao possui acesso administrativo.");
    }
    authSession = session;
    if (session.account?.mustChangePassword) {
      document.getElementById("adminLoginCard").hidden = true;
      document.getElementById("adminPasswordChangeCard").hidden = false;
      feedback.textContent = "";
      return;
    }
    showAdminAccess(true);
    await refreshAdminFromRemote({ notify: false });
    panelState = Store.loadData();
    renderPanel();
    renderAdminSyncStatus();
    feedback.textContent = "";
  } catch (error) {
    feedback.textContent = error.message || "Nao foi possivel entrar.";
  }
}

async function logoutAdministrator() {
  await Store.logoutRemote();
  authSession = null;
  managedAccounts = [];
  panelState = Store.migrateData(Store.createEmptySnapshot());
  Store.saveData(panelState);
  showAdminAccess(false);
  document.getElementById("adminLoginCard").hidden = false;
  document.getElementById("adminPasswordChangeCard").hidden = true;
}

function renderManagedAccounts() {
  const target = document.getElementById("accountList");
  target.innerHTML = managedAccounts.length ? managedAccounts.map((account) => `<article><div><strong>${escapeHtml(account.login)}</strong><span>${escapeHtml(account.role)} · ${account.active === false ? "bloqueada" : "ativa"}</span></div><button class="ghost-button" data-reset-account="${escapeHtml(account.id)}" type="button">Nova senha</button><button class="ghost-button" data-toggle-account="${escapeHtml(account.id)}" type="button">${account.active === false ? "Ativar" : "Bloquear"}</button></article>`).join("") : '<p>Nenhuma conta cadastrada.</p>';
}

async function loadManagedAccounts() {
  try {
    managedAccounts = await Store.listAccountsRemote();
    renderManagedAccounts();
  } catch (error) {
    document.getElementById("accountList").innerHTML = `<p>${escapeHtml(error.message || "Nao foi possivel carregar as contas.")}</p>`;
  }
}

async function createManagedAccountFromForm(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await Store.createAccountRemote(data);
    event.currentTarget.reset();
    await loadManagedAccounts();
    window.alert(`A senha temporaria de ${result.account.login} e:\n\n${result.temporaryPassword}\n\nEla sera exibida somente agora e devera ser trocada no primeiro acesso.`);
  } catch (error) {
    window.alert(error.message || "Nao foi possivel criar a conta.");
  }
}

async function handleAccountListAction(event) {
  const resetButton = event.target.closest("[data-reset-account]");
  const toggleButton = event.target.closest("[data-toggle-account]");
  try {
    if (resetButton) {
      const result = await Store.resetPasswordRemote(resetButton.dataset.resetAccount);
      window.alert(`Nova senha temporaria de ${result.account.login}:\n\n${result.temporaryPassword}\n\nEla sera exibida somente agora.`);
      return;
    }
    if (toggleButton) {
      const account = managedAccounts.find((item) => item.id === toggleButton.dataset.toggleAccount);
      if (!account) return;
      await Store.updateAccountRemote({ id: account.id, active: account.active === false, permissions: account.permissions || [] });
      await loadManagedAccounts();
    }
  } catch (error) {
    window.alert(error.message || "Nao foi possivel alterar a conta.");
  }
}

async function stopGateSimulatorCamera() {
  if (gateSimulatorStream) gateSimulatorStream.getTracks().forEach((track) => track.stop());
  gateSimulatorStream = null;
  document.getElementById("gateSimulatorVideo").hidden = true;
}

async function startGateSimulatorCamera() {
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
    window.alert("Leitura automatica indisponivel neste navegador. Cole o conteudo do QR no campo.");
    return;
  }
  try {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    gateSimulatorStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    const video = document.getElementById("gateSimulatorVideo");
    video.srcObject = gateSimulatorStream; video.hidden = false; await video.play();
    const scan = async () => {
      if (!gateSimulatorStream) return;
      const codes = await detector.detect(video).catch(() => []);
      if (codes[0]?.rawValue) {
        document.getElementById("gateSimulatorPayload").value = codes[0].rawValue;
        await stopGateSimulatorCamera();
        document.getElementById("gateSimulatorForm").requestSubmit();
        return;
      }
      window.requestAnimationFrame(scan);
    };
    window.requestAnimationFrame(scan);
  } catch (error) {
    window.alert("Nao foi possivel abrir a camera. Cole o conteudo do QR no campo.");
  }
}

async function validateGateSimulator(event) {
  event.preventDefault();
  const resultTarget = document.getElementById("gateSimulatorResult");
  resultTarget.className = "gate-simulator-result";
  resultTarget.innerHTML = "<strong>Validando...</strong>";
  try {
    const result = await Store.validateGateRemote(new FormData(event.currentTarget).get("payload"));
    resultTarget.classList.add(result.allowed ? "allowed" : "blocked");
    resultTarget.innerHTML = `<strong>${result.allowed ? "Acesso liberado" : "Acesso recusado"}</strong><p>${escapeHtml(result.reason || result.result)}</p>${result.student ? `<span>${escapeHtml(result.student.name)}</span>` : ""}`;
    if (result.allowed) await refreshAdminFromRemote({ notify: false });
  } catch (error) {
    resultTarget.classList.add("blocked");
    resultTarget.innerHTML = `<strong>Falha na validacao</strong><p>${escapeHtml(error.message)}</p>`;
  }
}

function attachPanelEvents() {
  studentForm.addEventListener("submit", handleStudentSave);
  paymentForm.addEventListener("submit", handlePaymentSave);
  movementForm.addEventListener("submit", handleMovementSave);
  expenseForm.addEventListener("submit", handleExpenseSave);
  cashClosingForm.addEventListener("submit", handleCashClosingSave);
  workoutForm.addEventListener("submit", handleWorkoutSave);
  assessmentForm.addEventListener("submit", handleAssessmentSave);
  scheduleForm.addEventListener("submit", handleScheduleSave);
  weeklyScheduleForm.addEventListener("submit", handleWeeklyScheduleSave);
  planCatalogForm.addEventListener("submit", handlePlanCatalogSave);
  modalityCatalogForm.addEventListener("submit", handleModalityCatalogSave);
  paymentRulesForm.addEventListener("submit", handlePaymentRulesSave);
  staffCatalogForm.addEventListener("submit", handleStaffCatalogSave);
  document.getElementById("adminLoginForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await loginAdministrator(form.get("login"), form.get("password")); });
  document.getElementById("adminDemoLoginButton").addEventListener("click", () => loginAdministrator("admin.demo", "Demo1234"));
  document.getElementById("adminPasswordChangeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") || "");
    const feedback = document.getElementById("adminPasswordChangeFeedback");
    if (newPassword !== String(form.get("confirmPassword") || "")) { feedback.textContent = "A confirmacao nao confere."; return; }
    try {
      authSession = await Store.changePasswordRemote(form.get("currentPassword"), newPassword);
      document.getElementById("adminLoginCard").hidden = false;
      document.getElementById("adminPasswordChangeCard").hidden = true;
      showAdminAccess(true); await refreshAdminFromRemote({ notify: false }); panelState = Store.loadData(); renderPanel();
    } catch (error) { feedback.textContent = error.message || "Nao foi possivel alterar a senha."; }
  });
  document.getElementById("cancelAdminPasswordChange").addEventListener("click", logoutAdministrator);
  document.getElementById("adminLogoutButton").addEventListener("click", logoutAdministrator);
  document.getElementById("accountForm").addEventListener("submit", createManagedAccountFromForm);
  document.getElementById("refreshAccountsButton").addEventListener("click", loadManagedAccounts);
  document.getElementById("accountList").addEventListener("click", handleAccountListAction);
  document.getElementById("openGateSimulatorButton").addEventListener("click", () => document.getElementById("gateSimulatorDialog").showModal());
  document.getElementById("closeGateSimulatorButton").addEventListener("click", async () => { await stopGateSimulatorCamera(); document.getElementById("gateSimulatorDialog").close(); });
  document.getElementById("startGateSimulatorCamera").addEventListener("click", startGateSimulatorCamera);
  document.getElementById("gateSimulatorForm").addEventListener("submit", validateGateSimulator);
  assessmentForm.elements.weight.addEventListener("input", updateImcPreview);
  assessmentForm.elements.height.addEventListener("input", updateImcPreview);

  document.getElementById("resetDemoButton").addEventListener("click", async () => {
    if (!Store.isDemoEnvironment() || !window.confirm("A API criara uma copia completa da planilha antes de restaurar os dados ficticios. Deseja continuar?")) return;
    const phrase = window.prompt("Digite RESTAURAR DEMONSTRACAO para confirmar:");
    if (phrase !== "RESTAURAR DEMONSTRACAO") {
      window.alert("Restauracao cancelada: frase de confirmacao incorreta.");
      return;
    }
    try {
      const demoResponse = await fetch("assets/data/demo.json", { cache: "no-store" });
      if (!demoResponse.ok) throw new Error("Modelo oficial de demonstracao indisponivel.");
      const demoFile = await demoResponse.json();
      const demoSnapshot = demoFile.snapshot || demoFile;
      await Store.restoreDemoRemote(demoSnapshot, phrase);
      panelState = Store.migrateData(demoSnapshot);
      Store.saveData(panelState);
      selectedStudentId = panelState.students[0]?.id || "";
      renderPanel();
      window.alert("Demonstracao restaurada. Uma copia da planilha anterior foi criada automaticamente.");
    } catch (error) {
      window.alert(error.message || "Nao foi possivel restaurar a demonstracao.");
    }
  });

  document.querySelector("#setupSheetsButton")?.addEventListener("click", async () => {
    if (!Store.isRemoteConfigured()) {
      window.alert("Configure a URL do Web App em app-config.js antes de preparar o Sheets.");
      return;
    }
    try {
      const result = await Store.setupRemoteSpreadsheet();
      renderAdminSyncStatus("online", `Planilha preparada — estrutura ${result.schemaVersion || "atual"}`);
      window.alert("Planilha preparada com sucesso.");
    } catch (error) {
      window.alert(error.message);
    }
  });

  document.getElementById("syncSheetsButton").addEventListener("click", () => refreshAdminFromRemote({ notify: true }));
  document.getElementById("retryAdminSyncButton").addEventListener("click", () => refreshAdminFromRemote({ notify: true }));
  document.getElementById("adminPendingSyncButton").addEventListener("click", () => flushAdminSyncQueue({ notify: true }));

  document.getElementById("newWorkoutButton").addEventListener("click", createNewWorkout);
  document.getElementById("newAssessmentButton").addEventListener("click", createNewAssessment);
  document.getElementById("newScheduleButton").addEventListener("click", createNewSchedule);
  document.getElementById("openStudentFinanceHistoryButton").addEventListener("click", () => {
    const student = getSelectedStudent();
    if (!student) return;
    financeHistoryStudentId = student.id;
    selectedStudentId = student.id;
    activeFinanceTab = "payments";
    financeSearchFilter.value = student.name;
    setActiveMainSection("finance");
    setActiveFinanceTab("payments");
    renderFinanceStudentHistory(student.id);
  });
  document.getElementById("openFinanceStudentProfileButton").addEventListener("click", () => {
    const student = Store.findStudent(panelState, financeHistoryStudentId);
    if (!student) return;
    selectedStudentId = student.id;
    activePanelTab = "ficha";
    setActiveMainSection("operation");
  });
  document.getElementById("quickReceivePaymentButton").addEventListener("click", receivePaymentFromFinanceBar);
  document.getElementById("newMovementButton").addEventListener("click", createNewMovement);
  document.getElementById("newExpenseButton").addEventListener("click", createNewExpense);
  financeQuickStudentSearch.addEventListener("input", () => financeQuickStudentSearch.setCustomValidity(""));
  financeQuickStudentSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      receivePaymentFromFinanceBar();
    }
  });
  document.getElementById("manageWeeklyScheduleButton").addEventListener("click", () => {
    setActiveMainSection("weekly");
    document.querySelector(".main-section-nav").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("clearWeeklyScheduleButton").addEventListener("click", resetWeeklyScheduleForm);
  document.getElementById("openStudentsOverviewButton").addEventListener("click", () => {
    setActiveMainSection("operation");
    document.querySelector(".main-section-nav").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelectorAll("[data-main-section]").forEach((button) => {
    button.addEventListener("click", () => setActiveMainSection(button.dataset.mainSection));
  });
  globalStudentSearch.addEventListener("input", () => globalStudentSearch.setCustomValidity(""));
  globalStudentSearch.addEventListener("change", openGlobalStudentSearch);
  globalStudentSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      openGlobalStudentSearch();
    }
  });
  document.getElementById("settingsSection").addEventListener("click", handleSettingsAction);
  document.getElementById("downloadDataBackupButton").addEventListener("click", downloadDataBackup);
  document.getElementById("restoreDataBackupInput").addEventListener("change", restoreDataBackup);
  document.getElementById("importStudentsCsvInput").addEventListener("change", importStudentsCsv);
  document.getElementById("runDataAuditButton").addEventListener("click", renderDataAudit);
  document.getElementById("applyStaffTimeFiltersButton").addEventListener("click", renderStaffTimeReport);
  staffReportStartDate.addEventListener("change", renderStaffTimeReport);
  staffReportEndDate.addEventListener("change", renderStaffTimeReport);
  staffReportProfessorFilter.addEventListener("change", renderStaffTimeReport);
  document.getElementById("exportStaffTimeCsvButton").addEventListener("click", exportStaffTimeCsv);
  document.getElementById("printStaffTimeReportButton").addEventListener("click", () => {
    document.body.classList.add("printing-staff-time-report");
    window.print();
  });

  document.getElementById("weeklyDaySelector").addEventListener("click", (event) => {
    const button = event.target.closest("[data-weekly-day]");
    if (!button) {
      return;
    }
    activeWeeklyDay = Number(button.dataset.weeklyDay);
    renderWeeklyOverview();
  });
  weeklyDayFilter.addEventListener("change", renderWeeklyManagement);
  weeklySearchFilter.addEventListener("input", renderWeeklyManagement);
  document.getElementById("weeklyScheduleAdminList").addEventListener("click", handleWeeklyAdminAction);

  financeMonthFilter.addEventListener("change", renderFinance);
  document.querySelectorAll("[data-finance-tab]").forEach((button) => {
    button.addEventListener("click", () => setActiveFinanceTab(button.dataset.financeTab));
  });
  document.getElementById("generateMonthlyPaymentsButton").addEventListener("click", generateMonthlyPayments);
  document.getElementById("generateRecurringExpensesButton").addEventListener("click", generateRecurringExpenses);
  financeStatusFilter.addEventListener("change", renderFinancePaymentList);
  financeSearchFilter.addEventListener("input", renderFinancePaymentList);
  document.getElementById("paymentHistory").addEventListener("click", handleFinanceAction);
  document.getElementById("financeStudentHistoryList").addEventListener("click", handleFinanceAction);
  document.getElementById("closePaymentDialogButton").addEventListener("click", closePaymentDialog);
  document.getElementById("cancelPaymentDialogButton").addEventListener("click", closePaymentDialog);
  document.getElementById("paymentReceiptButton").addEventListener("click", (event) => {
    if (event.currentTarget.dataset.paymentId) openPaymentReceipt(event.currentTarget.dataset.paymentId);
  });
  paymentDialog.addEventListener("click", (event) => {
    if (event.target === paymentDialog) closePaymentDialog();
  });
  ["amount", "discount", "fine"].forEach((name) => {
    paymentForm.elements[name].addEventListener("input", updatePaymentNetPreview);
  });
  paymentForm.elements.paidAmount.addEventListener("input", () => {
    paymentForm.dataset.paidAmountTouched = "1";
  });
  paymentForm.elements.status.addEventListener("change", () => {
    if (["pago", "parcial"].includes(paymentForm.elements.status.value)) {
      if (!paymentForm.elements.paidAt.value) paymentForm.elements.paidAt.value = Store.todayISO();
      if (paymentForm.elements.status.value === "pago") {
        paymentForm.dataset.paidAmountTouched = "0";
        updatePaymentNetPreview();
      }
    } else {
      paymentForm.elements.paidAt.value = "";
      paymentForm.elements.paidAmount.value = "0.00";
      paymentForm.dataset.paidAmountTouched = "0";
    }
  });
  paymentForm.elements.studentId.addEventListener("change", () => {
    if (paymentForm.elements.id.value) {
      return;
    }
    const student = Store.findStudent(panelState, paymentForm.elements.studentId.value);
    const latestPayment = student ? getLatestStudentPayment(student.id) : null;
    paymentForm.elements.amount.value = student ? student.monthlyFee || latestPayment?.amount || 0 : "";
    paymentForm.elements.dueDate.value = student
      ? getSuggestedPaymentDueDate(student.id, paymentForm.elements.reference.value || Store.currentMonth(), null)
      : Store.todayISO();
    if (student) {
      setPaymentEditorMode(student, {
        studentId: student.id,
        reference: paymentForm.elements.reference.value || Store.currentMonth(),
        dueDate: paymentForm.elements.dueDate.value
      }, paymentForm.dataset.editorMode || "new", "inexistente");
    }
    updatePaymentNetPreview();
  });

  document.getElementById("clearMovementButton").addEventListener("click", closeMovementEditor);
  document.getElementById("movementList").addEventListener("click", handleMovementAction);
  cashDateFilter.addEventListener("change", () => {
    closeMovementEditor();
    renderCashModule();
  });
  movementTypeFilter.addEventListener("change", renderMovementList);
  movementMethodFilter.addEventListener("change", renderMovementList);
  movementSearchFilter.addEventListener("input", renderMovementList);
  cashClosingForm.elements.openingBalance.addEventListener("input", () => {
    updateCashClosingPreview();
    renderCashMetrics();
  });
  cashClosingForm.elements.countedCash.addEventListener("input", updateCashClosingPreview);

  document.getElementById("clearExpenseButton").addEventListener("click", closeExpenseEditor);
  document.getElementById("expenseList").addEventListener("click", handleExpenseAction);
  document.getElementById("expenseStatusTabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-expense-status]");
    if (!button) return;
    expenseStatusFilter.value = button.dataset.expenseStatus;
    renderExpenseList();
  });
  expenseMonthFilter.addEventListener("change", renderExpenseModule);
  expenseStatusFilter.addEventListener("change", renderExpenseList);
  expenseSearchFilter.addEventListener("input", renderExpenseList);

  document.getElementById("applyReportFiltersButton").addEventListener("click", renderFinanceReports);
  reportStudentFilter.addEventListener("change", renderFinanceReports);
  reportCostCenterFilter.addEventListener("change", renderFinanceReports);
  document.getElementById("studentReportPaymentTable").addEventListener("click", handleFinanceAction);
  document.getElementById("exportFinanceCsvButton").addEventListener("click", exportFinanceCsv);
  document.getElementById("printFinanceReportButton").addEventListener("click", () => {
    const studentId = getReportSelectedStudentId();
    document.body.classList.add(studentId ? "printing-student-report" : "printing-finance-report");
    window.print();
  });
  document.getElementById("closeReceiptDialogButton").addEventListener("click", closePaymentReceipt);
  document.getElementById("printReceiptButton").addEventListener("click", printPaymentReceipt);
  receiptDialog.addEventListener("click", (event) => {
    if (event.target === receiptDialog) closePaymentReceipt();
  });
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing-finance-report", "printing-student-report", "printing-payment-receipt", "printing-staff-time-report");
  });

  document.getElementById("studentRoster").addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-select-student]");
    if (!trigger) {
      return;
    }
    selectedStudentId = trigger.dataset.selectStudent;
    activePanelTab = "ficha";
    renderPanel();
  });

  document.getElementById("studentRoster").addEventListener("keydown", (event) => {
    const trigger = event.target.closest("[data-select-student]");
    if (!trigger || !["Enter", " "].includes(event.key)) {
      return;
    }
    event.preventDefault();
    selectedStudentId = trigger.dataset.selectStudent;
    activePanelTab = "ficha";
    renderPanel();
  });

  if (studentSearchFilter) {
    studentSearchFilter.addEventListener("input", () => {
      studentSearchTerm = studentSearchFilter.value;
      renderRoster();
    });
  }

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderRoster();
    });
  });

  document.querySelectorAll("[data-panel-tab]").forEach((button) => {
    button.addEventListener("click", () => setActivePanelTab(button.dataset.panelTab));
    button.addEventListener("keydown", handleTabKeyboard);
  });

  workspaceContent.addEventListener("click", handleWorkspaceAction);

  document.getElementById("regenEnrollmentButton").addEventListener("click", () => {
    const student = getSelectedStudent();
    if (!student) {
      return;
    }
    const nextState = Store.regenerateEnrollmentToken(panelState, student.id);
    saveWithLog(nextState, "enrollment-qr-regenerated", student.id, "QR de matricula regenerado no painel.");
  });

  document.getElementById("regenGateButton").addEventListener("click", () => {
    const student = getSelectedStudent();
    if (!student) {
      return;
    }
    const nextState = Store.regenerateGateCode(panelState, student.id);
    saveWithLog(nextState, "gate-qr-regenerated", student.id, "QR da roleta regenerado no painel.");
  });

  window.addEventListener("storage", (event) => {
    if (event.key === Store.STORAGE_KEY || String(event.key || "").startsWith(ADMIN_SYNC_QUEUE_PREFIX) || String(event.key || "").startsWith(ADMIN_PENDING_SNAPSHOT_PREFIX)) {
      panelState = Store.loadData();
      renderPanel();
      renderAdminSyncStatus();
    }
  });

  window.addEventListener("online", () => {
    renderAdminSyncStatus(getAdminPendingCount() ? "pending" : "online", "Internet restabelecida");
    flushAdminSyncQueue({ notify: false });
  });
  window.addEventListener("offline", () => renderAdminSyncStatus("offline"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") flushAdminSyncQueue({ notify: false });
  });
  adminAutoSyncTimer = window.setInterval(() => flushAdminSyncQueue({ notify: false }), ADMIN_SYNC_INTERVAL_MS);
  window.addEventListener("beforeunload", () => {
    if (adminAutoSyncTimer) window.clearInterval(adminAutoSyncTimer);
  });
}

attachPanelEvents();
resetWeeklyScheduleForm();
cashDateFilter.value = Store.todayISO();
expenseMonthFilter.value = Store.currentMonth();
resetMovementForm();
resetExpenseForm();
renderPanel();
renderAdminSyncStatus();
(async function initializeAdminPanel() {
  Store.applyRuntimeEnvironment();
  document.getElementById("resetDemoButton").hidden = !Store.isDemoEnvironment();
  if (authSession?.account?.role !== "admin") {
    authSession = null;
    showAdminAccess(false);
    return;
  }
  showAdminAccess(true);
  await flushAdminSyncQueue({ notify: false });
  panelState = Store.loadData();
  if (!getAdminPendingCount() && Store.isRemoteConfigured() && navigator.onLine !== false) {
    await refreshAdminFromRemote({ notify: false });
    panelState = Store.loadData();
  }
  if (!selectedStudentId && panelState.students[0]) selectedStudentId = panelState.students[0].id;
  autoGenerateCurrentMonthFinance();
  renderPanel();
  renderAdminSyncStatus(getAdminPendingCount() ? "pending" : undefined);
})();
