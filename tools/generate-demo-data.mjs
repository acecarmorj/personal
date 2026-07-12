import fs from "node:fs";
import path from "node:path";

const TODAY = "2026-07-11";
const MONTHS = ["2026-05", "2026-06", "2026-07"];
const SOURCE = "gerador-demonstracao";
const names = [
  "Alice Ferreira", "Amanda Ribeiro", "Ana Beatriz Souza", "Andre Luiz Costa", "Arthur Nogueira",
  "Barbara Martins", "Beatriz Almeida", "Bruno Henrique Lima", "Caio Mendes", "Camila Araujo",
  "Carla Cristina Rocha", "Carlos Eduardo Alves", "Clara Monteiro", "Daniel Barbosa", "Davi Moreira",
  "Diego Fernandes", "Eduarda Lopes", "Elaine Carvalho", "Enzo Gabriel Silva", "Fabiana Moraes",
  "Felipe Cardoso", "Fernanda Oliveira", "Gabriel Rodrigues", "Giovana Freitas", "Guilherme Castro",
  "Helena Pires", "Igor Teixeira", "Isabela Cunha", "Joao Pedro Santos", "Julia Ramos",
  "Karen Vieira", "Larissa Gomes", "Leonardo Dutra", "Leticia Correia", "Lucas Matheus Pinto",
  "Luiza Farias", "Marcelo Dias", "Mariana Tavares", "Matheus Rezende", "Natalia Andrade",
  "Nicolas Peixoto", "Paola Siqueira", "Pedro Henrique Melo", "Rafael Xavier", "Renata Borges",
  "Rodrigo Campos", "Sabrina Neves", "Thiago Amaral", "Valentina Reis", "Vinicius Machado"
];
const professors = [
  ["USR-PROF-001", "Profa. Ana Martins", "ana.martins@exemplo.com"],
  ["USR-PROF-002", "Prof. Bruno Souza", "bruno.souza@exemplo.com"],
  ["USR-PROF-003", "Profa. Camila Rocha", "camila.rocha@exemplo.com"],
  ["USR-PROF-004", "Prof. Diego Alves", "diego.alves@exemplo.com"],
  ["USR-PROF-005", "Profa. Fernanda Lima", "fernanda.lima@exemplo.com"],
  ["USR-PROF-006", "Prof. Rafael Costa", "rafael.costa@exemplo.com"]
];
const planCatalog = [
  { name: "Musculacao", monthlyFee: 89.9, extraModalities: [] },
  { name: "Musculacao + Natacao", monthlyFee: 119.9, extraModalities: ["Natacao"] },
  { name: "Musculacao + Jiu-jitsu", monthlyFee: 119.9, extraModalities: ["Jiu-jitsu"] },
  { name: "Musculacao + Ballet", monthlyFee: 119.9, extraModalities: ["Ballet"] },
  { name: "Musculacao + Zumba", monthlyFee: 119.9, extraModalities: ["Zumba"] },
  { name: "Musculacao + Natacao + Jiu-jitsu", monthlyFee: 149.9, extraModalities: ["Natacao", "Jiu-jitsu"] },
  { name: "Musculacao + Ballet + Natacao", monthlyFee: 149.9, extraModalities: ["Ballet", "Natacao"] },
  { name: "Musculacao + Zumba + Ballet", monthlyFee: 149.9, extraModalities: ["Zumba", "Ballet"] }
];
const goals = ["Emagrecimento", "Ganho de massa muscular", "Condicionamento fisico", "Qualidade de vida", "Preparacao esportiva"];
const methods = ["pix", "cartao", "dinheiro", "transferencia"];

