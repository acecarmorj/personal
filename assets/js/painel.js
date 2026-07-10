const Store = window.PersonalProStore;

let panelState = Store.loadData();
let selectedStudentId = panelState.students[0] ? panelState.students[0].id : "";
let activeFilter = "todos";
let activePanelTab = "resumo";

const studentForm = document.getElementById("studentForm");
const paymentForm = document.getElementById("paymentForm");
const workoutForm = document.getElementById("workoutForm");
const assessmentForm = document.getElementById("assessmentForm");
const scheduleForm = document.getElementById("scheduleForm");
const workspaceTitle = document.getElementById("workspaceTitle");
const workspaceEmpty = document.getElementById("workspaceEmpty");
const workspaceContent = document.getElementById("workspaceContent");

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
    colorDark: "#163f32",
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

function renderMetrics() {
  const today = Store.todayISO();
  const activeStudents = panelState.students.filter((student) => student.status === "ativo").length;
  const todayClasses = panelState.schedule.filter(
    (item) => item.date === today && !["cancelada", "falta"].includes(item.status)
  ).length;
  const pendingPayments = panelState.payments.filter((payment) => payment.status === "pendente" || payment.status === "vencido").length;
  const overduePayments = panelState.payments.filter((payment) => payment.status === "vencido").length;
  const monthlyRevenue = panelState.payments
    .filter((payment) => payment.reference === Store.currentMonth() && payment.status === "pago")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const pendingAssessments = panelState.students.filter((student) => !Store.getLatestAssessment(panelState, student.id)).length;

  const metrics = [
    ["Total de alunos", panelState.students.length],
    ["Alunos ativos", activeStudents],
    ["Aulas de hoje", todayClasses],
    ["Cobrancas abertas", pendingPayments],
    ["Mensalidades vencidas", overduePayments],
    ["Receita do mes", Store.currency(monthlyRevenue)],
    ["Avaliacoes pendentes", pendingAssessments]
  ];

  document.getElementById("metricGrid").innerHTML = metrics
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");
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
      const payment = Store.getCurrentPayment(panelState, student.id);
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
            ${badge(access.status, access.label)}
            ${badge(student.enrollmentStatus === "ativo" ? "ativo" : "pendente", student.enrollmentStatus)}
            ${badge(payment ? payment.status : "aviso", payment ? payment.status : "sem cobranca")}
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
  const record = payment || (student ? Store.getCurrentPayment(panelState, student.id) : null);
  paymentForm.reset();
  paymentForm.elements.studentId.value = student ? student.id : "";
  paymentForm.elements.reference.value = record ? record.reference : Store.currentMonth();
  paymentForm.elements.amount.value = record ? record.amount : student ? student.monthlyFee : "";
  paymentForm.elements.dueDate.value = record ? record.dueDate : Store.todayISO();
  paymentForm.elements.status.value = record ? record.status : "pendente";
  paymentForm.elements.method.value = record ? record.method : "pix";
  paymentForm.elements.notes.value = record ? record.notes || "" : "";
  paymentForm.elements.id.value = record ? record.id : "";
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
  const payment = Store.getCurrentPayment(panelState, student.id);
  const checkins = Store.getStudentCheckins(panelState, student.id);
  const cards = [
    {
      label: "Acesso",
      value: access.label,
      detail: access.reason,
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
      label: "Mensalidade",
      value: payment ? Store.currency(payment.amount) : "Sem cobranca",
      detail: payment ? `${payment.reference} - venc. ${Store.formatDate(payment.dueDate)}` : "Crie a primeira mensalidade.",
      status: payment ? payment.status : "aviso"
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

  getStudentRecords("checkins", student.id).forEach((item) => {
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

  getStudentRecords("payments", student.id).forEach((item) => {
    events.push({
      date: `${item.dueDate || ""}T00:00`,
      title: "Mensalidade",
      detail: `${item.reference} - ${Store.currency(item.amount)} - ${item.status}`,
      status: item.status
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
  const checkins = Store.getStudentCheckins(panelState, student.id);

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

function renderPayments(student) {
  const payments = Store.getStudentPayments(panelState, student.id);

  document.getElementById("paymentHistory").innerHTML = payments.length
    ? payments
        .map(
          (payment) => `
            <article class="record-item">
              <div class="record-head">
                <div>
                  <p class="eyebrow">Competencia ${escapeHtml(payment.reference)}</p>
                  <h4>${Store.currency(payment.amount)}</h4>
                </div>
                ${badge(payment.status, payment.status)}
              </div>
              <div class="record-meta">
                <span>Vencimento ${escapeHtml(Store.formatDate(payment.dueDate))}</span>
                <span>${escapeHtml(payment.method || "pix")}</span>
                ${payment.paidAt ? `<span>Pago em ${escapeHtml(Store.formatDate(payment.paidAt))}</span>` : ""}
              </div>
              ${payment.notes ? `<p class="record-note">${escapeText(payment.notes)}</p>` : ""}
              <div class="record-actions">
                <button class="ghost-button small-button" type="button" data-edit-payment="${escapeHtml(payment.id)}">Editar</button>
                ${payment.status !== "pago" ? `<button class="ghost-button small-button" type="button" data-pay-payment="${escapeHtml(payment.id)}">Marcar como pago</button>` : ""}
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Nenhuma mensalidade cadastrada para este aluno.</div>`;
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

  gateStateBox.textContent = access.reason;
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
  populatePaymentForm(student);
  populateWorkoutForm(student);
  populateAssessmentForm(student);
  populateScheduleForm(student);
  renderStudentSummary(student);
  renderTimeline(student);
  renderWorkouts(student);
  renderAssessments(student);
  renderSchedule(student);
  renderPayments(student);
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
                ${badge(item.access.status, item.access.label)}
              </div>
              <p>${escapeHtml(item.access.reason)}</p>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Nenhum alerta aberto no momento.</div>`;
}

function renderLogBoard() {
  const logBoard = document.getElementById("logBoard");
  const logs = panelState.log.slice(0, 8);

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
  renderMetrics();
  renderRoster();
  renderWorkspace();
  renderAlertBoard();
  renderLogBoard();
}

function handleStudentSave(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const nextStudent = Store.createStudentRecord({
    ...Store.findStudent(panelState, payload.id),
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
  const nextPayment = Store.createPaymentRecord({
    ...existing,
    ...payload,
    id: payload.id || (existingByReference ? existingByReference.id : ""),
    amount: safeNumber(payload.amount),
    paidAt: payload.status === "pago" ? existing?.paidAt || Store.todayISO() : ""
  });

  const nextState = Store.upsertPayment(panelState, nextPayment);
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
  const student = getSelectedStudent();
  if (student) {
    populatePaymentForm(student, {
      reference: Store.currentMonth(),
      amount: student.monthlyFee,
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

  if (button.dataset.editPayment) {
    populatePaymentForm(student, findRecord("payments", button.dataset.editPayment));
    return;
  }

  if (button.dataset.payPayment) {
    const payment = findRecord("payments", button.dataset.payPayment);
    if (!payment) {
      return;
    }
    saveWithLog(
      updateRecord("payments", payment.id, (record) => ({ ...record, status: "pago", paidAt: Store.todayISO() })),
      "payment-paid",
      student.id,
      `Mensalidade ${payment.reference} marcada como paga.`
    );
  }
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
