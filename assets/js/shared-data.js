(function () {
  const RUNTIME_CONFIG = window.PROFITNESS_CONFIG || {};
  const ENVIRONMENT = String(RUNTIME_CONFIG.environment || "production").trim().toLowerCase() === "demo" ? "demo" : "production";
  const PAGE_NAME = String(window.location?.pathname || "").split("/").pop().toLowerCase();
  const SURFACE = PAGE_NAME === "prof.html" ? "professor" : ["painel.html", "gestor.html"].includes(PAGE_NAME) ? "admin" : "student";
  const STORAGE_NAMESPACE = `profitness-${ENVIRONMENT}-${SURFACE}`;
  const STORAGE_KEY = `${STORAGE_NAMESPACE}-data-v1`;
  const PRE_ENVIRONMENT_STORAGE_KEY = "profitness-data-v1";
  const LEGACY_STORAGE_KEY = "profitness-data-v0";
  const SESSION_KEY = `${STORAGE_NAMESPACE}-student-session-v1`;
  const AUTH_SESSION_KEY = `${STORAGE_NAMESPACE}-auth-session-v1`;
  const LOCAL_DEMO_MASTER_KEY = `${STORAGE_NAMESPACE}-demo-master-v1`;
  let localDemoRuntimeSnapshot = null;
  const API_PLACEHOLDER = "COLE_A_URL_DO_WEB_APP_AQUI";
  const WEEKLY_NOTE_PREFIX = "WEEKLY_CLASS:";
  const LOCAL_DEMO_ACCOUNTS = {
    "000001": { id: "ACC-DEMO-STUDENT", personType: "student", personId: "ALU-DEMO-001", login: "000001", email: "aluno001@exemplo.com", role: "student", active: true, mustChangePassword: false, demoPassword: "Demo1234" },
    "prof.rafael": { id: "ACC-DEMO-PROF", personType: "staff", personId: "USR-PROF-006", login: "prof.rafael", email: "rafael.costa@exemplo.com", role: "professor", active: true, mustChangePassword: false, demoPassword: "Demo1234" },
    "admin.demo": { id: "ACC-DEMO-ADMIN", personType: "staff", personId: "USR-ADMIN-001", login: "admin.demo", email: "administracao@exemplo.com", role: "admin", active: true, mustChangePassword: false, demoPassword: "Demo1234" }
  };
  const SHARED_DEMO_ACCOUNTS_KEY = "profitness-demo-dynamic-accounts-v1";
  const SHARED_DEMO_STUDENTS_KEY = "profitness-demo-dynamic-students-v1";
  const SYNC_DEVICE_KEY = `${STORAGE_NAMESPACE}-sync-device-v1`;
  const SNAPSHOT_RESOURCES = ["students", "assessments", "workouts", "schedule", "payments", "movements", "expenses", "cashClosings", "checkins", "workoutSessions", "exerciseSets", "exercises", "users", "staffTimeEntries", "config", "log"];
  const LEGACY_OPTIONAL_RESOURCES = ["workoutSessions", "exerciseSets"];

  function dateToSaoPauloISO(date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date || new Date());
  }

  function todayISO() {
    return dateToSaoPauloISO(new Date());
  }

  function demoDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return dateToSaoPauloISO(date);
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

  function parseDateInput(value) {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const raw = String(value).trim();
    if (!raw) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return new Date(`${raw}T12:00:00`);
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDate(value) {
    const parsed = parseDateInput(value);
    if (!parsed) {
      return "-";
    }
    if (parsed.getUTCFullYear() <= 1900) {
      return "-";
    }
    return new Intl.DateTimeFormat("pt-BR").format(parsed);
  }

  function formatTime(value) {
    if (!value && value !== 0) {
      return "--:--";
    }
    const raw = String(value).trim();
    if (!raw) {
      return "--:--";
    }
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      return `${match[1].padStart(2, "0")}:${match[2]}`;
    }
    const parsed = parseDateInput(raw);
    if (!parsed) {
      return raw;
    }
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC"
    }).format(parsed);
  }

  function formatDateTime(value) {
    const parsed = parseDateInput(value);
    if (!parsed) {
      return "-";
    }
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(parsed);
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

  function getSyncDeviceId() {
    let deviceId = localStorage.getItem(SYNC_DEVICE_KEY);
    if (!deviceId) {
      deviceId = uid("DEV");
      localStorage.setItem(SYNC_DEVICE_KEY, deviceId);
    }
    return deviceId;
  }

  function getSyncSource() {
    const page = String(window.location?.pathname || "").split("/").pop().toLowerCase();
    if (page === "prof.html") return "tablet-professor";
    if (page === "painel.html") return "painel-administrativo";
    if (page === "gestor.html") return "gestor-mobile";
    if (page === "index.html" || !page) return "app-aluno";
    return "aplicacao-web";
  }

  function prepareRemoteRecord(record) {
    const prepared = clone(record || {});
    prepared.updatedAt = prepared.updatedAt || prepared.createdAt || new Date().toISOString();
    prepared.updatedBy = prepared.updatedBy || prepared.recordedBy || (getSyncSource() === "tablet-professor" ? "Professor" : "Administracao");
    prepared.source = prepared.source || getSyncSource();
    prepared.deviceId = prepared.deviceId || getSyncDeviceId();
    return prepared;
  }

  function getRuntimeConfig() {
    return RUNTIME_CONFIG;
  }

  function getEnvironment() {
    return ENVIRONMENT;
  }

  function isDemoEnvironment() {
    return ENVIRONMENT === "demo";
  }

  function storageKey(name) {
    return `${STORAGE_NAMESPACE}-${String(name || "data").replace(/^profitness-/, "")}`;
  }

  function applyRuntimeEnvironment() {
    const label = String(RUNTIME_CONFIG.environmentLabel || (isDemoEnvironment() ? "Ambiente de demonstracao" : "")).trim();
    document.querySelectorAll("[data-environment-badge]").forEach((badge) => {
      badge.hidden = !isDemoEnvironment();
      badge.textContent = label;
    });
    document.documentElement.dataset.environment = ENVIRONMENT;
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
      enrollmentNumber: String(student.enrollmentNumber || student.registrationNumber || student.id || ""),
      cpf: String(student.cpf || ""),
      accountId: String(student.accountId || ""),
      name: student.name || "",
      phone: student.phone || "",
      email: student.email || "",
      birthDate: student.birthDate || "",
      goal: student.goal || "",
      restrictions: student.restrictions || "",
      status: student.status || "ativo",
      plan: student.plan || "",
      selectedModalities: Array.isArray(student.selectedModalities) ? clone(student.selectedModalities) : student.selectedModalities || [],
      baseMonthlyFee: Number(student.baseMonthlyFee ?? student.monthlyFee ?? 0),
      planDiscountType: student.planDiscountType || "individual",
      planDiscountPercent: Number(student.planDiscountPercent || 0),
      monthlyFee: Number(student.monthlyFee || 0),
      notes: student.notes || "",
      createdAt: student.createdAt || todayISO(),
      updatedAt: student.updatedAt || student.createdAt || new Date().toISOString(),
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
    const amount = Number(payment.amount || 0);
    const discount = Number(payment.discount || 0);
    const fine = Number(payment.fine || 0);
    const netAmount = Number(payment.netAmount ?? Math.max(0, amount - discount + fine));
    const status = payment.status || "pendente";
    return {
      id: payment.id || uid("PG"),
      studentId: payment.studentId || "",
      reference: payment.reference || currentMonth(),
      amount: amount,
      discount: discount,
      fine: fine,
      netAmount: netAmount,
      paidAmount: Number(payment.paidAmount ?? (status === "pago" ? netAmount : 0)),
      dueDate: payment.dueDate || todayISO(),
      status: status,
      method: payment.method || "pix",
      paidAt: payment.paidAt || "",
      recordedBy: payment.recordedBy || "Equipe Pro Fitness",
      reversalReason: payment.reversalReason || "",
      reversedBy: payment.reversedBy || "",
      reversedAt: payment.reversedAt || "",
      collectionLastContactAt: payment.collectionLastContactAt || "",
      collectionContactType: payment.collectionContactType || "",
      collectionNotes: payment.collectionNotes || "",
      paymentPromiseDate: payment.paymentPromiseDate || "",
      description: payment.description || "Mensalidade",
      createdAt: payment.createdAt || new Date().toISOString(),
      updatedAt: payment.updatedAt || payment.createdAt || new Date().toISOString(),
      notes: payment.notes || ""
    };
  }

  function createMovementRecord(overrides) {
    const movement = overrides || {};
    return {
      id: movement.id || uid("MOV"),
      date: movement.date || todayISO(),
      time: movement.time || new Date().toTimeString().slice(0, 5),
      type: movement.type || "entrada",
      category: movement.category || "outros",
      description: movement.description || "Lancamento financeiro",
      amount: Number(movement.amount || 0),
      method: movement.method || "pix",
      account: movement.account || "caixa-principal",
      costCenter: movement.costCenter || "geral",
      studentId: movement.studentId || "",
      paymentId: movement.paymentId || "",
      expenseId: movement.expenseId || "",
      status: movement.status || "confirmado",
      voidReason: movement.voidReason || "",
      voidedBy: movement.voidedBy || "",
      voidedAt: movement.voidedAt || "",
      createdAt: movement.createdAt || new Date().toISOString(),
      updatedAt: movement.updatedAt || movement.createdAt || new Date().toISOString(),
      notes: movement.notes || ""
    };
  }

  function createExpenseRecord(overrides) {
    const expense = overrides || {};
    return {
      id: expense.id || uid("DES"),
      description: expense.description || "Despesa",
      supplier: expense.supplier || "",
      category: expense.category || "outros",
      amount: Number(expense.amount || 0),
      dueDate: expense.dueDate || todayISO(),
      status: expense.status || "pendente",
      paidAt: expense.paidAt || "",
      method: expense.method || "pix",
      account: expense.account || "caixa-principal",
      costCenter: expense.costCenter || "geral",
      recurring: expense.recurring || "nao",
      recurrenceId: expense.recurrenceId || "",
      document: expense.document || "",
      createdAt: expense.createdAt || new Date().toISOString(),
      updatedAt: expense.updatedAt || expense.createdAt || new Date().toISOString(),
      notes: expense.notes || ""
    };
  }

  function createCashClosingRecord(overrides) {
    const closing = overrides || {};
    return {
      id: closing.id || uid("FEC"),
      date: closing.date || todayISO(),
      openingBalance: Number(closing.openingBalance || 0),
      cashIncome: Number(closing.cashIncome || 0),
      cashExpense: Number(closing.cashExpense || 0),
      expectedCash: Number(closing.expectedCash || 0),
      countedCash: Number(closing.countedCash || 0),
      difference: Number(closing.difference || 0),
      totalIncome: Number(closing.totalIncome || 0),
      totalExpense: Number(closing.totalExpense || 0),
      closedBy: closing.closedBy || "Administracao",
      closedAt: closing.closedAt || new Date().toISOString(),
      notes: closing.notes || ""
    };
  }

  function createCheckinRecord(overrides) {
    const checkin = overrides || {};
    const hasExplicitPresenceSource = Object.prototype.hasOwnProperty.call(checkin, "presenceSource");
    return {
      id: checkin.id || uid("CK"),
      studentId: checkin.studentId || "",
      workoutId: checkin.workoutId || "",
      date: checkin.date || todayISO(),
      time: checkin.time || "",
      type: checkin.type || "access",
      checkedInAt: checkin.checkedInAt || "",
      checkedOutAt: checkin.checkedOutAt || "",
      presenceSource: checkin.presenceSource || checkin.entrySource || (!hasExplicitPresenceSource ? checkin.source || "" : ""),
      presenceStatus: checkin.presenceStatus || "",
      usedLoad: checkin.usedLoad || "",
      difficulty: checkin.difficulty || "",
      pain: checkin.pain || "",
      notes: checkin.notes || "",
      updatedAt: checkin.updatedAt || checkin.checkedOutAt || checkin.checkedInAt || new Date().toISOString(),
      updatedBy: checkin.updatedBy || "",
      source: hasExplicitPresenceSource ? checkin.source || "" : checkin.syncSource || "",
      deviceId: checkin.deviceId || ""
    };
  }

  function createWorkoutSessionRecord(overrides) {
    const session = overrides || {};
    const startedAt = session.startedAt || new Date().toISOString();
    return {
      id: session.id || uid("SES"),
      studentId: session.studentId || "",
      workoutId: session.workoutId || "",
      workoutTitle: session.workoutTitle || "Treino",
      division: session.division || "",
      startedAt,
      endedAt: session.endedAt || "",
      durationMinutes: Number(session.durationMinutes || 0),
      status: session.status || "em_andamento",
      difficulty: session.difficulty || "",
      pain: session.pain || "",
      notes: session.notes || "",
      totalSets: Number(session.totalSets || 0),
      completedSets: Number(session.completedSets || 0),
      createdAt: session.createdAt || startedAt,
      updatedAt: session.updatedAt || session.endedAt || startedAt,
      updatedBy: session.updatedBy || "",
      source: session.source || "",
      deviceId: session.deviceId || ""
    };
  }

  function createExerciseSetRecord(overrides) {
    const exerciseSet = overrides || {};
    const createdAt = exerciseSet.createdAt || new Date().toISOString();
    return {
      id: exerciseSet.id || uid("SER"),
      sessionId: exerciseSet.sessionId || "",
      studentId: exerciseSet.studentId || "",
      workoutId: exerciseSet.workoutId || "",
      exerciseItemId: exerciseSet.exerciseItemId || "",
      exerciseId: exerciseSet.exerciseId || "",
      exerciseName: exerciseSet.exerciseName || "Exercicio",
      setNumber: Number(exerciseSet.setNumber || 1),
      targetReps: exerciseSet.targetReps || "",
      actualReps: Number(exerciseSet.actualReps || 0),
      targetLoad: exerciseSet.targetLoad || "",
      actualLoad: Number(exerciseSet.actualLoad || 0),
      status: exerciseSet.status || "pendente",
      completedAt: exerciseSet.completedAt || "",
      notes: exerciseSet.notes || "",
      createdAt,
      updatedAt: exerciseSet.updatedAt || exerciseSet.completedAt || createdAt,
      updatedBy: exerciseSet.updatedBy || "",
      source: exerciseSet.source || "",
      deviceId: exerciseSet.deviceId || ""
    };
  }

  function createStaffTimeEntryRecord(overrides) {
    const entry = overrides || {};
    return {
      id: entry.id || uid("PTO"),
      staffId: entry.staffId || "",
      staffName: entry.staffName || "Professor Pro Fitness",
      date: entry.date || todayISO(),
      clockIn: entry.clockIn || "",
      clockOut: entry.clockOut || "",
      durationMinutes: Number(entry.durationMinutes || 0),
      status: entry.status || (entry.clockOut ? "concluido" : "aberto"),
      source: entry.source || "tablet-professor",
      deviceId: entry.deviceId || "",
      notes: entry.notes || "",
      createdAt: entry.createdAt || entry.clockIn || new Date().toISOString(),
      updatedAt: entry.updatedAt || entry.clockOut || entry.clockIn || new Date().toISOString()
    };
  }

  function createDemoWeeklyClass(overrides) {
    const weeklyClass = {
      id: overrides.id || uid("GRD"),
      title: overrides.title || "Atividade coletiva",
      category: overrides.category || "outra",
      dayOfWeek: Number(overrides.dayOfWeek ?? 1),
      startTime: overrides.startTime || "08:00",
      endTime: overrides.endTime || "09:00",
      teacherId: overrides.teacherId || "",
      teacherName: overrides.teacherName || "Professor a definir",
      location: overrides.location || "Local a definir",
      capacity: Number(overrides.capacity || 0),
      status: overrides.status || "ativo",
      userNotes: overrides.notes || "Horario demonstrativo. Substitua pelos dados reais da academia."
    };

    return {
      id: weeklyClass.id,
      studentId: "",
      date: "",
      time: weeklyClass.startTime,
      type: "group",
      status: weeklyClass.status,
      title: weeklyClass.title,
      category: weeklyClass.category,
      dayOfWeek: weeklyClass.dayOfWeek,
      startTime: weeklyClass.startTime,
      endTime: weeklyClass.endTime,
      teacherId: weeklyClass.teacherId,
      teacherName: weeklyClass.teacherName,
      location: weeklyClass.location,
      capacity: weeklyClass.capacity,
      recurring: true,
      scheduleKind: "weekly-class",
      notes: `${WEEKLY_NOTE_PREFIX}${JSON.stringify(weeklyClass)}`
    };
  }

  function buildDemoData() {
    const today = todayISO();
    const month = currentMonth();
    const yesterday = demoDateDaysAgo(1);
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
        },
        createDemoWeeklyClass({
          id: "GRD-001",
          title: "Natacao adulto",
          category: "natacao",
          dayOfWeek: 1,
          startTime: "06:00",
          endTime: "07:00",
          teacherName: "Prof. Rafael",
          location: "Piscina",
          capacity: 16
        }),
        createDemoWeeklyClass({
          id: "GRD-002",
          title: "Hidroginastica",
          category: "hidroginastica",
          dayOfWeek: 2,
          startTime: "08:00",
          endTime: "09:00",
          teacherName: "Profa. Luiza",
          location: "Piscina",
          capacity: 20
        }),
        createDemoWeeklyClass({
          id: "GRD-003",
          title: "Karate infantil",
          category: "karate",
          dayOfWeek: 2,
          startTime: "17:30",
          endTime: "18:30",
          teacherName: "Profa. Camila",
          location: "Sala de lutas",
          capacity: 18
        }),
        createDemoWeeklyClass({
          id: "GRD-004",
          title: "Jiu-jitsu",
          category: "jiu-jitsu",
          dayOfWeek: 3,
          startTime: "19:00",
          endTime: "20:30",
          teacherName: "Prof. Bruno",
          location: "Sala de lutas",
          capacity: 22
        }),
        createDemoWeeklyClass({
          id: "GRD-005",
          title: "Natacao infantil",
          category: "natacao",
          dayOfWeek: 4,
          startTime: "18:30",
          endTime: "19:20",
          teacherName: "Prof. Rafael",
          location: "Piscina",
          capacity: 12
        }),
        createDemoWeeklyClass({
          id: "GRD-006",
          title: "Treino funcional",
          category: "funcional",
          dayOfWeek: 5,
          startTime: "07:00",
          endTime: "08:00",
          teacherName: "Profa. Ana",
          location: "Sala principal",
          capacity: 20
        }),
        createDemoWeeklyClass({
          id: "GRD-007",
          title: "Karate adulto",
          category: "karate",
          dayOfWeek: 6,
          startTime: "09:00",
          endTime: "10:30",
          teacherName: "Profa. Camila",
          location: "Sala de lutas",
          capacity: 20
        })
      ],
      payments: [
        createPaymentRecord({
          id: "PG-001",
          studentId: "ALU-001",
          reference: month,
          amount: 320,
          dueDate: `${month}-20`,
          status: "pendente",
          method: "pix"
        }),
        createPaymentRecord({
          id: "PG-002",
          studentId: "ALU-002",
          reference: month,
          amount: 450,
          dueDate: `${month}-08`,
          status: "pago",
          method: "cartao",
          paidAt: today
        }),
        createPaymentRecord({
          id: "PG-003",
          studentId: "ALU-003",
          reference: month,
          amount: 280,
          dueDate: `${month}-05`,
          status: "vencido",
          method: "boleto",
          fine: 15,
          netAmount: 295
        })
      ],
      movements: [
        createMovementRecord({
          id: "MOV-001",
          date: today,
          time: "09:15",
          type: "entrada",
          category: "mensalidade",
          description: "Mensalidade do mes",
          amount: 450,
          method: "cartao",
          studentId: "ALU-002",
          paymentId: "PG-002"
        }),
        createMovementRecord({
          id: "MOV-002",
          date: yesterday,
          time: "16:30",
          type: "entrada",
          category: "avaliacao",
          description: "Avaliacao fisica avulsa",
          amount: 120,
          method: "pix"
        }),
        createMovementRecord({
          id: "MOV-003",
          date: yesterday,
          time: "17:10",
          type: "saida",
          category: "limpeza",
          description: "Material de limpeza",
          amount: 180,
          method: "pix",
          expenseId: "DES-002"
        }),
        createMovementRecord({
          id: "MOV-004",
          date: yesterday,
          time: "19:20",
          type: "entrada",
          category: "outros",
          description: "Venda de touca de natacao",
          amount: 35,
          method: "dinheiro"
        })
      ],
      expenses: [
        createExpenseRecord({
          id: "DES-001",
          description: "Conta de energia",
          supplier: "Concessionaria",
          category: "utilidades",
          amount: 980,
          dueDate: `${month}-15`,
          status: "pendente",
          recurring: "mensal"
        }),
        createExpenseRecord({
          id: "DES-002",
          description: "Material de limpeza",
          supplier: "Fornecedor local",
          category: "limpeza",
          amount: 180,
          dueDate: `${month}-06`,
          status: "pago",
          paidAt: yesterday,
          method: "pix"
        }),
        createExpenseRecord({
          id: "DES-003",
          description: "Manutencao de equipamento",
          supplier: "Assistencia tecnica",
          category: "manutencao",
          amount: 640,
          dueDate: `${month}-05`,
          status: "vencido",
          method: "boleto"
        })
      ],
      cashClosings: [
        createCashClosingRecord({
          id: "FEC-001",
          date: yesterday,
          openingBalance: 100,
          cashIncome: 35,
          cashExpense: 0,
          expectedCash: 135,
          countedCash: 135,
          difference: 0,
          totalIncome: 155,
          totalExpense: 180,
          closedBy: "Equipe Pro Fitness"
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
      workoutSessions: [],
      exerciseSets: [],
      exercises: [
        { id: "EX-001", name: "Supino reto", muscleGroup: "Peito", equipment: "Barra" },
        { id: "EX-002", name: "Prancha", muscleGroup: "Core", equipment: "Solo" }
      ],
      users: [
        { id: "USR-001", name: "Equipe Pro Fitness", email: "gestao@exemplo.com", role: "admin", status: "ativo" },
        { id: "USR-PROF-001", name: "Prof. Rafael", email: "", role: "professor", status: "ativo" },
        { id: "USR-PROF-002", name: "Profa. Camila", email: "", role: "professor", status: "ativo" }
      ],
      staffTimeEntries: [],
      config: [
        {
          id: "CFG-001",
          timezone: "America/Sao_Paulo",
          currency: "BRL",
          appName: "Pro Fitness Academia",
          supportPhone: "(22) 98823-3216",
          whatsappNumber: "5522988233216",
          paymentAlertDays: [7, 3, 0],
          paymentGraceDays: 0,
          blockAccessOnOverdue: true,
          environment: "demo",
          datasetId: "pro-fitness-demo-2026-07",
          schemaVersion: 6
        }
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
      students: Array.isArray(data.students) ? data.students.map(createStudentRecord) : base.students,
      assessments: Array.isArray(data.assessments) ? data.assessments : base.assessments,
      workouts: Array.isArray(data.workouts) ? data.workouts : base.workouts,
      schedule: Array.isArray(data.schedule) ? data.schedule : base.schedule,
      payments: Array.isArray(data.payments) ? data.payments.map(createPaymentRecord) : base.payments,
      movements: Array.isArray(data.movements) ? data.movements.map(createMovementRecord) : base.movements,
      expenses: Array.isArray(data.expenses) ? data.expenses.map(createExpenseRecord) : base.expenses,
      cashClosings: Array.isArray(data.cashClosings) ? data.cashClosings.map(createCashClosingRecord) : base.cashClosings,
      checkins: Array.isArray(data.checkins) ? data.checkins.map(createCheckinRecord) : base.checkins.map(createCheckinRecord),
      workoutSessions: safeArray(data.workoutSessions).map(createWorkoutSessionRecord),
      exerciseSets: safeArray(data.exerciseSets).map(createExerciseSetRecord),
      exercises: Array.isArray(data.exercises) ? data.exercises : base.exercises,
      users: Array.isArray(data.users) ? data.users : base.users,
      staffTimeEntries: safeArray(data.staffTimeEntries).map(createStaffTimeEntryRecord),
      config: Array.isArray(data.config) ? data.config : base.config,
      log: safeArray(data.log)
    };
  }

  function loadData() {
    if (isLocalDemoSession()) {
      localStorage.removeItem(LOCAL_DEMO_MASTER_KEY);
      localStorage.removeItem(STORAGE_KEY);
      if (!localDemoRuntimeSnapshot || !snapshotHasMeaningfulData(localDemoRuntimeSnapshot)) {
        localDemoRuntimeSnapshot = getEmbeddedDemoSnapshot();
      }
      return localDemoRuntimeSnapshot;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    const preEnvironment = isDemoEnvironment() ? localStorage.getItem(PRE_ENVIRONMENT_STORAGE_KEY) : null;
    const legacy = isDemoEnvironment() ? localStorage.getItem(LEGACY_STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : preEnvironment ? JSON.parse(preEnvironment) : legacy ? JSON.parse(legacy) : isDemoEnvironment() ? buildDemoData() : createEmptySnapshot();
    const normalized = migrateData(parsed);
    saveData(normalized);
    return normalized;
  }

  async function fetchJson(url, options, timeoutMs) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = window.setTimeout(() => controller?.abort(), Number(timeoutMs || 15000));
    try {
      const response = await fetch(url, { ...(options || {}), ...(controller ? { signal: controller.signal } : {}) });
      if (!response.ok) {
        throw new Error(`Falha HTTP ${response.status}.`);
      }
      return await response.json();
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("A comunicacao com a API demorou demais.");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
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
    let requestToken = "";

    if (payload) {
      const authSession = loadAuthSession();
      requestToken = String(authSession?.token || "");
      options.body = JSON.stringify({ ...payload, ...(requestToken ? { token: requestToken } : {}) });
    }

    const data = await fetchJson(apiBaseUrl, options, 20000);

    if (!data.ok) {
      const error = new Error(data.message || "Falha ao comunicar com a API do Sheets.");
      error.code = data.errorCode || "REMOTE_ERROR";
      error.remoteStatus = data.status || 0;
      if (["INVALID_SESSION", "SESSION_EXPIRED", "ACCOUNT_INACTIVE", "AUTH_REQUIRED"].includes(String(error.code || ""))) {
        const currentSession = loadAuthSession();
        // Uma resposta antiga nunca deve apagar uma sessao criada enquanto a
        // requisicao ainda estava em andamento.
        const invalidatesCurrentSession = Boolean(requestToken) && (!currentSession || currentSession.token === requestToken);
        if (invalidatesCurrentSession) {
          clearAuthenticatedLocalData();
          if (typeof window?.dispatchEvent === "function" && typeof window?.CustomEvent === "function") {
            window.dispatchEvent(new window.CustomEvent("profitness:auth-invalid", { detail: { code: error.code, message: error.message } }));
          }
        }
      }
      throw error;
    }

    return data;
  }

  function getDeviceDescriptor() {
    return {
      deviceId: getSyncDeviceId(),
      deviceName: `${navigator?.platform || "Web"} - ${getSyncSource()}`,
      userAgent: navigator?.userAgent || ""
    };
  }

  function loadDynamicDemoAccounts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SHARED_DEMO_ACCOUNTS_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function getLocalDemoAccounts() {
    return { ...LOCAL_DEMO_ACCOUNTS, ...loadDynamicDemoAccounts() };
  }

  function saveDynamicDemoAccounts(accounts) {
    localStorage.setItem(SHARED_DEMO_ACCOUNTS_KEY, JSON.stringify(accounts || {}));
  }

  function loadDynamicDemoStudents() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SHARED_DEMO_STUDENTS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function persistLocalDemoStudent(student) {
    if (!student?.id) return;
    const current = loadDynamicDemoStudents();
    const index = current.findIndex((item) => String(item.id) === String(student.id));
    const record = clone(student);
    if (index >= 0) current[index] = record;
    else current.push(record);
    localStorage.setItem(SHARED_DEMO_STUDENTS_KEY, JSON.stringify(current));
  }

  function getEmbeddedDemoSnapshot() {
    const embedded = window.PROFITNESS_DEMO_DATA && (window.PROFITNESS_DEMO_DATA.snapshot || window.PROFITNESS_DEMO_DATA);
    const snapshot = migrateData(embedded && typeof embedded === "object" ? clone(embedded) : buildDemoData());
    loadDynamicDemoStudents().forEach((student) => {
      const index = snapshot.students.findIndex((item) => String(item.id) === String(student.id));
      if (index >= 0) snapshot.students[index] = createStudentRecord(student);
      else snapshot.students.push(createStudentRecord(student));
    });
    return snapshot;
  }

  function isLocalDemoSession(session) {
    const current = session || loadAuthSession();
    return Boolean(current && current.localDemo === true);
  }

  function createLocalDemoSession(account) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
    const publicAccount = clone(account);
    delete publicAccount.demoPassword;
    const session = {
      token: `LOCAL-DEMO-${account.role}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      localDemo: true,
      account: publicAccount,
      session: {
        id: `SES-LOCAL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        accountId: account.id,
        deviceId: getSyncDeviceId(),
        deviceName: `${navigator?.platform || "Web"} - demonstracao local`,
        createdAt: now.toISOString(),
        lastUsedAt: now.toISOString(),
        expiresAt,
        idleExpiresAt: expiresAt,
        sessionVersion: 1
      }
    };
    // A base oficial supera a cota do localStorage em alguns navegadores.
    // Mantemos os dados ficticios em memoria e persistimos somente a sessao.
    localStorage.removeItem(LOCAL_DEMO_MASTER_KEY);
    localStorage.removeItem(STORAGE_KEY);
    localDemoRuntimeSnapshot = getEmbeddedDemoSnapshot();
    return saveAuthSession(session);
  }

  async function loginDemoLocal(login, password) {
    if (!isDemoEnvironment()) throw new Error("A demonstracao local nao esta disponivel neste ambiente.");
    const normalizedLogin = String(login || "").trim().toLowerCase();
    const account = getLocalDemoAccounts()[normalizedLogin];
    if (!account) throw new Error("Usuario demonstrativo nao encontrado.");
    if (String(password || "").trim().toLowerCase() !== String(account.demoPassword || "Demo1234").trim().toLowerCase()) {
      throw new Error("Senha demonstrativa incorreta.");
    }
    return createLocalDemoSession(account);
  }

  function getLocalDemoStudentBootstrap(account) {
    const snapshot = StoreSafeDemoSnapshot();
    const studentId = String(account?.personId || "");
    const student = snapshot.students.find((item) => String(item.id) === studentId);
    if (!student) throw new Error("Aluno demonstrativo nao encontrado.");
    const own = (resource) => (snapshot[resource] || []).filter((item) => String(item.studentId) === studentId);
    const workouts = own("workouts");
    const exerciseIds = new Set();
    workouts.forEach((workout) => (Array.isArray(workout.exerciseItems) ? workout.exerciseItems : []).forEach((item) => {
      if (item.exerciseId) exerciseIds.add(String(item.exerciseId));
    }));
    return {
      student: clone(student),
      workouts: clone(workouts),
      exercises: clone((snapshot.exercises || []).filter((item) => exerciseIds.has(String(item.id)))),
      workoutSessions: clone(own("workoutSessions")),
      exerciseSets: clone(own("exerciseSets")),
      schedule: clone((snapshot.schedule || []).filter((item) => !item.studentId || String(item.studentId) === studentId)),
      checkins: clone(own("checkins")),
      assessments: clone(own("assessments")),
      payments: clone(own("payments")),
      config: clone((snapshot.config || []).slice(0, 1))
    };
  }

  function getLocalDemoProfessorBootstrap(account) {
    const snapshot = StoreSafeDemoSnapshot();
    const profile = (snapshot.users || []).find((item) => String(item.id) === String(account?.personId));
    return {
      students: clone(snapshot.students || []),
      assessments: clone(snapshot.assessments || []),
      workouts: clone(snapshot.workouts || []),
      schedule: clone(snapshot.schedule || []),
      checkins: clone(snapshot.checkins || []),
      workoutSessions: clone(snapshot.workoutSessions || []),
      exerciseSets: clone(snapshot.exerciseSets || []),
      exercises: clone(snapshot.exercises || []),
      users: profile ? [clone(profile)] : [],
      staffTimeEntries: clone((snapshot.staffTimeEntries || []).filter((item) => String(item.staffId) === String(account?.personId))),
      config: clone((snapshot.config || []).slice(0, 1))
    };
  }

  function StoreSafeDemoSnapshot() {
    if (isLocalDemoSession()) {
      if (localDemoRuntimeSnapshot && snapshotHasMeaningfulData(localDemoRuntimeSnapshot)) return localDemoRuntimeSnapshot;
      localStorage.removeItem(LOCAL_DEMO_MASTER_KEY);
      localStorage.removeItem(STORAGE_KEY);
      localDemoRuntimeSnapshot = getEmbeddedDemoSnapshot();
      return localDemoRuntimeSnapshot;
    }
    const current = loadData();
    if (snapshotHasMeaningfulData(current)) return current;
    const demo = getEmbeddedDemoSnapshot();
    saveData(demo);
    return demo;
  }

  async function loginRemote(login, password) {
    const normalizedLogin = String(login || "").trim().toLowerCase();
    // No ambiente demonstrativo, as tres contas oficiais sempre autenticam
    // localmente. Isso evita atraso, dependencia da API e falhas causadas por
    // uma implantacao remota ainda sem as contas ficticias.
    if (isDemoEnvironment() && getLocalDemoAccounts()[normalizedLogin]) {
      return loginDemoLocal(normalizedLogin, password);
    }
    const data = await requestRemote("POST", { action: "login", login: String(login || "").trim(), password: String(password || ""), ...getDeviceDescriptor() });
    return saveAuthSession(data.data);
  }

  async function unlockSessionRemote(password) {
    const current = loadAuthSession();
    if (!current) throw new Error("Sessao nao encontrada.");
    if (isLocalDemoSession(current)) {
      const account = getLocalDemoAccounts()[String(current.account?.login || "").toLowerCase()];
      if (String(password || "").trim().toLowerCase() !== String(account?.demoPassword || "Demo1234").trim().toLowerCase()) throw new Error("Senha incorreta.");
      const now = new Date();
      const refreshed = {
        ...current,
        session: {
          ...(current.session || {}),
          lastUsedAt: now.toISOString(),
          idleExpiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString()
        }
      };
      return saveAuthSession(refreshed);
    }
    const data = await requestRemote("POST", { action: "unlockSession", password: String(password || "") });
    return saveAuthSession({ ...data.data, token: current.token });
  }

  async function validateAuthSessionRemote(options) {
    const settings = options || {};
    const current = loadAuthSession();
    if (!current) return null;
    if (isLocalDemoSession(current)) return current;
    if (navigator?.onLine === false && settings.allowOffline !== false) return current;
    try {
      const data = await requestRemote("POST", { action: "session" });
      return saveAuthSession({ ...data.data, token: current.token });
    } catch (error) {
      if (settings.allowOffline !== false && !["INVALID_SESSION", "SESSION_EXPIRED", "ACCOUNT_INACTIVE", "AUTH_REQUIRED"].includes(String(error.code || ""))) {
        return current;
      }
      throw error;
    }
  }

  async function changePasswordRemote(currentPassword, newPassword) {
    const current = loadAuthSession();
    if (isLocalDemoSession(current)) {
      const login = String(current.account?.login || "").toLowerCase();
      const accounts = loadDynamicDemoAccounts();
      const all = getLocalDemoAccounts();
      const account = all[login];
      if (!account || String(currentPassword || "").trim().toLowerCase() !== String(account.demoPassword || "Demo1234").trim().toLowerCase()) throw new Error("Senha temporaria incorreta.");
      const updated = { ...account, demoPassword: String(newPassword || ""), mustChangePassword: false, passwordChangedAt: new Date().toISOString() };
      accounts[login] = updated;
      saveDynamicDemoAccounts(accounts);
      const publicAccount = { ...updated }; delete publicAccount.demoPassword;
      return saveAuthSession({ ...current, account: publicAccount });
    }
    const data = await requestRemote("POST", { action: "changePassword", currentPassword, newPassword, ...getDeviceDescriptor() });
    return saveAuthSession(data.data);
  }

  async function logoutRemote() {
    const session = loadAuthSession();
    try {
      if (session && !isLocalDemoSession(session)) await requestRemote("POST", { action: "logout" });
    } catch (error) {
      // A sessao local sempre deve ser removida, mesmo se ja expirou no servidor.
    } finally {
      clearAuthenticatedLocalData();
    }
  }

  async function listAccountsRemote() {
    const current = loadAuthSession();
    if (isLocalDemoSession(current)) return Object.values(getLocalDemoAccounts()).map((account) => { const safe = { ...clone(account), permissions: [] }; delete safe.demoPassword; return safe; });
    return (await requestRemote("POST", { action: "listAccounts" })).data || [];
  }

  async function listSessionsRemote() {
    const current = loadAuthSession();
    if (isLocalDemoSession(current)) return current?.session ? [{ ...current.session, accountId: current.account?.id || "", accountLogin: current.account?.login || "", accountRole: current.account?.role || "", state: "active" }] : [];
    const data = await requestRemote("POST", { action: "listSessions" });
    return Array.isArray(data.data) ? data.data : [];
  }

  async function revokeSessionRemote(sessionId) {
    const current = loadAuthSession();
    if (isLocalDemoSession(current)) {
      if (String(current?.session?.id || "") === String(sessionId || "")) clearAuthenticatedLocalData();
      return { revoked: true };
    }
    return (await requestRemote("POST", { action: "revokeSession", sessionId })).data;
  }

  async function revokeAccountSessionsRemote(accountId) {
    const current = loadAuthSession();
    if (isLocalDemoSession(current)) return { revoked: 0 };
    return (await requestRemote("POST", { action: "revokeAccountSessions", accountId })).data;
  }

  async function listLoginAttemptsRemote() {
    const current = loadAuthSession();
    if (isLocalDemoSession(current)) return [];
    const data = await requestRemote("POST", { action: "listLoginAttempts" });
    return Array.isArray(data.data) ? data.data : [];
  }

  async function createAccountRemote(account) {
    const current = loadAuthSession();
    if (isLocalDemoSession(current)) {
      const login = String(account?.login || "").trim().toLowerCase();
      if (!login) throw new Error("Informe o login da conta.");
      const existing = getLocalDemoAccounts()[login];
      if (existing) {
        const samePerson = String(existing.personId || "") === String(account?.personId || "");
        const sameRole = String(existing.role || "") === String(account?.role || "student");
        if (!samePerson || !sameRole) throw new Error("Este login ja esta em uso.");
        const safe = clone(existing); delete safe.demoPassword;
        return { account: safe, temporaryPassword: "", reused: true };
      }
      const temporaryPassword = `Pf${Math.floor(100000 + Math.random() * 900000)}`;
      const dynamic = loadDynamicDemoAccounts();
      const created = {
        id: `ACC-DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        personType: account.personType || (account.role === "student" ? "student" : "staff"),
        personId: String(account.personId || ""),
        login,
        email: String(account.email || ""),
        role: account.role || "student",
        active: account.active !== false,
        mustChangePassword: true,
        demoPassword: temporaryPassword,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      dynamic[login] = created;
      saveDynamicDemoAccounts(dynamic);
      const safe = clone(created); delete safe.demoPassword;
      return { account: safe, temporaryPassword };
    }
    return (await requestRemote("POST", { action: "createAccount", data: account })).data;
  }

  async function resetPasswordRemote(accountId) {
    const current = loadAuthSession();
    if (isLocalDemoSession(current)) {
      const all = getLocalDemoAccounts();
      const entry = Object.entries(all).find(([, account]) => String(account.id) === String(accountId));
      if (!entry) throw new Error("Conta nao encontrada.");
      const [login, account] = entry;
      const temporaryPassword = `Pf${Math.floor(100000 + Math.random() * 900000)}`;
      const dynamic = loadDynamicDemoAccounts();
      const updated = { ...account, demoPassword: temporaryPassword, mustChangePassword: true, updatedAt: new Date().toISOString() };
      dynamic[login] = updated;
      saveDynamicDemoAccounts(dynamic);
      const safe = clone(updated); delete safe.demoPassword;
      return { account: safe, temporaryPassword };
    }
    return (await requestRemote("POST", { action: "resetPassword", accountId })).data;
  }

  async function updateAccountRemote(account) {
    const current = loadAuthSession();
    if (isLocalDemoSession(current)) {
      const all = getLocalDemoAccounts();
      const entry = Object.entries(all).find(([, item]) => String(item.id) === String(account.id));
      if (!entry) throw new Error("Conta nao encontrada.");
      const [login, existing] = entry;
      const dynamic = loadDynamicDemoAccounts();
      dynamic[login] = { ...existing, ...account, updatedAt: new Date().toISOString() };
      saveDynamicDemoAccounts(dynamic);
      const safe = clone(dynamic[login]); delete safe.demoPassword;
      return safe;
    }
    return (await requestRemote("POST", { action: "updateAccount", data: account })).data;
  }

  async function restoreDemoRemote(snapshot, confirmation) {
    return (await requestRemote("POST", { action: "restoreDemo", snapshot: normalizeSnapshot(snapshot), confirmation })).data;
  }

  async function requestGateTokenRemote() {
    const session = loadAuthSession();
    if (isLocalDemoSession(session)) {
      const student = StoreSafeDemoSnapshot().students.find((item) => String(item.id) === String(session.account.personId));
      const expiresAt = new Date(Date.now() + 60000).toISOString();
      return { allowed: true, payload: `PROFITNESS|DEMO|${student?.id || session.account.personId}|${Date.now()}`, expiresAt, student: student ? { id: student.id, name: student.name } : null };
    }
    return (await requestRemote("POST", { action: "requestGateToken", deviceId: getSyncDeviceId() })).data;
  }

  async function validateGateRemote(payload) {
    const session = loadAuthSession();
    if (isLocalDemoSession(session)) {
      const match = String(payload || "").match(/^PROFITNESS\|DEMO\|([^|]+)\|/);
      const student = match ? StoreSafeDemoSnapshot().students.find((item) => String(item.id) === String(match[1])) : null;
      return student ? { allowed: true, result: "liberado", reason: "Acesso demonstrativo liberado.", student: { id: student.id, name: student.name } } : { allowed: false, result: "recusado", reason: "Codigo demonstrativo invalido." };
    }
    return (await requestRemote("POST", { action: "validateGate", payload, deviceId: getSyncDeviceId() })).data;
  }

  async function fetchRemoteSnapshot() {
    if (isLocalDemoSession()) return clone(StoreSafeDemoSnapshot());
    const data = await requestRemote("POST", { action: "exportAll" });
    return data.data && data.data.snapshot ? data.data.snapshot : data.data || {};
  }

  async function fetchStudentBootstrap() {
    const session = loadAuthSession();
    if (isLocalDemoSession(session)) return getLocalDemoStudentBootstrap(session.account);
    const data = await requestRemote("POST", { action: "studentBootstrap" });
    return data.data || {};
  }

  async function fetchProfessorBootstrap() {
    const session = loadAuthSession();
    if (isLocalDemoSession(session)) return getLocalDemoProfessorBootstrap(session.account);
    const data = await requestRemote("POST", { action: "professorBootstrap" });
    return data.data || {};
  }

  async function fetchProfessorPaymentContext(studentId, reference) {
    if (isLocalDemoSession()) {
      const snapshot = StoreSafeDemoSnapshot();
      const student = snapshot.students.find((item) => String(item.id) === String(studentId));
      if (!student) throw new Error("Aluno nao encontrado.");
      const payment = (snapshot.payments || []).find((item) => String(item.studentId) === String(studentId) && String(item.reference) === String(reference)) || null;
      return { student: { id: student.id, name: student.name, plan: student.plan }, reference, payment: payment ? clone(payment) : null, suggestedAmount: Number(payment?.amount || student.monthlyFee || 0) };
    }
    const data = await requestRemote("POST", { action: "paymentContext", studentId, reference });
    return data.data || {};
  }

  async function receivePaymentRemote(payment) {
    if (isLocalDemoSession()) {
      const snapshot = StoreSafeDemoSnapshot();
      const receiptId = String(payment.receiptId || uid("REC"));
      const processedMovement = (snapshot.movements || []).find((item) => String(item.id) === receiptId);
      const existingIndex = snapshot.payments.findIndex((item) => String(item.id) === String(payment.id)
        || (String(item.studentId) === String(payment.studentId) && String(item.reference) === String(payment.reference)));
      const existing = existingIndex >= 0 ? snapshot.payments[existingIndex] : null;
      if (processedMovement) {
        if (!existing || String(processedMovement.paymentId) !== String(existing.id) || String(processedMovement.studentId) !== String(payment.studentId)) {
          throw new Error("Identificador de recebimento ja utilizado em outra operacao.");
        }
        return {
          payment: clone(existing),
          movement: clone(processedMovement),
          student: snapshot.students.find((item) => String(item.id) === String(payment.studentId)) || null,
          receivedNow: Number(processedMovement.amount || 0),
          idempotent: true
        };
      }
      if (existing && ["pago", "cancelado", "estornado"].includes(String(existing.status))) {
        throw new Error("Este pagamento ja possui registro definitivo. Ajustes devem ser feitos pela administracao.");
      }
      const roundCurrency = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
      const amount = roundCurrency(payment.amount ?? existing?.amount ?? 0);
      const discount = Math.max(0, roundCurrency(payment.discount ?? existing?.discount ?? 0));
      const fine = Math.max(0, roundCurrency(payment.fine ?? existing?.fine ?? 0));
      const netAmount = Math.max(0, roundCurrency(amount - discount + fine));
      const existingPaid = Math.max(0, roundCurrency(existing?.paidAmount || 0));
      const receivedNow = Math.max(0, roundCurrency(payment.receivedNow ?? (existing ? Number(payment.paidAmount || 0) - existingPaid : payment.paidAmount || netAmount)));
      const paidAmount = roundCurrency(existingPaid + receivedNow);
      if (amount <= 0 || netAmount <= 0 || receivedNow <= 0 || existingPaid > netAmount || paidAmount > netAmount + 0.009) {
        throw new Error("Valores do recebimento sao invalidos ou excedem o saldo da mensalidade.");
      }
      const normalized = createPaymentRecord({
        ...existing,
        ...payment,
        id: existing?.id || payment.id || uid("PG"),
        amount,
        discount,
        fine,
        netAmount,
        paidAmount: Math.min(netAmount, paidAmount),
        status: paidAmount + 0.009 < netAmount ? "parcial" : "pago",
        updatedAt: new Date().toISOString()
      });
      const index = existingIndex >= 0 ? existingIndex : snapshot.payments.findIndex((item) => String(item.id) === String(normalized.id));
      if (index >= 0) snapshot.payments[index] = normalized; else snapshot.payments.unshift(normalized);
      const student = snapshot.students.find((item) => String(item.id) === String(normalized.studentId));
      const movement = createMovementRecord({
        id: receiptId, date: normalized.paidAt || todayISO(), time: formatTime(new Date().toISOString()), type: "entrada", category: "mensalidade",
        description: `Mensalidade ${normalized.reference} - ${student?.name || "Aluno"}`, amount: receivedNow,
        method: normalized.method || "pix", account: "caixa-principal", studentId: normalized.studentId, paymentId: normalized.id, status: "confirmado",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      snapshot.movements.unshift(movement);
      saveData(snapshot);
      return { payment: clone(normalized), movement: clone(movement), student: student ? { id: student.id, name: student.name, plan: student.plan } : null, receivedNow, idempotent: false };
    }
    const data = await requestRemote("POST", { action: "receivePayment", data: payment });
    return data.data || {};
  }

  async function setupRemoteSpreadsheet() {
    throw new Error("Prepare a planilha pelo menu Pro Fitness no editor vinculado do Google Sheets.");
  }

  async function fetchRemoteHealth() {
    const healthUrl = `${getApiBaseUrl()}?action=health`;
    const data = await fetchJson(healthUrl, {}, 12000);

    if (!data.ok) {
      const error = new Error(data.message || "Falha ao consultar a API.");
      error.code = data.errorCode || "REMOTE_ERROR";
      throw error;
    }

    return data.data || data;
  }

  async function upsertRemoteRecord(resource, record) {
    if (!resource || !record || !record.id) {
      throw new Error("Registro remoto invalido.");
    }
    const authSession = loadAuthSession();
    const data = await requestRemote("POST", {
      action: authSession?.account?.role === "student" ? "studentUpsert" : authSession?.account?.role === "professor" && resource === "staffTimeEntries" ? "staffPresenceUpsert" : "upsert",
      resource: resource,
      data: prepareRemoteRecord(record)
    });
    if (data.data?._conflict) {
      const conflict = new Error(data.data._conflictMessage || "Conflito de sincronizacao.");
      conflict.code = "SYNC_CONFLICT";
      conflict.remoteRecord = data.data;
      throw conflict;
    }
    return data.data;
  }

  async function deleteRemoteRecord(resource, recordId, expectedUpdatedAt) {
    if (!resource || !recordId) {
      throw new Error("Registro remoto invalido.");
    }
    const authSession = loadAuthSession();
    const data = await requestRemote("POST", {
      action: authSession?.account?.role === "student" ? "studentDelete" : "delete",
      resource: resource,
      data: { id: recordId, expectedUpdatedAt: expectedUpdatedAt || "" }
    });
    if (data.data?._conflict) {
      const conflict = new Error(data.data._conflictMessage || "Conflito de sincronizacao.");
      conflict.code = "SYNC_CONFLICT";
      conflict.remoteRecord = data.data;
      throw conflict;
    }
    return data.data;
  }

  function buildRemoteRecordOperations(beforeSnapshot, afterSnapshot, resources) {
    const operationResources = Array.isArray(resources) && resources.length
      ? resources
      : ["students", "assessments", "workouts", "schedule", "payments", "movements", "expenses", "cashClosings", "checkins", "exercises", "users", "staffTimeEntries", "config"];
    const operations = [];
    operationResources.forEach((resource) => {
      const beforeItems = Array.isArray(beforeSnapshot?.[resource]) ? beforeSnapshot[resource] : [];
      const afterItems = Array.isArray(afterSnapshot?.[resource]) ? afterSnapshot[resource] : [];
      const beforeMap = new Map(beforeItems.filter((item) => item?.id).map((item) => [String(item.id), item]));
      const afterMap = new Map(afterItems.filter((item) => item?.id).map((item) => [String(item.id), item]));

      afterMap.forEach((record, recordId) => {
        if (!beforeMap.has(recordId) || JSON.stringify(beforeMap.get(recordId)) !== JSON.stringify(record)) {
          operations.push({ action: "upsert", resource, recordId, data: clone(record) });
        }
      });
      beforeMap.forEach((record, recordId) => {
        if (!afterMap.has(recordId)) {
          operations.push({
            action: "delete",
            resource,
            recordId,
            data: { id: recordId, expectedUpdatedAt: record.updatedAt || "" }
          });
        }
      });
    });
    return operations;
  }

  async function syncSnapshotChanges(beforeSnapshot, afterSnapshot, resources) {
    if (!isRemoteConfigured() || !shouldAutoSyncToRemote()) {
      return { sent: 0 };
    }
    const operations = buildRemoteRecordOperations(beforeSnapshot, afterSnapshot, resources);
    for (const operation of operations) {
      if (operation.action === "delete") {
        await deleteRemoteRecord(operation.resource, operation.recordId, operation.data?.expectedUpdatedAt);
      } else {
        await upsertRemoteRecord(operation.resource, operation.data);
      }
    }
    return { sent: operations.length };
  }

  function validateCompleteSnapshot(snapshot) {
    const missing = SNAPSHOT_RESOURCES.filter((resource) => !LEGACY_OPTIONAL_RESOURCES.includes(resource) && !Array.isArray(snapshot?.[resource]));
    if (missing.length) {
      const error = new Error(`Backup incompleto. Colecoes ausentes: ${missing.join(", ")}.`);
      error.code = "INCOMPLETE_SNAPSHOT";
      error.missingResources = missing;
      throw error;
    }
    return true;
  }

  function getSnapshotSummary(snapshot) {
    const summary = {};
    SNAPSHOT_RESOURCES.forEach((resource) => {
      summary[resource] = Array.isArray(snapshot?.[resource]) ? snapshot[resource].length : null;
    });
    return summary;
  }

  async function pushRemoteSnapshot(snapshot) {
    const normalized = normalizeSnapshot(snapshot);
    validateCompleteSnapshot(normalized);
    const data = await requestRemote("POST", {
      action: "importAll",
      snapshot: normalized
    });
    return data.data;
  }

  async function pushRemotePartialSnapshot(snapshot) {
    const partial = {};
    Object.keys(snapshot || {}).forEach((resource) => {
      if (!SNAPSHOT_RESOURCES.includes(resource)) {
        throw new Error(`Colecao desconhecida: ${resource}.`);
      }
      if (!Array.isArray(snapshot[resource])) {
        throw new Error(`A colecao ${resource} precisa ser uma lista.`);
      }
      partial[resource] = clone(snapshot[resource]);
    });
    if (!Object.keys(partial).length) throw new Error("Nenhuma colecao foi informada.");
    const data = await requestRemote("POST", { action: "importPartial", snapshot: partial });
    return data.data;
  }

  function snapshotHasMeaningfulData(snapshot) {
    const keys = ["students", "assessments", "workouts", "schedule", "payments", "checkins", "exercises", "users", "staffTimeEntries", "movements", "expenses", "cashClosings"];
    return keys.some((key) => Array.isArray(snapshot?.[key]) && snapshot[key].length > 0);
  }

  function mergeRemoteCollectionWithNewerLocal(remoteItems, localItems) {
    const localById = new Map(safeArray(localItems).filter((item) => item?.id).map((item) => [String(item.id), item]));
    return safeArray(remoteItems).map((remoteRecord) => {
      const localRecord = localById.get(String(remoteRecord?.id || ""));
      if (!localRecord?.updatedAt || !remoteRecord?.updatedAt) return remoteRecord;
      const localTime = new Date(localRecord.updatedAt).getTime();
      const remoteTime = new Date(remoteRecord.updatedAt).getTime();
      return Number.isFinite(localTime) && Number.isFinite(remoteTime) && localTime > remoteTime ? clone(localRecord) : remoteRecord;
    });
  }

  async function hydrateFromRemoteIfConfigured() {
    const localSnapshot = loadData();

    if (!isRemoteConfigured() || !shouldUseRemoteOnLoad()) {
      return localSnapshot;
    }

    try {
      const remoteRawSnapshot = await fetchRemoteSnapshot();

      if (!snapshotHasMeaningfulData(remoteRawSnapshot) && snapshotHasMeaningfulData(localSnapshot)) {
        return localSnapshot;
      }

      const remoteSnapshot = migrateData(remoteRawSnapshot);
      Object.keys(remoteRawSnapshot).forEach((key) => {
        if (Array.isArray(remoteRawSnapshot[key]) && Array.isArray(localSnapshot[key])) {
          remoteSnapshot[key] = mergeRemoteCollectionWithNewerLocal(remoteSnapshot[key], localSnapshot[key]);
        }
      });
      ["movements", "expenses", "cashClosings", "staffTimeEntries"].forEach((key) => {
        if (!Array.isArray(remoteRawSnapshot[key]) && Array.isArray(localSnapshot[key])) {
          remoteSnapshot[key] = clone(localSnapshot[key]);
        }
      });
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

  function createEmptySnapshot() {
    return Object.fromEntries(SNAPSHOT_RESOURCES.map((resource) => [resource, []]));
  }

  function saveData(data) {
    const normalized = migrateData(data);
    if (isLocalDemoSession()) {
      localDemoRuntimeSnapshot = normalized;
      localStorage.removeItem(LOCAL_DEMO_MASTER_KEY);
      localStorage.removeItem(STORAGE_KEY);
      return normalized;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
      if (!isDemoEnvironment()) throw error;
      // Recupera automaticamente caches grandes deixados por versoes anteriores.
      localDemoRuntimeSnapshot = normalized;
      localStorage.removeItem(LOCAL_DEMO_MASTER_KEY);
      localStorage.removeItem(STORAGE_KEY);
    }
    return normalized;
  }

  function getAuthSessionExpiry(session) {
    const absolute = new Date(session?.session?.expiresAt || "").getTime();
    const idle = new Date(session?.session?.idleExpiresAt || "").getTime();
    const candidates = [absolute, idle].filter(Number.isFinite);
    return candidates.length ? Math.min(...candidates) : 0;
  }

  function isAuthSessionLocallyValid(session) {
    if (!session?.token || !session?.account) return false;
    const expiry = getAuthSessionExpiry(session);
    return !expiry || expiry > Date.now();
  }

  function clearAuthenticatedLocalData() {
    localDemoRuntimeSnapshot = null;
    [AUTH_SESSION_KEY, SESSION_KEY, STORAGE_KEY, LOCAL_DEMO_MASTER_KEY].forEach((key) => localStorage.removeItem(key));
    if (typeof localStorage?.length === "number" && typeof localStorage?.key === "function") {
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && key.startsWith(STORAGE_NAMESPACE) && key !== SYNC_DEVICE_KEY) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
    }
  }

  function loadAuthSession() {
    try {
      const session = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || "null");
      if (!session || !session.token || !session.account) return null;
      if (!isAuthSessionLocallyValid(session)) {
        clearAuthenticatedLocalData();
        return null;
      }
      return session;
    } catch (error) {
      clearAuthenticatedLocalData();
      return null;
    }
  }

  function saveAuthSession(session) {
    if (!session?.token || !session?.account) throw new Error("Sessao de autenticacao invalida.");
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function clearAuthSession() {
    localStorage.removeItem(AUTH_SESSION_KEY);
  }

  function setFormBusy(form, busy, label) {
    if (!form) return;
    const submit = form.querySelector('button[type="submit"], input[type="submit"]');
    form.dataset.busy = busy ? "true" : "false";
    form.setAttribute("aria-busy", busy ? "true" : "false");
    if (!submit) return;
    if (busy) {
      if (!submit.dataset.originalLabel) submit.dataset.originalLabel = submit.textContent || submit.value || "Entrar";
      submit.disabled = true;
      if (submit.tagName === "INPUT") submit.value = label || "Entrando...";
      else submit.textContent = label || "Entrando...";
    } else {
      submit.disabled = false;
      const original = submit.dataset.originalLabel;
      if (original) {
        if (submit.tagName === "INPUT") submit.value = original;
        else submit.textContent = original;
      }
      delete submit.dataset.originalLabel;
    }
  }

  function resetData() {
    if (!isDemoEnvironment() || getRuntimeConfig().allowDemoReset !== true) {
      throw new Error("A restauracao demonstrativa nao esta disponivel neste ambiente.");
    }
    const demo = buildDemoData();
    saveData(demo);
    clearStudentSession();
    return demo;
  }

  function loadStudentSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function saveStudentSession(studentId, options) {
    const settings = options || {};
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      studentId: studentId,
      authVersion: 1,
      method: settings.method || "enrollment-device",
      authenticatedAt: new Date().toISOString()
    }));
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

  function getStudentWorkoutSessions(data, studentId) {
    return clone(safeArray(data.workoutSessions))
      .filter((session) => session.studentId === studentId)
      .sort((left, right) => String(right.startedAt || "").localeCompare(String(left.startedAt || "")));
  }

  function getWorkoutSessionSets(data, sessionId) {
    return clone(safeArray(data.exerciseSets))
      .filter((exerciseSet) => exerciseSet.sessionId === sessionId)
      .sort((left, right) => Number(left.setNumber || 0) - Number(right.setNumber || 0));
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
      parcial: "warning",
      remarcada: "warning",
      pausado: "warning",
      bloqueado: "danger",
      vencido: "danger",
      cancelada: "danger",
      cancelado: "neutral",
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

    if (student.operationalAccess) {
      return { ...student.operationalAccess, payment: null };
    }

    const payment = getCurrentPayment(data, studentId);
    const today = todayISO();
    const config = safeArray(data.config)[0] || {};
    const paymentGraceDays = Math.max(0, Number(config.paymentGraceDays || 0));
    const blockAccessOnOverdue = config.blockAccessOnOverdue !== false && config.blockAccessOnOverdue !== "false";

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

    const graceLimit = payment.dueDate ? parseDateInput(payment.dueDate) : null;
    if (graceLimit) graceLimit.setDate(graceLimit.getDate() + paymentGraceDays);
    const unpaidStatus = ["vencido", "pendente", "parcial"].includes(payment.status);
    const overdueAfterGrace = unpaidStatus && (graceLimit ? parseDateInput(today).getTime() > graceLimit.getTime() : payment.status === "vencido");
    if (overdueAfterGrace && blockAccessOnOverdue) {
      return {
        status: "bloqueado",
        label: "Acesso bloqueado",
        reason: `Mensalidade em atraso desde ${formatDate(payment.dueDate)}.`,
        payment: payment,
        allowsGate: false
      };
    }

    if (overdueAfterGrace) {
      return {
        status: "aviso",
        label: "Mensalidade vencida",
        reason: `Mensalidade em atraso desde ${formatDate(payment.dueDate)}. O acesso permanece liberado pela regra atual da academia.`,
        payment: payment,
        allowsGate: true
      };
    }

    if (["pendente", "parcial"].includes(payment.status)) {
      return {
        status: "aviso",
        label: payment.status === "parcial" ? "Pagamento parcial" : "Pagamento pendente",
        reason: `Mensalidade ${payment.status === "parcial" ? "parcialmente paga" : "pendente"} com vencimento em ${formatDate(payment.dueDate)}.`,
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
    applyRuntimeEnvironment: applyRuntimeEnvironment,
    STORAGE_KEY: STORAGE_KEY,
    SESSION_KEY: SESSION_KEY,
    buildDemoData: buildDemoData,
    buildRemoteRecordOperations: buildRemoteRecordOperations,
    appendLog: appendLog,
    clearStudentSession: clearStudentSession,
    clearAuthSession: clearAuthSession,
    clearAuthenticatedLocalData: clearAuthenticatedLocalData,
    clone: clone,
    changePasswordRemote: changePasswordRemote,
    createCode: createCode,
    createAccountRemote: createAccountRemote,
    createEmptySnapshot: createEmptySnapshot,
    createCashClosingRecord: createCashClosingRecord,
    createCheckinRecord: createCheckinRecord,
    createExerciseSetRecord: createExerciseSetRecord,
    createExpenseRecord: createExpenseRecord,
    createMovementRecord: createMovementRecord,
    createPaymentRecord: createPaymentRecord,
    createStudentRecord: createStudentRecord,
    createWorkoutSessionRecord: createWorkoutSessionRecord,
    currency: currency,
    currentMonth: currentMonth,
    deleteRemoteRecord: deleteRemoteRecord,
    fetchRemoteHealth: fetchRemoteHealth,
    fetchProfessorBootstrap: fetchProfessorBootstrap,
    fetchProfessorPaymentContext: fetchProfessorPaymentContext,
    fetchStudentBootstrap: fetchStudentBootstrap,
    fetchRemoteSnapshot: fetchRemoteSnapshot,
    findStudent: findStudent,
    formatDate: formatDate,
    formatTime: formatTime,
    formatDateTime: formatDateTime,
    getAccessState: getAccessState,
    getCurrentPayment: getCurrentPayment,
    getLatestAssessment: getLatestAssessment,
    getStatusTone: getStatusTone,
    getStudentCheckins: getStudentCheckins,
    getStudentPayments: getStudentPayments,
    getStudentSchedule: getStudentSchedule,
    getStudentWorkoutSessions: getStudentWorkoutSessions,
    getStudentWorkouts: getStudentWorkouts,
    getWorkoutSessionSets: getWorkoutSessionSets,
    getApiBaseUrl: getApiBaseUrl,
    getEnvironment: getEnvironment,
    getDeviceDescriptor: getDeviceDescriptor,
    getRuntimeConfig: getRuntimeConfig,
    hydrateFromRemoteIfConfigured: hydrateFromRemoteIfConfigured,
    isRemoteConfigured: isRemoteConfigured,
    isDemoEnvironment: isDemoEnvironment,
    loadData: loadData,
    loadAuthSession: loadAuthSession,
    listAccountsRemote: listAccountsRemote,
    listSessionsRemote: listSessionsRemote,
    listLoginAttemptsRemote: listLoginAttemptsRemote,
    loadStudentSession: loadStudentSession,
    loginRemote: loginRemote,
    unlockSessionRemote: unlockSessionRemote,
    validateAuthSessionRemote: validateAuthSessionRemote,
    loginDemoLocal: loginDemoLocal,
    isLocalDemoSession: isLocalDemoSession,
    migrateData: migrateData,
    normalizeSnapshot: normalizeSnapshot,
    logoutRemote: logoutRemote,
    pushRemoteSnapshot: pushRemoteSnapshot,
    pushRemotePartialSnapshot: pushRemotePartialSnapshot,
    persistLocalDemoStudent: persistLocalDemoStudent,
    regenerateEnrollmentToken: regenerateEnrollmentToken,
    regenerateGateCode: regenerateGateCode,
    receivePaymentRemote: receivePaymentRemote,
    resetData: resetData,
    resetPasswordRemote: resetPasswordRemote,
    revokeSessionRemote: revokeSessionRemote,
    revokeAccountSessionsRemote: revokeAccountSessionsRemote,
    requestGateTokenRemote: requestGateTokenRemote,
    restoreDemoRemote: restoreDemoRemote,
    saveData: saveData,
    saveAuthSession: saveAuthSession,
    setFormBusy: setFormBusy,
    isAuthSessionLocallyValid: isAuthSessionLocallyValid,
    saveStudentSession: saveStudentSession,
    setupRemoteSpreadsheet: setupRemoteSpreadsheet,
    snapshotHasMeaningfulData: snapshotHasMeaningfulData,
    storageKey: storageKey,
    getSnapshotSummary: getSnapshotSummary,
    validateCompleteSnapshot: validateCompleteSnapshot,
    shouldAutoSyncToRemote: shouldAutoSyncToRemote,
    shouldUseRemoteOnLoad: shouldUseRemoteOnLoad,
    syncSnapshotChanges: syncSnapshotChanges,
    syncSnapshotIfConfigured: syncSnapshotIfConfigured,
    todayISO: todayISO,
    touchGateSync: touchGateSync,
    uid: uid,
    upsertRemoteRecord: upsertRemoteRecord,
    upsertPayment: upsertPayment,
    upsertStudent: upsertStudent,
    updateAccountRemote: updateAccountRemote,
    updateStudent: updateStudent,
    validateGateRemote: validateGateRemote
  };
})();
