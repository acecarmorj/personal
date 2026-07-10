const Store = window.PersonalProStore;

let state = Store.loadData();
let session = Store.loadStudentSession();
let activeScreen = "home";
let pendingEnrollmentId = "";
let isEnrollmentStartOpen = false;
let scannerStream = null;
let scannerActive = false;
let detector = null;

const onboardingView = document.getElementById("onboardingView");
const studentView = document.getElementById("studentView");
const enrollmentCard = document.getElementById("enrollmentCard");
const enrollmentStartActions = document.getElementById("enrollmentStartActions");
const enrollmentForm = document.getElementById("enrollmentForm");
const manualEnrollmentForm = document.getElementById("manualEnrollmentForm");
const scannerModal = document.getElementById("scannerModal");
const scannerVideo = document.getElementById("scannerVideo");
const openEnrollmentButton = document.getElementById("openEnrollmentButton");
const startScanButton = document.getElementById("startScanButton");
const stopScanButton = document.getElementById("stopScanButton");
const toast = document.getElementById("toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 2500);
}

function syncState() {
  state = Store.loadData();
  session = Store.loadStudentSession();
  if (session && !Store.findStudent(state, session.studentId)) {
    Store.clearStudentSession();
    session = null;
  }
}

function persistState(nextState, message) {
  state = Store.migrateData(nextState);
  Store.saveData(state);
  Store.syncSnapshotIfConfigured(state).catch(() => null);
  syncState();
  render();
  if (message) {
    showToast(message);
  }
}

function statusBadge(status, label) {
  return `<span class="badge ${Store.getStatusTone(status)}">${label || status}</span>`;
}

