const Store = window.ProFitnessStore;

let panelState = Store.loadData();
let selectedStudentId = panelState.students[0] ? panelState.students[0].id : "";
let activeFilter = "todos";
let activePanelTab = "resumo";
let activeMainSection = "overview";

const studentForm = document.getElementById("studentForm");
const paymentForm = document.getElementById("paymentForm");
const workoutForm = document.getElementById("workoutForm");
const assessmentForm = document.getElementById("assessmentForm");
const scheduleForm = document.getElementById("scheduleForm");
const workspaceTitle = document.getElementById("workspaceTitle");
const workspaceEmpty = document.getElementById("workspaceEmpty");
const workspaceContent = document.getElementById("workspaceContent");
const financeMonthFilter = document.getElementById("financeMonthFilter");
const financeStatusFilter = document.getElementById("financeStatusFilter");
const financeSearchFilter = document.getElementById("financeSearchFilter");

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

function savePanelState(nextState) {
  panelState = Store.migrateData(nextState);
  Store.saveData(panelState);
  Store.syncSnapshotIfConfigured(panelState).catch(() => null);
  renderPanel();
}

function saveWithLog(nextState, action, studentId, message) {
  savePanelState(
    Store.appendLog(nextState, {
      action: action,
      studentId: studentId,
      message: message
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
  if (activeFilter === "todos") {
    return panelState.students;
  }

  if (activeFilter === "pendentes") {
    return panelState.students.filter((student) => student.enrollmentStatus !== "ativo");
  }

  if (activeFilter === "bloqueados") {
    return panelState.students.filter((student) => Store.getAccessState(panelState, student.id).status === "bloqueado");
  }

  if (activeFilter === "ativos") {
    return panelState.students.filter((student) => Store.getAccessState(panelState, student.id).status === "liberado");
  }

  return panelState.students;
}

function findRecord(collection, id) {
  return (panelState[collection] || []).find((record) => record.id === id) || null;
}

function upsertRecord(collection, record) {
  const nextState = Store.clone(panelState);
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
    overview: {
      kicker: "Pro Fitness Carmo / Visao geral",
      title: "Visao geral da academia",
      description: "Indicadores gerais para acompanhar o movimento da Pro Fitness."
    },
    operation: {
      kicker: "Pro Fitness Carmo / Alunos e treinos",
      title: "Gestao de alunos",
      description: "Cadastros, treinos, avaliacoes, agenda e acessos em uma area operacional."
    },
    finance: {
      kicker: "Pro Fitness Carmo / Financeiro",
      title: "Gestao financeira",
      description: "Receita, recebimentos e pendencias concentrados em uma area reservada."
    }
  }[sectionName] || {};

  document.getElementById("sectionKicker").textContent = headings.kicker || "Pro Fitness Carmo";
  document.getElementById("sectionTitle").textContent = headings.title || "Painel Pro Fitness";
  document.getElementById("sectionDescription").textContent = headings.description || "Gestao da academia.";

  if (sectionName === "operation") {
    renderOperation();
  }
  if (sectionName === "finance") {
    renderFinance();
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
  const todayClasses = panelState.schedule.filter(
    (item) => item.date === today && !["cancelada", "falta"].includes(item.status)
  ).length;

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

function renderTodayAgendaSummary() {
  const todayItems = panelState.schedule.filter((item) => item.date === Store.todayISO());
  const completed = todayItems.filter((item) => item.status === "realizada").length;
  const scheduled = todayItems.filter((item) => ["marcada", "remarcada"].includes(item.status)).length;
  const online = todayItems.filter((item) => item.type === "online").length;
  const inPerson = todayItems.filter((item) => item.type !== "online").length;

  document.getElementById("todayAgendaSummary").innerHTML = `
    <div class="agenda-total">
      <strong>${todayItems.length}</strong>
      <span>${todayItems.length === 1 ? "atividade prevista" : "atividades previstas"}</span>
    </div>
    <div class="agenda-stat-grid">
      <div><span class="agenda-dot scheduled"></span><strong>${scheduled}</strong><small>Agendadas</small></div>
      <div><span class="agenda-dot completed"></span><strong>${completed}</strong><small>Realizadas</small></div>
      <div><span class="agenda-dot in-person"></span><strong>${inPerson}</strong><small>Presenciais</small></div>
      <div><span class="agenda-dot online"></span><strong>${online}</strong><small>Online</small></div>
    </div>
  `;
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
}

function renderRoster() {
  const list = document.getElementById("studentRoster");
  const students = getFilteredStudents();

  if (!students.length) {
    list.innerHTML = `<div class="empty-state">Nenhum aluno neste filtro.</div>`;
    return;
  }

  list.innerHTML = students
    .map((student) => {
      const access = Store.getAccessState(panelState, student.id);
      return `
        <article class="roster-item ${student.id === selectedStudentId ? "selected" : ""}">
          <div class="meta-row">
            <div>
              <strong>${escapeHtml(student.name)}</strong>
              <p>${escapeHtml(student.plan || "Plano nao informado")}</p>
            </div>
            <button class="ghost-button" type="button" data-select-student="${escapeHtml(student.id)}">Abrir</button>
          </div>
          <div class="badge-row">
            ${badge(access.status, getOperationalAccessLabel(access))}
            ${badge(student.enrollmentStatus === "ativo" ? "ativo" : "pendente", student.enrollmentStatus)}
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

function populatePaymentForm(student, payment) {
  const record = payment || null;
  paymentForm.reset();
  renderFinanceStudentOptions();
  paymentForm.elements.studentId.value = record ? record.studentId : student ? student.id : "";
  paymentForm.elements.reference.value = record ? record.reference : Store.currentMonth();
  paymentForm.elements.amount.value = record ? record.amount : student ? student.monthlyFee : "";
  paymentForm.elements.dueDate.value = record ? record.dueDate : Store.todayISO();
  paymentForm.elements.status.value = record ? record.status : "pendente";
  paymentForm.elements.method.value = record ? record.method : "pix";
  paymentForm.elements.notes.value = record ? record.notes || "" : "";
  paymentForm.elements.id.value = record?.id || "";
}

function renderFinanceStudentOptions() {
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
  workoutForm.elements.exercises.value = workout ? getExercises(workout).join("\n") : "";
  workoutForm.elements.sets.value = workout ? workout.sets || "" : "";
  workoutForm.elements.reps.value = workout ? workout.reps || "" : "";
  workoutForm.elements.load.value = workout ? workout.load || "" : "";
  workoutForm.elements.rest.value = workout ? workout.rest || "" : "";
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

function getPhotos(assessment) {
  if (Array.isArray(assessment.photos)) {
    return assessment.photos.filter(Boolean);
  }

  return String(assessment.photos || "")
    .split(/[\n,]/)
    .map((photo) => photo.trim())
    .filter(Boolean);
}

function renderStudentSummary(student) {
  const access = Store.getAccessState(panelState, student.id);
  const assessment = Store.getLatestAssessment(panelState, student.id);
  const activeWorkouts = Store.getStudentWorkouts(panelState, student.id).filter((item) => item.status === "ativo");
  const upcomingClass = Store.getStudentSchedule(panelState, student.id).find(
    (item) => item.date >= Store.todayISO() && !["cancelada", "falta"].includes(item.status)
  );
  const checkins = Store.getStudentCheckins(panelState, student.id).filter((item) => !isAccessCheckin(item));
  const cards = [
    {
      label: "Acesso",
      value: getOperationalAccessLabel(access),
      detail: access.allowsGate ? "Entrada autorizada para este aluno." : "Veja os detalhes na aba Acessos.",
      status: access.status
    },
    {
      label: "Plano atual",
      value: student.plan || "Nao informado",
      detail: student.goal || "Objetivo nao informado",
      status: "neutral"
    },
    {
      label: "Proxima aula",
      value: upcomingClass ? `${Store.formatDate(upcomingClass.date)} ${upcomingClass.time}` : "Sem aula marcada",
      detail: upcomingClass ? `${upcomingClass.type} - ${upcomingClass.status}` : "Cadastre um horario na agenda.",
      status: upcomingClass ? upcomingClass.status : "neutral"
    },
    {
      label: "Ultima avaliacao",
      value: assessment ? `${formatNumber(assessment.weight, 1)} kg` : "Pendente",
      detail: assessment ? `IMC ${formatNumber(assessment.imc, 2)} em ${Store.formatDate(assessment.date)}` : "Registre as medidas iniciais.",
      status: assessment ? "ativo" : "pendente"
    },
    {
      label: "Treinos ativos",
      value: String(activeWorkouts.length),
      detail: activeWorkouts.length ? activeWorkouts.map((workout) => workout.division).join(" / ") : "Nenhum treino liberado.",
      status: activeWorkouts.length ? "ativo" : "pendente"
    },
    {
      label: "Treinos realizados",
      value: String(checkins.length),
      detail: checkins[0] ? `Ultimo em ${Store.formatDate(checkins[0].date)}` : "Sem registros ainda.",
      status: checkins.length ? "ativo" : "neutral"
    }
  ];

  document.getElementById("studentSummary").innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card ${Store.getStatusTone(card.status)}">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <p>${escapeHtml(card.detail)}</p>
        </article>
      `
    )
    .join("");
}

function renderTimeline(student) {
  const events = [];

  getStudentRecords("schedule", student.id).forEach((item) => {
    events.push({
      date: `${item.date || ""}T${item.time || "00:00"}`,
      title: "Agenda",
      detail: `${Store.formatDate(item.date)} ${item.time || ""} - ${item.status}`,
      status: item.status
    });
  });

  getStudentRecords("checkins", student.id).filter((item) => !isAccessCheckin(item)).forEach((item) => {
    events.push({
      date: `${item.date || ""}T00:00`,
      title: "Treino realizado",
      detail: `${Store.formatDate(item.date)} - ${item.usedLoad || "carga nao informada"} - dificuldade ${item.difficulty || "nao informada"}`,
      status: "ativo"
    });
  });

  getStudentRecords("assessments", student.id).forEach((item) => {
    events.push({
      date: `${item.date || ""}T00:00`,
      title: "Avaliacao",
      detail: `${Store.formatDate(item.date)} - ${formatNumber(item.weight, 1)} kg - IMC ${formatNumber(item.imc, 2)}`,
      status: "ativo"
    });
  });

  const items = events
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))
    .slice(0, 8);

  document.getElementById("studentTimeline").innerHTML = items.length
    ? items
        .map(
          (item) => `
            <article class="timeline-item">
              <div class="meta-row">
                <strong>${escapeHtml(item.title)}</strong>
                ${badge(item.status, item.status)}
              </div>
              <p>${escapeHtml(item.detail)}</p>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Sem eventos para este aluno.</div>`;
}

function renderWorkouts(student) {
  const workouts = Store.getStudentWorkouts(panelState, student.id).sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "ativo" ? -1 : 1;
    }
    return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
  });
  const checkins = Store.getStudentCheckins(panelState, student.id).filter((item) => !isAccessCheckin(item));

  document.getElementById("workoutList").innerHTML = workouts.length
    ? workouts
        .map((workout) => {
          const lastCheckin = checkins.find((item) => item.workoutId === workout.id);
          const exerciseList = getExercises(workout);
          return `
            <article class="record-item">
              <div class="record-head">
                <div>
                  <p class="eyebrow">Divisao ${escapeHtml(workout.division || "-")}</p>
                  <h4>${escapeHtml(workout.title || "Treino sem nome")}</h4>
                </div>
                ${badge(workout.status || "ativo", workout.status || "ativo")}
              </div>
              <p class="record-description">${escapeHtml(exerciseList.join(" - ") || "Sem exercicios cadastrados.")}</p>
              <div class="record-meta">
                <span>${escapeHtml(workout.sets || "-")} series</span>
                <span>${escapeHtml(workout.reps || "-")} repeticoes</span>
                <span>${escapeHtml(workout.load || "Carga livre")}</span>
                <span>${escapeHtml(workout.rest || "Sem intervalo")}</span>
              </div>
              <p class="record-note">${lastCheckin ? `Ultimo registro: ${Store.formatDate(lastCheckin.date)} - ${escapeHtml(lastCheckin.usedLoad || "-")}` : "Sem check-in registrado."}</p>
              <div class="record-actions">
                <button class="ghost-button small-button" type="button" data-edit-workout="${escapeHtml(workout.id)}">Editar</button>
                <button class="ghost-button small-button" type="button" data-duplicate-workout="${escapeHtml(workout.id)}">Duplicar</button>
                <button class="ghost-button small-button" type="button" data-toggle-workout="${escapeHtml(workout.id)}">${workout.status === "ativo" ? "Encerrar" : "Ativar"}</button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">Nenhum treino cadastrado para este aluno.</div>`;
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
  const assessments = getStudentRecords("assessments", student.id).sort((left, right) =>
    String(right.date || "").localeCompare(String(left.date || ""))
  );

  renderAssessmentEvolution(assessments);
  document.getElementById("assessmentList").innerHTML = assessments.length
    ? assessments
        .map(
          (assessment) => `
            <article class="record-item">
              <div class="record-head">
                <div>
                  <p class="eyebrow">${escapeHtml(Store.formatDate(assessment.date))}</p>
                  <h4>${formatNumber(assessment.weight, 1)} kg <span>IMC ${formatNumber(assessment.imc, 2)}</span></h4>
                </div>
                ${badge("ativo", `${formatNumber(assessment.bodyFat, 1)}% gordura`)}
              </div>
              <div class="record-meta">
                <span>Peitoral ${formatNumber(assessment.chest, 1)} cm</span>
                <span>Cintura ${formatNumber(assessment.waist, 1)} cm</span>
                <span>Quadril ${formatNumber(assessment.hip, 1)} cm</span>
                <span>${getPhotos(assessment).length} foto(s)</span>
              </div>
              ${assessment.notes ? `<p class="record-note">${escapeText(assessment.notes)}</p>` : ""}
              <div class="record-actions">
                <button class="ghost-button small-button" type="button" data-edit-assessment="${escapeHtml(assessment.id)}">Editar</button>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Nenhuma avaliacao cadastrada para este aluno.</div>`;
}

function renderSchedule(student) {
  const schedule = Store.getStudentSchedule(panelState, student.id);

  document.getElementById("scheduleList").innerHTML = schedule.length
    ? schedule
        .map(
          (item) => `
            <article class="record-item">
              <div class="record-head">
                <div>
                  <p class="eyebrow">${escapeHtml(Store.formatDate(item.date))} as ${escapeHtml(item.time || "-")}</p>
                  <h4>${escapeHtml(item.type || "presencial")}</h4>
                </div>
                ${badge(item.status || "marcada", item.status || "marcada")}
              </div>
              <p class="record-note">${item.notes ? escapeText(item.notes) : "Sem observacoes."}</p>
              <div class="record-actions">
                <button class="ghost-button small-button" type="button" data-edit-schedule="${escapeHtml(item.id)}">Editar</button>
                ${["marcada", "remarcada"].includes(item.status) ? `<button class="ghost-button small-button" type="button" data-complete-schedule="${escapeHtml(item.id)}">Marcar realizada</button>` : ""}
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Nenhuma aula agendada para este aluno.</div>`;
}

function getEffectivePaymentStatus(payment) {
  if (payment.status === "pago") {
    return "pago";
  }
  if (payment.status === "vencido" || (payment.dueDate && payment.dueDate < Store.todayISO())) {
    return "vencido";
  }
  return "pendente";
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

function renderFinanceMetrics(monthlyPayments) {
  const paidPayments = monthlyPayments.filter((payment) => getEffectivePaymentStatus(payment) === "pago");
  const pendingPayments = monthlyPayments.filter((payment) => getEffectivePaymentStatus(payment) === "pendente");
  const overduePayments = monthlyPayments.filter((payment) => getEffectivePaymentStatus(payment) === "vencido");
  const total = (payments) => payments.reduce((sum, payment) => sum + safeNumber(payment.amount), 0);
  const expected = total(monthlyPayments);
  const compliance = monthlyPayments.length ? Math.round((paidPayments.length / monthlyPayments.length) * 100) : 0;
  const metrics = [
    { label: "Receita confirmada", value: Store.currency(total(paidPayments)), note: `${paidPayments.length} pagamento(s)`, tone: "success" },
    { label: "A receber", value: Store.currency(total(pendingPayments)), note: `${pendingPayments.length} cobranca(s)`, tone: "warning" },
    { label: "Em atraso", value: Store.currency(total(overduePayments)), note: `${overduePayments.length} cobranca(s)`, tone: "danger" },
    { label: "Previsto no mes", value: Store.currency(expected), note: `${monthlyPayments.length} lancamento(s)`, tone: "neutral" },
    { label: "Adimplencia", value: `${compliance}%`, note: "Por quantidade de cobrancas", tone: compliance >= 80 ? "success" : compliance >= 50 ? "warning" : "danger" }
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
      expected: payments.reduce((sum, payment) => sum + safeNumber(payment.amount), 0),
      paid: payments
        .filter((payment) => getEffectivePaymentStatus(payment) === "pago")
        .reduce((sum, payment) => sum + safeNumber(payment.amount), 0)
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

function getFilteredFinancePayments() {
  const month = financeMonthFilter.value;
  const status = financeStatusFilter.value;
  const query = financeSearchFilter.value.trim().toLocaleLowerCase("pt-BR");

  return panelState.payments
    .filter((payment) => !month || payment.reference === month)
    .filter((payment) => status === "todos" || getEffectivePaymentStatus(payment) === status)
    .filter((payment) => {
      if (!query) {
        return true;
      }
      const student = Store.findStudent(panelState, payment.studentId);
      return String(student?.name || "").toLocaleLowerCase("pt-BR").includes(query);
    })
    .sort((left, right) => {
      const statusOrder = { vencido: 0, pendente: 1, pago: 2 };
      const statusDifference = statusOrder[getEffectivePaymentStatus(left)] - statusOrder[getEffectivePaymentStatus(right)];
      return statusDifference || String(right.dueDate || "").localeCompare(String(left.dueDate || ""));
    });
}

function renderFinancePaymentList() {
  const payments = getFilteredFinancePayments();
  document.getElementById("financeResultCount").textContent = `${payments.length} registro${payments.length === 1 ? "" : "s"}`;
  document.getElementById("paymentHistory").innerHTML = payments.length
    ? `
      <div class="finance-table-header" aria-hidden="true">
        <span>Aluno</span>
        <span>Competencia</span>
        <span>Vencimento</span>
        <span>Valor</span>
        <span>Status</span>
        <span>Acoes</span>
      </div>
      ${payments
        .map((payment) => {
          const student = Store.findStudent(panelState, payment.studentId);
          const effectiveStatus = getEffectivePaymentStatus(payment);
          return `
            <article class="finance-table-row">
              <div class="finance-student-cell" data-label="Aluno">
                <strong>${escapeHtml(student?.name || "Aluno nao encontrado")}</strong>
                <small>${escapeHtml(student?.plan || "Plano nao informado")}</small>
              </div>
              <div data-label="Competencia"><span>${escapeHtml(payment.reference)}</span></div>
              <div data-label="Vencimento"><span>${escapeHtml(Store.formatDate(payment.dueDate))}</span></div>
              <div data-label="Valor"><strong class="finance-amount">${escapeHtml(Store.currency(payment.amount))}</strong></div>
              <div data-label="Status">${badge(effectiveStatus, effectiveStatus)}</div>
              <div class="finance-row-actions" data-label="Acoes">
                <button class="ghost-button small-button" type="button" data-edit-payment="${escapeHtml(payment.id)}">Editar</button>
                ${effectiveStatus !== "pago" ? `<button class="ghost-button small-button pay-button" type="button" data-pay-payment="${escapeHtml(payment.id)}">Receber</button>` : ""}
              </div>
            </article>
          `;
        })
        .join("")}
    `
    : `<div class="empty-state">Nenhuma cobranca encontrada para os filtros selecionados.</div>`;
}

function renderFinance() {
  if (!financeMonthFilter.value) {
    financeMonthFilter.value = Store.currentMonth();
  }

  renderFinanceStudentOptions();
  const monthlyPayments = panelState.payments.filter((payment) => payment.reference === financeMonthFilter.value);
  renderFinanceMetrics(monthlyPayments);
  renderFinanceChart();
  renderFinancePaymentList();

  if (!paymentForm.elements.reference.value && panelState.students.length) {
    const student = Store.findStudent(panelState, paymentForm.elements.studentId.value) || panelState.students[0];
    populatePaymentForm(student);
  }
}

function renderAccess(student) {
  const access = Store.getAccessState(panelState, student.id);
  const enrollmentPayload = Store.buildEnrollmentPayload(student);
  const enrollmentCodeBox = document.getElementById("enrollmentCodeBox");
  const enrollmentQr = document.getElementById("enrollmentQr");
  const gateCodeBox = document.getElementById("gateCodeBox");
  const gateQr = document.getElementById("gateQr");
  const gateStateBox = document.getElementById("gateStateBox");

  enrollmentCodeBox.innerHTML = student.enrollmentStatus === "ativo"
    ? `
      ${badge("ativo", "matricula concluida")}
      <div class="detail-copy"><strong>Concluida em:</strong> ${escapeHtml(student.enrollmentCompletedAt ? Store.formatDate(student.enrollmentCompletedAt) : "data indisponivel")}</div>
      <div class="detail-copy">O QR inicial ja foi consumido. Para refazer a matricula, altere o status para pendente e reemita um novo QR.</div>
    `
    : `
      ${badge("pendente", "matricula pendente")}
      <div class="detail-copy"><strong>Codigo:</strong> ${escapeHtml(student.enrollmentToken)}</div>
      <div class="detail-copy">Esse QR funciona apenas uma vez, na primeira matricula do aluno.</div>
    `;
  renderQr(enrollmentQr, enrollmentPayload, 190);

  gateCodeBox.innerHTML = `
    ${badge(access.status, access.label)}
    <div class="detail-copy"><strong>Codigo:</strong> ${escapeHtml(student.gateCode)}</div>
  `;

  if (access.allowsGate) {
    renderQr(gateQr, Store.buildGatePayload(panelState, student.id), 190);
  } else {
    gateQr.innerHTML = `<div class="empty-state">QR bloqueado no momento.</div>`;
  }

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

  workspaceTitle.textContent = student.name;
  populateStudentForm(student);
  populateWorkoutForm(student);
  populateAssessmentForm(student);
  populateScheduleForm(student);
  renderStudentSummary(student);
  renderTimeline(student);
  renderWorkouts(student);
  renderAssessments(student);
  renderSchedule(student);
  renderAccess(student);
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
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Nenhum evento registrado ainda.</div>`;
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
    monthlyFee: existingStudent ? existingStudent.monthlyFee : 0
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
  const nextPayment = Store.createPaymentRecord({
    ...existing,
    ...payload,
    id: payload.id || (existingByReference ? existingByReference.id : ""),
    amount: safeNumber(payload.amount),
    paidAt: payload.status === "pago" ? existing?.paidAt || Store.todayISO() : ""
  });

  paymentForm.elements.id.value = nextPayment.id;
  let nextState = Store.upsertPayment(panelState, nextPayment);
  nextState = Store.updateStudent(nextState, payload.studentId, { monthlyFee: nextPayment.amount });
  saveWithLog(nextState, "payment-updated", payload.studentId, `Mensalidade ${nextPayment.reference} atualizada para ${nextPayment.status}.`);
}

function handleWorkoutSave(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (!payload.studentId) {
    return;
  }

  const existing = findRecord("workouts", payload.id);
  const workout = {
    ...existing,
    id: payload.id || Store.uid("TR"),
    studentId: payload.studentId,
    title: payload.title.trim(),
    division: payload.division,
    muscleGroup: payload.muscleGroup.trim(),
    exercises: String(payload.exercises || "")
      .split(/[\n,]/)
      .map((exercise) => exercise.trim())
      .filter(Boolean),
    sets: payload.sets.trim(),
    reps: payload.reps.trim(),
    load: payload.load.trim(),
    rest: payload.rest.trim(),
    status: payload.status,
    notes: payload.notes.trim(),
    createdAt: existing?.createdAt || Store.todayISO()
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
  const student = Store.createStudentRecord({
    name: "Novo aluno",
    plan: "Plano a definir",
    monthlyFee: 0
  });
  selectedStudentId = student.id;
  activePanelTab = "cadastro";
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
  const preferredStudentId = paymentForm.elements.studentId.value || selectedStudentId;
  const student = Store.findStudent(panelState, preferredStudentId) || panelState.students[0] || null;
  if (student) {
    const latestPayment = Store.getStudentPayments(panelState, student.id)[0];
    populatePaymentForm(student, {
      studentId: student.id,
      reference: Store.currentMonth(),
      amount: student.monthlyFee || latestPayment?.amount || 0,
      dueDate: Store.todayISO(),
      status: "pendente",
      method: "pix"
    });
  }
}

function handleWorkspaceAction(event) {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  const student = getSelectedStudent();
  if (!student) {
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
      createdAt: Store.todayISO()
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
  if (!button) {
    return;
  }

  const paymentId = button.dataset.editPayment || button.dataset.payPayment;
  const payment = findRecord("payments", paymentId);
  if (!payment) {
    return;
  }

  if (button.dataset.editPayment) {
    const student = Store.findStudent(panelState, payment.studentId);
    populatePaymentForm(student, payment);
    document.querySelector(".finance-editor").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  saveWithLog(
    updateRecord("payments", payment.id, (record) => ({ ...record, status: "pago", paidAt: Store.todayISO() })),
    "payment-paid",
    payment.studentId,
    `Mensalidade ${payment.reference} marcada como paga.`
  );
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

function attachPanelEvents() {
  studentForm.addEventListener("submit", handleStudentSave);
  paymentForm.addEventListener("submit", handlePaymentSave);
  workoutForm.addEventListener("submit", handleWorkoutSave);
  assessmentForm.addEventListener("submit", handleAssessmentSave);
  scheduleForm.addEventListener("submit", handleScheduleSave);
  assessmentForm.elements.weight.addEventListener("input", updateImcPreview);
  assessmentForm.elements.height.addEventListener("input", updateImcPreview);

  document.getElementById("resetDemoButton").addEventListener("click", () => {
    panelState = Store.resetData();
    selectedStudentId = panelState.students[0] ? panelState.students[0].id : "";
    activePanelTab = "resumo";
    activeMainSection = "overview";
    Store.syncSnapshotIfConfigured(panelState).catch(() => null);
    renderPanel();
  });

  document.getElementById("setupSheetsButton").addEventListener("click", async () => {
    if (!Store.isRemoteConfigured()) {
      window.alert("Configure a URL do Web App em app-config.js antes de preparar o Sheets.");
      return;
    }
    try {
      await Store.setupRemoteSpreadsheet();
      window.alert("Planilha preparada com sucesso.");
    } catch (error) {
      window.alert(error.message);
    }
  });

  document.getElementById("syncSheetsButton").addEventListener("click", async () => {
    if (!Store.isRemoteConfigured()) {
      window.alert("Configure a URL do Web App em app-config.js antes de sincronizar.");
      return;
    }
    try {
      await Store.pushRemoteSnapshot(panelState);
      window.alert("Sincronizacao com Google Sheets concluida.");
    } catch (error) {
      window.alert(error.message);
    }
  });

  document.getElementById("newStudentButton").addEventListener("click", createNewStudent);
  document.getElementById("newWorkoutButton").addEventListener("click", createNewWorkout);
  document.getElementById("newAssessmentButton").addEventListener("click", createNewAssessment);
  document.getElementById("newScheduleButton").addEventListener("click", createNewSchedule);
  document.getElementById("newPaymentButton").addEventListener("click", createNewPayment);
  document.getElementById("openStudentsOverviewButton").addEventListener("click", () => {
    setActiveMainSection("operation");
    document.querySelector(".main-section-nav").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelectorAll("[data-main-section]").forEach((button) => {
    button.addEventListener("click", () => setActiveMainSection(button.dataset.mainSection));
  });

  financeMonthFilter.addEventListener("change", renderFinance);
  financeStatusFilter.addEventListener("change", renderFinancePaymentList);
  financeSearchFilter.addEventListener("input", renderFinancePaymentList);
  document.getElementById("paymentHistory").addEventListener("click", handleFinanceAction);
  paymentForm.elements.studentId.addEventListener("change", () => {
    if (paymentForm.elements.id.value) {
      return;
    }
    const student = Store.findStudent(panelState, paymentForm.elements.studentId.value);
    const latestPayment = student ? Store.getStudentPayments(panelState, student.id)[0] : null;
    paymentForm.elements.amount.value = student ? student.monthlyFee || latestPayment?.amount || 0 : "";
  });

  document.getElementById("studentRoster").addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-select-student]");
    if (!trigger) {
      return;
    }
    selectedStudentId = trigger.dataset.selectStudent;
    activePanelTab = "resumo";
    renderPanel();
  });

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

  window.addEventListener("storage", () => {
    panelState = Store.loadData();
    renderPanel();
  });
}

attachPanelEvents();
renderPanel();
Store.hydrateFromRemoteIfConfigured().then((remoteState) => {
  panelState = remoteState;
  if (!selectedStudentId && panelState.students[0]) {
    selectedStudentId = panelState.students[0].id;
  }
  renderPanel();
});