function dateFrom(value) {
  return new Date(`${value}T12:00:00Z`);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = dateFrom(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function timestamp(date, time) {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

function pad(value) {
  return String(value).padStart(3, "0");
}

function metadata(index, updatedAt) {
  return {
    updatedAt: updatedAt || `${TODAY}T12:${String(index % 60).padStart(2, "0")}:00.000Z`,
    updatedBy: "Equipe de demonstracao",
    source: SOURCE,
    deviceId: "DEMO-DATASET"
  };
}

const students = names.map((name, index) => {
  const number = index + 1;
  const plan = planCatalog[index % planCatalog.length];
  const status = index >= 48 ? "inativo" : index >= 45 ? "pausado" : "ativo";
  const createdAt = addDays("2026-04-20", index % 73);
  return {
    id: `ALU-DEMO-${pad(number)}`,
    enrollmentNumber: String(number).padStart(6, "0"),
    cpf: "",
    accountId: "",
    name,
    phone: `(22) 99${String(100000 + number).slice(-6)}-${String(1000 + number).slice(-4)}`,
    email: `aluno${pad(number)}@exemplo.com`,
    birthDate: `${1982 + (index % 24)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 26) + 1).padStart(2, "0")}`,
    goal: goals[index % goals.length],
    restrictions: index % 11 === 0 ? "Acompanhamento para joelho; evitar impacto excessivo." : index % 13 === 0 ? "Sensibilidade no ombro direito." : "",
    status,
    plan: plan.name,
    monthlyFee: plan.monthlyFee,
    notes: index % 7 === 0 ? "Prefere treinos no periodo da manha." : "",
    createdAt,
    enrollmentToken: `MAT-DEMO-${pad(number)}`,
    enrollmentStatus: "ativo",
    enrollmentCompletedAt: createdAt,
    appAccessPolicy: "auto",
    accessBlockReason: "",
    gateCode: `GATE-DEMO-${pad(number)}`,
    lastGateSyncAt: `${createdAt}T15:00:00.000Z`,
    avatarUrl: "",
    ...metadata(index, `${createdAt}T15:00:00.000Z`)
  };
});

const exercises = [
  ["Supino reto", "Peito", "Barra"], ["Supino inclinado", "Peito", "Halteres"],
  ["Remada baixa", "Costas", "Polia"], ["Puxada frontal", "Costas", "Polia"],
  ["Agachamento livre", "Pernas", "Barra"], ["Leg press", "Pernas", "Maquina"],
  ["Cadeira extensora", "Quadriceps", "Maquina"], ["Mesa flexora", "Posterior", "Maquina"],
  ["Desenvolvimento", "Ombros", "Halteres"], ["Elevacao lateral", "Ombros", "Halteres"],
  ["Rosca direta", "Biceps", "Barra"], ["Rosca alternada", "Biceps", "Halteres"],
  ["Triceps corda", "Triceps", "Polia"], ["Triceps frances", "Triceps", "Halter"],
  ["Prancha", "Core", "Solo"], ["Abdominal infra", "Core", "Solo"],
  ["Panturrilha em pe", "Panturrilha", "Maquina"], ["Gluteo no cabo", "Gluteos", "Polia"],
  ["Esteira", "Cardio", "Esteira"], ["Bicicleta", "Cardio", "Bicicleta"]
].map(([name, muscleGroup, equipment], index) => ({
  id: `EX-DEMO-${String(index + 1).padStart(2, "0")}`,
  name,
  muscleGroup,
  equipment,
  videoUrl: "",
  notes: "",
  ...metadata(index)
}));

const workouts = students.flatMap((student, studentIndex) => ["A", "B"].map((division, divisionIndex) => {
  const base = (studentIndex * 2 + divisionIndex * 5) % exercises.length;
  const items = Array.from({ length: 5 }, (_, itemIndex) => {
    const exercise = exercises[(base + itemIndex) % exercises.length];
    return {
      id: `ITEM-${pad(studentIndex + 1)}-${division}-${itemIndex + 1}`,
      exerciseId: exercise.id,
      name: exercise.name,
      sets: itemIndex === 0 ? "4" : "3",
      reps: itemIndex % 2 ? "12" : "10",
      load: `${12 + ((studentIndex + itemIndex) % 8) * 4} kg`,
      rest: "60s",
      notes: itemIndex === 0 ? "Priorizar tecnica e amplitude." : ""
    };
  });
  return {
    id: `TR-DEMO-${pad(studentIndex + 1)}-${division}`,
    studentId: student.id,
    title: `Treino ${division} - ${division === "A" ? "Membros superiores" : "Membros inferiores"}`,
    division,
    muscleGroup: division === "A" ? "Peito, costas e bracos" : "Pernas, gluteos e core",
    exercises: items.map((item) => item.name),
    exerciseItems: items,
    sets: "3-4",
    reps: "10-12",
    load: "Progressiva",
    rest: "60s",
    status: "ativo",
    notes: "Ficha ficticia para demonstracao.",
    createdAt: "2026-05-05T14:00:00.000Z",
    ...metadata(studentIndex + divisionIndex, "2026-07-05T14:00:00.000Z")
  };
}));
workouts.filter((workout) => workout.studentId === "ALU-DEMO-017").forEach((workout) => {
  workout.status = "encerrado";
  workout.notes = "Aluno sem treino ativo para demonstrar a pendencia profissional.";
});

const assessments = students.flatMap((student, index) => {
  const height = 1.56 + (index % 16) * 0.018;
  const initialWeight = 58 + (index % 20) * 2.1;
  const records = [{ date: "2026-05-06", weight: initialWeight, suffix: "A" }];
  if (index < 32) records.push({ date: "2026-07-06", weight: initialWeight - 0.8 - (index % 4) * 0.35, suffix: "B" });
  return records.map((record, recordIndex) => ({
    id: `AVA-DEMO-${pad(index + 1)}-${record.suffix}`,
    studentId: student.id,
    date: addDays(record.date, index % 4),
    weight: Number(record.weight.toFixed(1)),
    height: Number(height.toFixed(2)),
    imc: Number((record.weight / (height * height)).toFixed(1)),
    bodyFat: Number((18 + (index % 13) - recordIndex * 0.8).toFixed(1)),
    chest: 82 + (index % 18),
    waist: 68 + (index % 20) - recordIndex,
    hip: 88 + (index % 16),
    arm: 27 + (index % 8),
    thigh: 48 + (index % 12),
    photos: [],
    notes: recordIndex ? "Evolucao positiva no periodo." : "Avaliacao inicial de demonstracao.",
    ...metadata(index + recordIndex, `${addDays(record.date, index % 4)}T16:00:00.000Z`)
  }));
});

const weeklyClasses = [
  ["Natacao infantil", "natacao", 1, "18:00", "18:50", 5, "Piscina"],
  ["Musculacao orientada", "musculacao", 1, "19:00", "20:00", 0, "Sala principal"],
  ["Hidroginastica", "hidroginastica", 2, "08:00", "08:50", 4, "Piscina"],
  ["Karate infantil", "karate", 2, "18:30", "19:30", 2, "Sala de lutas"],
  ["Jiu-jitsu adulto", "jiu-jitsu", 3, "19:30", "21:00", 1, "Sala de lutas"],
  ["Treino funcional", "funcional", 3, "07:00", "08:00", 3, "Sala principal"],
  ["Natacao adulto", "natacao", 4, "19:00", "19:50", 5, "Piscina"],
  ["Ballet juvenil", "ballet", 4, "20:00", "21:00", 0, "Sala coletiva"],
  ["Hidroginastica", "hidroginastica", 5, "09:00", "09:50", 4, "Piscina"],
  ["Musculacao orientada", "musculacao", 5, "18:00", "19:00", 3, "Sala principal"],
  ["Karate adulto", "karate", 6, "09:00", "10:30", 2, "Sala de lutas"],
  ["Funcional em grupo", "funcional", 6, "10:30", "11:30", 0, "Sala principal"],
  ["Zumba", "zumba", 2, "20:00", "21:00", 4, "Sala coletiva"],
  ["Zumba", "zumba", 5, "20:00", "21:00", 4, "Sala coletiva"]
].map(([title, category, dayOfWeek, startTime, endTime, teacherIndex, location], index) => ({
  id: `GRD-DEMO-${String(index + 1).padStart(2, "0")}`,
  studentId: "",
  date: "",
  time: startTime,
  type: "group",
  status: "ativo",
  notes: "Grade semanal ficticia para demonstracao.",
  title,
  category,
  dayOfWeek,
  startTime,
  endTime,
  teacherId: professors[teacherIndex][0],
  teacherName: professors[teacherIndex][1],
  location,
  capacity: category === "natacao" ? 12 : 24,
  recurring: true,
  scheduleKind: "weekly-class",
  ...metadata(index)
}));

const individualSchedule = students.flatMap((student, index) => [0, 1, 2].map((period, periodIndex) => {
  const baseDates = ["2026-05-12", "2026-06-10", "2026-07-07"];
  const date = addDays(baseDates[period], index % 8);
  return {
    id: `AGE-DEMO-${pad(index + 1)}-${periodIndex + 1}`,
    studentId: student.id,
    date,
    time: `${String(7 + ((index * 2) % 13)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
    type: index % 5 === 0 ? "online" : "presencial",
    status: date > TODAY ? "marcada" : index % 17 === 0 ? "falta" : "realizada",
    notes: "Acompanhamento individual de demonstracao.",
    title: "Acompanhamento individual",
    category: "musculacao",
    dayOfWeek: "",
    startTime: "",
    endTime: "",
    teacherId: professors[index % professors.length][0],
    teacherName: professors[index % professors.length][1],
    location: "Sala principal",
    capacity: 1,
    recurring: false,
    scheduleKind: "student-session",
    ...metadata(index + periodIndex, `${date}T13:00:00.000Z`)
  };
}));
const schedule = [...weeklyClasses, ...individualSchedule];
schedule.find((item) => item.id === "GRD-DEMO-13").notes = "Turma lotada para demonstracao.";
schedule.find((item) => item.id === "GRD-DEMO-13").capacity = 0;
schedule.find((item) => item.id === "AGE-DEMO-020-3").status = "cancelada";

const payments = [];
const movements = [];
MONTHS.forEach((month, monthIndex) => {
  const overdueStart = monthIndex * 5;
  students.forEach((student, index) => {
    const isOverdue = index >= overdueStart && index < overdueStart + 5;
    const dueDay = 5 + (index % 16);
    const dueDate = `${month}-${String(dueDay).padStart(2, "0")}`;
    const paymentId = `PG-DEMO-${month.replace("-", "")}-${pad(index + 1)}`;
    const paidAt = isOverdue ? "" : `${month}-${String(Math.max(1, dueDay - (index % 4))).padStart(2, "0")}`;
    payments.push({
      id: paymentId,
      studentId: student.id,
      reference: month,
      amount: student.monthlyFee,
      discount: 0,
      fine: isOverdue && month !== "2026-07" ? 10 : 0,
      netAmount: student.monthlyFee + (isOverdue && month !== "2026-07" ? 10 : 0),
      paidAmount: isOverdue ? 0 : student.monthlyFee,
      dueDate,
      status: isOverdue ? "vencido" : "pago",
      method: methods[(index + monthIndex) % methods.length],
      paidAt,
      recordedBy: "Administracao",
      reversalReason: "",
      reversedBy: "",
      reversedAt: "",
      description: "Mensalidade",
      createdAt: `${dueDate}T12:00:00.000Z`,
      notes: isOverdue ? "Inadimplencia ficticia para demonstracao." : "",
      ...metadata(index + monthIndex, `${paidAt || dueDate}T15:00:00.000Z`)
    });
    if (!isOverdue) {
      movements.push({
        id: `MOV-${paymentId}`,
        date: paidAt,
        time: `${String(8 + (index % 11)).padStart(2, "0")}:${String((index * 7) % 60).padStart(2, "0")}`,
        type: "entrada",
        category: "mensalidade",
        description: `Mensalidade ${student.name}`,
        amount: student.monthlyFee,
        method: methods[(index + monthIndex) % methods.length],
        account: "caixa-principal",
        costCenter: "geral",
        studentId: student.id,
        paymentId,
        expenseId: "",
        status: "confirmado",
        voidReason: "",
        voidedBy: "",
        voidedAt: "",
        createdAt: `${paidAt}T15:00:00.000Z`,
        notes: "",
        ...metadata(index + monthIndex, `${paidAt}T15:00:00.000Z`)
      });
    }
  });
});
const partialPayment = payments.find((payment) => payment.reference === "2026-07" && payment.studentId === "ALU-DEMO-016");
partialPayment.status = "parcial";
partialPayment.paidAmount = Number((partialPayment.netAmount / 2).toFixed(2));
partialPayment.notes = "Pagamento parcial ficticio para demonstracao.";
const reversedPayment = payments.find((payment) => payment.reference === "2026-05" && payment.studentId === "ALU-DEMO-020");
reversedPayment.status = "estornado";
reversedPayment.reversalReason = "Estorno ficticio para demonstracao.";
reversedPayment.reversedBy = "Administracao";
reversedPayment.reversedAt = "2026-05-20";
const partialMovement = movements.find((movement) => movement.paymentId === partialPayment.id);
if (partialMovement) partialMovement.amount = partialPayment.paidAmount;
const reversedMovement = movements.find((movement) => movement.paymentId === reversedPayment.id);
if (reversedMovement) {
  reversedMovement.status = "estornado";
  reversedMovement.voidReason = reversedPayment.reversalReason;
  reversedMovement.voidedBy = reversedPayment.reversedBy;
  reversedMovement.voidedAt = reversedPayment.reversedAt;
}

const expenseSeeds = [
  ["Aluguel", "Imobiliaria Carmo", "aluguel", 4200, "administrativo"],
  ["Energia eletrica", "Concessionaria", "utilidades", 1380, "geral"],
  ["Produtos de limpeza", "Fornecedor local", "limpeza", 460, "geral"],
  ["Manutencao de equipamentos", "Assistencia Fitness", "manutencao", 790, "musculacao"],
  ["Produtos para piscina", "Aqua Carmo", "manutencao", 620, "natacao"]
];
const expenses = MONTHS.flatMap((month, monthIndex) => expenseSeeds.map(([description, supplier, category, amount, costCenter], index) => {
  const dueDate = `${month}-${String(5 + index * 3).padStart(2, "0")}`;
  const isPending = month === "2026-07" && index >= 3;
  const id = `DES-DEMO-${month.replace("-", "")}-${index + 1}`;
  const expense = {
    id,
    description,
    supplier,
    category,
    amount: amount + monthIndex * 25,
    dueDate,
    status: isPending ? "pendente" : "pago",
    paidAt: isPending ? "" : dueDate,
    method: index === 0 ? "boleto" : "pix",
    account: "caixa-principal",
    costCenter,
    recurring: "mensal",
    recurrenceId: `REC-${index + 1}`,
    document: "",
    createdAt: `${dueDate}T12:00:00.000Z`,
    notes: "Despesa ficticia para demonstracao.",
    ...metadata(monthIndex + index, `${dueDate}T15:00:00.000Z`)
  };
  if (!isPending) {
    movements.push({
      id: `MOV-${id}`,
      date: dueDate,
      time: "10:00",
      type: "saida",
      category,
      description,
      amount: expense.amount,
      method: expense.method,
      account: "caixa-principal",
      costCenter,
      studentId: "",
      paymentId: "",
      expenseId: id,
      status: "confirmado",
      voidReason: "",
      voidedBy: "",
      voidedAt: "",
      createdAt: `${dueDate}T15:00:00.000Z`,
      notes: "",
      ...metadata(monthIndex + index, `${dueDate}T15:00:00.000Z`)
    });
  }
  return expense;
}));

for (let index = 0; index < 18; index += 1) {
  const date = addDays("2026-05-08", index * 3);
  movements.push({
    id: `MOV-EXTRA-${String(index + 1).padStart(2, "0")}`,
    date,
    time: `${String(9 + (index % 9)).padStart(2, "0")}:20`,
    type: "entrada",
    category: index % 2 ? "venda" : "avaliacao",
    description: index % 2 ? "Venda de acessorio esportivo" : "Avaliacao fisica avulsa",
    amount: index % 2 ? 45 + (index % 4) * 10 : 90,
    method: methods[index % methods.length],
    account: "caixa-principal",
    costCenter: "geral",
    studentId: "",
    paymentId: "",
    expenseId: "",
    status: "confirmado",
    voidReason: "",
    voidedBy: "",
    voidedAt: "",
    createdAt: `${date}T15:20:00.000Z`,
    notes: "",
    ...metadata(index, `${date}T15:20:00.000Z`)
  });
}

const checkins = [];
students.forEach((student, studentIndex) => {
  for (let visit = 0; visit < 22; visit += 1) {
    const date = addDays("2026-05-05", visit * 3 + (studentIndex % 3));
    if (date > TODAY) continue;
    const entryHour = 6 + ((studentIndex + visit) % 14);
    const entryTime = `${String(entryHour).padStart(2, "0")}:${String((studentIndex * 7 + visit * 3) % 60).padStart(2, "0")}`;
    const exitMinutes = 58 + ((studentIndex + visit) % 38);
    const entry = new Date(timestamp(date, entryTime));
    const exit = new Date(entry.getTime() + exitMinutes * 60000);
    checkins.push({
      id: `CK-DEMO-${pad(studentIndex + 1)}-${String(visit + 1).padStart(2, "0")}`,
      studentId: student.id,
      workoutId: "",
      date,
      time: entryTime,
      type: "access",
      checkedInAt: entry.toISOString(),
      checkedOutAt: exit.toISOString(),
      presenceSource: "catraca-demo",
      presenceStatus: "outside",
      usedLoad: "",
      difficulty: "",
      pain: "",
      notes: "",
      ...metadata(studentIndex + visit, exit.toISOString())
    });
  }
  for (let workoutIndex = 0; workoutIndex < 4; workoutIndex += 1) {
    const date = addDays("2026-06-18", workoutIndex * 6 + (studentIndex % 3));
    if (date > TODAY) continue;
    checkins.push({
      id: `LOG-TR-DEMO-${pad(studentIndex + 1)}-${workoutIndex + 1}`,
      studentId: student.id,
      workoutId: `TR-DEMO-${pad(studentIndex + 1)}-${workoutIndex % 2 ? "B" : "A"}`,
      date,
      time: "18:30",
      type: "workout",
      checkedInAt: "",
      checkedOutAt: "",
      presenceSource: "tablet-professor",
      presenceStatus: "",
      usedLoad: `${20 + (studentIndex % 8) * 5} kg`,
      difficulty: workoutIndex % 3 === 0 ? "moderada" : "leve",
      pain: studentIndex % 17 === 0 ? "leve" : "nenhuma",
      notes: "Treino realizado para demonstracao.",
      ...metadata(studentIndex + workoutIndex, `${date}T21:00:00.000Z`)
    });
  }
});

const workoutSessions = [];
const exerciseSets = [];
checkins.filter((checkin) => checkin.type === "workout").forEach((checkin, sessionIndex) => {
  const workout = workouts.find((item) => item.id === checkin.workoutId);
  if (!workout) return;
  const sessionId = `SES-DEMO-${String(sessionIndex + 1).padStart(4, "0")}`;
  const startedAt = timestamp(checkin.date, checkin.time || "18:30");
  const durationMinutes = 62 + (sessionIndex % 31);
  const endedAt = new Date(new Date(startedAt).getTime() + durationMinutes * 60000).toISOString();
  let completedSets = 0;
  workout.exerciseItems.forEach((item, exerciseIndex) => {
    const setCount = Math.max(1, Number.parseInt(item.sets, 10) || 3);
    const targetReps = Number.parseInt(item.reps, 10) || 10;
    const targetLoad = Number.parseFloat(item.load) || 0;
    for (let setNumber = 1; setNumber <= setCount; setNumber += 1) {
      completedSets += 1;
      exerciseSets.push({
        id: `SER-DEMO-${String(sessionIndex + 1).padStart(4, "0")}-${exerciseIndex + 1}-${setNumber}`,
        sessionId,
        studentId: checkin.studentId,
        workoutId: workout.id,
        exerciseItemId: item.id,
        exerciseId: item.exerciseId || "",
        exerciseName: item.name,
        setNumber,
        targetReps: item.reps,
        actualReps: Math.max(1, targetReps - ((sessionIndex + setNumber) % 3 === 0 ? 1 : 0)),
        targetLoad: item.load,
        actualLoad: Math.max(0, targetLoad + (sessionIndex % 4) * 2),
        status: "concluida",
        completedAt: new Date(new Date(startedAt).getTime() + completedSets * 180000).toISOString(),
        notes: "",
        createdAt: startedAt,
        ...metadata(sessionIndex + exerciseIndex + setNumber, endedAt)
      });
    }
  });
  workoutSessions.push({
    id: sessionId,
    studentId: checkin.studentId,
    workoutId: workout.id,
    workoutTitle: workout.title,
    division: workout.division,
    startedAt,
    endedAt,
    durationMinutes,
    status: "concluida",
    difficulty: checkin.difficulty || "moderada",
    pain: checkin.pain || "nenhuma",
    notes: checkin.notes || "",
    totalSets: completedSets,
    completedSets,
    createdAt: startedAt,
    ...metadata(sessionIndex, endedAt)
  });
});
const interruptedSession = workoutSessions[0];
interruptedSession.status = "interrompida";
interruptedSession.pain = "moderada";
interruptedSession.notes = "Treino interrompido apos relato de dor no joelho.";
interruptedSession.completedSets = Math.max(1, interruptedSession.totalSets - 4);
exerciseSets.filter((set) => set.sessionId === interruptedSession.id).slice(-4).forEach((set) => {
  set.status = "pendente";
  set.completedAt = "";
});
for (let index = checkins.length - 1; index >= 0; index -= 1) {
  if (checkins[index].studentId === "ALU-DEMO-018" && checkins[index].date >= "2026-06-01") checkins.splice(index, 1);
}

const staffTimeEntries = [];
professors.forEach(([staffId, staffName], professorIndex) => {
  let cursor = dateFrom("2026-05-01");
  let sequence = 1;
  while (isoDate(cursor) <= TODAY) {
    const date = isoDate(cursor);
    const weekDay = cursor.getUTCDay();
    if (weekDay >= 1 && weekDay <= 6) {
      const startHour = 6 + ((professorIndex * 2 + sequence) % 8);
      const startTime = `${String(startHour).padStart(2, "0")}:${sequence % 2 ? "00" : "30"}`;
      const durationMinutes = 240 + ((professorIndex + sequence) % 5) * 45;
      const clockIn = new Date(timestamp(date, startTime));
      const leaveOpen = date === TODAY && professorIndex === 0;
      const clockOut = leaveOpen ? "" : new Date(clockIn.getTime() + durationMinutes * 60000).toISOString();
      staffTimeEntries.push({
        id: `PTO-DEMO-${professorIndex + 1}-${String(sequence).padStart(3, "0")}`,
        staffId,
        staffName,
        date,
        clockIn: clockIn.toISOString(),
        clockOut,
        durationMinutes: leaveOpen ? 0 : durationMinutes,
        status: leaveOpen ? "aberto" : "concluido",
        source: "tablet-professor-demo",
        deviceId: `TABLET-DEMO-${professorIndex + 1}`,
        notes: leaveOpen ? "Presenca aberta para demonstrar o acompanhamento em tempo real." : "",
        createdAt: clockIn.toISOString(),
        updatedAt: clockOut || clockIn.toISOString(),
        updatedBy: staffName
      });
      sequence += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
});

const cashClosings = [];
for (let index = 0; index < 30; index += 1) {
  const date = addDays("2026-05-05", index * 2);
  const dailyIncome = 420 + (index % 7) * 115;
  const dailyExpense = index % 5 === 0 ? 180 : 0;
  cashClosings.push({
    id: `FEC-DEMO-${String(index + 1).padStart(3, "0")}`,
    date,
    openingBalance: 150,
    cashIncome: Math.round(dailyIncome * 0.22),
    cashExpense: dailyExpense,
    expectedCash: 150 + Math.round(dailyIncome * 0.22) - dailyExpense,
    countedCash: 150 + Math.round(dailyIncome * 0.22) - dailyExpense,
    difference: 0,
    totalIncome: dailyIncome,
    totalExpense: dailyExpense,
    closedBy: "Administracao",
    closedAt: `${date}T23:00:00.000Z`,
    notes: "Fechamento ficticio conferido.",
    ...metadata(index, `${date}T23:00:00.000Z`)
  });
}

const users = [
  { id: "USR-ADMIN-001", name: "Administracao Pro Fitness", email: "administracao@exemplo.com", passwordHash: "", role: "admin", status: "ativo", lastLogin: "" },
  ...professors.map(([id, name, email]) => ({ id, name, email, passwordHash: "", role: "professor", status: "ativo", lastLogin: "" }))
].map((user, index) => ({ ...user, ...metadata(index) }));

const config = [{
  id: "CONFIG-001",
  appName: "Pro Fitness Academia",
  environment: "demo",
  datasetId: "pro-fitness-demo-2026-07-auth5",
  timezone: "America/Sao_Paulo",
  currency: "BRL",
  logoUrl: "",
  supportPhone: "(22) 98823-3216",
  apiBaseUrl: "https://script.google.com/macros/s/AKfycbxv5kc71SaSMhe10SQR0kqQQO11aFNInVAJFmH1zTif5SqefNDnZ1F60xBN_VrU0lFGIw/exec",
  lastSnapshotAt: new Date().toISOString(),
  schemaVersion: 8,
  plans: planCatalog,
  modalities: [
    { id: "MOD-MUSCULACAO", name: "Musculacao", monthlyFee: 60 },
    { id: "MOD-NATACAO", name: "Natacao", monthlyFee: 40 },
    { id: "MOD-HIDROGINASTICA", name: "Hidroginastica", monthlyFee: 40 },
    { id: "MOD-KARATE", name: "Karate", monthlyFee: 45 },
    { id: "MOD-JIU-JITSU", name: "Jiu-jitsu", monthlyFee: 50 },
    { id: "MOD-BALLET", name: "Ballet", monthlyFee: 45 },
    { id: "MOD-ZUMBA", name: "Zumba", monthlyFee: 35 },
    { id: "MOD-FUNCIONAL", name: "Funcional", monthlyFee: 45 }
  ],
  costCenters: ["geral", "musculacao", "natacao", "lutas", "aulas", "administrativo"],
  paymentAlertDays: [7, 3, 0],
  paymentGraceDays: 0,
  blockAccessOnOverdue: true,
  whatsappNumber: "5522988233216",
  ...metadata(1)
}];

const log = Array.from({ length: 24 }, (_, index) => ({
  timestamp: `${addDays("2026-06-18", index)}T${String(10 + (index % 9)).padStart(2, "0")}:00:00.000Z`,
  action: index % 3 === 0 ? "student-updated" : index % 3 === 1 ? "workout-updated" : "assessment-created",
  resource: index % 3 === 0 ? "students" : index % 3 === 1 ? "workouts" : "assessments",
  recordId: students[index % students.length].id,
  changedFields: ["updatedAt", "status"],
  actor: "Equipe de demonstracao",
  source: SOURCE,
  deviceId: "DEMO-DATASET",
  result: "success",
  message: "Evento ficticio para demonstracao do historico."
}));

const snapshot = {
  students,
  assessments,
  workouts,
  exercises,
  schedule,
  payments,
  movements,
  expenses,
  cashClosings,
  checkins,
  workoutSessions,
  exerciseSets,
  users,
  staffTimeEntries,
  config,
  log
};

const outputIndex = process.argv.indexOf("--output");
const defaultBackupDir = path.resolve(process.cwd(), "..", "PersonalPro-backups");
const outputFile = outputIndex >= 0 ? process.argv[outputIndex + 1] : path.join(defaultBackupDir, "demo-50-alunos.json");
const absoluteOutput = path.resolve(process.cwd(), outputFile);
fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
fs.writeFileSync(absoluteOutput, `${JSON.stringify({ app: "Pro Fitness Academia", schemaVersion: 10, generatedAt: new Date().toISOString(), demo: true, snapshot }, null, 2)}
`, "utf8");
const emptyOutput = path.join(path.dirname(absoluteOutput), "base-limpa-pro-fitness.json");
const emptySnapshot = Object.fromEntries(Object.keys(snapshot).map((key) => [key, []]));
fs.writeFileSync(emptyOutput, `${JSON.stringify({ app: "Pro Fitness Academia", schemaVersion: 10, generatedAt: new Date().toISOString(), clean: true, snapshot: emptySnapshot }, null, 2)}
`, "utf8");

const currentOverdue = payments.filter((payment) => payment.reference === "2026-07" && payment.status === "vencido").length;
console.log(JSON.stringify({
  output: absoluteOutput,
  cleanBackup: emptyOutput,
  students: students.length,
  professors: professors.length,
  months: MONTHS.length,
  payments: payments.length,
  overduePayments: payments.filter((payment) => payment.status === "vencido").length,
  currentOverdue,
  currentDefaultRate: `${((currentOverdue / students.length) * 100).toFixed(1)}%`,
  checkins: checkins.length,
  workoutSessions: workoutSessions.length,
  exerciseSets: exerciseSets.length,
  staffTimeEntries: staffTimeEntries.length
}, null, 2));