function renderQr(target, payload, size) {
  target.innerHTML = "";

  if (!payload) {
    target.innerHTML = `<div class="empty-state">QR indisponivel.</div>`;
    return;
  }

  if (!window.QRCode) {
    target.innerHTML = `<div class="code-line">${payload}</div>`;
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

function parseEnrollmentCode(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("PERSONALPRO|ENROLL|")) {
    const parts = raw.split("|");
    if (parts.length >= 4) {
      return { studentId: parts[2], token: parts[3] };
    }
  }

  const student = state.students.find((item) => item.enrollmentToken === raw);
  if (student) {
    return { studentId: student.id, token: raw };
  }

  return null;
}

function beginEnrollment(rawCode) {
  const parsed = parseEnrollmentCode(rawCode);
  if (!parsed) {
    showToast("Codigo de matricula nao reconhecido.");
    return;
  }

  const student = Store.findStudent(state, parsed.studentId);
  if (!student || student.enrollmentToken !== parsed.token) {
    showToast("QR de matricula invalido para este aluno.");
    return;
  }

  if (student.enrollmentStatus === "ativo") {
    showToast("Esta matricula ja foi usada. O painel precisa emitir uma nova se necessario.");
    return;
  }

  pendingEnrollmentId = student.id;
  enrollmentCard.hidden = false;
  enrollmentForm.elements.studentId.value = student.id;
  enrollmentForm.elements.name.value = student.name || "";
  enrollmentForm.elements.phone.value = student.phone || "";
  enrollmentForm.elements.email.value = student.email || "";
  enrollmentForm.elements.birthDate.value = student.birthDate || "";
  enrollmentForm.elements.goal.value = student.goal || "";
  showToast("Matricula encontrada. Confirme seus dados.");
}

function completeEnrollment(event) {
  event.preventDefault();
  if (!pendingEnrollmentId) {
    return;
  }

  const formData = Object.fromEntries(new FormData(event.currentTarget).entries());
  const currentStudent = Store.findStudent(state, pendingEnrollmentId);
  let nextState = Store.updateStudent(state, pendingEnrollmentId, {
    name: formData.name,
    phone: formData.phone,
    email: formData.email,
    birthDate: formData.birthDate,
    goal: formData.goal,
    enrollmentStatus: "ativo",
    enrollmentCompletedAt: Store.todayISO(),
    enrollmentToken: Store.createCode("MAT")
  });

  nextState = Store.appendLog(nextState, {
    action: "student-enrollment",
    studentId: pendingEnrollmentId,
    message: `Matricula concluida pelo app do aluno. QR inicial consumido: ${currentStudent?.enrollmentToken || "-"}.`
  });

  Store.saveStudentSession(pendingEnrollmentId);
  pendingEnrollmentId = "";
  isEnrollmentStartOpen = false;
  enrollmentCard.hidden = true;
  event.currentTarget.reset();
  persistState(nextState, "Matricula concluida com sucesso.");
}

function getCurrentStudent() {
  return session ? Store.findStudent(state, session.studentId) : null;
}

function renderHero(student, accessState) {
  const payment = accessState.payment;
  document.getElementById("studentHero").innerHTML = `
    <div>
      <p class="eyebrow">App do aluno</p>
      <h1>${student.name}</h1>
      <p>${student.plan || "Plano nao informado"} - ${student.goal || "Objetivo nao informado"}</p>
    </div>
    <div class="status-row">
      ${statusBadge(accessState.status, accessState.label)}
      ${statusBadge(payment ? payment.status : "aviso", payment ? payment.status : "sem cobranca")}
    </div>
    <p>${accessState.reason}</p>
  `;
}

function renderHome(student, accessState) {
  const summary = document.getElementById("homeSummary");
  const schedule = Store.getStudentSchedule(state, student.id).find((item) => item.date >= Store.todayISO());
  const payment = Store.getCurrentPayment(state, student.id);
  const assessment = Store.getLatestAssessment(state, student.id);
  const workouts = Store.getStudentWorkouts(state, student.id).filter((item) => item.status === "ativo");

  const cards = [
    ["Proxima aula", schedule ? `${Store.formatDate(schedule.date)} ${schedule.time}` : "Sem aula agendada"],
    ["Mensalidade", payment ? `${payment.status} - ${Store.currency(payment.amount)}` : "Sem lancamento"],
    ["Ultima avaliacao", assessment ? `${assessment.weight} kg - IMC ${assessment.imc}` : "Sem avaliacao"],
    ["Treinos ativos", String(workouts.length)]
  ];

  summary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  const alertTone = Store.getStatusTone(accessState.status);
  document.getElementById("homeAlerts").innerHTML = `
    <div class="section-title">
      <div>
        <p class="eyebrow">Avisos do painel</p>
        <h2>Status do seu acesso</h2>
      </div>
      ${statusBadge(accessState.status, accessState.label)}
    </div>
    <article class="alert-panel ${alertTone}">
      <p class="helper-text">${accessState.reason}</p>
      <div class="meta-row">
        <div class="code-line">Plano: ${student.plan || "-"}</div>
        <div class="code-line">Mensalidade: ${Store.currency(student.monthlyFee)}</div>
      </div>
    </article>
  `;
}

function renderAccess(student, accessState) {
  const qrContainer = document.getElementById("gateQrContainer");
  const details = document.getElementById("gateAccessDetails");

  if (!accessState.allowsGate) {
    qrContainer.innerHTML = `<div class="empty-state">QR da roleta indisponivel no momento.</div>`;
    details.innerHTML = `
      ${statusBadge(accessState.status, accessState.label)}
      <div class="code-line">${accessState.reason}</div>
      <div class="code-line">Codigo da roleta: ${student.gateCode}</div>
    `;
    return;
  }

  renderQr(qrContainer, Store.buildGatePayload(state, student.id), 210);
  details.innerHTML = `
    ${statusBadge(accessState.status, accessState.label)}
    <div class="code-line">Codigo da roleta: ${student.gateCode}</div>
    <div class="code-line">Ultima atualizacao: ${Store.formatDateTime(student.lastGateSyncAt || new Date().toISOString())}</div>
    <p class="helper-text">${accessState.reason}</p>
  `;
}

function renderWorkouts(student) {
  const workouts = Store.getStudentWorkouts(state, student.id).filter((item) => item.status === "ativo");
  const checkins = Store.getStudentCheckins(state, student.id);
  const container = document.getElementById("workoutCards");

  if (!workouts.length) {
    container.innerHTML = `<div class="empty-state">Nenhum treino ativo liberado para voce.</div>`;
    return;
  }

  container.innerHTML = workouts
    .map((workout) => {
      const workoutCheckin = checkins.find((item) => item.workoutId === workout.id);
      return `
        <article class="timeline-item">
          <div class="section-title">
            <div>
              <p class="eyebrow">Divisao ${workout.division}</p>
              <h2>${workout.title}</h2>
            </div>
            ${statusBadge(workout.status, workout.status)}
          </div>
          <p>${workout.exercises.join(", ")}</p>
          <div class="meta-row">
            <div class="code-line">${workout.sets} - ${workout.reps}</div>
            <div class="code-line">Carga de referencia: ${workout.load || "-"}</div>
          </div>
          <p class="helper-text">
            Ultimo registro: ${workoutCheckin ? `${Store.formatDate(workoutCheckin.date)} - ${workoutCheckin.usedLoad}` : "sem check-in"}
          </p>
        </article>
      `;
    })
    .join("");
}

function renderSchedule(student) {
  const scheduleItems = Store.getStudentSchedule(state, student.id);
  const container = document.getElementById("scheduleCards");

  if (!scheduleItems.length) {
    container.innerHTML = `<div class="empty-state">Nenhum horario agendado.</div>`;
    return;
  }

  container.innerHTML = scheduleItems
    .map(
      (item) => `
        <article class="timeline-item">
          <div class="section-title">
            <div>
              <p class="eyebrow">${Store.formatDate(item.date)}</p>
              <h2>${item.time}</h2>
            </div>
            ${statusBadge(item.status, item.status)}
          </div>
          <p>${item.type} - ${item.notes || "Sem observacoes"}</p>
        </article>
      `
    )
    .join("");
}

function renderProfile(student, accessState) {
  const assessment = Store.getLatestAssessment(state, student.id);
  const payments = Store.getStudentPayments(state, student.id);

  document.getElementById("profileCard").innerHTML = `
    <div class="section-title">
      <div>
        <p class="eyebrow">Perfil</p>
        <h2>Dados da matricula</h2>
      </div>
      <button class="ghost-button" id="logoutButton">Sair deste celular</button>
    </div>
    <article class="profile-panel">
      <div class="meta-row">
        <div class="code-line">${student.phone || "-"}</div>
        <div class="code-line">${student.email || "-"}</div>
      </div>
      <div class="meta-row">
        <div class="code-line">Nascimento: ${Store.formatDate(student.birthDate)}</div>
        <div class="code-line">Primeira matricula: ${student.enrollmentCompletedAt ? Store.formatDate(student.enrollmentCompletedAt) : "pendente"}</div>
      </div>
      <p class="helper-text">Status do app: ${student.enrollmentStatus} - ${accessState.reason}</p>
      <p class="helper-text">
        Ultima avaliacao: ${assessment ? `${Store.formatDate(assessment.date)} - IMC ${assessment.imc}` : "nao disponivel"}
      </p>
    </article>
  `;

  document.getElementById("financeCard").innerHTML = `
    <div class="section-title">
      <div>
        <p class="eyebrow">Financeiro</p>
        <h2>Mensalidade e avisos</h2>
      </div>
    </div>
    <div class="card-stack">
      ${payments.length
        ? payments
            .map(
              (payment) => `
                <article class="payment-row">
                  <div class="meta-row">
                    <strong>${Store.currency(payment.amount)}</strong>
                    ${statusBadge(payment.status, payment.status)}
                  </div>
                  <p class="helper-text">${payment.reference} - vencimento ${Store.formatDate(payment.dueDate)}</p>
                </article>
              `
            )
            .join("")
        : `<div class="empty-state">Sem mensalidades cadastradas.</div>`}
    </div>
  `;

  document.getElementById("logoutButton").addEventListener("click", () => {
    Store.clearStudentSession();
    isEnrollmentStartOpen = false;
    syncState();
    render();
    showToast("Sessao encerrada neste celular.");
  });
}

function renderStudentArea(student) {
  const accessState = Store.getAccessState(state, student.id);
  renderHero(student, accessState);
  renderHome(student, accessState);
  renderAccess(student, accessState);
  renderWorkouts(student);
  renderSchedule(student);
  renderProfile(student, accessState);
}

function switchScreen(screenId) {
  activeScreen = screenId;
  document.querySelectorAll(".student-screen").forEach((screen) => {
    screen.classList.toggle("active", screen.id === `${screenId}Screen`);
  });
  document.querySelectorAll(".nav-pill").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === screenId);
  });
}

