(function () {
  const STORAGE_KEY = "profitness-data-v1";
  const LEGACY_STORAGE_KEY = "profitness-data-v0";
  const SESSION_KEY = "profitness-student-session-v1";
  const API_PLACEHOLDER = "COLE_A_URL_DO_WEB_APP_AQUI";

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function demoDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
  }

  function demoTimestampDaysAgo(days, hour, minute) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  }

  function currentMonth() {
    return todayISO().slice(0, 7);
  }

  function currency(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }
    return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
  }

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(value));
  }

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  function createCode(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function clone(data) {
    return JSON.parse(JSON.stringify(data));
  }

  function getRuntimeConfig() {
    return window.PROFITNESS_CONFIG || {};
  }

  function getApiBaseUrl() {
    const config = getRuntimeConfig();
    const url = String(config.apiBaseUrl || "").trim();
    return url && url !== API_PLACEHOLDER ? url : "";
  }

  function isRemoteConfigured() {
    return Boolean(getApiBaseUrl());
  }

  function shouldUseRemoteOnLoad() {
    const config = getRuntimeConfig();
    return config.useRemoteOnLoad !== false;
  }

  function shouldAutoSyncToRemote() {
    const config = getRuntimeConfig();
    return config.autoSyncToRemote !== false;
  }

  function createStudentRecord(overrides) {
    const student = overrides || {};
    return {
      id: student.id || uid("ALU"),
      name: student.name || "",
      phone: student.phone || "",
      email: student.email || "",
      birthDate: student.birthDate || "",
      goal: student.goal || "",
      restrictions: student.restrictions || "",
      status: student.status || "ativo",
      plan: student.plan || "",
      monthlyFee: Number(student.monthlyFee || 0),
      notes: student.notes || "",
      createdAt: student.createdAt || todayISO(),
      enrollmentToken: student.enrollmentToken || createCode("MAT"),
      enrollmentStatus: student.enrollmentStatus || "pendente",
      enrollmentCompletedAt: student.enrollmentCompletedAt || "",
      appAccessPolicy: student.appAccessPolicy || "auto",
      accessBlockReason: student.accessBlockReason || "",
      gateCode: student.gateCode || createCode("GATE"),
      lastGateSyncAt: student.lastGateSyncAt || "",
      avatarUrl: student.avatarUrl || ""
    };
  }

  function createPaymentRecord(overrides) {
    const payment = overrides || {};
    return {
      id: payment.id || uid("PG"),
      studentId: payment.studentId || "",
      reference: payment.reference || currentMonth(),
      amount: Number(payment.amount || 0),
      dueDate: payment.dueDate || todayISO(),
      status: payment.status || "pendente",
      method: payment.method || "pix",
      paidAt: payment.paidAt || "",
      notes: payment.notes || ""
    };
  }

  function buildDemoData() {
    const today = todayISO();
    const month = currentMonth();
    return {
      students: [
        createStudentRecord({
          id: "ALU-001",
          name: "Marina Costa",
          phone: "(11) 99888-2201",
          email: "marina@exemplo.com",
          birthDate: "1992-06-14",
          goal: "Emagrecimento e condicionamento",
          restrictions: "Lombar sensivel",
          status: "ativo",
          plan: "3x por semana",
          monthlyFee: 320,
          notes: "Matricula pelo QR entregue na recepcao.",
          enrollmentToken: "MAT-MARINA01",
          enrollmentStatus: "pendente",
          gateCode: "GATE-MARINA01"
        }),
        createStudentRecord({
          id: "ALU-002",
          name: "Lucas Pereira",
          phone: "(11) 97777-3102",
          email: "lucas@exemplo.com",
          birthDate: "1988-10-03",
          goal: "Hipertrofia",
          restrictions: "Nenhuma",
          status: "ativo",
          plan: "5x por semana",
          monthlyFee: 450,
          notes: "Aluno ja liberado para acesso.",
          enrollmentToken: "MAT-LUCAS02",
          enrollmentStatus: "ativo",
          enrollmentCompletedAt: today,
          gateCode: "GATE-LUCAS02",
          lastGateSyncAt: new Date().toISOString()
        }),
        createStudentRecord({
          id: "ALU-003",
          name: "Carla Mendes",
          phone: "(11) 96666-1203",
          email: "carla@exemplo.com",
          birthDate: "1979-02-27",
          goal: "Reabilitacao e mobilidade",
          restrictions: "Joelho esquerdo",
          status: "ativo",
          plan: "2x por semana",
          monthlyFee: 280,
          notes: "Acesso bloqueado por atraso.",
          enrollmentToken: "MAT-CARLA03",
          enrollmentStatus: "ativo",
          enrollmentCompletedAt: today,
          gateCode: "GATE-CARLA03",
          lastGateSyncAt: new Date().toISOString()
        })
      ],
      assessments: [
        {
          id: "AV-001",
          studentId: "ALU-002",
          date: "2026-04-10",
          weight: 83,
          height: 1.81,
          imc: 25.34,
          bodyFat: 18.2,
          chest: 104,
          waist: 82,
          hip: 96,
          arm: 39,
          thigh: 61,
          photos: []
        },
        {
          id: "AV-002",
          studentId: "ALU-003",
          date: "2026-04-08",
          weight: 69.2,
          height: 1.68,
          imc: 24.52,
          bodyFat: 27.1,
          chest: 94,
          waist: 81,
          hip: 99,
          arm: 30,
          thigh: 55,
          photos: []
        }
      ],
      workouts: [
        {
          id: "TR-001",
          studentId: "ALU-002",
          title: "Treino A - Peito e Triceps",
          division: "A",
          muscleGroup: "Superiores",
          exercises: ["Supino reto", "Crucifixo", "Triceps corda"],
          sets: "5x",
          reps: "8-10",
          load: "35 kg",
          rest: "75s",
          status: "ativo",
          notes: "Progressao de carga semanal.",
          createdAt: today
        },
        {
          id: "TR-002",
          studentId: "ALU-003",
          title: "Treino Mobilidade",
          division: "B",
          muscleGroup: "Mobilidade",
          exercises: ["Prancha", "Bird Dog", "Ponte"],
          sets: "3x",
          reps: "15",
          load: "Peso corporal",
          rest: "45s",
          status: "ativo",
          notes: "Executar com foco em controle.",
          createdAt: today
        }
      ],
      schedule: [
        {
          id: "AG-001",
          studentId: "ALU-002",
          date: today,
          time: "19:00",
          type: "presencial",
          status: "marcada",
          notes: "Treino de forca."
        },
        {
          id: "AG-002",
          studentId: "ALU-003",
          date: "2026-04-26",
          time: "09:00",
          type: "presencial",
          status: "remarcada",
          notes: "Sessao de retorno."
        }
      ],
      payments: [
        createPaymentRecord({
          id: "PG-001",
          studentId: "ALU-001",
          reference: month,
          amount: 320,
          dueDate: "2026-04-28",
          status: "pendente",
          method: "pix"
        }),
        createPaymentRecord({
          id: "PG-002",
          studentId: "ALU-002",
          reference: month,
          amount: 450,
          dueDate: "2026-04-25",
          status: "pago",
          method: "cartao",
          paidAt: today
        }),
        createPaymentRecord({
          id: "PG-003",
          studentId: "ALU-003",
          reference: month,
          amount: 280,
          dueDate: "2026-04-12",
          status: "vencido",
          method: "boleto"
        })
      ],
      checkins: [
        {
          id: "CK-ACCESS-001",
          studentId: "ALU-002",
          workoutId: "",
          date: today,
          time: new Date().toTimeString().slice(0, 5),
          type: "access",
          checkedInAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
          checkedOutAt: "",
          source: "catraca",
          presenceStatus: "inside",
          usedLoad: "",
          difficulty: "",
          pain: "",
          notes: "Entrada de demonstracao pela catraca."
        },
        {
          id: "CK-ACCESS-002",
          studentId: "ALU-002",
          workoutId: "",
          date: demoDateDaysAgo(1),
          time: "18:10",
          type: "access",
          checkedInAt: demoTimestampDaysAgo(1, 18, 10),
          checkedOutAt: demoTimestampDaysAgo(1, 19, 35),
          source: "catraca",
          presenceStatus: "outside",
          usedLoad: "",
          difficulty: "",
          pain: "",
          notes: ""
        },
        {
          id: "CK-ACCESS-003",
          studentId: "ALU-003",
          workoutId: "",
          date: demoDateDaysAgo(2),
          time: "08:20",
          type: "access",
          checkedInAt: demoTimestampDaysAgo(2, 8, 20),
          checkedOutAt: demoTimestampDaysAgo(2, 9, 30),
          source: "catraca",
          presenceStatus: "outside",
          usedLoad: "",
          difficulty: "",
          pain: "",
          notes: ""
        },
        {
          id: "CK-ACCESS-004",
          studentId: "ALU-002",
          workoutId: "",
          date: demoDateDaysAgo(4),
          time: "19:05",
          type: "access",
          checkedInAt: demoTimestampDaysAgo(4, 19, 5),
          checkedOutAt: demoTimestampDaysAgo(4, 20, 25),
          source: "catraca",
          presenceStatus: "outside",
          usedLoad: "",
          difficulty: "",
          pain: "",
          notes: ""
        },
        {
          id: "CK-001",
          studentId: "ALU-002",
          workoutId: "TR-001",
          date: "2026-04-22",
          time: "19:10",
          type: "workout",
          checkedInAt: "",
          checkedOutAt: "",
          source: "app",
          presenceStatus: "",
          usedLoad: "40 kg",
          difficulty: "alta",
          pain: "leve",
          notes: "Desconforto leve no ombro."
        }
      ],
      exercises: [
        { id: "EX-001", name: "Supino reto", muscleGroup: "Peito", equipment: "Barra" },
        { id: "EX-002", name: "Prancha", muscleGroup: "Core", equipment: "Solo" }
      ],
      users: [
        { id: "USR-001", name: "Equipe Pro Fitness", email: "gestao@exemplo.com", role: "admin" }
      ],
      config: [
        { id: "CFG-001", timezone: "America/Sao_Paulo", currency: "BRL", appName: "Pro Fitness Academia", supportPhone: "(22) 98823-3216" }
      ],
      log: []
    };
  }

  function sortByDateDescending(items, field) {
    return clone(items).sort((left, right) => String(right[field] || "").localeCompare(String(left[field] || "")));
  }

  function migrateData(raw) {
    const base = buildDemoData();
    const data = raw && typeof raw === "object" ? raw : {};
    return {
      students: safeArray(data.students).length ? safeArray(data.students).map(createStudentRecord) : base.students,
      assessments: safeArray(data.assessments).length ? safeArray(data.assessments) : base.assessments,
      workouts: safeArray(data.workouts).length ? safeArray(data.workouts) : base.workouts,
      schedule: safeArray(data.schedule).length ? safeArray(data.schedule) : base.schedule,
      payments: safeArray(data.payments).length ? safeArray(data.payments).map(createPaymentRecord) : base.payments,
      checkins: safeArray(data.checkins).length ? safeArray(data.checkins) : base.checkins,
      exercises: safeArray(data.exercises).length ? safeArray(data.exercises) : base.exercises,
      users: safeArray(data.users).length ? safeArray(data.users) : base.users,
      config: safeArray(data.config).length ? safeArray(data.config) : base.config,
      log: safeArray(data.log)
    };
  }

  function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : legacy ? JSON.parse(legacy) : buildDemoData();
    const normalized = migrateData(parsed);
    saveData(normalized);
    return normalized;
  }

  async function requestRemote(method, payload) {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl) {
      throw new Error("API do Google Sheets nao configurada.");
    }

    const options = {
      method: method,
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      }
    };

    if (payload) {
      options.body = JSON.stringify(payload);
    }

    const response = await fetch(apiBaseUrl, options);
    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.message || "Falha ao comunicar com a API do Sheets.");
    }

    return data;
  }

  async function fetchRemoteSnapshot() {
    const exportUrl = `${getApiBaseUrl()}?action=exportAll`;
    const exportResponse = await fetch(exportUrl);
    const data = await exportResponse.json();

    if (!data.ok) {
      throw new Error(data.message || "Falha ao exportar snapshot remoto.");
    }

    const snapshot = data.data && data.data.snapshot ? data.data.snapshot : data.data;
    return normalizeSnapshot(snapshot || {});
  }

  async function setupRemoteSpreadsheet() {
    const setupUrl = `${getApiBaseUrl()}?action=setup`;
    const response = await fetch(setupUrl);
    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.message || "Falha ao preparar a planilha.");
    }

    return data.data;
  }

  async function fetchRemoteHealth() {
    const healthUrl = `${getApiBaseUrl()}?action=health`;
    const response = await fetch(healthUrl);
    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.message || "Falha ao consultar a API.");
    }

    return data.data;
  }

  async function pushRemoteSnapshot(snapshot) {
    const normalized = normalizeSnapshot(snapshot);
    const data = await requestRemote("POST", {
      action: "importAll",
      snapshot: normalized
    });
    saveData(normalized);
    return data.data;
  }

  function snapshotHasMeaningfulData(snapshot) {
    const normalized = normalizeSnapshot(snapshot);
    const keys = ["students", "assessments", "workouts", "schedule", "payments", "checkins", "exercises", "users"];
    return keys.some((key) => Array.isArray(normalized[key]) && normalized[key].length > 0);
  }

  async function hydrateFromRemoteIfConfigured() {
    const localSnapshot = loadData();

    if (!isRemoteConfigured() || !shouldUseRemoteOnLoad()) {
      return localSnapshot;
    }

    try {
      const remoteSnapshot = await fetchRemoteSnapshot();

      if (!snapshotHasMeaningfulData(remoteSnapshot) && snapshotHasMeaningfulData(localSnapshot)) {
        return localSnapshot;
      }

      saveData(remoteSnapshot);
      return remoteSnapshot;
    } catch (error) {
      return localSnapshot;
    }
  }

  async function syncSnapshotIfConfigured(snapshot) {
    if (!isRemoteConfigured() || !shouldAutoSyncToRemote()) {
      return null;
    }
    return pushRemoteSnapshot(snapshot);
  }

  function normalizeSnapshot(snapshot) {
    return migrateData(snapshot || {});
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrateData(data)));
  }

  function resetData() {
    const demo = buildDemoData();
    saveData(demo);
    clearStudentSession();
    return demo;
  }

  function loadStudentSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function saveStudentSession(studentId) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ studentId: studentId }));
  }

  function clearStudentSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function findStudent(data, studentId) {
    return data.students.find((student) => student.id === studentId) || null;
  }

  function getStudentPayments(data, studentId) {
    return sortByDateDescending(
      data.payments.filter((payment) => payment.studentId === studentId),
      "dueDate"
    );
  }

  function getCurrentPayment(data, studentId) {
    const payments = getStudentPayments(data, studentId);
    const monthly = payments.find((payment) => payment.reference === currentMonth());
    return monthly || payments[0] || null;
  }

  function getLatestAssessment(data, studentId) {
    return sortByDateDescending(
      data.assessments.filter((assessment) => assessment.studentId === studentId),
      "date"
    )[0] || null;
  }

  function getStudentWorkouts(data, studentId) {
    return data.workouts.filter((workout) => workout.studentId === studentId);
  }

  function getStudentCheckins(data, studentId) {
    return sortByDateDescending(
      data.checkins.filter((checkin) => checkin.studentId === studentId),
      "date"
    );
  }

  function getStudentSchedule(data, studentId) {
    return clone(data.schedule)
      .filter((scheduleItem) => scheduleItem.studentId === studentId)
      .sort((left, right) => `${left.date}${left.time}`.localeCompare(`${right.date}${right.time}`));
  }

  function getStatusTone(status) {
    const tones = {
      ativo: "success",
      liberado: "success",
      pago: "success",
      realizada: "success",
      aviso: "warning",
      pendente: "warning",
      remarcada: "warning",
      pausado: "warning",
      bloqueado: "danger",
      vencido: "danger",
      cancelada: "danger",
      inativo: "danger",
      falta: "danger"
    };
    return tones[status] || "neutral";
  }

  function getAccessState(data, studentId) {
    const student = findStudent(data, studentId);
    if (!student) {
      return {
        status: "bloqueado",
        label: "Bloqueado",
        reason: "Aluno nao encontrado.",
        payment: null,
        allowsGate: false
      };
    }

    const payment = getCurrentPayment(data, studentId);
    const today = todayISO();

    if (student.status !== "ativo") {
      return {
        status: "bloqueado",
        label: "Bloqueado",
        reason: "Aluno esta com status administrativo inativo ou pausado.",
        payment: payment,
        allowsGate: false
      };
    }

    if (student.appAccessPolicy === "bloqueado") {
      return {
        status: "bloqueado",
        label: "Bloqueado",
        reason: student.accessBlockReason || "Bloqueio manual definido no painel.",
        payment: payment,
        allowsGate: false
      };
    }

    if (student.enrollmentStatus !== "ativo") {
      return {
        status: "aviso",
        label: "Matricula pendente",
        reason: "Leia o QR de matricula para ativar o app do aluno.",
        payment: payment,
        allowsGate: false
      };
    }

    if (student.appAccessPolicy === "liberado") {
      return {
        status: "liberado",
        label: "Liberado",
        reason: student.accessBlockReason || "Acesso liberado manualmente pelo painel.",
        payment: payment,
        allowsGate: true
      };
    }

    if (!payment) {
      return {
        status: "aviso",
        label: "Sem cobranca",
        reason: "Nao existe mensalidade cadastrada para este aluno.",
        payment: null,
        allowsGate: true
      };
    }

    if (payment.status === "vencido" || (payment.status === "pendente" && payment.dueDate && payment.dueDate < today)) {
      return {
        status: "bloqueado",
        label: "Acesso bloqueado",
        reason: `Mensalidade em atraso desde ${formatDate(payment.dueDate)}.`,
        payment: payment,
        allowsGate: false
      };
    }

    if (payment.status === "pendente") {
      return {
        status: "aviso",
        label: "Pagamento pendente",
        reason: `Mensalidade pendente com vencimento em ${formatDate(payment.dueDate)}.`,
        payment: payment,
        allowsGate: true
      };
    }

    return {
      status: "liberado",
      label: "Acesso liberado",
      reason: "Mensalidade em dia e acesso autorizado.",
      payment: payment,
      allowsGate: true
    };
  }

  function buildEnrollmentPayload(student) {
    if (!student || student.enrollmentStatus === "ativo" || !student.enrollmentToken) {
      return "";
    }
    return `PROFITNESS|ENROLL|${student.id}|${student.enrollmentToken}`;
  }

  function buildGatePayload(data, studentId) {
    const student = findStudent(data, studentId);
    const access = getAccessState(data, studentId);
    if (!student) {
      return "";
    }
    const syncSeed = student.lastGateSyncAt || new Date().toISOString();
    return `PROFITNESS|GATE|${student.id}|${student.gateCode}|${syncSeed}|${access.status}`;
  }

  function appendLog(data, entry) {
    const next = migrateData(data);
    next.log.unshift({
      id: uid("LOG"),
      timestamp: new Date().toISOString(),
      ...entry
    });
    next.log = next.log.slice(0, 200);
    return next;
  }

  function upsertStudent(data, studentPayload) {
    const next = migrateData(data);
    const record = createStudentRecord(studentPayload);
    const index = next.students.findIndex((student) => student.id === record.id);

    if (index >= 0) {
      next.students[index] = createStudentRecord({
        ...next.students[index],
        ...record
      });
    } else {
      next.students.unshift(record);
    }

    return next;
  }

  function upsertPayment(data, paymentPayload) {
    const next = migrateData(data);
    const record = createPaymentRecord(paymentPayload);
    const index = next.payments.findIndex((payment) => payment.id === record.id);

    if (index >= 0) {
      next.payments[index] = createPaymentRecord({
        ...next.payments[index],
        ...record
      });
    } else {
      next.payments.unshift(record);
    }

    return next;
  }

  function updateStudent(data, studentId, updater) {
    const next = migrateData(data);
    next.students = next.students.map((student) => {
      if (student.id !== studentId) {
        return student;
      }
      const updated = typeof updater === "function" ? updater(student) : updater;
      return createStudentRecord({
        ...student,
        ...updated
      });
    });
    return next;
  }

  function regenerateEnrollmentToken(data, studentId) {
    return updateStudent(data, studentId, {
      enrollmentToken: createCode("MAT")
    });
  }

  function regenerateGateCode(data, studentId) {
    return updateStudent(data, studentId, {
      gateCode: createCode("GATE"),
      lastGateSyncAt: new Date().toISOString()
    });
  }

  function touchGateSync(data, studentId) {
    return updateStudent(data, studentId, {
      lastGateSyncAt: new Date().toISOString()
    });
  }

  window.ProFitnessStore = {
    API_PLACEHOLDER: API_PLACEHOLDER,
    STORAGE_KEY: STORAGE_KEY,
    SESSION_KEY: SESSION_KEY,
    buildDemoData: buildDemoData,
    buildEnrollmentPayload: buildEnrollmentPayload,
    buildGatePayload: buildGatePayload,
    appendLog: appendLog,
    clearStudentSession: clearStudentSession,
    clone: clone,
    createCode: createCode,
    createPaymentRecord: createPaymentRecord,
    createStudentRecord: createStudentRecord,
    currency: currency,
    currentMonth: currentMonth,
    fetchRemoteHealth: fetchRemoteHealth,
    fetchRemoteSnapshot: fetchRemoteSnapshot,
    findStudent: findStudent,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    getAccessState: getAccessState,
    getCurrentPayment: getCurrentPayment,
    getLatestAssessment: getLatestAssessment,
    getStatusTone: getStatusTone,
    getStudentCheckins: getStudentCheckins,
    getStudentPayments: getStudentPayments,
    getStudentSchedule: getStudentSchedule,
    getStudentWorkouts: getStudentWorkouts,
    getApiBaseUrl: getApiBaseUrl,
    getRuntimeConfig: getRuntimeConfig,
    hydrateFromRemoteIfConfigured: hydrateFromRemoteIfConfigured,
    isRemoteConfigured: isRemoteConfigured,
    loadData: loadData,
    loadStudentSession: loadStudentSession,
    migrateData: migrateData,
    normalizeSnapshot: normalizeSnapshot,
    pushRemoteSnapshot: pushRemoteSnapshot,
    regenerateEnrollmentToken: regenerateEnrollmentToken,
    regenerateGateCode: regenerateGateCode,
    resetData: resetData,
    saveData: saveData,
    saveStudentSession: saveStudentSession,
    setupRemoteSpreadsheet: setupRemoteSpreadsheet,
    snapshotHasMeaningfulData: snapshotHasMeaningfulData,
    shouldAutoSyncToRemote: shouldAutoSyncToRemote,
    shouldUseRemoteOnLoad: shouldUseRemoteOnLoad,
    syncSnapshotIfConfigured: syncSnapshotIfConfigured,
    todayISO: todayISO,
    touchGateSync: touchGateSync,
    uid: uid,
    upsertPayment: upsertPayment,
    upsertStudent: upsertStudent,
    updateStudent: updateStudent
  };
})();