function render() {
  syncState();
  const student = getCurrentStudent();

  onboardingView.hidden = Boolean(student);
  studentView.hidden = !student;
  enrollmentStartActions.hidden = !isEnrollmentStartOpen;

  if (!student) {
    switchScreen("home");
    return;
  }

  renderStudentArea(student);
  switchScreen(activeScreen);
}

async function stopScanner() {
  scannerActive = false;
  if (scannerStream) {
    scannerStream.getTracks().forEach((track) => track.stop());
    scannerStream = null;
  }
  scannerVideo.srcObject = null;
  scannerModal.hidden = true;
  stopScanButton.hidden = true;
}

async function scanLoop() {
  if (!scannerActive || !detector) {
    return;
  }

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
    document.getElementById("scannerHint").textContent =
      "Nao foi possivel ler o QR automaticamente. Use o campo manual abaixo.";
  }

  window.requestAnimationFrame(scanLoop);
}

async function startScanner() {
  if (!("mediaDevices" in navigator) || !navigator.mediaDevices.getUserMedia) {
    showToast("Camera indisponivel neste navegador.");
    return;
  }

  if (!("BarcodeDetector" in window)) {
    showToast("Leitura nativa de QR nao disponivel. Use o codigo manual.");
    return;
  }

  detector = new window.BarcodeDetector({ formats: ["qr_code"] });

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    scannerVideo.srcObject = scannerStream;
    scannerModal.hidden = false;
    stopScanButton.hidden = false;
    scannerActive = true;
    window.requestAnimationFrame(scanLoop);
  } catch (error) {
    showToast("Nao foi possivel abrir a camera.");
  }
}

function handleGateRefresh() {
  const student = getCurrentStudent();
  if (!student) {
    return;
  }

  let nextState = Store.touchGateSync(state, student.id);
  nextState = Store.appendLog(nextState, {
    action: "gate-qr-refresh",
    studentId: student.id,
    message: "Aluno atualizou o QR de acesso no app."
  });
  persistState(nextState, "QR de acesso atualizado.");
}

function attachEvents() {
  document.getElementById("restoreDemoButton").addEventListener("click", () => {
    state = Store.resetData();
    session = null;
    pendingEnrollmentId = "";
    isEnrollmentStartOpen = false;
    enrollmentCard.hidden = true;
    render();
    showToast("Base demo restaurada.");
  });

  openEnrollmentButton.addEventListener("click", () => {
    isEnrollmentStartOpen = true;
    render();
  });

  startScanButton.addEventListener("click", startScanner);
  document.getElementById("closeScannerButton").addEventListener("click", stopScanner);
  stopScanButton.addEventListener("click", stopScanner);

  manualEnrollmentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get("enrollmentCode");
    beginEnrollment(code);
  });

  enrollmentForm.addEventListener("submit", completeEnrollment);

  document.getElementById("cancelEnrollmentButton").addEventListener("click", () => {
    pendingEnrollmentId = "";
    enrollmentCard.hidden = true;
    enrollmentForm.reset();
  });

  document.querySelectorAll(".nav-pill").forEach((button) => {
    button.addEventListener("click", () => switchScreen(button.dataset.screen));
  });

  document.getElementById("refreshGateQrButton").addEventListener("click", handleGateRefresh);

  window.addEventListener("storage", () => {
    syncState();
    render();
  });
}

attachEvents();
render();
Store.hydrateFromRemoteIfConfigured().then((remoteState) => {
  state = remoteState;
  render();
});
